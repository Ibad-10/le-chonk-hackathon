"""Owner-only routes (v4): logbook, analyse, drafts, retest, publish, graph,
version diff. Every route requires a verified Clerk session and the owner check
(`is_agent_owner`; house agents are owned by ADMIN_PLAYER_IDS)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.auth import current_player, is_agent_owner
from app.db import Agent, AgentDraft, AgentVersion, Player, RetestResult
from app.improvement import (
    MAX_INSTRUCTIONS_CHARS,
    RetestService,
    analyse_agent,
    build_graph,
    create_draft,
    get_draft,
    list_logbook,
    publish_draft,
    version_diff,
)

router = APIRouter()


def _engine(request: Request):
    return request.app.state.db_engine


def _retest_service(request: Request) -> RetestService:
    return request.app.state.retest_service


def _run_service(request: Request):
    return getattr(request.app.state, "run_service", None)


def _get_agent(request: Request, agent_id: str) -> Agent:
    with Session(_engine(request)) as session:
        agent = session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return agent


def _owner_agent(request: Request, agent_id: str, player: Player) -> Agent:
    agent = _get_agent(request, agent_id)
    if not is_agent_owner(agent, player):  # open to all signed-in players when OPEN_ACCESS=1
        raise HTTPException(status_code=403, detail="not the agent owner")
    return agent


class CreateDraftRequest(BaseModel):
    instructions: str = Field(default="", max_length=MAX_INSTRUCTIONS_CHARS)
    knowledge: list = Field(default_factory=list)


@router.get("/agents/{agent_id}/logbook")
async def get_logbook(agent_id: str, request: Request, player: Player = Depends(current_player)):
    _owner_agent(request, agent_id, player)
    entries = list_logbook(_engine(request), agent_id)
    return {"entries": [e.model_dump(mode="json") for e in entries]}


@router.post("/agents/{agent_id}/analyse")
async def post_analyse(agent_id: str, request: Request, player: Player = Depends(current_player)):
    _owner_agent(request, agent_id, player)
    llm = _retest_service(request).llm
    analysis = await analyse_agent(llm, _engine(request), agent_id)
    return analysis.model_dump(mode="json")


@router.post("/agents/{agent_id}/drafts", status_code=201)
async def post_draft(
    agent_id: str, req: CreateDraftRequest, request: Request, player: Player = Depends(current_player)
):
    _owner_agent(request, agent_id, player)
    if len(req.instructions) > MAX_INSTRUCTIONS_CHARS:  # belt and braces: 422
        raise HTTPException(status_code=422, detail="instructions exceed 2000 characters")
    draft = create_draft(_engine(request), agent_id, req.instructions, req.knowledge)
    return draft.model_dump(mode="json")


@router.get("/agents/{agent_id}/drafts/{draft_version}")
async def get_draft_route(
    agent_id: str, draft_version: int, request: Request, player: Player = Depends(current_player)
):
    _owner_agent(request, agent_id, player)
    draft = get_draft(_engine(request), agent_id, draft_version)
    if draft is None:
        raise HTTPException(status_code=404, detail="draft not found")
    return draft.model_dump(mode="json")


@router.post("/agents/{agent_id}/drafts/{draft_version}/retest")
async def post_retest(
    agent_id: str, draft_version: int, request: Request, player: Player = Depends(current_player)
):
    _owner_agent(request, agent_id, player)
    if get_draft(_engine(request), agent_id, draft_version) is None:
        raise HTTPException(status_code=404, detail="draft not found")
    job_id = _retest_service(request).start(agent_id, draft_version)
    return {"job_id": job_id}


@router.get("/agents/{agent_id}/retest/{job_id}")
async def get_retest_job(
    agent_id: str, job_id: str, request: Request, player: Player = Depends(current_player)
):
    _owner_agent(request, agent_id, player)
    job = _retest_service(request).get(job_id)
    if job is None or job["agent_id"] != agent_id:
        raise HTTPException(status_code=404, detail="retest job not found")
    return job


@router.post("/agents/{agent_id}/drafts/{draft_version}/publish")
async def post_publish(
    agent_id: str, draft_version: int, request: Request, player: Player = Depends(current_player)
):
    _owner_agent(request, agent_id, player)
    try:
        return publish_draft(_engine(request), _run_service(request), agent_id, draft_version)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/agents/{agent_id}/graph")
async def get_graph(agent_id: str, request: Request, player: Player = Depends(current_player)):
    _owner_agent(request, agent_id, player)
    return build_graph(_engine(request), agent_id)


@router.get("/agents/{agent_id}/versions")
async def list_versions(
    agent_id: str, request: Request, player: Player = Depends(current_player)
):
    """Owner-only version list: published versions plus still-open drafts, each
    with status, created_at and a retest summary (cases / blocked / labels)."""
    _owner_agent(request, agent_id, player)
    engine = _engine(request)
    with Session(engine) as session:
        versions = session.exec(
            select(AgentVersion).where(AgentVersion.agent_id == agent_id)
        ).all()
        drafts = session.exec(
            select(AgentDraft).where(
                AgentDraft.agent_id == agent_id, AgentDraft.status == "draft"
            )
        ).all()
        retests = session.exec(select(RetestResult)).all()

    def _retest_summary(version: int) -> dict:
        rows = [r for r in retests if r.draft_version == version]
        return {
            "cases": len(rows),
            "blocked": sum(r.blocked_count for r in rows),
            "fixed": sum(1 for r in rows if r.label == "fixed"),
            "flaky": sum(1 for r in rows if r.label == "flaky"),
            "still_failing": sum(1 for r in rows if r.label == "still_failing"),
        }

    out = []
    for v in versions:
        out.append(
            {
                "version": v.version,
                "status": v.status,
                "created_at": v.created_at.isoformat(),
                "published_at": v.created_at.isoformat(),
                "instructions": v.instructions,
                "knowledge": v.knowledge,
                "retest": _retest_summary(v.version),
            }
        )
    for d in drafts:
        out.append(
            {
                "version": d.version,
                "status": "draft",
                "created_at": d.created_at.isoformat(),
                "published_at": None,
                "instructions": d.instructions,
                "knowledge": d.knowledge,
                "retest": _retest_summary(d.version),
            }
        )
    out.sort(key=lambda x: (x["version"], x["status"]))
    return out


@router.get("/agents/{agent_id}/versions/diff")
async def get_version_diff(
    agent_id: str,
    request: Request,
    from_: int = Query(..., alias="from"),
    to: int = Query(...),
    player: Player = Depends(current_player),
):
    _owner_agent(request, agent_id, player)
    return version_diff(_engine(request), agent_id, from_, to)
