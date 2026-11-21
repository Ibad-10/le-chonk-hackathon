"""Live voice call tests (WS /voice/live/{run_id}): fakes for the Mistral
realtime socket and the TTS stream.

Covered: partial transcripts forwarded as captions; end-of-utterance (API
turn.end and the server-side VAD fallback) triggers exactly one agent turn
through RunService; interrupt cancels the pending TTS; muted audio frames are
never forwarded to the STT socket; the 300 s cap ends the call; and the server
never sends the API key to the client (route-level test with a Clerk token).
"""

from __future__ import annotations

import asyncio
import base64
import json
import struct
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.routes.voice_live import router as voice_live_router
from app.runs import RunService
from app.voice_live import LiveCall
from tests.test_voice import FakeLLM

API_KEY = "sk-live-secret-456"


# --- fakes -------------------------------------------------------------------


class FakeSTT:
    """Fake Mistral realtime transcription socket: scripted events out,
    captured messages in (what would have gone to Mistral)."""

    def __init__(self, events=()):
        self.events: asyncio.Queue = asyncio.Queue()
        for e in events:
            self.events.put_nowait(e)
        self.sent: list[dict] = []
        self.closed = False

    def push(self, ev: dict) -> None:
        self.events.put_nowait(ev)

    async def send(self, obj) -> None:
        self.sent.append(obj if isinstance(obj, dict) else json.loads(obj))

    async def recv(self) -> dict:
        return await self.events.get()  # blocks like a real socket when empty

    async def close(self) -> None:
        self.closed = True


class FakeWS:
    """Fake browser-side WebSocket: messages in via push(), captured out."""

    def __init__(self):
        self.incoming: asyncio.Queue = asyncio.Queue()
        self.outgoing: list[dict] = []
        self.closed = False
        self.close_code: int | None = None

    def push(self, msg: dict | None) -> None:
        self.incoming.put_nowait(msg)

    async def receive_json(self):
        return await self.incoming.get()

    async def send_json(self, msg: dict) -> None:
        self.outgoing.append(msg)

    async def close(self, code: int = 1000) -> None:
        self.closed = True
        self.close_code = code

    def of(self, type_: str) -> list[dict]:
        return [m for m in self.outgoing if m.get("type") == type_]


class FakeTTS:
    """Fake streaming TTS: yields one chunk per sentence, can block forever
    (to prove interrupt cancels it)."""

    def __init__(self, block: bool = False):
        self.block = block
        self.texts: list[str] = []
        self.started = asyncio.Event()
        self.cancelled = False
        self.chunks_sent = 0

    async def __call__(self, text: str, voice_id: str):
        self.texts.append(text)
        self.started.set()
        try:
            if self.block:
                await asyncio.sleep(3600)  # pending forever until cancelled
            else:
                await asyncio.sleep(0)  # let the caller observe the start
            self.chunks_sent += 1
            yield b"FAKE-PCM-" + text.encode()[:16]
        except (asyncio.CancelledError, GeneratorExit):
            self.cancelled = True
            raise


def loud_frame(ms: int = 100, amp: int = 8000) -> str:
    samples = int(16000 * ms / 1000)
    return base64.b64encode(struct.pack("<h", amp) * samples).decode()


def silent_frame(ms: int = 100) -> str:
    samples = int(16000 * ms / 1000)
    return base64.b64encode(b"\x00\x00" * samples).decode()


def clerk_token(sub: str = "user_live_123") -> str:
    def b64(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return f"{b64({'alg': 'RS256', 'typ': 'JWT'})}.{b64({'sub': sub})}.sig"


async def wait_for(cond, timeout: float = 5.0) -> None:
    t0 = time.monotonic()
    while not cond():
        if time.monotonic() - t0 > timeout:
            raise AssertionError("timed out waiting for condition")
        await asyncio.sleep(0.01)


class FakeClock:
    """Advances in real time from a fixed epoch; jump() skips ahead."""

    def __init__(self, t0: float = 1000.0):
        self.box = t0
        self.mono0 = time.monotonic()

    def __call__(self) -> float:
        return self.box + (time.monotonic() - self.mono0)

    def jump(self, dt: float) -> None:
        self.box += dt


def make_runs(llm=None, clock: FakeClock | None = None) -> RunService:
    return RunService(llm or FakeLLM(), now_fn=clock or FakeClock())


def make_call(runs, stt, ws, tts=None, clock: FakeClock | None = None):
    clock = clock or FakeClock()

    async def stt_connect(model, key):
        stt.connect_args = (model, key)
        return stt

    return LiveCall(
        ws,
        runs.start_run(agent_id="bank-ava", channel="voice", mode="ladder", player_id="anon").id,
        runs,
        "anon",
        stt_connect=stt_connect,
        tts_stream=tts or FakeTTS(),
        api_key=API_KEY,
        now_fn=clock,
    )


def session_events() -> list[dict]:
    return [{"type": "session.created", "session": {}}, {"type": "session.updated", "session": {}}]


@pytest.fixture(autouse=True)
def _voices(monkeypatch):
    monkeypatch.setattr(settings, "mistral_api_key", API_KEY)
    monkeypatch.setattr(settings, "voxtral_voice_ava", "voice_ava_preset")


async def drive(call: LiveCall, ws: FakeWS, script) -> None:
    """Run handle() while executing `script(ws, call)` concurrently."""

    async def runner():
        await script(ws, call)

    task = asyncio.create_task(call.handle())
    runner_task = asyncio.create_task(runner())
    await asyncio.wait_for(asyncio.gather(task, runner_task), timeout=15)


# --- tests -------------------------------------------------------------------


async def test_partial_transcripts_forwarded_as_captions():
    runs = make_runs()
    stt = FakeSTT(session_events())
    ws = FakeWS()
    call = make_call(runs, stt, ws)

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        ws.push({"type": "audio", "data": loud_frame()})
        stt.push({"type": "transcription.text.delta", "text": "Hello "})
        stt.push({"type": "transcription.text.delta", "text": "there."})
        await wait_for(lambda: len(ws.of("caption")) >= 2)
        ws.push({"type": "end"})

    await drive(call, ws, script)

    deltas = [m["text"] for m in ws.of("caption") if not m["final"]]
    assert deltas == ["Hello ", "there."], "partial transcript deltas not forwarded as captions"
    assert all(m["role"] == "player" for m in ws.of("caption"))
    # the mic frame was relayed to the realtime socket as input_audio.append
    appends = [m for m in stt.sent if m.get("type") == "input_audio.append"]
    assert len(appends) == 1 and appends[0]["audio"] == loud_frame()
    # session configured for 16 kHz pcm + turn detection before any audio
    update = next(m for m in stt.sent if m.get("type") == "session.update")
    assert update["session"]["audio_format"] == {"encoding": "pcm_s16le", "sample_rate": 16000}
    assert "turn_detection" in update["session"]


async def test_turn_end_triggers_exactly_one_agent_turn():
    llm = FakeLLM(responses=[{"reply": "Your balance is 100 pounds.", "tool_calls": []}])
    runs = make_runs(llm)
    stt = FakeSTT(session_events())
    ws = FakeWS()
    tts = FakeTTS()
    call = make_call(runs, stt, ws, tts)

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        ws.push({"type": "audio", "data": loud_frame()})
        stt.push({"type": "transcription.text.delta", "text": "what is my balance?"})
        stt.push({"type": "turn.end", "time_s": 1.0, "end_reason": "threshold"})
        await wait_for(lambda: bool(ws.of("audio_end")))
        ws.push({"type": "end"})

    await drive(call, ws, script)

    run = runs.repo.get(call.run_id)
    player_turns = [t for t in run.transcript if t.role == "player"]
    assert len(player_turns) == 1, "end-of-utterance must trigger exactly one agent turn"
    assert player_turns[0].content == "what is my balance?"
    assert len(llm.agent_calls) == 1, "RunService agent turn ran exactly once"
    assert [t.role for t in run.transcript] == ["player", "agent"]
    # final player caption carries the full utterance; agent reply spoken via TTS
    finals = [m for m in ws.of("caption") if m["final"]]
    assert {m["role"] for m in finals} == {"player", "agent"}
    assert tts.texts == ["Your balance is 100 pounds."]
    assert len(ws.of("audio")) == 1  # one pcm chunk forwarded to the browser
    assert ws.of("audio_start")[0]["format"] == "pcm_f32le"
    assert ws.of("ended")[0]["reason"] == "hangup"


async def test_vad_fallback_ends_utterance_without_turn_events():
    """No turn.* events from the API: ~700 ms of silence after speech ends it."""

    llm = FakeLLM(responses=[{"reply": "Sure, one moment.", "tool_calls": []}])
    runs = make_runs(llm)
    stt = FakeSTT(session_events())
    ws = FakeWS()
    call = make_call(runs, stt, ws)

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        for _ in range(3):  # ~300 ms of loud speech
            ws.push({"type": "audio", "data": loud_frame()})
            await asyncio.sleep(0.05)
        stt.push({"type": "transcription.text.delta", "text": "help me"})
        for _ in range(12):  # then silence frames keep flowing (muted mic still streams)
            ws.push({"type": "audio", "data": silent_frame()})
            await asyncio.sleep(0.05)
        await wait_for(lambda: bool(ws.of("audio_end")), timeout=5)
        ws.push({"type": "end"})

    await drive(call, ws, script)

    run = runs.repo.get(call.run_id)
    assert [t.content for t in run.transcript if t.role == "player"] == ["help me"]
    assert len(llm.agent_calls) == 1


async def test_interrupt_cancels_pending_tts():
    llm = FakeLLM(responses=[{"reply": "Hello there. Let me check that for you now.", "tool_calls": []}])
    runs = make_runs(llm)
    stt = FakeSTT(session_events())
    ws = FakeWS()
    tts = FakeTTS(block=True)  # first sentence's TTS stays pending
    call = make_call(runs, stt, ws, tts)

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        ws.push({"type": "audio", "data": loud_frame()})
        stt.push({"type": "transcription.text.delta", "text": "hi"})
        stt.push({"type": "turn.end", "time_s": 0.5, "end_reason": "threshold"})
        await tts.started.wait()  # TTS for the first sentence is in flight
        ws.push({"type": "interrupt"})
        await wait_for(lambda: bool(ws.of("agent_interrupted")))
        await wait_for(lambda: tts.cancelled)
        ws.push({"type": "end"})

    await drive(call, ws, script)

    assert tts.cancelled, "interrupt must cancel the pending TTS stream"
    assert ws.of("audio") == [], "no agent audio may be sent after the interrupt"
    assert ws.of("agent_interrupted"), "browser gets an interrupt ack"


async def test_muted_audio_frames_are_not_forwarded():
    runs = make_runs()
    stt = FakeSTT(session_events())
    ws = FakeWS()
    call = make_call(runs, stt, ws)

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        ws.push({"type": "mute", "muted": True})
        ws.push({"type": "audio", "data": loud_frame()})
        ws.push({"type": "audio", "data": loud_frame()})
        await asyncio.sleep(0.3)
        ws.push({"type": "mute", "muted": False})
        ws.push({"type": "audio", "data": loud_frame()})
        await asyncio.sleep(0.3)
        ws.push({"type": "end"})

    await drive(call, ws, script)

    appends = [m for m in stt.sent if m.get("type") == "input_audio.append"]
    assert len(appends) == 1, "muted frames must be dropped, only the unmuted one forwarded"
    assert appends[0]["audio"] == loud_frame()


async def test_300s_call_cap_ends_call():
    clock = FakeClock(1000.0)
    runs = make_runs(clock=clock)
    stt = FakeSTT(session_events())
    ws = FakeWS()
    call = make_call(runs, stt, ws, clock=clock)
    assert settings.run_voice_s == 300

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        assert ws.of("ready")[0]["ends_at"] == pytest.approx(1000.0 + 300, abs=1.0)
        clock.jump(301)  # past the 300 s voice cap
        await wait_for(lambda: bool(ws.of("ended")))
        ws.push(None)  # socket closed after ended

    await drive(call, ws, script)

    ended = ws.of("ended")[0]
    assert ended["reason"] == "timeout"
    run = runs.repo.get(call.run_id)
    assert run.outcome is not None, "run must be finished at the cap"
    assert ws.closed


async def test_server_never_sends_api_key_to_client():
    runs = make_runs()
    stt = FakeSTT(session_events())
    ws = FakeWS()
    tts = FakeTTS()
    call = make_call(runs, stt, ws, tts)

    async def script(ws: FakeWS, call: LiveCall):
        await wait_for(lambda: bool(ws.of("ready")))
        ws.push({"type": "audio", "data": loud_frame()})
        stt.push({"type": "transcription.text.delta", "text": "what is my balance?"})
        stt.push({"type": "turn.end", "time_s": 1.0, "end_reason": "threshold"})
        await wait_for(lambda: bool(ws.of("audio_end")))
        ws.push({"type": "end"})

    await drive(call, ws, script)

    blob = json.dumps(ws.outgoing)
    assert API_KEY not in blob, "API key leaked to the client"
    # the key is only used server-side, as the realtime socket credential
    assert stt.connect_args[1] == API_KEY


# --- route-level test: WS wiring + Clerk token auth ---------------------------


def test_route_websocket_auth_and_no_key_leak():
    runs = make_runs()
    stt = FakeSTT(session_events())
    tts = FakeTTS()
    token = clerk_token("user_live_123")

    app = FastAPI()
    app.state.run_service = runs

    def factory(ws, run_id, runs_, player, **kw):
        async def stt_connect(model, key):
            return stt

        return LiveCall(
            ws, run_id, runs_, player,
            stt_connect=stt_connect, tts_stream=tts, api_key=API_KEY,
        )

    app.state.live_call_factory = factory
    app.include_router(voice_live_router)

    client = TestClient(app)
    run = runs.start_run(agent_id="bank-ava", channel="voice", mode="ladder", player_id="anon")
    received: list[dict] = []
    with client.websocket_connect(f"/voice/live/{run.id}?token={token}") as ws:
        received.append(ws.receive_json())  # ready
        ws.send_json({"type": "audio", "data": loud_frame()})
        ws.send_json({"type": "end"})
        while True:
            msg = ws.receive_json()
            received.append(msg)
            if msg.get("type") == "ended":
                break

    ready = next(m for m in received if m["type"] == "ready")
    assert ready["run_id"] == run.id
    assert ready["input"] == "live"
    # Clerk token resolved through current_player and stamped on the anon run
    assert ready["player_id"] == "user_live_123"
    assert runs.repo.get(run.id).player_id == "user_live_123"
    assert received[-1]["type"] == "ended"
    assert API_KEY not in json.dumps(received), "API key leaked over the WebSocket"
    # the audio frame was relayed to the (fake) realtime socket, key server-side
    assert any(m.get("type") == "input_audio.append" for m in stt.sent)
