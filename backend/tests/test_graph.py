"""V4-9/D graph projection tests: GET /agents/{id}/graph is owner-only and
returns nodes (version, attack, root_cause, learned) and links
(attack->root_cause, root_cause->learned, learned->version,
version->next version) built from logbook, analysis and graph_events."""

from __future__ import annotations

import random

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import ClerkAuth
from app.db import Agent, AgentVersion, GraphEvent, LogbookEntry, init_db, make_engine
from app.improvement import RetestService, build_graph
from app.repo import SQLiteLogbookRepo, SQLiteRunsRepo
from app.routes.agents import router as agents_router
from app.routes.owner import router as owner_router
from app.runs import RunService
from tests.test_auth import PK, PRIVATE, JWK, _fake_fetcher, _token
from tests.test_runs import FakeLLM


def _engine(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/graph.db")
    init_db(engine)
    with Session(engine) as session:
        session.add(Agent(id="my-agent", name="Mine", domain="banking", stream="banking",
                          owner_id="user_123", current_version=2))
        session.add(AgentVersion(agent_id="my-agent", version=1, status="published",
                                 instructions="v1 rules"))
        session.add(AgentVersion(agent_id="my-agent", version=2, status="published",
                                 instructions="v2 rules"))
        session.add(LogbookEntry(id="e1", agent_id="my-agent", version=1, run_id="r1",
                                 outcome="win", stopped_by="none", root_cause="trusts fraud-team claims",
                                 loss_kind="security"))
        session.add(GraphEvent(id="g1", agent_id="my-agent", type="root_cause",
                               payload={"root_cause": "trusts fraud-team claims", "run_ids": ["r1"]}))
        session.add(GraphEvent(id="g2", agent_id="my-agent", type="learned",
                               payload={"attack_run_id": "r1", "draft_version": 2, "version": 2,
                                        "root_cause": "trusts fraud-team claims"}))
        session.commit()
    return engine


def test_graph_node_and_link_shape(tmp_path):
    engine = _engine(tmp_path)
    graph = build_graph(engine, "my-agent")
    nodes = {n["id"]: n for n in graph["nodes"]}
    links = {(l["source"], l["target"], l["type"]) for l in graph["links"]}

    # node types: version, attack, root_cause, learned
    assert nodes["version-1"]["type"] == "version" and nodes["version-2"]["type"] == "version"
    assert nodes["attack-e1"]["type"] == "attack" and nodes["attack-e1"]["run_id"] == "r1"
    rc = next(n for n in graph["nodes"] if n["type"] == "root_cause")
    assert rc["label"] == "trusts fraud-team claims"
    learned = next(n for n in graph["nodes"] if n["type"] == "learned")
    assert learned["attack_run_id"] == "r1" and learned["draft_version"] == 2

    # links: attack->root_cause, root_cause->learned, learned->version, version->next
    assert ("attack-e1", rc["id"], "root_cause") in links
    assert (rc["id"], learned["id"], "learned") in links
    assert (learned["id"], "version-2", "learned_version") in links
    assert ("version-1", "version-2", "next_version") in links


def test_graph_route_is_owner_only_and_shaped(tmp_path):
    engine = _engine(tmp_path)
    app = FastAPI()
    app.state.db_engine = engine
    app.state.clerk_auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    app.state.run_service = RunService(FakeLLM(), repo=SQLiteRunsRepo(engine),
                                       logbook=SQLiteLogbookRepo(engine), now_fn=lambda: 1000.0,
                                       rng=random.Random(0))
    app.state.retest_service = RetestService(FakeLLM(), engine, app.state.run_service)
    app.include_router(agents_router)
    app.include_router(owner_router)
    client = TestClient(app)

    owner = {"Authorization": f"Bearer {_token(PRIVATE, sub='user_123')}"}
    other = {"Authorization": f"Bearer {_token(PRIVATE, sub='user_999')}"}
    assert client.get("/agents/my-agent/graph", headers=other).status_code == 403
    assert client.get("/agents/my-agent/graph").status_code == 401
    resp = client.get("/agents/my-agent/graph", headers=owner)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"nodes", "links"}
    assert {n["type"] for n in body["nodes"]} >= {"version", "attack", "root_cause", "learned"}
    # the public route never exposes the graph
    assert "graph" not in client.get("/agents/my-agent").json()
