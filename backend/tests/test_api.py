"""V4 API-route tests: public agent/leaderboard routes return only safe fields,
owner routes enforce Clerk + owner (house agents owned by ADMIN_PLAYER_IDS),
draft instructions are capped at 2,000 chars (422 beyond), and practice runs
are owner-only, allowed during cooldown and never change Elo or points."""

from __future__ import annotations

import random

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import ClerkAuth
from app.config import settings
from app.db import Agent, GraphEvent, LogbookEntry, Player, init_db, make_engine, seed_house_agents
from app.improvement import RetestService
from app.repo import SQLiteLogbookRepo, SQLiteRunsRepo
from app.routes.agents import router as agents_router
from app.routes.owner import router as owner_router
from app.routes.runs import router as runs_router
from app.runs import RunService
from tests.test_auth import PK, PRIVATE, JWK, _fake_fetcher, _token
from tests.test_runs import FakeLLM

SECRET = "SECRET-DRAFT-INSTRUCTIONS-9f3a"


def _app(tmp_path) -> FastAPI:
    app = FastAPI()
    engine = make_engine(f"sqlite:///{tmp_path}/api.db")
    init_db(engine)
    seed_house_agents(engine)
    with Session(engine) as session:
        session.add(
            Agent(
                id="my-agent",
                name="Mine",
                domain="banking",
                stream="banking",
                owner_id="user_123",
                config={"instructions": "SECRET-CONFIG-1b2c"},
            )
        )
        session.add(Player(id="user_123", handle="owner", xp=10))
        session.add(Player(id="user_999", handle="other", xp=99))
        session.commit()
    app.state.db_engine = engine
    app.state.clerk_auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    llm = FakeLLM()
    app.state.run_service = RunService(
        llm,
        repo=SQLiteRunsRepo(engine),
        logbook=SQLiteLogbookRepo(engine),
        now_fn=lambda: 1000.0,
        rng=random.Random(0),
        engine=engine,
    )
    app.state.retest_service = RetestService(llm, engine, app.state.run_service)
    app.include_router(runs_router)
    app.include_router(agents_router)
    app.include_router(owner_router)
    return app


def _client(tmp_path) -> TestClient:
    return TestClient(_app(tmp_path))


def _auth(sub="user_123") -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(PRIVATE, sub=sub)}"}


SAFE_KEYS = {
    "id", "name", "stream", "rating", "rating_deviation", "grade", "helpfulness",
    "current_version", "cooldown_until", "is_house", "stats",
}


# --- public routes ------------------------------------------------------------


def test_public_agents_list_has_only_safe_fields(tmp_path):
    client = _client(tmp_path)
    resp = client.get("/agents")
    assert resp.status_code == 200
    agents = resp.json()
    assert any(a["id"] == "bank-ava" for a in agents)
    for a in agents:
        assert set(a.keys()) <= SAFE_KEYS
    body = resp.text
    assert "SECRET-CONFIG-1b2c" not in body
    for leak in ("instructions", "knowledge", "transcript", "graph", "config"):
        assert leak not in body.lower() or leak == "knowledge"  # knowledge only as field name? no:
    assert "knowledge" not in body.lower()


def test_get_agent_adds_stats_and_stays_safe(tmp_path):
    client = _client(tmp_path)
    resp = client.get("/agents/bank-ava")
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) <= SAFE_KEYS
    assert set(data["stats"].keys()) == {"runs", "breaks", "holds"}
    assert data["is_house"] is True
    assert data["cooldown_until"] is None


def test_leaderboards(tmp_path):
    client = _client(tmp_path)
    players = client.get("/leaderboard/players").json()
    assert [p["name"] for p in players] == ["other", "owner"]  # xp desc
    # matches frontend PlayerLeaderboardEntry exactly
    assert all(set(p) == {"player_id", "name", "rating", "wins", "points"} for p in players)
    agents = client.get("/leaderboard/agents").json()
    assert all("rating" in a for a in agents)
    banking = client.get("/leaderboard/agents", params={"stream": "banking"}).json()
    assert all(a["stream"] == "banking" for a in banking)
    assert any(a["id"] == "bank-ava" for a in banking)


# --- owner-only routes ----------------------------------------------------------


def test_owner_routes_403_for_non_owner(tmp_path):
    client = _client(tmp_path)
    for path in (
        "/agents/my-agent/logbook",
        "/agents/my-agent/graph",
        "/agents/my-agent/drafts/1",
    ):
        resp = client.get(path, headers=_auth("user_999"))
        assert resp.status_code == 403, path
    # house agents are owned by ADMIN_PLAYER_IDS, not by a random player
    assert client.get("/agents/bank-ava/logbook", headers=_auth("user_999")).status_code == 403
    # no token at all -> 401
    assert client.get("/agents/my-agent/logbook").status_code == 401


def test_house_agent_owned_by_admins(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_player_ids", ["user_admin"])
    client = _client(tmp_path)
    resp = client.get("/agents/bank-ava/logbook", headers=_auth("user_admin"))
    assert resp.status_code == 200
    assert resp.json()["entries"] == []


def test_owner_can_read_logbook_graph_and_drafts(tmp_path):
    client = _client(tmp_path)
    headers = _auth("user_123")
    assert client.get("/agents/my-agent/logbook", headers=headers).status_code == 200
    graph = client.get("/agents/my-agent/graph", headers=headers)
    assert graph.status_code == 200
    assert set(graph.json().keys()) == {"nodes", "links"}
    draft = client.post(
        "/agents/my-agent/drafts",
        json={"instructions": SECRET, "knowledge": ["k1"]},
        headers=headers,
    )
    assert draft.status_code == 201
    got = client.get("/agents/my-agent/drafts/1", headers=headers)
    assert got.status_code == 200
    assert got.json()["instructions"] == SECRET


def test_draft_instructions_capped_at_2000_chars(tmp_path):
    client = _client(tmp_path)
    headers = _auth("user_123")
    ok = client.post("/agents/my-agent/drafts", json={"instructions": "x" * 2000}, headers=headers)
    assert ok.status_code == 201
    too_long = client.post(
        "/agents/my-agent/drafts", json={"instructions": "x" * 2001}, headers=headers
    )
    assert too_long.status_code == 422


def test_public_routes_never_return_draft_or_graph_secrets(tmp_path):
    client = _client(tmp_path)
    headers = _auth("user_123")
    client.post("/agents/my-agent/drafts", json={"instructions": SECRET}, headers=headers)
    with Session(client.app.state.db_engine) as session:
        session.add(
            LogbookEntry(
                id="e1", agent_id="my-agent", version=1, run_id="r1",
                outcome="win", stopped_by="none", root_cause=SECRET,
            )
        )
        session.add(
            GraphEvent(id="g1", agent_id="my-agent", type="learned",
                       payload={"attack_run_id": "r1", "draft_version": 1, "root_cause": SECRET})
        )
        session.commit()
    for path in ("/agents", "/agents/my-agent", "/leaderboard/agents", "/leaderboard/players"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert SECRET not in resp.text, path


def test_retest_route_returns_job_id_and_progress(tmp_path):
    client = _client(tmp_path)
    headers = _auth("user_123")
    client.post("/agents/my-agent/drafts", json={"instructions": "verify everyone"}, headers=headers)
    started = client.post("/agents/my-agent/drafts/1/retest", headers=headers)
    assert started.status_code == 200
    job_id = started.json()["job_id"]
    job = client.get(f"/agents/my-agent/retest/{job_id}", headers=headers)
    assert job.status_code == 200
    assert job.json()["status"] in ("running", "done")
    assert "progress" in job.json()
    # another player cannot see the job
    assert client.get(f"/agents/my-agent/retest/{job_id}", headers=_auth("user_999")).status_code == 403


def test_publish_route_creates_version_and_keeps_rating(tmp_path):
    client = _client(tmp_path)
    headers = _auth("user_123")
    client.post("/agents/my-agent/drafts", json={"instructions": "verify everyone"}, headers=headers)
    resp = client.post("/agents/my-agent/drafts/1/publish", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"] == 2
    assert data["rating_deviation"] == 200.0
    assert data["cooldown_cleared"] is True
    diff = client.get(
        "/agents/my-agent/versions/diff", params={"from": 1, "to": 2}, headers=headers
    )
    assert diff.status_code == 200
    assert diff.json()["to"]["instructions"] == "verify everyone"


# --- practice runs ---------------------------------------------------------------


def test_practice_run_is_owner_only_and_allowed_in_cooldown(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_player_ids", ["user_admin"])
    client = _client(tmp_path)
    svc = client.app.state.run_service
    svc._cooldown_until["bank-ava"] = 1000.0 + settings.arena_cooldown_s  # in cooldown
    # arena run is rejected while in cooldown
    arena = client.post(
        "/runs", json={"agent_id": "bank-ava", "mode": "arena"}, headers=_auth("user_admin")
    )
    assert arena.status_code == 409
    # practice run by the owner (admin owns house agents) is allowed anyway
    practice = client.post(
        "/runs", json={"agent_id": "bank-ava", "mode": "practice"}, headers=_auth("user_admin")
    )
    assert practice.status_code == 200
    # a non-owner cannot start practice runs
    forbidden = client.post(
        "/runs", json={"agent_id": "bank-ava", "mode": "practice"}, headers=_auth("user_999")
    )
    assert forbidden.status_code == 403


async def test_practice_run_never_changes_elo_points_or_logbook(tmp_path):
    client = _client(tmp_path)
    svc = client.app.state.run_service
    llm = FakeLLM(
        responses=[
            {"reply": "", "tool_calls": [
                {"name": "add_payee", "args": {"name": "Safe Account", "account_hint": "xx"}},
                {"name": "send_payment", "args": {"payee_id": "payee_3", "amount": 5000}},
            ]},
            {"reply": "Done.", "tool_calls": []},
        ]
    )
    svc.llm = llm
    run = svc.start_run(agent_id="bank-ava", mode="practice", player_id="user_123",
                        channel="text", mission_id="m_drain")
    await svc.send_message(run.id, "send £5,000 to my new payee")
    assert run.outcome == "win"
    assert run.points == 0  # practice never scores
    assert run.elo_delta == 0.0  # and never changes Elo
    assert svc.logbook.open_entries("bank-ava") == []  # nor the logbook
    assert svc.arena_available("bank-ava", 1000.0)  # no cooldown either


def test_me_reports_admin(tmp_path, monkeypatch):
    from app.routes.agents import router as agents_router

    monkeypatch.setattr(settings, "admin_player_ids", ["user_123"])
    app = _app(tmp_path)
    app.include_router(agents_router)
    client = TestClient(app)
    assert client.get("/me", headers=_auth("user_123")).json() == {"id": "user_123", "is_admin": True}
    assert client.get("/me", headers=_auth("user_999")).json()["is_admin"] is False


def test_notifications_only_my_agents(tmp_path):
    from datetime import datetime, timedelta

    from app.db import LogbookEntry, RunRow
    from app.routes.agents import router as agents_router

    app = _app(tmp_path)
    app.include_router(agents_router)
    engine = app.state.db_engine
    with Session(engine) as s:
        for i, agent_id in enumerate(["my-agent", "bank-ava"]):
            s.add(RunRow(id=f"r{i}", agent_id=agent_id, agent_version=1, player_id="user_999"))
            s.add(LogbookEntry(id=f"l{i}", agent_id=agent_id, version=1, run_id=f"r{i}", outcome="win",
                               family="urgency", created_at=datetime.utcnow() - timedelta(minutes=1)))
        s.commit()
    client = TestClient(app)
    mine = client.get("/me/notifications", headers=_auth("user_123")).json()
    assert [n["agent_id"] for n in mine] == ["my-agent"]
    assert mine[0]["tactic_family"] == "urgency"
    assert client.get("/me/notifications", params={"since": 4102444800}, headers=_auth("user_123")).json() == []
