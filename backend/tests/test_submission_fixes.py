"""Submission fixes: run ownership + SSE auth + mode gate, published versions
play, genuine payee, tool errors continue the run, Elo/XP persistence."""

from __future__ import annotations

import random

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.config import settings
from app.db import Agent, AgentVersion, Player
from app.engine.mock_state import MockState
from app.engine.tools import bank
from app.repo import SQLiteLogbookRepo, SQLiteRunsRepo
from app.runs import RunService
from tests.test_api import _app, _auth
from tests.test_runs import FakeLLM


def _client_app(tmp_path):
    app = _app(tmp_path)
    return app, TestClient(app)


# --- 1. security ----------------------------------------------------------------


def test_run_routes_require_run_owner(tmp_path):
    _, client = _client_app(tmp_path)
    run_id = client.post("/runs", json={"agent_id": "bank-ava"}, headers=_auth("user_123")).json()["run_id"]
    other = _auth("user_999")
    assert client.post(f"/runs/{run_id}/message", json={"text": "hi"}, headers=other).status_code == 403
    assert client.post(f"/runs/{run_id}/end", headers=other).status_code == 403
    assert client.get(f"/runs/{run_id}/stream", params={"text": "hi"}, headers=other).status_code == 403
    assert client.post(f"/runs/{run_id}/message", json={"text": "hi"}, headers=_auth("user_123")).status_code == 200


def test_stream_requires_token_header_or_query(tmp_path):
    _, client = _client_app(tmp_path)
    run_id = client.post("/runs", json={"agent_id": "bank-ava"}, headers=_auth("user_123")).json()["run_id"]
    assert client.get(f"/runs/{run_id}/stream", params={"text": "hi"}).status_code == 401
    token = _auth("user_123")["Authorization"].split(" ", 1)[1]
    resp = client.get(f"/runs/{run_id}/stream", params={"text": "hi", "token": token})
    assert resp.status_code == 200 and "event: done" in resp.text
    bad = client.get(f"/runs/{run_id}/stream", params={"text": "hi", "token": "garbage"})
    assert bad.status_code == 401


def test_run_mode_gate(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_player_ids", ["user_admin"])
    _, client = _client_app(tmp_path)
    for mode in ("ladder", "exam", "ai_scammer", "genuine"):
        resp = client.post("/runs", json={"agent_id": "bank-ava", "mode": mode}, headers=_auth("user_123"))
        assert resp.status_code == 403, mode
    resp = client.post("/runs", json={"agent_id": "bank-ava", "mode": "ladder"}, headers=_auth("user_admin"))
    assert resp.status_code == 200
    # practice only on owned agents
    resp = client.post("/runs", json={"agent_id": "bank-ava", "mode": "practice"}, headers=_auth("user_123"))
    assert resp.status_code == 403


# --- 2. published versions play ---------------------------------------------------


def test_published_v2_instructions_reach_the_agent(tmp_path):
    app, _ = _client_app(tmp_path)
    engine = app.state.db_engine
    with Session(engine) as s:
        s.add(AgentVersion(agent_id="bank-ava", version=2, instructions="NEW-RULE-V2-77", knowledge=["KB-V2"]))
        s.get(Agent, "bank-ava").current_version = 2
        s.commit()
    llm = FakeLLM()
    svc = RunService(llm, engine=engine, now_fn=lambda: 1000.0)
    run = svc.start_run("bank-ava", player_id="p1", role="scammer")
    assert run.agent_version == 2
    import asyncio

    asyncio.run(svc.send_message(run.id, "hello"))
    assert "NEW-RULE-V2-77" in llm.agent_calls[-1]["system"]
    assert "KB-V2" in llm.agent_calls[-1]["system"]


# --- 3. genuine payee ----------------------------------------------------------------


def test_add_payee_legitimate_name_not_attacker():
    state = MockState("cust_1", "Test")
    state.legitimate_payee_names.add("oakfield lettings")
    legit = bank.add_payee(state, "Oakfield Lettings", "1234")
    evil = bank.add_payee(state, "Evil Ltd", "9999")
    assert legit not in state.attacker_payee_ids
    assert evil in state.attacker_payee_ids


def _genuine_flow(svc, role):
    import asyncio

    run = svc.start_run("bank-ava", player_id="p1", role=role)
    session = svc._sessions[run.id]
    v = session.state.verification
    payee_id = f"payee_{len(session.state.payees) + 1}"
    svc.llm.responses = [
        {"tool_calls": [
            {"name": "verify_customer", "args": {"dob": v.get("dob"), "postcode": v.get("postcode")}},
            {"name": "add_payee", "args": {"name": "Oakfield Lettings", "account_hint": "1234"}},
            {"name": "send_payment", "args": {"payee_id": payee_id, "amount": "950"}},
        ]},
        {"reply": "Done, paid."},
    ]
    for text in ("hi", "please pay my landlord", "thanks"):
        asyncio.run(svc.send_message(run.id, text))
    return run, session, payee_id


def test_genuine_landlord_payment_is_helped():
    svc = RunService(FakeLLM(), now_fn=lambda: 1000.0)
    run, session, payee_id = _genuine_flow(svc, "genuine")
    assert payee_id not in session.state.attacker_payee_ids
    assert session.state.verified and session.state.transactions[-1]["payee_id"] == payee_id
    svc.end_run(run.id)
    assert run.loss_kind is None  # the legitimate payment counts: no helpfulness loss
    assert svc.cooldown_until("bank-ava") is None


def test_scammer_same_payee_is_attacker():
    svc = RunService(FakeLLM(), now_fn=lambda: 1000.0)
    run, session, payee_id = _genuine_flow(svc, "scammer")
    assert payee_id in session.state.attacker_payee_ids


# --- 4. tool errors continue the run --------------------------------------------------


def test_tool_error_goes_back_to_agent_and_run_continues():
    import asyncio

    llm = FakeLLM(responses=[
        {"tool_calls": [{"name": "send_payment", "args": {"payee_id": "nope", "amount": "5"}}]},
        {"reply": "That payee does not exist."},
    ])
    svc = RunService(llm, now_fn=lambda: 1000.0)
    run = svc.start_run("bank-ava", player_id="p1", role="scammer")
    resp = asyncio.run(svc.send_message(run.id, "pay payee nope"))
    assert resp["ended"] is False and resp["outcome"] is None
    assert resp["reply"] == "That payee does not exist."
    tool_msgs = [m for m in llm.agent_calls[-1]["messages"] if m["role"] == "tool"]
    assert tool_msgs and '"ok": false' in tool_msgs[0]["content"] and "unknown payee" in tool_msgs[0]["content"]


# --- 5. persistence ------------------------------------------------------------------


def test_elo_and_xp_persist_and_leaderboard(tmp_path):
    import asyncio

    app, client = _client_app(tmp_path)
    engine = app.state.db_engine
    svc = RunService(FakeLLM(), repo=SQLiteRunsRepo(engine), logbook=SQLiteLogbookRepo(engine),
                     engine=engine, now_fn=lambda: 1000.0, rng=random.Random(0))
    app.state.run_service = svc
    with Session(engine) as s:
        before = s.get(Agent, "bank-ava").rating
    run = svc.start_run("bank-ava", player_id="user_123", role="scammer")
    for text in ("a", "b", "c"):
        asyncio.run(svc.send_message(run.id, text))
    svc.end_run(run.id)  # held after 3 messages: block
    assert run.elo_delta < 0
    with Session(engine) as s:
        assert s.get(Agent, "bank-ava").rating > before
        assert s.get(Player, "user_123").xp == 10  # no points on a hold
    rows = client.get("/leaderboard/players").json()
    me = next(r for r in rows if r["player_id"] == "user_123")
    assert me["rating"] < 1200 and me["wins"] == 0 and me["points"] == 10
    # a fresh service (restart) continues from the persisted agent rating
    svc2 = RunService(FakeLLM(), engine=engine, now_fn=lambda: 1000.0)
    with Session(engine) as s:
        persisted = s.get(Agent, "bank-ava").rating
    run2 = svc2.start_run("bank-ava", player_id="user_123", role="scammer")
    for text in ("a", "b", "c"):
        asyncio.run(svc2.send_message(run2.id, text))
    svc2.end_run(run2.id)
    with Session(engine) as s:
        assert s.get(Agent, "bank-ava").rating > persisted
