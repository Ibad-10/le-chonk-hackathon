"""SQLite persistence (V4-3): SQLModel tables mirroring supabase/migrations/0001_init.sql.

The backend is the only database writer. The database URL comes from config
`DATABASE_URL` (default `sqlite:///./redroom.db`; `*.db` is git-ignored).
`seed_house_agents` inserts the three house agents (Ava, Max, Pip) from their
targets/*.json configs when missing, so a fresh database is ready to serve.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import Column, JSON
from sqlalchemy import Engine
from sqlmodel import Field, Session, SQLModel, create_engine

from app.config import settings

REPO_ROOT = Path(__file__).resolve().parents[2]
TARGETS_DIR = REPO_ROOT / "targets"

# Red Room's own house agents (the three streams: banking, support, assistant)
HOUSE_AGENT_IDS = ("bank-ava", "shop-max", "assistant-pip")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Player(SQLModel, table=True):
    __tablename__ = "players"

    id: str = Field(primary_key=True)
    handle: str = Field(unique=True)
    team: str | None = None
    xp: int = 0
    rank: str | None = None
    lives: int = 3
    lives_refill_at: datetime | None = None
    wallet_address: str | None = None
    is_admin: bool = False
    created_at: datetime = Field(default_factory=_now)


class Agent(SQLModel, table=True):
    __tablename__ = "agents"

    id: str = Field(primary_key=True)
    name: str
    domain: str
    stream: str | None = None
    visibility: str = "public"
    owner_id: str | None = None
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    current_version: int = 1
    elo: float | None = None  # legacy column kept from the migration
    rating: float = 1200.0
    rating_deviation: float = 350.0
    first_blood_open: bool = True
    created_at: datetime = Field(default_factory=_now)


class AgentVersion(SQLModel, table=True):
    __tablename__ = "agent_versions"

    agent_id: str = Field(primary_key=True, foreign_key="agents.id")
    version: int = Field(primary_key=True)
    status: str = "published"
    instructions: str = ""  # v4: owner instructions of this version (diffable)
    knowledge: list[Any] = Field(default_factory=list, sa_column=Column(JSON))  # v4: owner knowledge
    rulebook_rule_ids: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    examples: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
    created_from_run_id: str | None = None
    grade_score: float | None = None
    exam_catch_rate: float | None = None
    exam_false_block_rate: float | None = None
    unbeaten_since: datetime | None = None


class RunRow(SQLModel, table=True):
    __tablename__ = "runs"

    id: str = Field(primary_key=True)
    player_id: str | None = Field(default=None, foreign_key="players.id")
    agent_id: str = Field(foreign_key="agents.id")
    agent_version: int
    channel: str = "text"
    mode: str = "arena"
    mission_id: str | None = None
    wave: int | None = None
    language: str = "auto"
    transcript: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    tool_calls: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    outcome: str | None = None
    stopped_by: str | None = None
    role: str | None = None  # v4.1: dealt role on arena runs
    loss_kind: str | None = None  # "security" | "helpfulness" on agent losses
    spectate: bool = False  # v4.1: player opted in to live spectators (arena wall)
    how_close: int = 0
    points: int = 0
    elo_delta: float = 0.0
    started_at: datetime = Field(default_factory=_now)
    ended_at: datetime | None = None


class LogbookEntry(SQLModel, table=True):
    __tablename__ = "logbook_entries"

    id: str = Field(primary_key=True)
    agent_id: str = Field(foreign_key="agents.id")
    version: int
    run_id: str = Field(foreign_key="runs.id")
    outcome: str
    stopped_by: str | None = None
    family: str | None = None  # tactic family, filled by the analyst
    root_cause: str | None = None  # v4: analyst group this entry belongs to
    siblings: list[Any] = Field(default_factory=list, sa_column=Column(JSON))  # v4: cached sibling variants
    language: str | None = None  # v4.1: caller language of the run
    loss_kind: str | None = None  # "security" | "helpfulness"
    signals: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    how_close: int = 0
    open: bool = True
    created_at: datetime = Field(default_factory=_now)


class AgentDraft(SQLModel, table=True):
    """Owner draft (v4): a candidate instructions + knowledge pair, retested
    before it can be published as a new agent version."""

    __tablename__ = "agent_drafts"

    id: str = Field(primary_key=True)
    agent_id: str = Field(foreign_key="agents.id")
    version: int  # draft number d (per agent)
    instructions: str = ""
    knowledge: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    status: str = "draft"  # draft | published
    created_at: datetime = Field(default_factory=_now)


class RetestResult(SQLModel, table=True):
    __tablename__ = "retest_results"

    id: str = Field(primary_key=True)
    draft_version: int
    log_entry_id: str = Field(foreign_key="logbook_entries.id")
    blocked_count: int = 0
    repeats: int = 3
    label: str | None = None
    created_at: datetime = Field(default_factory=_now)


class GraphEvent(SQLModel, table=True):
    __tablename__ = "graph_events"

    id: str = Field(primary_key=True)
    agent_id: str = Field(foreign_key="agents.id")
    type: str
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


class PublicEvent(SQLModel, table=True):
    __tablename__ = "public_events"

    id: int | None = Field(default=None, primary_key=True)
    type: str
    agent_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)


def normalise_database_url(url: str) -> str:
    """v4.1: bare `postgres://` / `postgresql://` URLs use the psycopg driver."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def make_engine(url: str | None = None) -> Engine:
    """Engine for `DATABASE_URL` (default sqlite:///./redroom.db).

    Postgres (Supabase) URLs go through psycopg with `pool_pre_ping=True` so
    stale pooled connections are recycled; SQLite keeps check_same_thread.
    """
    database_url = normalise_database_url(url or settings.database_url)
    if database_url.startswith("sqlite"):
        return create_engine(database_url, connect_args={"check_same_thread": False})
    return create_engine(database_url, pool_pre_ping=True)


def init_db(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)


def seed_house_agents(engine: Engine) -> list[str]:
    """Insert the house agents from their targets/*.json configs if missing.

    Returns the agent ids present after seeding. Idempotent.
    """
    seeded: list[str] = []
    with Session(engine) as session:
        from sqlmodel import select

        for agent_id in HOUSE_AGENT_IDS:
            path = TARGETS_DIR / f"{agent_id}.json"
            if not path.exists():
                continue  # target file lands with its stream (V4-4)
            exists = session.exec(select(Agent).where(Agent.id == agent_id)).first()
            if exists is not None:
                seeded.append(agent_id)
                continue
            config = json.loads(path.read_text(encoding="utf-8"))
            session.add(
                Agent(
                    id=agent_id,
                    name=config.get("name", agent_id),
                    domain=config.get("domain", ""),
                    stream=config.get("stream"),
                    visibility=config.get("visibility", "public"),
                    config=config,
                )
            )
            seeded.append(agent_id)
        session.commit()
    return seeded


def bootstrap_from_env() -> list[str]:
    """One-shot startup against `DATABASE_URL` from the repo-root .env.

    Runs create_all + house-agent seed once (idempotent) and returns the table
    names present. An empty `DATABASE_URL` returns [] (caller skips and says
    so). Never prints or logs the URL.
    """
    import os

    from dotenv import load_dotenv
    from sqlalchemy import inspect

    load_dotenv(REPO_ROOT / ".env")
    raw = os.environ.get("DATABASE_URL", "")
    if not raw:
        return []
    engine = make_engine(raw)
    init_db(engine)
    seed_house_agents(engine)
    return sorted(inspect(engine).get_table_names())


if __name__ == "__main__":
    tables = bootstrap_from_env()
    if not tables:
        print("DATABASE_URL is empty in ../.env; skipping (SQLite stays the default for tests).")
    else:
        print("tables:", ", ".join(tables))
