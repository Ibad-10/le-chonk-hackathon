"""HTTP routes for voice calls (V4-10, push-to-talk).

POST /voice/sessions                      start a voice run (channel="voice")
POST /voice/sessions/{id}/turn            upload one audio clip -> transcript,
                                          same agent turn + executor as text,
                                          reply text + base64 mp3 (Voxtral TTS)
GET  /voice/sessions/{id}                 status: timer, language, transcript
POST /voice/sessions/{id}/end             hang up

All routes require the same verified Clerk session token as the other write
routes (`Depends(current_player)`: JWKS signature + exp + azp/sid); the caller-
supplied `player_id` body field is ignored — the player id always comes from
the verified token's `sub`. No route returns the Mistral API key or any
credential; audio is uploaded to this backend, which is the only process that
talks to the Mistral API.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.auth import current_player
from app.db import Player
from app.routes.runs import START_ERRORS, start_errors
from app.runs import RunNotFound, RunService
from app.voice import VoiceService

router = APIRouter()

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # one push-to-talk clip


class StartVoiceSession(BaseModel):
    agent_id: str = Field(max_length=80)
    mission_id: str | None = Field(default=None, max_length=40)
    player_id: str = "anon"  # deprecated: ignored, the verified `sub` is used
    mode: Literal["arena", "practice"] = "arena"


def get_voice_service(request: Request) -> VoiceService:
    runs: RunService = request.app.state.run_service
    return VoiceService(runs)


def _own_session(service: VoiceService, session_id: str, player: Player) -> None:
    """404 for unknown sessions, 403 unless the caller started the run."""
    run = service.runs.repo.get(session_id)
    if run is None:
        raise HTTPException(status_code=404, detail="voice session not found")
    if run.player_id != player.id:
        raise HTTPException(status_code=403, detail="not your run")


@router.post("/voice/sessions")
async def start_voice_session(
    req: StartVoiceSession, request: Request, player: Player = Depends(current_player)
):
    service = get_voice_service(request)
    try:
        return await service.create_session(
            agent_id=req.agent_id,
            player_id=player.id,
            mode=req.mode,
            mission_id=req.mission_id,
            caller=player,  # same mode / owner / arena checks as POST /runs
        )
    except START_ERRORS as exc:
        raise start_errors(exc)


@router.post("/voice/sessions/{session_id}/turn")
async def voice_turn(
    session_id: str,
    request: Request,
    file: UploadFile = File(...),
    player: Player = Depends(current_player),
):
    service = get_voice_service(request)
    _own_session(service, session_id, player)
    audio = await file.read(MAX_AUDIO_BYTES + 1)
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio clip larger than 5 MB")
    try:
        return await service.turn(
            session_id,
            audio,
            file.filename or "clip.webm",
            file.content_type or "audio/webm",
        )
    except RunNotFound:
        raise HTTPException(status_code=404, detail="voice session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/voice/sessions/{session_id}")
async def voice_session_status(
    session_id: str, request: Request, player: Player = Depends(current_player)
):
    service = get_voice_service(request)
    _own_session(service, session_id, player)
    try:
        return service.status(session_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="voice session not found")


@router.post("/voice/sessions/{session_id}/end")
async def end_voice_session(
    session_id: str, request: Request, player: Player = Depends(current_player)
):
    service = get_voice_service(request)
    _own_session(service, session_id, player)
    try:
        return service.end_session(session_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="voice session not found")
