"""HTTP routes for runs (v4): POST /runs, POST /runs/{id}/message,
POST /runs/{id}/end, GET /runs/{id}/stream?text=... (SSE, live text chat)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth import current_player, stream_player
from app.config import settings
from app.db import Player
from app.models import RunChannel, RunMode
from app.runs import (
    AgentInCooldown,
    AgentNotFound,
    NoLivesAvailable,
    RunForbidden,
    RunNotFound,
    RunService,
)

from app.ratelimit import check as check_rate, limit

router = APIRouter()


class StartRunRequest(BaseModel):
    agent_id: str = Field(max_length=80)
    mission_id: str | None = Field(default=None, max_length=40)
    channel: RunChannel = "text"
    mode: RunMode = "arena"
    player_id: str = "anon"  # deprecated: ignored, the verified `sub` is used
    language: str = Field(default="auto", max_length=40)  # unknown -> "auto"
    spectate: bool = False  # v4.1: opt in to live spectators (GET /now-playing)


MAX_MESSAGE_CHARS = 2000


class MessageRequest(BaseModel):
    text: str = Field(max_length=MAX_MESSAGE_CHARS)


def get_service(request: Request) -> RunService:
    return request.app.state.run_service


def start_errors(exc: Exception) -> HTTPException:
    """RunService.start_run errors -> HTTP (shared with the voice routes)."""
    if isinstance(exc, RunForbidden):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, AgentNotFound):
        return HTTPException(status_code=404, detail="agent not found")
    return HTTPException(status_code=409, detail=str(exc))  # no lives / cooldown


START_ERRORS = (RunForbidden, AgentNotFound, NoLivesAvailable, AgentInCooldown)


def _own_run(service: RunService, run_id: str, player: Player) -> None:
    """404 for unknown runs, 403 unless the caller started the run."""
    try:
        owner = service.owner_of(run_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")
    if owner != player.id:
        raise HTTPException(status_code=403, detail="not your run")


@router.post("/runs", dependencies=[limit("start")])
async def start_run(req: StartRunRequest, request: Request, player: Player = Depends(current_player)):
    service = get_service(request)
    try:
        # mode gate, owner-only practice and arena rules live in start_run
        run = service.start_run(
            agent_id=req.agent_id,
            mission_id=req.mission_id,
            channel=req.channel,
            mode=req.mode,
            language=req.language,
            spectate=req.spectate,  # v4.1: arena-wall opt-in
            caller=player,  # v4.1: the player is the verified Clerk user
        )
    except START_ERRORS as exc:
        raise start_errors(exc)
    duration = settings.run_voice_s if run.channel == "voice" else settings.run_text_s
    return {
        "run_id": run.id,
        "agent_id": run.agent_id,
        "ends_at": run.started_at.timestamp() + duration,
        "role": run.role,  # v4.1: the dealt role, with the player-only brief
        "brief": service.brief_for(run.id),
    }


@router.post("/runs/{run_id}/message", dependencies=[limit("chat")])
async def send_message(
    run_id: str, req: MessageRequest, request: Request, player: Player = Depends(current_player)
):
    service = get_service(request)
    _own_run(service, run_id, player)
    try:
        return await service.send_message(run_id, req.text)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")


@router.get("/runs/{run_id}/stream")
async def stream_message(
    run_id: str, request: Request, text: str = Query(..., max_length=MAX_MESSAGE_CHARS), player: Player = Depends(stream_player)
):
    """Live text chat over server-sent events.

    `event: chunk` carries one streamed piece of the agent's reply;
    the final `event: done` carries tool_events, ended and outcome (tool calls
    still go through the sandbox executor and win checks before it).
    """
    check_rate(player.id, "chat")
    service = get_service(request)
    _own_run(service, run_id, player)

    async def gen():
        try:
            async for event in service.stream_message(run_id, text):
                yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
        except RunNotFound:
            yield "event: error\ndata: " + json.dumps({"detail": "run not found"}) + "\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/runs/{run_id}/end")
async def end_run(run_id: str, request: Request, player: Player = Depends(current_player)):
    service = get_service(request)
    _own_run(service, run_id, player)
    try:
        return service.end_run(run_id)
    except RunNotFound:
        raise HTTPException(status_code=404, detail="run not found")
