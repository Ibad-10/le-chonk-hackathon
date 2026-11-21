"""Live voice call WebSocket (product decision): WS /voice/live/{run_id}.

The browser authenticates with the Clerk session token as the `?token=` query
param (browsers cannot set headers on a WebSocket) or as the first message
`{"type": "auth", "token": ...}`. BOTH are verified with the same ClerkAuth
verifier as the HTTP write routes (JWKS signature, exp, azp/sid rules) BEFORE
the socket is accepted for relaying or any Mistral call is made: a missing,
malformed or forged token closes the socket with code 4401 and no LiveCall is
ever created. The run itself is created by the existing POST /voice/sessions
(push-to-talk fallback stays available on the same router in
app/routes/voice.py).

Messages browser -> server (all JSON text frames):
  {"type": "auth", "token": "<clerk jwt>"}          first message when no ?token=
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
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.auth import get_clerk_auth
from app.voice_live import LiveCall

router = APIRouter()

WS_AUTH_REJECTED = 4401  # close code for a missing/invalid Clerk session token


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
    # Real Clerk verification (JWKS signature + exp + azp/sid), same verifier
    # as the HTTP write routes — never a base64-decoded `sub`. The token comes
    # from the query param, or (when absent) from the first `auth` message.
    clerk = get_clerk_auth(ws)

    async def verify_token(raw: Any) -> str:
        """Verified Clerk user id, or raises HTTPException(401)."""
        if not isinstance(raw, str) or not raw:
            raise HTTPException(status_code=401, detail="missing bearer token")
        claims = await clerk.verify(raw)
        return str(claims["sub"])

    player: str | None = None
    if token is not None:
        try:
            player = await verify_token(token)
        except HTTPException:
            # rejected before accept and before any LiveCall/Mistral call
            await ws.close(code=WS_AUTH_REJECTED)
            return

    await ws.accept()

    adapter = _WSAdapter(ws)
    if player is None:
        # no query param: the FIRST message must be {"type": "auth", "token": ...}
        first = await adapter.receive_json()
        if first is None or first.get("type") != "auth":
            await adapter.send_json({"type": "error", "detail": "missing session token"})
            await adapter.close(code=WS_AUTH_REJECTED)
            return
        try:
            player = await verify_token(first.get("token"))
        except HTTPException:
            await adapter.send_json({"type": "error", "detail": "invalid session token"})
            await adapter.close(code=WS_AUTH_REJECTED)
            return

    factory = getattr(ws.app.state, "live_call_factory", None) or default_live_call_factory
    call = factory(
        adapter, run_id, ws.app.state.run_service, player, auth_verifier=verify_token
    )
    await call.handle()
