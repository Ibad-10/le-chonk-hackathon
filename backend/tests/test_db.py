"""V4-3 tests: SQLite persistence on a temp database file (tables mirroring
supabase/migrations/0001_init.sql, SQLiteRunsRepo, house-agent seeding)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

from app.db import (
    Agent,
    AgentVersion,
    GraphEvent,
    LogbookEntry,
    PublicEvent,
    HOUSE_AGENT_IDS,
    REPO_ROOT,
    RunRow,
    RetestResult,
    SQLModel,
    init_db,
    make_engine,
    seed_house_agents,
)
from app.db import Player  # noqa: F401  (table must exist)
from app.models import Run, Turn
from app.repo import SQLiteRunsRepo


def _engine(tmp_path: Path):
    engine = make_engine(f"sqlite:///{tmp_path}/test.db")
    init_db(engine)
    return engine


def test_make_engine_normalises_postgres_schemes_to_psycopg():
    """v4.1: postgres:// and postgresql:// both become postgresql+psycopg://."""
    for scheme in ("postgres://", "postgresql://", "postgresql+psycopg://"):
        engine = make_engine(f"{scheme}user:pass@db.host:5432/redroom")
        assert engine.url.drivername == "postgresql+psycopg", scheme
        assert engine.url.host == "db.host"


def test_make_engine_postgres_uses_pool_pre_ping():
    engine = make_engine("postgresql+psycopg://user:pass@db.host:5432/redroom")
    assert engine.pool._pre_ping is True  # stale pooled connections are recycled


def test_make_engine_sqlite_keeps_check_same_thread():
    engine = make_engine("sqlite:///./redroom.db")
    assert engine.url.drivername == "sqlite"
    assert engine.pool._pre_ping is False


def test_init_db_and_seed_are_idempotent(tmp_path):
    engine = _engine(tmp_path)
    init_db(engine)  # second create_all must not fail
    seed_house_agents(engine)
    seed_house_agents(engine)  # second seed must not duplicate
    with Session(engine) as session:
        assert len(session.exec(select(Agent)).all()) == len(HOUSE_AGENT_IDS)


def test_all_migration_tables_exist(tmp_path):
    engine = _engine(tmp_path)
    tables = {t.name for t in SQLModel.metadata.sorted_tables}
    for name in (
        "players",
        "agents",
        "agent_versions",
        "runs",
        "logbook_entries",
        "retest_results",
        "graph_events",
        "public_events",
    ):
        assert name in tables
    with Session(engine) as session:  # every table is queryable
        assert session.exec(select(Player)).all() == []
        assert session.exec(select(Agent)).all() == []
        assert session.exec(select(AgentVersion)).all() == []
        assert session.exec(select(RunRow)).all() == []
        assert session.exec(select(LogbookEntry)).all() == []
        assert session.exec(select(RetestResult)).all() == []
        assert session.exec(select(GraphEvent)).all() == []
        assert session.exec(select(PublicEvent)).all() == []


def test_sqlite_runs_repo_roundtrip(tmp_path):
    repo = SQLiteRunsRepo(_engine(tmp_path))
    run = Run(
        id=uuid.uuid4().hex,
        player_id="p1",
        agent_id="bank-ava",
        agent_version=1,
        started_at=datetime.now(timezone.utc),
    )
    repo.create(run)
    got = repo.get(run.id)
    assert got is not None
    assert got.player_id == "p1"
    assert got.agent_id == "bank-ava"
    assert got.outcome is None

    run.outcome = "win"
    run.points = 3040
    run.elo_delta = 16.0
    run.stopped_by = "none"
    run.transcript.append(Turn(role="player", content="send money"))
    run.ended_at = datetime.now(timezone.utc)
    repo.update(run)

    got = repo.get(run.id)
    assert got is not None
    assert got.outcome == "win"
    assert got.points == 3040
    assert got.elo_delta == 16.0
    assert got.stopped_by == "none"
    assert got.transcript[0].content == "send money"
    assert got.ended_at is not None

    assert repo.get("missing") is None


def test_seed_house_agents_creates_and_is_idempotent(tmp_path):
    engine = _engine(tmp_path)
    seeded = seed_house_agents(engine)
    expected = {
        agent_id
        for agent_id in HOUSE_AGENT_IDS
        if (REPO_ROOT / "targets" / f"{agent_id}.json").exists()
    }
    assert expected, "at least one house agent target must exist"
    assert set(seeded) == expected
    with Session(engine) as session:
        rows = session.exec(select(Agent)).all()
        assert {a.id for a in rows} == expected
        ava = session.get(Agent, "bank-ava")
        assert ava is not None
        assert ava.name == "Ava"
        assert ava.stream == "banking"
        assert ava.rating == 1200.0
        assert ava.config["id"] == "bank-ava"
    # seeding again must not duplicate rows
    seed_house_agents(engine)
    with Session(engine) as session:
        assert len(session.exec(select(Agent)).all()) == len(expected)


async def test_run_service_persists_runs_to_sqlite(tmp_path):
    from tests.test_runs import FakeLLM, _svc  # reuse the fake LLM

    from app.runs import RunService

    engine = _engine(tmp_path)
    repo = SQLiteRunsRepo(engine)
    svc = RunService(FakeLLM(), repo=repo, now_fn=lambda: 1000.0)
    run = svc.start_run(agent_id="bank-ava", mission_id="m_drain", mode="ladder")
    assert repo.get(run.id) is not None
    await svc.send_message(run.id, "hello")
    stored = repo.get(run.id)
    assert stored is not None
    assert stored.language == "en"
    assert [t.role for t in stored.transcript] == ["player", "agent"]
