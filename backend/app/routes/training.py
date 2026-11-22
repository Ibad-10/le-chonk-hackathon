"""Bonus track "Mistral Agents": admin training routes + the public research feed
(v4 §3.5 / §3.8, plan V4-13).

- POST /admin/training/{agent_id}/run   admin only; body {"force": bool} — an
  ADMIN can trigger a cycle on demand, bypassing the one-per-hour limit. House
  agents only (bank-ava, shop-max, assistant-pip); creator agents get 409.
- GET  /admin/training/{agent_id}/cycles  admin only: the logged cycles.
- GET  /research/latest  public: tactic names, families and source links only.

The admin check reuses the existing Clerk auth (`current_player`) plus the same
admin set that owns the house agents in app/auth.py (`ADMIN_PLAYER_IDS`,
`Player.is_admin`).
"""


from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import current_player
from app.config import settings
from app.db import Agent, Player
from app.research_agent import latest_scan, public_tactics
from app.training import NotHouseAgent, TrainingRateLimited, TrainingService

router = APIRouter()


def _engine(request: Request):
    return request.app.state.db_engine


def _training_service(request: Request) -> TrainingService:
    """The training service from app.state when wired (tests), otherwise built
    from the pieces the app lifespan already puts there."""
    svc = getattr(request.app.state, "training_service", None)
    if svc is None:
        retest_service = request.app.state.retest_service
        svc = TrainingService(
            _engine(request),
            retest_service.llm,
            getattr(request.app.state, "run_service", None),
        )
        request.app.state.training_service = svc
    return svc


async def require_admin(
    request: Request,
    authorization: str | None = Header(default=None),
    player: Player = Depends(current_player),
) -> Player:
    """Admin-only dependency: verified Clerk session + ADMIN_PLAYER_IDS / is_admin."""
    if not (player.is_admin or player.id in settings.admin_player_ids):
        raise HTTPException(status_code=403, detail="admin only")
    return player


class RunCycleRequest(BaseModel):
    force: bool = False  # ADMIN triggers on demand, bypassing the hourly limit


@router.post("/admin/training/{agent_id}/run")
async def run_training_cycle(
    agent_id: str,
    req: RunCycleRequest,
    request: Request,
    player: Player = Depends(require_admin),
):
    try:
        return await _training_service(request).run_cycle(agent_id, force=req.force)
    except NotHouseAgent as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except TrainingRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/admin/training/{agent_id}/cycles")
async def list_training_cycles(
    agent_id: str,
    request: Request,
    player: Player = Depends(require_admin),
):
    with Session(_engine(request)) as session:
        if session.get(Agent, agent_id) is None:
            raise HTTPException(status_code=404, detail="agent not found")
    return {"agent_id": agent_id, "cycles": _training_service(request).cycles(agent_id)}


@router.get("/research/latest")
async def research_latest(request: Request):
    """Public: the latest research-agent scan, reduced to tactic names,
    families and source links (never summaries or example lines)."""
    scan = latest_scan(_engine(request))
    if scan is None:
        return {"source": None, "created_at": None, "tactics": []}
    return {
        "source": scan.source,
        "created_at": scan.created_at.isoformat(),
        "tactics": public_tactics(scan.tactics),
    }


# --- house-agent duels (admin only; never offered to players) -----------------------


class DuelRequest(BaseModel):
    agent_a: str
    agent_b: str


def _duel_service(request: Request):
    from app.duels import DuelService
    from app.training import run_exam

    svc = getattr(request.app.state, "duel_service", None)
    if svc is None:
        from app.creator import load_runtime

        llm = request.app.state.retest_service.llm
        engine = _engine(request)

        async def exam(agent_id: str):
            _, instructions, knowledge = load_runtime(engine, agent_id)  # live published version
            return await run_exam(llm, agent_id, instructions, knowledge)

        svc = DuelService(exam)
        request.app.state.duel_service = svc
    return svc


@router.post("/admin/duels")
async def start_duel(req: DuelRequest, request: Request, admin: Player = Depends(require_admin)):
    from app.duels import DuelNotAllowed

    try:
        return {"job_id": _duel_service(request).start(req.agent_a, req.agent_b)}
    except DuelNotAllowed as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/admin/duels/{job_id}")
async def get_duel(job_id: str, request: Request, admin: Player = Depends(require_admin)):
    job = _duel_service(request).jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="no such duel")
    return job
