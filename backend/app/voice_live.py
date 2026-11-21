"""Live voice call (product decision, v4.1): WS /voice/live/{run_id}.

The browser opens one WebSocket to this backend and streams 16 kHz mono PCM16
frames (~100 ms) the whole time the call is live — no hold-to-talk. The backend
relays every unmuted frame to the Mistral realtime transcription WebSocket
(`VOXTRAL_STT_REALTIME_MODEL`, `wss://api.mistral.ai/v1/audio/transcriptions/realtime`,
Authorization header from the server only) and forwards each
`transcription.text.delta` to the browser as a live caption.

End of utterance: the API's `turn.end` event (turn detection enabled, with a
short grace for trailing deltas) or, when no turn events arrive, server-side
VAD (~700 ms of silence after speech). The final text then runs the SAME
RunService turn as text chat (moderation, language detect, agent turn,
sandbox executor, win checks, 300 s / 60 s idle limits, logbook) via
`stream_message`. The agent's reply is spoken by Voxtral TTS
(`VOXTRAL_TTS_MODEL`, `voice_id` from config) requested per full sentence with
`stream: true` (SSE `speech.audio.delta`, raw pcm_f32le @ 24 kHz mono), and each
audio chunk is sent to the browser over the same WebSocket as it arrives.

Barge-in: an `{"type": "interrupt"}` message cancels the pending TTS for the
current reply. `{"type": "mute", "muted": true}` drops outgoing frames (the
call stays live; mute only affects the mic). Limits: 300 s call cap, 60 s
without speech ends the call, same no-contest rule via RunService.

The API key lives only in the Authorization headers of the server-side
WebSocket/HTTP calls; no message to the browser ever contains it.
"""

from __future__ import annotations

import asyncio
import base64
import json
import math
import re
import time
from typing import Any, AsyncIterator, Awaitable, Callable, Protocol

import httpx
import websockets

from app.config import settings
from app.runs import RunService
from app.voice import MISTRAL_API_BASE, voice_id_for

MISTRAL_WS_BASE = "wss://api.mistral.ai/v1"
STT_SAMPLE_RATE = 16000  # browser sends 16 kHz mono pcm_s16le
SILENCE_S = 0.7  # server-side VAD: end of utterance after 700 ms of silence
DELTA_QUIET_S = 0.35  # after the API's turn.end, close once deltas stop for this long
TURN_MIN_GRACE_S = 0.3  # minimum wait after turn.end before closing the utterance
TURN_MAX_GRACE_S = 1.5  # never wait longer than this for trailing deltas
VAD_RMS_THRESHOLD = 400.0  # pcm16 RMS above this counts as speech
STT_STREAMING_DELAY_MS = 480
MONITOR_TICK_S = 0.05

STTConnectFn = Callable[[str, str], Awaitable[Any]]
TTSStreamFn = Callable[[str, str], AsyncIterator[bytes]]
# async token -> verified Clerk user id; raises on an invalid token. Injected
# by the WS route (app.auth.ClerkAuth.verify) — never a base64-decoded `sub`.
AuthVerifierFn = Callable[[str], Awaitable[str]]


class WebSocketLike(Protocol):
    """Minimal server-side WebSocket surface LiveCall needs (tests use a fake)."""

    async def receive_json(self) -> dict[str, Any] | None: ...

    async def send_json(self, msg: dict[str, Any]) -> None: ...

    async def close(self, code: int = 1000) -> None: ...


class RealtimeSTT:
    """Thin wrapper over the Mistral realtime transcription WebSocket."""

    def __init__(self, ws: Any) -> None:
        self._ws = ws

    @classmethod
    async def connect(cls, model: str, api_key: str) -> "RealtimeSTT":
        url = f"{MISTRAL_WS_BASE}/audio/transcriptions/realtime?model={model}"
        ws = await websockets.connect(
            url,
            additional_headers={"Authorization": f"Bearer {api_key}"},
            max_size=None,
        )
        return cls(ws)

    async def send(self, obj: dict[str, Any]) -> None:
        await self._ws.send(json.dumps(obj))

    async def recv(self) -> dict[str, Any]:
        raw = await self._ws.recv()
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8")
        return json.loads(raw)

    async def close(self) -> None:
        try:
            await self._ws.close()
        except Exception:
            pass


async def default_stt_connect(model: str, api_key: str) -> RealtimeSTT:
    return await RealtimeSTT.connect(model, api_key)


async def stream_tts_pcm(text: str, voice_id: str, api_key: str) -> AsyncIterator[bytes]:
    """One streaming Voxtral TTS call: POST /v1/audio/speech with stream=true,
    response_format=pcm (raw float32 LE, mono, `VOXTRAL_TTS_SAMPLE_RATE`).
    Yields decoded audio chunks as the SSE `speech.audio.delta` events arrive."""

    body = {
        "model": settings.voxtral_tts_model,
        "input": text,
        "voice_id": voice_id,
        "stream": True,
        "response_format": "pcm",
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(base_url=MISTRAL_API_BASE, timeout=None) as client:
        async with client.stream("POST", "/audio/speech", json=body, headers=headers) as resp:
            if resp.status_code >= 400:
                await resp.aread()
                raise RuntimeError(f"TTS failed (HTTP {resp.status_code})")
            event_type: str | None = None
            async for line in resp.aiter_lines():
                if line.startswith("event:"):
                    event_type = line[len("event:"):].strip()
                elif line.startswith("data:"):
                    payload = line[len("data:"):].strip()
                    if not payload:
                        continue
                    data = json.loads(payload)
                    etype = data.get("type") or event_type
                    if etype == "speech.audio.delta" and data.get("audio_data"):
                        yield base64.b64decode(data["audio_data"])
                    elif etype == "speech.audio.done":
                        return
                    event_type = None


_SENTENCE_END = re.compile(r"[.!?]")


def _split_sentence(buf: str) -> tuple[str | None, str]:
    """Split the first complete sentence (ends in . ! or ?) off the buffer."""

    m = _SENTENCE_END.search(buf)
    if not m:
        return None, buf
    return buf[: m.end()], buf[m.end():].lstrip()


def _pcm16_rms(pcm: bytes) -> float:
    if len(pcm) < 2:
        return 0.0
    n = len(pcm) // 2
    total = 0.0
    for i in range(0, n * 2, 2):
        v = int.from_bytes(pcm[i : i + 2], "little", signed=True)
        total += v * v
    return math.sqrt(total / n)


class LiveCall:
    """One live call: browser WebSocket <-> realtime STT <-> RunService <-> TTS.

    Tests inject a fake `ws`, a fake `stt_connect` (returns an object with
    send/recv/close) and a fake `tts_stream(text, voice_id) -> async iterator
    of audio bytes`."""

    def __init__(
        self,
        ws: WebSocketLike,
        run_id: str,
        runs: RunService,
        player: str = "anon",
        *,
        stt_connect: STTConnectFn | None = None,
        tts_stream: TTSStreamFn | None = None,
        api_key: str | None = None,
        now_fn: Callable[[], float] = time.time,
        auth_verifier: AuthVerifierFn | None = None,
    ) -> None:
        self.ws = ws
        self.run_id = run_id
        self.runs = runs
        self.player = player
        self._auth_verifier = auth_verifier
        self._api_key = api_key if api_key is not None else settings.mistral_api_key
        self._stt_connect = stt_connect or default_stt_connect
        if tts_stream is not None:
            self._tts_stream = tts_stream
        else:
            self._tts_stream = lambda text, voice_id: stream_tts_pcm(text, voice_id, self._api_key)  # type: ignore[return-value]
        self._now = now_fn

        self._run: Any = None
        self._stt: Any = None
        self._ends_at = 0.0
        self._voice_id = ""
        self._muted = False
        self._speech_open = False
        self._turn_end_at: float | None = None
        self._last_speech = 0.0
        self._last_delta_at = 0.0
        self._utterance = ""
        self._buf = ""
        self._interrupted = False
        self._reply_task: asyncio.Task | None = None
        self._done = False
        self._done_event = asyncio.Event()
        self._send_lock = asyncio.Lock()
        self._turn_queue: asyncio.Queue[str] = asyncio.Queue()
        self._tasks: list[asyncio.Task] = []

    # -- helpers ------------------------------------------------------------

    async def _send(self, msg: dict[str, Any]) -> None:
        async with self._send_lock:
            await self.ws.send_json(msg)

    # -- lifecycle ----------------------------------------------------------

    async def handle(self) -> None:
        run = self.runs.repo.get(self.run_id)
        if run is None:
            await self._send({"type": "error", "detail": "run not found"})
            await self.ws.close(4404)
            return
        self._run = run
        if run.player_id == "anon" and self.player != "anon":
            run.player_id = self.player
            self.runs.repo.update(run)
        self._ends_at = run.started_at.timestamp() + settings.run_voice_s
        self._voice_id = voice_id_for(run.agent_id)
        self._last_speech = self._now()
        self._last_delta_at = self._last_speech

        try:
            self._stt = await self._stt_connect(settings.voxtral_stt_realtime_model, self._api_key)
            await self._stt.recv()  # session.created
            await self._stt.send(
                {
                    "type": "session.update",
                    "session": {
                        "audio_format": {"encoding": "pcm_s16le", "sample_rate": STT_SAMPLE_RATE},
                        "target_streaming_delay_ms": STT_STREAMING_DELAY_MS,
                        "turn_detection": {"min_silence_ms": int(SILENCE_S * 1000), "end_timeout_ms": 3000},
                    },
                }
            )
            await self._stt.recv()  # session.updated
        except Exception as exc:
            # realtime STT unavailable: tell the UI to fall back to push-to-talk
            await self._send(
                {"type": "error", "detail": f"realtime transcription unavailable: {exc}", "fallback": "ptt"}
            )
            await self.ws.close(1011)
            return

        await self._send(
            {
                "type": "ready",
                "run_id": run.id,
                "agent_id": run.agent_id,
                "player_id": run.player_id,
                "ends_at": self._ends_at,
                "voice_id": self._voice_id,
                "input": "live",
                "tts_format": "pcm_f32le",
                "tts_sample_rate": settings.voxtral_tts_sample_rate,
            }
        )

        self._tasks = [
            asyncio.create_task(self._pump_browser()),
            asyncio.create_task(self._pump_stt()),
            asyncio.create_task(self._monitor()),
            asyncio.create_task(self._turn_worker()),
        ]
        try:
            await self._done_event.wait()
        finally:
            for task in self._tasks:
                task.cancel()
            await asyncio.gather(*self._tasks, return_exceptions=True)
            if self._stt is not None:
                try:
                    await self._stt.send({"type": "input_audio.end"})
                except Exception:
                    pass
                await self._stt.close()

    async def _finish_call(self, reason: str) -> None:
        if self._done:
            return
        self._done = True
        run = self.runs.repo.get(self.run_id)
        try:
            if run is not None and run.outcome is None:
                self.runs.end_run(self.run_id, "timeout" if reason in ("timeout", "idle") else "abandoned")
                run = self.runs.repo.get(self.run_id)
        except Exception:
            pass
        await self._send(
            {"type": "ended", "reason": reason, "outcome": run.outcome if run else None}
        )
        self._done_event.set()
        try:
            await self.ws.close()
        except Exception:
            pass

    # -- browser -> backend ---------------------------------------------------

    async def _pump_browser(self) -> None:
        while not self._done:
            msg = await self.ws.receive_json()
            if msg is None:
                await self._finish_call("hangup")
                return
            kind = msg.get("type")
            if kind == "auth":
                # defense in depth: re-verify through the route's ClerkAuth
                # verifier (JWKS signature + exp + azp/sid), never decode `sub`
                if self._auth_verifier is not None:
                    try:
                        player = await self._auth_verifier(str(msg.get("token") or ""))
                    except Exception:
                        await self._send({"type": "error", "detail": "invalid session token"})
                        await self.ws.close(4401)
                        self._done = True
                        self._done_event.set()
                        return
                    if player and self._run is not None and self._run.player_id == "anon":
                        self._run.player_id = player
                        self.runs.repo.update(self._run)
            elif kind == "audio":
                data = msg.get("data") or msg.get("audio")
                if data and not self._muted:
                    # muted frames are dropped: never forwarded to the STT socket
                    await self._stt.send({"type": "input_audio.append", "audio": data})
                    self._vad(base64.b64decode(data))
            elif kind == "mute":
                self._muted = bool(msg.get("muted", True))
            elif kind == "interrupt":
                await self._interrupt()
            elif kind == "end":
                await self._finish_call("hangup")
                return

    def _vad(self, pcm: bytes) -> None:
        if _pcm16_rms(pcm) > VAD_RMS_THRESHOLD:
            now = self._now()
            self._last_speech = now
            self._turn_end_at = None
            if not self._speech_open:
                self._speech_open = True

    # -- STT -> backend -> browser --------------------------------------------

    async def _pump_stt(self) -> None:
        while not self._done:
            try:
                ev = await self._stt.recv()
            except Exception:
                if not self._done:
                    await self._send({"type": "error", "detail": "realtime transcription stream closed"})
                return
            kind = ev.get("type")
            if kind == "transcription.text.delta":
                text = str(ev.get("text", ""))
                self._utterance += text
                now = self._now()
                self._last_delta_at = now
                # words still arriving after a turn.end mean the turn is not
                # over yet: fall back to the silence-based close
                self._last_speech = now
                self._turn_end_at = None
                await self._send({"type": "caption", "role": "player", "text": text, "final": False})
            elif kind == "turn.start":
                self._speech_open = True
                self._last_speech = self._now()
                self._turn_end_at = None
                await self._send({"type": "speech_start"})
            elif kind == "turn.end":
                # end of utterance per the API; the monitor closes it after a
                # grace period so trailing deltas still land in this utterance
                self._turn_end_at = self._now()
            elif kind == "error":
                await self._send(
                    {"type": "error", "detail": str(ev.get("error", {}).get("message", "stt error"))}
                )

    # -- limits + end-of-utterance ---------------------------------------------

    async def _monitor(self) -> None:
        while not self._done:
            await asyncio.sleep(MONITOR_TICK_S)
            now = self._now()
            if now > self._ends_at:
                await self._finish_call("timeout")  # 300 s call cap
                return
            if now - self._last_speech > settings.run_idle_s:
                await self._finish_call("idle")  # 60 s without speech
                return
            if self._speech_open:
                if self._turn_end_at is not None:
                    # API end-of-turn: wait for trailing deltas to go quiet
                    # (the last words can arrive after turn.end), bounded
                    since_end = now - self._turn_end_at
                    quiet = now - self._last_delta_at
                    due = (since_end >= TURN_MIN_GRACE_S and quiet >= DELTA_QUIET_S) or (
                        since_end >= TURN_MAX_GRACE_S
                    )
                else:
                    due = now - self._last_speech >= SILENCE_S  # server-side VAD fallback
                if due:
                    text = self._utterance.strip()
                    self._utterance = ""
                    self._speech_open = False
                    self._turn_end_at = None
                    await self._send({"type": "speech_end"})
                    if text:
                        await self._send({"type": "caption", "role": "player", "text": text, "final": True})
                        await self._turn_queue.put(text)

    # -- one agent turn + streamed TTS reply -----------------------------------

    async def _turn_worker(self) -> None:
        while not self._done:
            try:
                text = await asyncio.wait_for(self._turn_queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            self._reply_task = asyncio.create_task(self._run_reply(text))
            try:
                await self._reply_task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                await self._send({"type": "error", "detail": f"agent turn failed: {exc}"})

    async def _run_reply(self, text: str) -> None:
        self._interrupted = False
        self._buf = ""
        queue: asyncio.Queue = asyncio.Queue()
        worker = asyncio.create_task(self._tts_loop(queue))
        try:
            async for ev in self.runs.stream_message(self.run_id, text):
                if self._interrupted:
                    break
                if ev["type"] == "chunk":
                    await self._send({"type": "caption", "role": "agent", "text": ev["text"], "final": False})
                    self._buf += ev["text"]
                    while True:
                        sentence, self._buf = _split_sentence(self._buf)
                        if sentence is None:
                            break
                        await queue.put(sentence)
                else:  # done
                    reply = str(ev.get("reply") or "")
                    if self._buf.strip():
                        await queue.put(self._buf)
                        self._buf = ""
                    await queue.put(None)
                    try:
                        await worker
                    except asyncio.CancelledError:
                        pass
                    await self._send({"type": "caption", "role": "agent", "text": reply, "final": True})
                    if not self._interrupted:
                        await self._send({"type": "audio_end"})
                    if ev.get("ended"):
                        await self._finish_call("run_ended")
                    return
        finally:
            if not worker.done():
                worker.cancel()

    async def _tts_loop(self, queue: asyncio.Queue) -> None:
        audio_started = False
        while True:
            item = await queue.get()
            if item is None or self._interrupted:
                if item is None:
                    return
                continue
            if not audio_started:
                await self._send(
                    {
                        "type": "audio_start",
                        "format": "pcm_f32le",
                        "sample_rate": settings.voxtral_tts_sample_rate,
                        "channels": 1,
                    }
                )
                audio_started = True
            try:
                async for chunk in self._tts_stream(item, self._voice_id):
                    if self._interrupted:
                        break
                    await self._send({"type": "audio", "data": base64.b64encode(chunk).decode("ascii")})
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # one bad sentence must not kill the rest of the reply
                await self._send({"type": "error", "detail": f"TTS failed for a sentence: {exc}"})

    async def _interrupt(self) -> None:
        """Barge-in: cancel the pending TTS (and the reply stream) for this turn."""

        if self._reply_task is not None and not self._reply_task.done():
            self._interrupted = True
            self._reply_task.cancel()
            await self._send({"type": "agent_interrupted"})
