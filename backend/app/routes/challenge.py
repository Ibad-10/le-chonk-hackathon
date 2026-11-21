"""GET /challenge/today and GET /ranks."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.challenge import challenge_for, ranks_payload
from app.research_agent import latest_scan, public_tactics

router = APIRouter()


@router.get("/challenge/today")
def challenge_today(request: Request):
    researched = None
    engine = getattr(request.app.state, "db_engine", None)
    if engine is not None:
        try:
            scan = latest_scan(engine)
            researched = public_tactics(scan.tactics) if scan else None
        except Exception:  # no research table yet: taxonomy fallback
            researched = None
    return challenge_for(datetime.now(timezone.utc).date(), researched)


@router.get("/ranks")
def ranks():
    return {"ranks": ranks_payload()}
