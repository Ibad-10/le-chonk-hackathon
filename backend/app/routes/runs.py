"""HTTP routes for runs (v4): POST /runs, POST /runs/{id}/message,
POST /runs/{id}/end, GET /runs/{id}/stream?text=... (SSE, live text chat)."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.models import RunChannel, RunMode
from app.runs import NoLivesAvailable, RunNotFound, RunService

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
    duration = settings.run_voice_s if run.channel == "voice" else settings.run_text_s
    return {
        "run_id": run.id,
        "agent_id": run.agent_id,
        "ends_at": run.started_at.timestamp() + duration,
    }


@router.post("/runs/{run_id}/message")
async def send_message(run_id: str, req: MessageRequest, request: Request):
    service = get_service(request)
    try:
        return await service.send_message(run_id, req.text)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")


@router.get("/runs/{run_id}/stream")
async def stream_message(run_id: str, request: Request, text: str = Query(...)):
    """Live text chat over server-sent events.

    `event: chunk` carries one streamed piece of the agent's reply;
    the final `event: done` carries tool_events, ended and outcome (tool calls
    still go through the sandbox executor and win checks before it).
    """
    service = get_service(request)

    async def gen():
        try:
            async for event in service.stream_message(run_id, text):
                yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
        except RunNotFound:
            yield "event: error\ndata: " + json.dumps({"detail": "run not found"}) + "\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/runs/{run_id}/end")
async def end_run(run_id: str, request: Request):
    service = get_service(request)
    try:
        return service.end_run(run_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")
