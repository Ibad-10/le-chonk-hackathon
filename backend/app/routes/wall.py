"""Arena-wall routes (V4-22): GET /events and GET /now-playing.

Both are public and privacy-safe by construction: /events re-serializes
`public_events` through an allowlist (type, agent id/name, tactic family,
version, timestamps — never transcripts, instructions or payload internals);
/now-playing lists only live runs whose player opted in with `spectate: true`
and returns the last caption lines only.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlmodel import Session, select

from app.db import Agent, PublicEvent

router = APIRouter()

# Allowlisted fields of a public event; anything else in the payload row is
# dropped on serialization.
_EVENT_KEYS = {
    "id", "type", "kind", "agent_id", "agent_name",
    "tactic_family", "version", "created_at", "at",
}


def _engine(request: Request):
    return request.app.state.db_engine


def _run_service(request: Request):
    return getattr(request.app.state, "run_service", None)


@router.get("/events")
async def list_events(request: Request, limit: int = Query(50, ge=1, le=200)):
    """Recent sanitized public events for the arena-wall ticker, newest first."""
    with Session(_engine(request)) as session:
        rows = session.exec(
            select(PublicEvent).order_by(PublicEvent.created_at.desc()).limit(limit)
        ).all()
        names = {
            a.id: a.name
            for a in session.exec(select(Agent)).all()
        }
    events: list[dict] = []
    for row in rows:
        payload = row.payload or {}
        key = (row.type, row.agent_id, payload.get("version"), payload.get("tactic_family"))
        if events and events[-1]["_key"] == key:  # collapse repeats into one line with a count
            events[-1]["count"] += 1
            continue
        events.append(
            {
                "id": row.id,
                "type": row.type,
                "kind": row.type,
                "agent_id": row.agent_id,
                "agent_name": names.get(row.agent_id, row.agent_id),
                "tactic_family": payload.get("tactic_family"),
                "version": payload.get("version"),
                "created_at": row.created_at.isoformat(),
                "at": row.created_at.isoformat(),
                "count": 1,
                "_key": key,
            }
        )
    for e in events:
        del e["_key"]
    return events


@router.get("/now-playing")
async def now_playing(request: Request):
    """Live opted-in runs (spectate=true) with agent, channel, elapsed and the
    last caption lines only."""
    service = _run_service(request)
    if service is None:
        return []
    return service.now_playing()
