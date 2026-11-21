"""SQLite RunsRepo (V4-3): the RunsRepo protocol backed by the `runs` table.

Rows mirror the Run pydantic model; transcript and tool_calls are stored as
JSON columns. Used by RunService for every run create/update.
"""

from __future__ import annotations

from typing import Protocol

from sqlalchemy import Engine
from sqlmodel import Session, select

from app.db import LogbookEntry, RunRow
from app.models import Run


def _to_row(run: Run) -> RunRow:
    return RunRow(
        id=run.id,
        player_id=run.player_id,
        agent_id=run.agent_id,
        agent_version=run.agent_version,
        channel=run.channel,
        mode=run.mode,
        mission_id=run.mission_id,
        wave=run.wave,
        language=run.language,
        transcript=[t.model_dump() for t in run.transcript],
        tool_calls=[c.model_dump() for c in run.tool_calls],
        outcome=run.outcome,
        stopped_by=run.stopped_by,
        role=run.role,
        loss_kind=run.loss_kind,
        spectate=run.spectate,
        how_close=run.how_close,
        points=run.points,
        elo_delta=run.elo_delta,
        started_at=run.started_at,
        ended_at=run.ended_at,
    )


def _to_run(row: RunRow) -> Run:
    return Run.model_validate(
        {
            "id": row.id,
            "player_id": row.player_id or "anon",
            "agent_id": row.agent_id,
            "agent_version": row.agent_version,
            "channel": row.channel,
            "mode": row.mode,
            "mission_id": row.mission_id,
            "wave": row.wave,
            "language": row.language,
            "transcript": row.transcript,
            "tool_calls": row.tool_calls,
            "outcome": row.outcome,
            "stopped_by": row.stopped_by,
            "role": row.role,
            "loss_kind": row.loss_kind,
            "spectate": row.spectate,
            "how_close": row.how_close,
            "points": row.points,
            "elo_delta": row.elo_delta,
            "started_at": row.started_at,
            "ended_at": row.ended_at,
        }
    )


class SQLiteRunsRepo:
    """RunsRepo implementation on SQLite via SQLModel."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def create(self, run: Run) -> None:
        with Session(self._engine) as session:
            session.add(_to_row(run))
            session.commit()

    def get(self, run_id: str) -> Run | None:
        with Session(self._engine) as session:
            row = session.exec(select(RunRow).where(RunRow.id == run_id)).first()
            return _to_run(row) if row is not None else None

    def update(self, run: Run) -> None:
        with Session(self._engine) as session:
            row = session.get(RunRow, run.id)
            if row is None:
                session.add(_to_row(run))
            else:
                fresh = _to_row(run)
                for field in RunRow.model_fields:
                    if field != "id":
                        setattr(row, field, getattr(fresh, field))
            session.commit()


class LogbookRepo(Protocol):
    def record(self, entry: LogbookEntry) -> None: ...
    def open_entries(self, agent_id: str) -> list[LogbookEntry]: ...


class SQLiteLogbookRepo:
    """LogbookRepo implementation on the `logbook_entries` table."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def record(self, entry: LogbookEntry) -> None:
        with Session(self._engine) as session:
            session.add(entry)
            session.commit()

    def open_entries(self, agent_id: str) -> list[LogbookEntry]:
        with Session(self._engine) as session:
            return list(
                session.exec(
                    select(LogbookEntry).where(
                        LogbookEntry.agent_id == agent_id, LogbookEntry.open == True  # noqa: E712
                    )
                ).all()
            )
