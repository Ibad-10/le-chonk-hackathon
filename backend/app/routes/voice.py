"""HTTP routes for voice calls (V4-10, push-to-talk).

POST /voice/sessions                      start a voice run (channel="voice")
POST /voice/sessions/{id}/turn            upload one audio clip -> transcript,
                                          same agent turn + executor as text,
                                          reply text + base64 mp3 (Voxtral TTS)
GET  /voice/sessions/{id}                 status: timer, language, transcript
POST /voice/sessions/{id}/end             hang up

No route returns the Mistral API key or any credential; audio is uploaded to
this backend, which is the only process that talks to the Mistral API.
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.runs import NoLivesAvailable, RunNotFound, RunService
from app.voice import VoiceService

router = APIRouter()


class StartVoiceSession(BaseModel):
    agent_id: str
    mission_id: str | None = None
    player_id: str = "anon"
    mode: str = "arena"


def get_voice_service(request: Request) -> VoiceService:
    runs: RunService = request.app.state.run_service
    return VoiceService(runs)


@router.post("/voice/sessions")
async def start_voice_session(req: StartVoiceSession, request: Request):
    service = get_voice_service(request)
    try:
        return await service.create_session(
            agent_id=req.agent_id,
            player_id=req.player_id,
            mode=req.mode,
            mission_id=req.mission_id,
        )
    except NoLivesAvailable as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/voice/sessions/{session_id}/turn")
async def voice_turn(
    session_id: str,
    request: Request,
    file: UploadFile = File(...),
):
    service = get_voice_service(request)
    audio = await file.read()
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
async def voice_session_status(session_id: str, request: Request):
    service = get_voice_service(request)
    try:
        return service.status(session_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="voice session not found")


@router.post("/voice/sessions/{session_id}/end")
async def end_voice_session(session_id: str, request: Request):
    service = get_voice_service(request)
    try:
        return service.end_session(session_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="voice session not found")
