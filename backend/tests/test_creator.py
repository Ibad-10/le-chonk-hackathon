"""Creator agents: create, limits, playable, placement, PATCH, privacy."""

from __future__ import annotations

import random
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import ClerkAuth
from app.creator import PlacementService
from app.db import Agent, AgentVersion, Player, init_db, make_engine, seed_house_agents
from app.improvement import RetestService
from app.repo import SQLiteLogbookRepo, SQLiteRunsRepo
from app.routes.agents import router as agents_router
from app.routes.runs import router as runs_router
from app.runs import RunService
from tests.test_auth import JWK, PK, PRIVATE, _fake_fetcher, _token
from tests.test_runs import FakeLLM

SECRET = "SECRET-CREATOR-INSTRUCTIONS-77"


def _client(tmp_path, exam_fn=None):
    app = FastAPI()
    engine = make_engine(f"sqlite:///{tmp_path}/c.db")
    init_db(engine)
    seed_house_agents(engine)
    app.state.db_engine = engine
    app.state.clerk_auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    llm = FakeLLM()
    app.state.llm = llm
    app.state.run_service = RunService(
        llm, repo=SQLiteRunsRepo(engine), logbook=SQLiteLogbookRepo(engine),
        now_fn=lambda: 1000.0, rng=random.Random(0), engine=engine,
    )
    app.state.retest_service = RetestService(llm, engine, app.state.run_service)
    app.state.placement_service = PlacementService(llm, engine, exam_fn)
    app.include_router(runs_router)
    app.include_router(agents_router)
    return TestClient(app)


def _auth(sub="user_a"):
    return {"Authorization": f"Bearer {_token(PRIVATE, sub=sub)}"}


def _body(**kw):
    return {"name": "Guard Dog", "stream": "banking", "instructions": SECRET,
            "knowledge": "we are a bank", **kw}


def test_create_ok(tmp_path):
    c = _client(tmp_path)
    r = c.post("/agents", json=_body(), headers=_auth())
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["id"].startswith("guard-dog-") and d["rating"] == 1200.0
    assert d["rating_deviation"] == 350.0 and d["is_house"] is False
    with Session(c.app.state.db_engine) as s:
        a = s.get(Agent, d["id"])
        assert a.owner_id == "user_a" and a.visibility == "private"
        assert a.config["tools"] and a.config["win_conditions"] and a.config["name"] == "Guard Dog"
        v = s.get(AgentVersion, (d["id"], 1))
        assert v.status == "published" and v.instructions == SECRET


def test_validation_422(tmp_path):
    c = _client(tmp_path)
    assert c.post("/agents", json=_body(instructions="x" * 2001), headers=_auth()).status_code == 422
    assert c.post("/agents", json=_body(instructions="x" * 2000), headers=_auth()).status_code == 201
    assert c.post("/agents", json=_body(name="ab"), headers=_auth()).status_code == 422
    assert c.post("/agents", json=_body(stream="nope"), headers=_auth()).status_code == 422
    assert c.post("/agents", json=_body(knowledge="k" * 8001), headers=_auth()).status_code == 422
    assert c.post("/agents", json=_body()).status_code == 401


def test_fourth_agent_409(tmp_path):
    c = _client(tmp_path)
    for _ in range(3):
        assert c.post("/agents", json=_body(), headers=_auth()).status_code == 201
    assert c.post("/agents", json=_body(), headers=_auth()).status_code == 409
    assert c.post("/agents", json=_body(), headers=_auth("user_b")).status_code == 201


def test_created_agent_playable_in_practice_with_instructions(tmp_path):
    c = _client(tmp_path)
    aid = c.post("/agents", json=_body(stream="support"), headers=_auth()).json()["id"]
    run = c.post("/runs", json={"agent_id": aid, "mode": "practice"}, headers=_auth())
    assert run.status_code == 200, run.text
    m = c.post(f"/runs/{run.json()['run_id']}/message", json={"text": "hello"}, headers=_auth())
    assert m.status_code == 200, m.text
    system = c.app.state.llm.agent_calls[0]["system"]
    assert SECRET in system and "we are a bank" in system and "Guard Dog" in system
    assert c.post("/runs", json={"agent_id": aid, "mode": "practice"},
                  headers=_auth("user_b")).status_code == 403


def _wait(c, aid, job):
    for _ in range(100):
        d = c.get(f"/agents/{aid}/placement/{job}", headers=_auth()).json()
        if d["status"] != "running":
            return d
        time.sleep(0.05)
    raise AssertionError("placement did not finish")


def test_placement_sets_rating_from_grade(tmp_path):
    async def exam(agent_id, instructions, knowledge):
        assert instructions == SECRET
        return {"catch_rate": 0.9, "false_block_rate": 0.1}

    c = _client(tmp_path, exam)
    aid = c.post("/agents", json=_body(), headers=_auth()).json()["id"]
    assert c.post(f"/agents/{aid}/placement", headers=_auth("user_b")).status_code == 403
    job = c.post(f"/agents/{aid}/placement", headers=_auth()).json()["job_id"]
    d = _wait(c, aid, job)
    assert d["status"] == "done", d
    r = d["result"]
    assert r["grade"] == "A" and abs(r["grade_score"] - 90.0) < 1e-6 and abs(r["rating"] - 1360.0) < 1e-6
    with Session(c.app.state.db_engine) as s:
        assert abs(s.get(Agent, aid).rating - 1360.0) < 1e-6
        v = s.get(AgentVersion, (aid, 1))
        assert v.exam_catch_rate == 0.9 and v.exam_false_block_rate == 0.1


def test_placement_default_runner_non_bank(tmp_path):
    c = _client(tmp_path)  # real case runner over FakeLLM (refuses everything)
    aid = c.post("/agents", json=_body(stream="support"), headers=_auth()).json()["id"]
    job = c.post(f"/agents/{aid}/placement", headers=_auth()).json()["job_id"]
    d = _wait(c, aid, job)
    assert d["status"] == "done", d
    assert d["result"]["catch_rate"] == 1.0 and d["result"]["false_block_rate"] == 1.0
    assert abs(d["result"]["rating"] - 1240.0) < 1e-6


def test_patch_owner_only(tmp_path):
    c = _client(tmp_path)
    aid = c.post("/agents", json=_body(), headers=_auth()).json()["id"]
    assert c.patch(f"/agents/{aid}", json={"name": "Hacked"}, headers=_auth("user_b")).status_code == 403
    r = c.patch(f"/agents/{aid}", json={"name": "New Name", "visibility": "public"}, headers=_auth())
    assert r.status_code == 200 and r.json()["name"] == "New Name"
    assert aid in [a["id"] for a in c.get("/agents").json()]
    assert c.patch(f"/agents/{aid}", json={"visibility": "weird"}, headers=_auth()).status_code == 422


def test_public_get_hides_instructions_and_knowledge(tmp_path):
    c = _client(tmp_path)
    aid = c.post("/agents", json=_body(visibility="public"), headers=_auth()).json()["id"]
    for path in ("/agents", f"/agents/{aid}", "/leaderboard/agents"):
        t = c.get(path).text
        assert SECRET not in t and "we are a bank" not in t, path
    assert SECRET not in c.get("/agents/mine", headers=_auth("user_b")).text
