"""Owner improvement loop (V4-6 + v4.1): drafts, analyse, retest jobs, publish,
knowledge-graph projection and version diffs.

The backend is the only database writer. Public routes only ever see the safe
serialisation in `app/routes/agents.py`; instructions, knowledge, transcripts
and the graph are owner-only and served from here.

Drafts live in the `agent_drafts` table (instructions max 2,000 chars, enforced
by the route with 422). `POST /drafts/{d}/retest` starts a background job
(`RetestService`) and returns the job id; the replay engine itself is in
`app/retest.py`. Publishing creates a new `agent_versions` row: the rating is
kept, the rating deviation widens to 200 and the arena cooldown is cleared.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any, Awaitable, Callable

from sqlalchemy import Engine
from sqlmodel import Session, select

from app.analyst import Analysis, analyze
from app.db import Agent, AgentDraft, AgentVersion, GraphEvent, LogbookEntry, PublicEvent, RunRow, HOUSE_AGENT_IDS
from app.llm import LLMClient
from app.models import Run
from app.repo import _to_run
from app.runs import RunService
from app.scoring import grade as grade_letter

MAX_INSTRUCTIONS_CHARS = 2000
PUBLISH_RD = 200.0  # uncertainty widens right after publishing (v4 §3.3)


def is_house_agent(agent: Agent) -> bool:
    return agent.id in HOUSE_AGENT_IDS or agent.owner_id is None


def _latest_version(session: Session, agent_id: str) -> AgentVersion | None:
    rows = session.exec(
        select(AgentVersion)
        .where(AgentVersion.agent_id == agent_id, AgentVersion.status == "published")
        .order_by(AgentVersion.version.desc())
    ).all()
    return rows[0] if rows else None


def _grade_of(session: Session, agent_id: str) -> str | None:
    version = _latest_version(session, agent_id)
    if version is None or version.exam_catch_rate is None or version.exam_false_block_rate is None:
        return None
    return grade_letter(version.exam_catch_rate, version.exam_false_block_rate)[1]


def _helpfulness_of(session: Session, agent_id: str) -> float | None:
    from app.scoring import helpfulness_score

    runs = [_to_run(r) for r in session.exec(select(RunRow).where(RunRow.agent_id == agent_id)).all()]
    return helpfulness_score(runs)


def public_agent(agent: Agent, engine: Engine, run_service: RunService | None = None) -> dict[str, Any]:
    """The safe arena-list serialisation. Never includes config (instructions,
    knowledge), transcripts or the graph."""
    with Session(engine) as session:
        grade = _grade_of(session, agent.id)
        helpfulness = _helpfulness_of(session, agent.id)
    cooldown = run_service.cooldown_until(agent.id) if run_service else None
    return {
        "id": agent.id,
        "name": agent.name,
        "stream": agent.stream,
        "rating": agent.rating,
        "rating_deviation": agent.rating_deviation,
        "grade": grade,
        "helpfulness": helpfulness,
        "current_version": agent.current_version,
        "cooldown_until": cooldown.isoformat() if cooldown else None,
        "is_house": is_house_agent(agent),
    }


def agent_stats(engine: Engine, agent_id: str) -> dict[str, int]:
    """runs / breaks / holds for `GET /agents/{id}`. A break is a player win
    (the agent was scammed); a hold is a contested run the agent survived."""
    with Session(engine) as session:
        rows = session.exec(select(RunRow).where(RunRow.agent_id == agent_id)).all()
    breaks = sum(1 for r in rows if r.outcome == "win")
    holds = sum(1 for r in rows if r.outcome in ("timeout", "abandoned"))
    return {"runs": len(rows), "breaks": breaks, "holds": holds}


# --- logbook + analyse -------------------------------------------------------


def list_logbook(engine: Engine, agent_id: str) -> list[LogbookEntry]:
    with Session(engine) as session:
        return list(
            session.exec(
                select(LogbookEntry)
                .where(LogbookEntry.agent_id == agent_id)
                .order_by(LogbookEntry.created_at.desc())
            ).all()
        )


async def analyse_agent(
    llm: LLMClient, engine: Engine, agent_id: str, agent_run: Any = None
) -> Analysis:
    """Run the analyst over the agent's open logbook entries, persist the root
    cause on each entry and record `root_cause` graph events. Explains only."""
    with Session(engine) as session:
        entries = list(
            session.exec(
                select(LogbookEntry).where(
                    LogbookEntry.agent_id == agent_id, LogbookEntry.open == True  # noqa: E712
                )
            ).all()
        )
        runs_by_id = {
            r.id: _to_run(r)
            for r in session.exec(select(RunRow).where(RunRow.agent_id == agent_id)).all()
        }
    result = await analyze(llm, llm.embed, entries, runs_by_id, agent_run=agent_run)
    with Session(engine) as session:
        all_entries = session.exec(
            select(LogbookEntry).where(LogbookEntry.agent_id == agent_id)
        ).all()
        for group in result.groups:
            newly_grouped: list[LogbookEntry] = []
            for entry in all_entries:
                if entry.run_id in group.example_run_ids and entry.open:
                    entry.root_cause = group.root_cause
                    newly_grouped.append(entry)
            # v4 §3.6: a new arena loss landing in an already-fixed (closed)
            # root-cause group reopens it with the flag fix_did_not_generalise
            closed = [
                e for e in all_entries
                if not e.open and e.root_cause == group.root_cause and e not in newly_grouped
            ]
            if closed and newly_grouped:
                for e in closed:
                    e.open = True
                    e.signals = list(e.signals) + ["fix_did_not_generalise"]
                for e in newly_grouped:
                    e.signals = list(e.signals) + ["fix_did_not_generalise"]
            session.add(
                GraphEvent(
                    id=uuid.uuid4().hex,
                    agent_id=agent_id,
                    type="root_cause",
                    payload={
                        "root_cause": group.root_cause,
                        "family": group.family,
                        "run_ids": group.example_run_ids,
                        "quotes": group.quotes,
                    },
                )
            )
        # V4-22: backfill the detected tactic family onto the matching
        # agent_broken public event (matched by the run_id in its payload,
        # which the /events route never serializes)
        broken_events = session.exec(
            select(PublicEvent).where(
                PublicEvent.agent_id == agent_id, PublicEvent.type == "agent_broken"
            )
        ).all()
        for group in result.groups:
            if not group.family:
                continue
            for entry in all_entries:
                if entry.run_id in group.example_run_ids:
                    for ev in broken_events:
                        if ev.payload.get("run_id") == entry.run_id:
                            ev.payload = {**ev.payload, "tactic_family": group.family}
        session.commit()
    return result


# --- drafts -------------------------------------------------------------------


def create_draft(engine: Engine, agent_id: str, instructions: str, knowledge: list[Any]) -> AgentDraft:
    if len(instructions) > MAX_INSTRUCTIONS_CHARS:
        raise ValueError("instructions exceed 2000 characters")
    with Session(engine) as session:
        existing = session.exec(
            select(AgentDraft).where(AgentDraft.agent_id == agent_id)
        ).all()
        version = max((d.version for d in existing), default=0) + 1
        draft = AgentDraft(
            id=uuid.uuid4().hex,
            agent_id=agent_id,
            version=version,
            instructions=instructions,
            knowledge=list(knowledge),
        )
        session.add(draft)
        session.commit()
        session.refresh(draft)
        return draft


def get_draft(engine: Engine, agent_id: str, version: int) -> AgentDraft | None:
    with Session(engine) as session:
        return session.exec(
            select(AgentDraft).where(
                AgentDraft.agent_id == agent_id, AgentDraft.version == version
            )
        ).first()


# --- publish ------------------------------------------------------------------


def publish_draft(
    engine: Engine, run_service: RunService | None, agent_id: str, draft_version: int
) -> dict[str, Any]:
    """Publish a draft as a new version: rating kept, rating_deviation 200,
    cooldown cleared, `version` graph event emitted."""
    with Session(engine) as session:
        draft = session.exec(
            select(AgentDraft).where(
                AgentDraft.agent_id == agent_id, AgentDraft.version == draft_version
            )
        ).first()
        if draft is None:
            raise KeyError(f"no draft {draft_version} for agent {agent_id}")
        if draft.status == "published":
            raise ValueError(f"draft {draft_version} is already published")
        # row lock: two parallel publishes can't both take the same version number
        agent = session.exec(select(Agent).where(Agent.id == agent_id).with_for_update()).first()
        if agent is None:
            raise KeyError(f"no agent {agent_id}")
        new_version = agent.current_version + 1
        session.add(
            AgentVersion(
                agent_id=agent_id,
                version=new_version,
                status="published",
                instructions=draft.instructions,
                knowledge=list(draft.knowledge),
            )
        )
        agent.current_version = new_version
        agent.rating_deviation = PUBLISH_RD  # rating carries over, never reset
        rating = agent.rating
        draft.status = "published"
        session.add(
            GraphEvent(
                id=uuid.uuid4().hex,
                agent_id=agent_id,
                type="version",
                payload={"version": new_version, "from_draft": draft.id},
            )
        )
        # V4-22: sanitized public event for the arena wall ticker
        session.add(
            PublicEvent(
                type="version_published",
                agent_id=agent_id,
                payload={"version": new_version},
            )
        )
        session.commit()
    if run_service is not None:
        run_service.clear_cooldown(agent_id)
    return {
        "agent_id": agent_id,
        "version": new_version,
        "rating": rating,
        "rating_deviation": PUBLISH_RD,
        "cooldown_cleared": True,
    }


# --- retest jobs ---------------------------------------------------------------


class RetestService:
    """Background retest jobs: `POST /drafts/{d}/retest` returns a job id, the
    replay engine (`app.retest.run_retest`) fills in progress + report."""

    def __init__(self, llm: LLMClient, engine: Engine, run_service: RunService | None = None) -> None:
        self.llm = llm
        self.engine = engine
        self.run_service = run_service
        self.jobs: dict[str, dict[str, Any]] = {}

    def start(self, agent_id: str, draft_version: int) -> str:
        from app.retest import run_retest

        job_id = uuid.uuid4().hex
        self.jobs[job_id] = {
            "job_id": job_id,
            "agent_id": agent_id,
            "draft_version": draft_version,
            "status": "running",
            "progress": {"done": 0, "total": 0},
            "report": None,
            "error": None,
        }

        async def _run() -> None:
            job = self.jobs[job_id]

            def on_progress(done: int, total: int) -> None:
                job["progress"] = {"done": done, "total": total}

            try:
                job["report"] = await run_retest(
                    self.llm, self.engine, agent_id, draft_version, on_progress=on_progress
                )
                job["status"] = "done"
            except Exception as exc:  # surfaced through GET /retest/{job}
                job["status"] = "error"
                job["error"] = str(exc)

        asyncio.create_task(_run())
        return job_id

    def get(self, job_id: str) -> dict[str, Any] | None:
        return self.jobs.get(job_id)


# --- knowledge graph -----------------------------------------------------------


def build_graph(engine: Engine, agent_id: str) -> dict[str, Any]:
    """Owner-only projection: version, attack, root_cause and learned nodes with
    attack->root_cause, root_cause->learned, learned->version and
    version->next-version links, built from logbook, analysis and graph_events."""
    nodes: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    with Session(engine) as session:
        versions = session.exec(
            select(AgentVersion)
            .where(AgentVersion.agent_id == agent_id)
            .order_by(AgentVersion.version)
        ).all()
        entries = session.exec(
            select(LogbookEntry).where(LogbookEntry.agent_id == agent_id)
        ).all()
        events = session.exec(
            select(GraphEvent).where(GraphEvent.agent_id == agent_id).order_by(GraphEvent.created_at)
        ).all()

    version_ids = {f"version-{v.version}" for v in versions}
    for v in versions:
        nodes.append(
            {
                "id": f"version-{v.version}",
                "type": "version",
                "version": v.version,
                "status": v.status,
                "created_at": v.created_at.isoformat(),
            }
        )
    for i, v in enumerate(versions):
        if i + 1 < len(versions):
            links.append({"source": f"version-{v.version}", "target": f"version-{versions[i + 1].version}", "type": "next_version"})

    root_cause_ids: dict[str, str] = {}
    for e in entries:
        nodes.append(
            {
                "id": f"attack-{e.id}",
                "type": "attack",
                "run_id": e.run_id,
                "loss_kind": e.loss_kind,
                "family": e.family,
                "open": e.open,
                "root_cause": e.root_cause,
            }
        )
        if e.root_cause and e.root_cause not in root_cause_ids:
            rc_id = f"root_cause-{len(root_cause_ids)}"
            root_cause_ids[e.root_cause] = rc_id
            nodes.append({"id": rc_id, "type": "root_cause", "label": e.root_cause})
    for e in entries:
        if e.root_cause:
            links.append(
                {"source": f"attack-{e.id}", "target": root_cause_ids[e.root_cause], "type": "root_cause"}
            )

    for ev in events:
        if ev.type == "root_cause":
            rc = ev.payload.get("root_cause", "")
            if rc and rc not in root_cause_ids:
                rc_id = f"root_cause-{len(root_cause_ids)}"
                root_cause_ids[rc] = rc_id
                nodes.append({"id": rc_id, "type": "root_cause", "label": rc})
        elif ev.type == "learned":
            node = {
                "id": f"learned-{ev.id}",
                "type": "learned",
                "attack_run_id": ev.payload.get("attack_run_id"),
                "draft_version": ev.payload.get("draft_version"),
                "created_at": ev.created_at.isoformat(),
            }
            nodes.append(node)
            rc = ev.payload.get("root_cause")
            if rc in root_cause_ids:
                links.append(
                    {"source": root_cause_ids[rc], "target": node["id"], "type": "learned"}
                )
            version = ev.payload.get("version") or ev.payload.get("draft_version")
            if version is not None and f"version-{version}" in version_ids:
                links.append(
                    {"source": node["id"], "target": f"version-{version}", "type": "learned_version"}
                )
    return {"nodes": nodes, "links": links}


# --- version diff --------------------------------------------------------------


def version_diff(engine: Engine, agent_id: str, from_v: int, to_v: int) -> dict[str, Any]:
    with Session(engine) as session:
        rows = {
            v.version: v
            for v in session.exec(
                select(AgentVersion).where(AgentVersion.agent_id == agent_id)
            ).all()
        }

    def _view(v: int) -> dict[str, Any]:
        row = rows.get(v)
        return {
            "version": v,
            "instructions": row.instructions if row else None,
            "knowledge": row.knowledge if row else None,
        }

    return {"agent_id": agent_id, "from": _view(from_v), "to": _view(to_v)}
