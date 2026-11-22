"""Voice pipeline (V4-10): push-to-talk against an arena agent.

The browser records a clip while Space is held and uploads it; this module
transcribes it with the Voxtral batch STT model, runs the SAME RunService turn
as text (agent_turn + sandbox executor, so win checks, the 300 s voice limit,
the 60 s idle timeout and the logbook are identical), and speaks the reply with
Voxtral TTS using the preset `voice_id` from config (Ava / Max / Pip).

All Mistral calls are backend-side over HTTPS with the API key in an
Authorization header. No endpoint in app/routes/voice.py ever returns the key
(or any credential): sessions return only ids, timers and the voice slug.

Realtime transcription (wss://.../audio/transcriptions/realtime) authenticates
the WebSocket itself with the API key, so a browser client would need the key;
push-to-talk keeps the key server-side and is the sanctioned fallback.
"""

from __future__ import annotations

import base64
from typing import Any, Awaitable, Callable, Protocol

import httpx

from app.config import settings
from app.runs import RunNotFound, RunService

MISTRAL_API_BASE = "https://api.mistral.ai/v1"

_http_client: httpx.AsyncClient | None = None


def mistral_http_client() -> httpx.AsyncClient:
    """One shared AsyncClient (one connection pool) for ALL Mistral HTTP calls.

    Latency: creating a client per call pays TCP+TLS setup every time (the live
    voice path calls TTS once per sentence); a single pooled client reuses the
    keep-alive connections."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(base_url=MISTRAL_API_BASE, timeout=None)
    return _http_client
STT_TIMEOUT_S = 30.0
TTS_TIMEOUT_S = 30.0
AUDIO_CONTENT_TYPE = "audio/mpeg"

# path + optional JSON body + optional multipart files -> (status, payload)
PostFn = Callable[..., Awaitable[tuple[int, Any]]]


def voice_id_for(agent_id: str) -> str:
    """Preset Voxtral voice for a house agent, from config (never hard-coded)."""
    voices = {
        "bank-ava": settings.voxtral_voice_ava,
        "shop-max": settings.voxtral_voice_max,
        "assistant-pip": settings.voxtral_voice_pip,
    }
    return voices.get(agent_id) or settings.voxtral_voice_ava


class VoiceService:
    """Stateless voice facade over the RunService. Tests inject a fake `post`."""

    def __init__(
        self,
        runs: RunService,
        post: PostFn | None = None,
        api_key: str | None = None,
    ) -> None:
        self.runs = runs
        self._api_key = api_key if api_key is not None else settings.mistral_api_key
        self._post: PostFn = post or self._http_post

    def _headers(self) -> dict[str, str]:
        """The API key is only ever sent in this header, never in a payload."""
        return {"Authorization": f"Bearer {self._api_key}"}

    async def _http_post(
        self,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        """One authenticated call to the Mistral API (JSON body, or multipart
        when `files` is given, with plain fields in `data`)."""
        client = mistral_http_client()  # shared pool, never closed per call
        resp = await client.post(
            path,
            json=json_body,
            data=data,
            files=files,
            headers=headers or self._headers(),
            timeout=60.0,
        )
        payload: Any
        if resp.headers.get("content-type", "").startswith("application/json"):
            payload = resp.json()
        else:
            payload = resp.content
        return resp.status_code, payload

    # -- sessions -----------------------------------------------------------

    async def create_session(
        self,
        agent_id: str,
        player_id: str = "anon",
        mode: str = "arena",
        mission_id: str | None = None,
        caller: Any = None,
    ) -> dict[str, Any]:
        """Start a voice run (channel="voice": 300 s limit, 60 s idle). The
        route passes `caller`, so the same checks as POST /runs apply."""
        run = self.runs.start_run(
            agent_id=agent_id,
            mission_id=mission_id,
            channel="voice",
            mode=mode,  # type: ignore[arg-type]
            player_id=player_id,
            caller=caller,
        )
        return {
            "session_id": run.id,
            "agent_id": run.agent_id,
            "channel": "voice",
            "mode": run.mode,
            "voice_id": voice_id_for(run.agent_id),
            "ends_at": run.started_at.timestamp() + settings.run_voice_s,
            "input": "push-to-talk",  # browser uploads a clip per turn
        }

    def status(self, session_id: str) -> dict[str, Any]:
        run = self.runs.repo.get(session_id)
        if run is None:
            raise RunNotFound(session_id)
        return {
            "session_id": run.id,
            "agent_id": run.agent_id,
            "channel": run.channel,
            "language": run.language,
            "ends_at": run.started_at.timestamp() + settings.run_voice_s,
            "ended": run.outcome is not None,
            "outcome": run.outcome,
            "transcript": [t.model_dump() for t in run.transcript],
        }

    def end_session(self, session_id: str) -> dict[str, Any]:
        return self.runs.end_run(session_id)

    # -- Mistral audio ------------------------------------------------------

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        """Speech in: Voxtral batch transcription (POST /v1/audio/transcriptions)."""
        status, payload = await self._post(
            "/audio/transcriptions",
            data={"model": settings.voxtral_stt_batch_model},
            files={"file": (filename, audio, content_type)},
            headers=self._headers(),
        )
        if status >= 400 or not isinstance(payload, dict):
            raise RuntimeError(f"transcription failed (HTTP {status})")
        return str(payload.get("text", ""))

    async def synthesize(self, text: str, voice_id: str) -> bytes:
        """Speech out: Voxtral TTS (POST /v1/audio/speech with `voice_id`)."""
        status, payload = await self._post(
            "/audio/speech",
            json_body={
                "model": settings.voxtral_tts_model,
                "input": text,
                "voice_id": voice_id,
            },
            headers=self._headers(),
        )
        if status >= 400:
            raise RuntimeError(f"TTS failed (HTTP {status})")
        if isinstance(payload, dict) and "audio_data" in payload:
            return base64.b64decode(payload["audio_data"])  # JSON-wrapped audio
        if isinstance(payload, (bytes, bytearray)):
            return bytes(payload)
        raise RuntimeError(f"TTS returned no audio (HTTP {status})")

    # -- one turn -----------------------------------------------------------

    async def turn(
        self,
        session_id: str,
        audio: bytes,
        filename: str,
        content_type: str,
    ) -> dict[str, Any]:
        """One push-to-talk turn: STT -> same agent turn/executor as text -> TTS."""
        run = self.runs.repo.get(session_id)
        if run is None:
            raise RunNotFound(session_id)
        text = await self.transcribe(audio, filename, content_type)
        if not text.strip():
            return {
                "session_id": session_id,
                "transcript": "",
                "reply": None,
                "audio_base64": None,
                "ended": run.outcome is not None,
                "outcome": run.outcome,
            }
        # identical path to text chat: moderation, language detect, agent_turn,
        # sandbox executor, win check, limits (300 s / 60 s idle), logbook
        resp = await self.runs.send_message(session_id, text)
        audio_b64: str | None = None
        if resp["reply"]:
            spoken = await self.synthesize(resp["reply"], voice_id_for(run.agent_id))
            audio_b64 = base64.b64encode(spoken).decode("ascii")
        return {
            "session_id": session_id,
            "transcript": text,
            "language": run.language,
            "reply": resp["reply"],
            "moderated": resp["moderated"],
            "audio_base64": audio_b64,
            "audio_content_type": AUDIO_CONTENT_TYPE if audio_b64 else None,
            "tool_events": resp["tool_events"],
            "ended": resp["ended"],
            "outcome": resp["outcome"],
        }
