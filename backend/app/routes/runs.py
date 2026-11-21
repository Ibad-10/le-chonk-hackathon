"""HTTP routes for runs (Task 6): POST /runs, POST /runs/{id}/message, POST /runs/{id}/end."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.models import RunChannel, RunMode
from app.runs import NoLivesAvailable, RunNotFound, RunService
from pydantic import BaseModel

router = APIRouter()


class StartRunRequest(BaseModel):
    agent_id: str
    mission_id: str | None = None
    channel: RunChannel = "text"
    mode: RunMode = "arena"
    player_id: str = "anon"
    language: str = "auto"


class MessageRequest(BaseModel):
    text: str


def get_service(request: Request) -> RunService:
    return request.app.state.run_service


@router.post("/runs")
async def start_run(req: StartRunRequest, request: Request):
    service = get_service(request)
    try:
        run = service.start_run(
            agent_id=req.agent_id,
            mission_id=req.mission_id,
            channel=req.channel,
            mode=req.mode,
            player_id=req.player_id,
            language=req.language,
        )
    except NoLivesAvailable as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {
        "run_id": run.id,
        "agent_id": run.agent_id,
        "ends_at": run.started_at.timestamp()
        + (120 if run.channel == "voice" else 180),
    }


@router.post("/runs/{run_id}/message")
async def send_message(run_id: str, req: MessageRequest, request: Request):
    service = get_service(request)
    try:
        return await service.send_message(run_id, req.text)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")


@router.post("/runs/{run_id}/end")
async def end_run(run_id: str, request: Request):
    service = get_service(request)
    try:
        return service.end_run(run_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")
