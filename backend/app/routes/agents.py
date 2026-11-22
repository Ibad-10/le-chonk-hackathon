"""Public agent + leaderboard routes (v4): GET /agents, GET /agents/{id},
GET /leaderboard/players, GET /leaderboard/agents?stream=.

These return only the safe serialisation from `app.improvement.public_agent`:
never instructions, knowledge, transcripts, config or the graph.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import case
from sqlmodel import Session, func, select

from app.auth import current_player, require_agent_owner
from app.creator import AgentLimitReached, create_agent
from app.db import Agent, Player, RunRow
from app.runs import START_ELO
from app.improvement import MAX_INSTRUCTIONS_CHARS, agent_stats, public_agent

from app.ratelimit import limit

router = APIRouter()


def _engine(request: Request):
    return request.app.state.db_engine


def _run_service(request: Request):
    return getattr(request.app.state, "run_service", None)


@router.get("/agents")
async def list_agents(request: Request):
    """Arena list: public agents with safe fields only."""
    with Session(_engine(request)) as session:
        agents = session.exec(select(Agent).where(Agent.visibility == "public")).all()
        return [public_agent(a, _engine(request), _run_service(request)) for a in agents]


@router.get("/agents/mine")
async def my_agents(request: Request, player: Player = Depends(current_player)):
    """The signed-in owner's own agents (agents.owner_id == Clerk user id).
    Declared before /agents/{agent_id} so "mine" is not swallowed by it."""
    with Session(_engine(request)) as session:
        agents = session.exec(select(Agent).where(Agent.owner_id == player.id)).all()
        return [public_agent(a, _engine(request), _run_service(request)) for a in agents]


class CreateAgentRequest(BaseModel):
    name: str = Field(min_length=3, max_length=40)
    stream: Literal["banking", "support", "assistant"]
    instructions: str = Field(default="", max_length=MAX_INSTRUCTIONS_CHARS)
    knowledge: str = Field(default="", max_length=8000)
    visibility: Literal["public", "private"] = "private"


class PatchAgentRequest(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=40)
    visibility: Literal["public", "private"] | None = None


def _owned(request: Request, agent_id: str, player: Player) -> Agent:
    with Session(_engine(request)) as session:
        agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    require_agent_owner(agent, player)
    return agent


@router.post("/agents", status_code=201, dependencies=[limit("create")])
async def create_agent_route(
    req: CreateAgentRequest, request: Request, player: Player = Depends(current_player)
):
    try:
        agent = create_agent(
            _engine(request), player.id, req.name, req.stream,
            req.instructions, req.knowledge, req.visibility,
        )
    except AgentLimitReached:
        raise HTTPException(status_code=409, detail="max 3 agents per player")
    return public_agent(agent, _engine(request), _run_service(request))


@router.patch("/agents/{agent_id}")
async def patch_agent(
    agent_id: str, req: PatchAgentRequest, request: Request, player: Player = Depends(current_player)
):
    _owned(request, agent_id, player)
    with Session(_engine(request)) as session:
        agent = session.get(Agent, agent_id)
        if req.name is not None:
            agent.name = req.name
            if agent.config:
                agent.config = {**agent.config, "name": req.name}
        if req.visibility is not None:
            agent.visibility = req.visibility
            if agent.config:
                agent.config = {**agent.config, "visibility": req.visibility}
        session.add(agent)
        session.commit()
        session.refresh(agent)
    return public_agent(agent, _engine(request), _run_service(request))


@router.post("/agents/{agent_id}/placement", dependencies=[limit("retest")])
async def start_placement(agent_id: str, request: Request, player: Player = Depends(current_player)):
    _owned(request, agent_id, player)
    return {"job_id": request.app.state.placement_service.start(agent_id)}


@router.get("/agents/{agent_id}/placement/{job_id}")
async def get_placement(
    agent_id: str, job_id: str, request: Request, player: Player = Depends(current_player)
):
    _owned(request, agent_id, player)
    job = request.app.state.placement_service.get(job_id)
    if job is None or job["agent_id"] != agent_id:
        raise HTTPException(status_code=404, detail="placement job not found")
    return job


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, request: Request):
    with Session(_engine(request)) as session:
        agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    data = public_agent(agent, _engine(request), _run_service(request))
    data["stats"] = agent_stats(_engine(request), agent_id)
    return data


@router.get("/leaderboard/players")
async def leaderboard_players(request: Request, limit: int = Query(50, ge=1, le=200)):
    """Rows match frontend PlayerLeaderboardEntry: points = persisted xp,
    rating = 1200 + sum(arena elo_delta), wins = arena runs won."""
    with Session(_engine(request)) as session:
        players = session.exec(select(Player).order_by(Player.xp.desc()).limit(limit)).all()
        stats = {
            pid: (float(delta or 0.0), int(wins or 0))
            for pid, delta, wins in session.exec(
                select(
                    RunRow.player_id,
                    func.sum(RunRow.elo_delta),
                    func.sum(case((RunRow.outcome == "win", 1), else_=0)),
                )
                .where(RunRow.mode == "arena")
                .group_by(RunRow.player_id)
            ).all()
        }
        return [
            {
                "player_id": p.id,
                "name": (f"Player {p.id[-4:]}" if p.handle.startswith("player-") else p.handle),
                "rating": START_ELO + stats.get(p.id, (0.0, 0))[0],
                "wins": stats.get(p.id, (0.0, 0))[1],
                "points": p.xp,
            }
            for p in players
        ]


@router.get("/leaderboard/agents")
async def leaderboard_agents(request: Request, stream: str | None = Query(default=None)):
    with Session(_engine(request)) as session:
        query = select(Agent).where(Agent.visibility == "public")
        if stream:
            query = query.where(Agent.stream == stream)
        agents = session.exec(query.order_by(Agent.rating.desc())).all()
        return [public_agent(a, _engine(request), _run_service(request)) for a in agents]
