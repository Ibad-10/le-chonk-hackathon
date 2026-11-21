"""Public agent + leaderboard routes (v4): GET /agents, GET /agents/{id},
GET /leaderboard/players, GET /leaderboard/agents?stream=.

These return only the safe serialisation from `app.improvement.public_agent`:
never instructions, knowledge, transcripts, config or the graph.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from sqlmodel import Session, select

from app.db import Agent, Player
from app.improvement import agent_stats, public_agent

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
    with Session(_engine(request)) as session:
        players = session.exec(select(Player).order_by(Player.xp.desc()).limit(limit)).all()
        return [
            {
                "id": p.id,
                "handle": p.handle,
                "xp": p.xp,
                "rank": p.rank,
                "is_admin": p.is_admin,
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
