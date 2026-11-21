"""Live voice smoke test: stream a short TTS-generated WAV through the live
call WebSocket against a running uvicorn and report latency + captions + reply.

Usage (from backend/):
    .venv/Scripts/python scripts/voice_live_smoke.py [--backend http://localhost:8000]

It generates the WAV with Voxtral TTS ("Hi, I need help with my account,
what's my balance?"), starts a voice session via POST /voice/sessions, opens
WS /voice/live/{run_id}, streams the WAV as 100 ms PCM16 frames at real-time
pace (then silence, like a muted mic), and reports:
  - time from end of speech to the first agent audio chunk,
  - the captions received,
  - the agent's reply text,
  - the run outcome.

The Mistral API key stays server-side in the app; this script only talks to
our backend over plain WebSocket/HTTP, like the browser.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import struct
import time
import wave
from pathlib import Path

import httpx
import websockets

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on sys.path

from app.config import settings  # noqa: E402
from app.voice import MISTRAL_API_BASE  # noqa: E402


def session_token(cli_arg: str | None) -> str:
    """Clerk session token for the smoke run: --token, else RED_ROOM_TOKEN, else
    minted exactly like scripts/e2e_smoke.py (Clerk Backend API + session
    token endpoint, CLERK_SECRET_KEY from ../.env). Never printed."""
    if cli_arg:
        return cli_arg
    import os

    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    if os.environ.get("RED_ROOM_TOKEN"):
        return os.environ["RED_ROOM_TOKEN"]
    from scripts.e2e_smoke import clerk_session_token

    return clerk_session_token()


PROMPT = "Hi, I need help with my account, what's my balance?"
FRAME_S = 0.1  # 100 ms frames, like the browser worklet
SILENCE_AFTER_SPEECH_S = 3.0  # keep streaming silence so turn detection fires
REPLY_WAIT_S = 45.0


def resample_pcm16_16k(wav_bytes: bytes) -> tuple[bytes, int]:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        rate, nch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    assert sw == 2 and nch == 1, f"expected 16-bit mono wav, got width={sw} ch={nch}"
    samples = struct.unpack(f"<{len(raw) // 2}h", raw)
    step = rate / 16000
    out = []
    pos = 0.0
    while pos + 1 < len(samples):
        i = int(pos)
        f = pos - i
        out.append(samples[i] * (1 - f) + samples[i + 1] * f)
        pos += step
    pcm = b"".join(
        struct.pack("<h", int(max(-32768, min(32767, s)))) for s in out
    )
    return pcm, rate


async def pick_voice(client: httpx.AsyncClient) -> str:
    """voice_id from config; if unset (fresh env), list presets and take the
    first English one (dev script only — app code always uses .env)."""

    if settings.voxtral_voice_ava:
        return settings.voxtral_voice_ava
    r = await client.get(
        "/audio/voices", headers={"Authorization": f"Bearer {settings.mistral_api_key}"}
    )
    r.raise_for_status()
    items = r.json().get("items") or []
    en = [v for v in items if "en" in (v.get("languages") or [])] or items
    return en[0]["slug"]


async def tts_wav(client: httpx.AsyncClient, text: str, voice_id: str) -> bytes:
    r = await client.post(
        "/audio/speech",
        headers={"Authorization": f"Bearer {settings.mistral_api_key}"},
        json={
            "model": settings.voxtral_tts_model,
            "input": text,
            "voice_id": voice_id,
            "response_format": "wav",
        },
    )
    r.raise_for_status()
    payload = r.json()
    return base64.b64decode(payload["audio_data"])


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:8000")
    parser.add_argument("--agent", default="bank-ava")
    parser.add_argument("--mode", default="arena", choices=["arena", "ladder"])
    parser.add_argument("--token", default=None, help="Clerk session JWT (else minted like e2e_smoke)")
    args = parser.parse_args()
    backend = args.backend.rstrip("/")
    token = session_token(args.token)
    auth = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(base_url=MISTRAL_API_BASE, timeout=60.0) as mistral:
        voice_id = await pick_voice(mistral)
        print(f"[smoke] voice_id={voice_id} (from config or voice list)")
        wav = await tts_wav(mistral, PROMPT, voice_id)
        pcm, src_rate = resample_pcm16_16k(wav)
        dur = len(pcm) / 2 / 16000
        print(f"[smoke] TTS wav {src_rate} Hz -> pcm16 16 kHz, {dur:.2f} s ({len(pcm)} bytes)")

    async with httpx.AsyncClient(base_url=backend, timeout=30.0) as http:
        r = await http.post(
            "/voice/sessions",
            json={"agent_id": args.agent, "mode": args.mode},
            headers=auth,
        )
        if r.status_code == 409:  # no lives left in arena: retry as practice
            print("[smoke] arena 409 (no lives) — retrying mode=ladder")
            r = await http.post(
                "/voice/sessions",
                json={"agent_id": args.agent, "mode": "ladder"},
                headers=auth,
            )
        r.raise_for_status()
        session = r.json()
        run_id = session["session_id"]
        print(f"[smoke] session {run_id} agent={session['agent_id']} mode={session['mode']}")

        ws_url = f"{backend.replace('http', 'ws')}/voice/live/{run_id}?token={token}"
        t0 = time.perf_counter()
        captions: list[dict] = []
        agent_reply = ""
        first_audio_t: float | None = None
        speech_end_t: float | None = None
        audio_chunks = 0
        audio_bytes = 0
        audio_pcm = bytearray()
        ended_msg: dict | None = None

        async with websockets.connect(ws_url, max_size=None) as ws:

            async def reader():
                nonlocal first_audio_t, agent_reply, ended_msg, audio_chunks, audio_bytes
                async for raw in ws:
                    msg = json.loads(raw)
                    t = msg.get("type")
                    now = time.perf_counter() - t0
                    if t == "ready":
                        print(f"[smoke] +{now:.2f}s ready input={msg.get('input')} tts={msg.get('tts_format')}@{msg.get('tts_sample_rate')}")
                    elif t == "caption":
                        captions.append({"t": round(now, 2), "role": msg["role"], "text": msg["text"], "final": msg.get("final", False)})
                        if msg["role"] == "player" and msg.get("final"):
                            print(f"[smoke] +{now:.2f}s player FINAL: {msg['text']!r}")
                        elif msg["role"] == "agent" and msg.get("final"):
                            agent_reply = msg["text"]
                            print(f"[smoke] +{now:.2f}s agent FINAL: {agent_reply!r}")
                        else:
                            print(f"[smoke] +{now:.2f}s {msg['role']} delta: {msg['text']!r}")
                    elif t == "speech_end":
                        print(f"[smoke] +{now:.2f}s speech_end")
                    elif t == "audio_start":
                        print(f"[smoke] +{now:.2f}s audio_start {msg.get('format')}@{msg.get('sample_rate')}")
                    elif t == "audio":
                        if first_audio_t is None:
                            first_audio_t = now
                            print(f"[smoke] +{now:.2f}s FIRST agent audio chunk")
                        audio_chunks += 1
                        data = base64.b64decode(msg["data"])
                        audio_bytes += len(data)
                        audio_pcm.extend(data)
                    elif t == "audio_end":
                        print(f"[smoke] +{now:.2f}s audio_end ({audio_chunks} chunks, {audio_bytes} bytes pcm)")
                        if agent_reply:
                            break  # first full reply received
                    elif t == "ended":
                        ended_msg = msg
                        print(f"[smoke] +{now:.2f}s ended reason={msg.get('reason')} outcome={msg.get('outcome')}")
                        break
                    elif t == "error":
                        print(f"[smoke] +{now:.2f}s error: {msg.get('detail')} fallback={msg.get('fallback')}")

            done_reading = asyncio.Event()

            async def reader_wrapped():
                try:
                    await reader()
                finally:
                    done_reading.set()

            read_task = asyncio.create_task(reader_wrapped())

            # stream the WAV at real-time pace, then keep streaming silence
            # (the call is live: the mic never stops, like the browser)
            frame = int(16000 * FRAME_S) * 2
            for i in range(0, len(pcm), frame):
                await ws.send(json.dumps({
                    "type": "audio",
                    "data": base64.b64encode(pcm[i : i + frame]).decode(),
                }))
                await asyncio.sleep(FRAME_S)
            speech_end_t = time.perf_counter() - t0
            print(f"[smoke] +{speech_end_t:.2f}s end of speech — mic stays live (silence frames)")
            silent = b"\x00\x00" * (frame // 2)

            async def keep_mic_alive():
                while not done_reading.is_set():
                    try:
                        await ws.send(json.dumps({"type": "audio", "data": base64.b64encode(silent).decode()}))
                    except Exception:
                        return
                    await asyncio.sleep(FRAME_S)

            mic_task = asyncio.create_task(keep_mic_alive())
            try:
                await asyncio.wait_for(done_reading.wait(), timeout=REPLY_WAIT_S)
            except asyncio.TimeoutError:
                print(f"[smoke] timed out waiting for the reply ({REPLY_WAIT_S}s)")
            try:
                await ws.send(json.dumps({"type": "end"}))
            except Exception:
                pass
            mic_task.cancel()
            try:
                await asyncio.wait_for(done_reading.wait(), timeout=5)
            except asyncio.TimeoutError:
                read_task.cancel()

        latency = (first_audio_t - speech_end_t) if (first_audio_t and speech_end_t) else None
        out = Path(__file__).parent / "voice_live_smoke_out"
        out.mkdir(exist_ok=True)
        if audio_pcm:
            # wrap raw pcm_f32le 24 kHz mono in a wav for inspection
            import struct as _s
            n = len(audio_pcm) // 4
            samples = _s.unpack(f"<{n}f", bytes(audio_pcm[: n * 4]))
            pcm16 = b"".join(_s.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples)
            with wave.open(str(out / "agent_reply.wav"), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(settings.voxtral_tts_sample_rate)
                w.writeframes(pcm16)

        report = {
            "run_id": run_id,
            "prompt": PROMPT,
            "seconds_end_of_speech_to_first_agent_audio": round(latency, 3) if latency else None,
            "captions": captions,
            "agent_reply": agent_reply,
            "audio_chunks": audio_chunks,
            "audio_bytes_pcm": audio_bytes,
            "ended": ended_msg,
            "agent_reply_wav": str(out / "agent_reply.wav") if audio_pcm else None,
        }
        print("\n===== SMOKE REPORT =====")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
