from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.challenge import AGENTS, challenge_for, rank_for_xp
from app.routes.challenge import router


def test_deterministic_and_valid():
    d = date(2026, 11, 21)
    a = challenge_for(d)
    assert a == challenge_for(d)
    assert a["target_agent_id"] in AGENTS and a["bonus_points"] > 0
    assert len({challenge_for(date(2026, 12, i))["tactic_family"] for i in range(1, 29)}) > 1


def test_uses_research_when_available():
    r = [{"tactic_name": "Fake courier", "family": "purchase", "source_url": ""}]
    c = challenge_for(date(2026, 11, 21), r)
    assert c["title"] == "Fake courier" and c["target_agent_id"] == "shop-max"
    # unknown families are ignored -> taxonomy fallback
    bad = [{"tactic_name": "x", "family": "nope"}]
    assert challenge_for(date(2026, 11, 21), bad) == challenge_for(date(2026, 11, 21))


def test_rank_boundaries():
    got = [rank_for_xp(x) for x in (0, 499, 500, 1999, 2000, 5999, 6000, 10**6)]
    assert got == ["Rookie", "Rookie", "Grifter", "Grifter", "Con Artist", "Con Artist", "Mastermind", "Mastermind"]


def test_routes():
    app = FastAPI()
    app.include_router(router)
    c = TestClient(app)
    j = c.get("/challenge/today").json()
    assert set(j) == {"date", "title", "tactic_family", "brief", "target_agent_id", "bonus_points"}
    r = c.get("/ranks").json()["ranks"]
    assert [x["min_xp"] for x in r] == [0, 500, 2000, 6000]
