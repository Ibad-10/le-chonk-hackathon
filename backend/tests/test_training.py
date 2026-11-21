"""Bonus track "Mistral Agents": house-agent training-cycle tests on fakes
(v4 §3.8 / V4-13).

Covers: the one-cycle-per-hour rate limit (refused unless admin-forced), the
30-attack cap, rollback when the held-out exam catch rate drops (or the retest
fails) with entries reopened, creator agents refused, ai_scammer runs excluded
from the human leaderboard (no logbook, no Elo, no points, no cooldown, no
public events), the cycle log (graph event + "house_agent_trained" public
event), and the admin/public routes (POST /admin/training/{id}/run,
GET /admin/training/{id}/cycles, GET /research/latest).
"""

from __future__ import annotations

import random
import time
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth import ClerkAuth
from app.config import settings
from app.db import (
    Agent,
    AgentDraft,
    AgentVersion,
    GraphEvent,
    LogbookEntry,
    Player,
    PublicEvent,
    RetestResult,
    RunRow,
    init_db,
    make_engine,
    seed_house_agents,
)
from app.improvement import RetestService
from app.moderation import ScreenResult
from app.repo import SQLiteLogbookRepo, SQLiteRunsRepo
from app.research_agent import Tactic, TacticReport, save_scan
from app.routes.training import router as training_router
from app.runs import RunService
from app.training import (
    CYCLE_INTERVAL_S,
    MAX_ATTACKS_PER_CYCLE,
    NotHouseAgent,
    TeacherProposal,
    TrainingRateLimited,
    TrainingService,
)
from tests.test_auth import JWK, PK, PRIVATE, _fake_fetcher, _token
from tests.test_runs import FakeLLM


async def _ares(value):
    return value


class TrainLLM(FakeLLM):
    """FakeLLM + json dispatch for the training schemas (AttackPlan,
    TeacherProposal, TacticReport); agent turns still come from the queue."""

    def __init__(self, responses=None, schemas=None):
        super().__init__(responses)
        self.schemas = schemas or {}
        self.json_calls: list[str] = []

    async def json(self, model, system, messages, schema, reasoning_effort, timeout_s):
        if schema.__name__ in ("ModerationCategories", "DetectedLanguage"):
            return await super().json(model, system, messages, schema, reasoning_effort, timeout_s)
        self.json_calls.append(schema.__name__)
        value = self.schemas.get(schema.__name__)
        if callable(value):
            value = value()
        if isinstance(value, schema):
            return value
        return schema.model_validate(value)


def _engine(tmp_path, creator: bool = False):
    engine = make_engine(f"sqlite:///{tmp_path}/training.db")
    init_db(engine)
    with Session(engine) as session:
        session.add(
            Agent(id="bank-ava", name="Ava", domain="banking", stream="banking")
        )
        session.add(
            AgentVersion(
                agent_id="bank-ava",
                version=1,
                status="published",
                instructions="verify identity before any payment",
                knowledge=[],
            )
        )
        if creator:
            session.add(
                Agent(
                    id="my-agent",
                    name="Mine",
                    domain="banking",
                    stream="banking",
                    owner_id="user_123",
                )
            )
        session.commit()
    return engine


def _tactic() -> Tactic:
    return Tactic(
        tactic_name="Deepfake kidnap call",
        family="relative_in_trouble",
        summary="Voice clone + urgency to push a transfer.",
        source_url="https://www.actionfraud.police.uk/example",
        example_opening_line="It's me, send money now.",
    )


def _svc(engine, now_box=None, **kw) -> TrainingService:
    """A TrainingService fully on fakes; `now_box[0]` is the fake clock. When a
    real run_service is passed, attacks run through it (mode ai_scammer)."""
    if now_box is None:
        now_box = [time.time()]
    run_service = kw.pop("run_service", None)
    kw.setdefault(
        "research_fn",
        lambda: _ares(TacticReport(tactics=[_tactic()])),
    )
    kw.setdefault(
        "attack_gen_fn",
        lambda entries, runs, tactics, target: _ares(
            [{"tactic_name": "t", "source": "research", "mission_id": "m_drain", "turns": ["hi"]}]
        ),
    )
    if run_service is None:
        kw.setdefault("attack_run_fn", lambda agent_id, attack: _ares("timeout"))
    kw.setdefault(
        "teacher_fn",
        lambda *a, **k: _ares(TeacherProposal(instructions="new house instructions", rationale="r")),
    )
    kw.setdefault(
        "retest_fn",
        lambda agent_id, version: _ares({"results": [], "fixed": [], "warnings": []}),
    )
    kw.setdefault(
        "exam_fn",
        lambda agent_id, instructions, knowledge: _ares(
            {"catch_rate": 0.8, "false_block_rate": 0.0}
        ),
    )
    return TrainingService(
        engine, TrainLLM(), run_service, now_fn=lambda: now_box[0], **kw
    )


# --- cycle behaviour ---------------------------------------------------------------


async def test_cycle_keeps_change_and_logs_graph_and_public_event(tmp_path):
    engine = _engine(tmp_path)
    svc = _svc(engine)
    cycle = await svc.run_cycle("bank-ava")
    assert cycle["kept"] is True
    assert cycle["published_version"] == 2
    assert cycle["attacks_run"] == 1
    assert cycle["failures_found"] == 0
    assert cycle["sources"] == ["logbook", "research:web_search"]
    assert cycle["tactics_used"] == ["Deepfake kidnap call"]
    assert cycle["retest"]["passed"] is True
    with Session(engine) as session:
        agent = session.get(Agent, "bank-ava")
        assert agent.current_version == 2  # published
        version = session.exec(
            select(AgentVersion).where(
                AgentVersion.agent_id == "bank-ava", AgentVersion.version == 2
            )
        ).first()
        assert version.status == "published"
        assert version.instructions == "new house instructions"
        assert version.exam_catch_rate == 0.8
        events = session.exec(
            select(GraphEvent).where(GraphEvent.type == "training_cycle")
        ).all()
        assert len(events) == 1
        assert events[0].payload["kept"] is True
        assert events[0].payload["attacks_run"] == 1
        pub = session.exec(
            select(PublicEvent).where(PublicEvent.type == "house_agent_trained")
        ).all()
        assert len(pub) == 1
        assert pub[0].agent_id == "bank-ava"
        assert pub[0].payload["version"] == 2


async def test_rate_limit_one_cycle_per_hour_unless_forced(tmp_path):
    engine = _engine(tmp_path)
    now_box = [time.time()]
    svc = _svc(engine, now_box=now_box)
    await svc.run_cycle("bank-ava")  # first cycle ok
    with pytest.raises(TrainingRateLimited):
        await svc.run_cycle("bank-ava")  # within the hour: refused
    cycle = await svc.run_cycle("bank-ava", force=True)  # admin forced on demand
    assert cycle["forced"] is True and cycle["kept"] is True
    now_box[0] += CYCLE_INTERVAL_S + 1  # an hour later: allowed again
    cycle = await svc.run_cycle("bank-ava")
    assert cycle["forced"] is False
    assert len(svc.cycles("bank-ava")) == 3


async def test_attack_cap_is_30_per_cycle(tmp_path):
    engine = _engine(tmp_path)
    calls: list[str] = []

    async def many_attacks(entries, runs, tactics, target):
        return [
            {"tactic_name": f"t{i}", "source": "research", "mission_id": "m_drain", "turns": ["x"]}
            for i in range(50)
        ]

    async def run_attack(agent_id, attack):
        calls.append(attack["tactic_name"])
        return "timeout"

    svc = _svc(engine, attack_gen_fn=many_attacks, attack_run_fn=run_attack)
    cycle = await svc.run_cycle("bank-ava")
    assert cycle["attacks_run"] == MAX_ATTACKS_PER_CYCLE == 30
    assert len(calls) == 30


async def test_rollback_when_exam_catch_rate_drops(tmp_path):
    engine = _engine(tmp_path)
    # one open logbook failure + its run, which the (fake) retest fixes
    with Session(engine) as session:
        session.add(
            RunRow(
                id="r1",
                agent_id="bank-ava",
                agent_version=1,
                mission_id="m_drain",
                outcome="win",
                transcript=[{"role": "player", "content": "my son is in hospital"}],
            )
        )
        session.add(
            LogbookEntry(
                id="e1",
                agent_id="bank-ava",
                version=1,
                run_id="r1",
                outcome="win",
                stopped_by="none",
                root_cause="acts on emotional family-emergency stories",
                open=True,
            )
        )
        session.add(RetestResult(id="rr1", draft_version=1, log_entry_id="e1", label="fixed"))
        session.add(
            GraphEvent(
                id="g1",
                agent_id="bank-ava",
                type="learned",
                payload={"draft_version": 1, "attack_run_id": "r1"},
            )
        )
        session.commit()

    exam_rates = [{"catch_rate": 0.9, "false_block_rate": 0.0}, {"catch_rate": 0.4, "false_block_rate": 0.0}]

    async def exam_fn(agent_id, instructions, knowledge):
        return exam_rates.pop(0)

    async def retest_fn(agent_id, version):
        return {
            "results": [{"log_entry_id": "e1", "label": "fixed"}],
            "fixed": ["e1"],
            "warnings": [],
        }

    svc = _svc(engine, retest_fn=retest_fn, exam_fn=exam_fn)
    cycle = await svc.run_cycle("bank-ava")
    assert cycle["kept"] is False
    assert cycle["reason"] == "exam catch rate dropped"
    assert cycle["published_version"] is None
    assert cycle["exam"]["baseline_catch_rate"] == 0.9
    assert cycle["exam"]["candidate_catch_rate"] == 0.4
    with Session(engine) as session:
        agent = session.get(Agent, "bank-ava")
        assert agent.current_version == 1  # rolled back to the previous version
        versions = session.exec(select(AgentVersion)).all()
        assert len(versions) == 1  # no new version published
        draft = session.exec(select(AgentDraft)).first()
        assert draft.status == "rolled_back"
        entry = session.get(LogbookEntry, "e1")
        assert entry.open is True  # reopened on rollback
        assert session.exec(select(RetestResult)).all() == []  # retest artefacts removed
        learned = session.exec(
            select(GraphEvent).where(GraphEvent.type == "learned")
        ).all()
        assert learned == []
        cycles = session.exec(
            select(GraphEvent).where(GraphEvent.type == "training_cycle")
        ).all()
        assert len(cycles) == 1 and cycles[0].payload["kept"] is False
        pub = session.exec(
            select(PublicEvent).where(PublicEvent.type == "house_agent_trained")
        ).all()
        assert len(pub) == 1 and pub[0].payload["kept"] is False


async def test_rollback_when_retest_does_not_pass(tmp_path):
    engine = _engine(tmp_path)

    async def retest_fn(agent_id, version):
        return {
            "results": [{"log_entry_id": "e1", "label": "still_failing"}],
            "fixed": [],
            "warnings": [],
        }

    svc = _svc(engine, retest_fn=retest_fn)
    cycle = await svc.run_cycle("bank-ava")
    assert cycle["kept"] is False
    assert cycle["reason"] == "retest failed"
    with Session(engine) as session:
        assert session.get(Agent, "bank-ava").current_version == 1


async def test_creator_agents_are_never_auto_trained(tmp_path):
    engine = _engine(tmp_path, creator=True)
    svc = _svc(engine)
    with pytest.raises(NotHouseAgent):
        await svc.run_cycle("my-agent")
    with pytest.raises(KeyError):
        await svc.run_cycle("no-such-agent")


async def _allow(text):
    return ScreenResult(allowed=True, reason=None)


async def test_ai_scammer_runs_never_count_on_the_human_leaderboard(tmp_path):
    engine = _engine(tmp_path)
    # the fake agent executes the winning tool sequence in one turn
    llm = TrainLLM(
        responses=[
            {
                "reply": "",
                "tool_calls": [
                    {"name": "add_payee", "args": {"name": "Safe Account", "account_hint": "12-34-56 12345678"}},
                    {"name": "send_payment", "args": {"payee_id": "payee_3", "amount": 6000}},
                ],
            }
        ]
    )
    rs = RunService(
        llm,
        repo=SQLiteRunsRepo(engine),
        logbook=SQLiteLogbookRepo(engine),
        screen_fn=_allow,
        now_fn=lambda: time.time(),
        rng=random.Random(0),
        engine=engine,
    )
    svc = _svc(engine, run_service=rs)  # default attack_run_fn uses the run engine
    cycle = await svc.run_cycle("bank-ava")
    assert cycle["attacks_run"] == 1
    assert cycle["failures_found"] == 1  # the ai scammer broke the agent
    with Session(engine) as session:
        (run,) = session.exec(select(RunRow)).all()
        assert run.mode == "ai_scammer"
        assert run.outcome == "win"
        assert run.points == 0  # no points
        assert run.elo_delta == 0.0  # no Elo
        assert session.exec(select(LogbookEntry)).all() == []  # no logbook entry
        broken_events = session.exec(
            select(PublicEvent).where(PublicEvent.type == "agent_broken")
        ).all()
        assert broken_events == []  # no arena-wall break event
        assert session.get(Player, "ai_scammer") is None  # not a leaderboard player
        agent = session.get(Agent, "bank-ava")
        assert agent.rating == 1200.0  # leaderboard rating untouched
    assert rs._agent_elo == {} and rs._player_elo == {}  # in-memory Elo untouched
    assert rs.cooldown_until("bank-ava") is None  # no cooldown


# --- routes --------------------------------------------------------------------------


def _app(tmp_path) -> FastAPI:
    app = FastAPI()
    engine = make_engine(f"sqlite:///{tmp_path}/routes.db")
    init_db(engine)
    seed_house_agents(engine)
    with Session(engine) as session:
        session.add(
            AgentVersion(
                agent_id="bank-ava",
                version=1,
                status="published",
                instructions="verify identity before any payment",
                knowledge=[],
            )
        )
        session.add(
            Agent(id="my-agent", name="Mine", domain="banking", stream="banking", owner_id="user_123")
        )
        session.add(Player(id="user_123", handle="owner"))
        session.add(Player(id="user_999", handle="other"))
        session.commit()
    app.state.db_engine = engine
    app.state.clerk_auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    llm = TrainLLM()
    app.state.run_service = RunService(
        llm,
        repo=SQLiteRunsRepo(engine),
        logbook=SQLiteLogbookRepo(engine),
        screen_fn=_allow,
        now_fn=lambda: time.time(),
        rng=random.Random(0),
        engine=engine,
    )
    app.state.retest_service = RetestService(llm, engine, app.state.run_service)
    app.state.training_service = _svc(engine, run_service=app.state.run_service)
    app.include_router(training_router)
    return app


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "admin_player_ids", ["user_admin"])
    return TestClient(_app(tmp_path))


def _auth(sub="user_123") -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(PRIVATE, sub=sub)}"}


def test_admin_can_run_a_cycle_and_list_cycles(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    resp = client.post("/admin/training/bank-ava/run", json={}, headers=_auth("user_admin"))
    assert resp.status_code == 200, resp.text
    cycle = resp.json()
    assert cycle["agent_id"] == "bank-ava" and cycle["kept"] is True
    cycles = client.get("/admin/training/bank-ava/cycles", headers=_auth("user_admin"))
    assert cycles.status_code == 200
    listed = cycles.json()["cycles"]
    assert len(listed) == 1
    assert listed[0]["attacks_run"] == 1 and listed[0]["kept"] is True
    # second cycle within the hour is refused (429) unless forced
    again = client.post("/admin/training/bank-ava/run", json={}, headers=_auth("user_admin"))
    assert again.status_code == 429
    forced = client.post(
        "/admin/training/bank-ava/run", json={"force": True}, headers=_auth("user_admin")
    )
    assert forced.status_code == 200 and forced.json()["forced"] is True


def test_training_routes_are_admin_only_and_house_only(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    # no token -> 401; non-admin -> 403
    assert client.post("/admin/training/bank-ava/run", json={}).status_code == 401
    assert (
        client.post("/admin/training/bank-ava/run", json={}, headers=_auth("user_999")).status_code
        == 403
    )
    assert (
        client.get("/admin/training/bank-ava/cycles", headers=_auth("user_999")).status_code == 403
    )
    # creator agents are refused (409), even for an admin
    resp = client.post("/admin/training/my-agent/run", json={}, headers=_auth("user_admin"))
    assert resp.status_code == 409
    assert "never auto-trained" in resp.json()["detail"]
    # unknown agent -> 404
    assert (
        client.post("/admin/training/nope/run", json={}, headers=_auth("user_admin")).status_code
        == 404
    )
    assert (
        client.get("/admin/training/nope/cycles", headers=_auth("user_admin")).status_code == 404
    )


def test_research_latest_route_serves_saved_scan_publicly(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    engine = client.app.state.db_engine
    save_scan(engine, TacticReport(tactics=[_tactic()]))
    resp = client.get("/research/latest")  # public, no auth
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "web_search"
    assert data["tactics"] == [
        {
            "tactic_name": "Deepfake kidnap call",
            "family": "relative_in_trouble",
            "source_url": "https://www.actionfraud.police.uk/example",
        }
    ]
    assert "summary" not in resp.text and "It's me" not in resp.text
