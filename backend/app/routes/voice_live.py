"""Live voice call WebSocket (product decision): WS /voice/live/{run_id}.

The browser authenticates with the Clerk session token as the `?token=` query
param (browsers cannot set headers on a WebSocket) or as the first message
`{"type": "auth", "token": ...}`; both resolve through `current_player`. The
run itself is created by the existing POST /voice/sessions (push-to-talk
fallback stays available on the same router in app/routes/voice.py).

Messages browser -> server (all JSON text frames):
  {"type": "auth", "token": "<clerk jwt>"}          optional first message
  {"type": "audio", "data": "<base64 pcm16 16k mono>"}  ~100 ms mic frames
  {"type": "mute", "muted": true|false}             drop/allow outgoing frames
  {"type": "interrupt"}                             barge-in: cancel pending TTS
  {"type": "end"}                                   hang up

Messages server -> browser: ready, caption (player/agent, final or delta),
speech_start/speech_end, audio_start, audio (base64 pcm_f32le chunk),
audio_end, agent_interrupted, ended, error. No message ever contains the
Mistral API key — it is only sent in Authorization headers of the server-side
Mistral calls.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth import current_player
from app.voice_live import LiveCall

router = APIRouter()


class _WSAdapter:
    """Adapts a FastAPI WebSocket to the WebSocketLike protocol LiveCall uses."""

    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws

    async def receive_json(self) -> dict[str, Any] | None:
        try:
            raw = await self._ws.receive_text()
        except WebSocketDisconnect:
            return None
        try:
            msg = json.loads(raw)
        except (ValueError, TypeError):
            return None
        return msg if isinstance(msg, dict) else None

    async def send_json(self, msg: dict[str, Any]) -> None:
        await self._ws.send_json(msg)

    async def close(self, code: int = 1000) -> None:
        try:
            await self._ws.close(code=code)
        except Exception:
            pass


def default_live_call_factory(
    ws: Any, run_id: str, runs: Any, player: str, **overrides: Any
) -> LiveCall:
    return LiveCall(ws, run_id, runs, player, **overrides)


@router.websocket("/voice/live/{run_id}")
async def voice_live(
    ws: WebSocket,
    run_id: str,
    token: str | None = Query(default=None),
) -> None:
    await ws.accept()
    player = current_player(token)
    factory = getattr(ws.app.state, "live_call_factory", None) or default_live_call_factory
    call = factory(_WSAdapter(ws), run_id, ws.app.state.run_service, player)
    await call.handle()
