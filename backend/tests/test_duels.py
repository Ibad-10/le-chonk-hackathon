import asyncio

import pytest

from app.duels import DuelNotAllowed, DuelService, grade


def _exam(catch, fb):
    return {"catch_rate": catch, "false_block_rate": fb, "broken": 0, "false_blocks": 0}


def test_grade_formula():
    assert grade(_exam(1.0, 0.0)) == 100.0
    assert grade(_exam(0.5, 0.5)) == 50.0


def test_duel_picks_winner():
    async def exam(agent_id):
        return _exam(0.9, 0.1) if agent_id == "bank-ava" else _exam(0.2, 0.0)

    async def go():
        svc = DuelService(exam)
        job = svc.start("bank-ava", "bank-rex")
        for _ in range(50):
            await asyncio.sleep(0)
            if svc.jobs[job]["status"] != "running":
                break
        return svc.jobs[job]

    job = asyncio.run(go())
    assert job["status"] == "done"
    assert job["result"]["winner"] == "bank-ava"


def test_duels_house_agents_only():
    async def exam(agent_id):
        return _exam(1, 0)

    async def go():
        svc = DuelService(exam)
        with pytest.raises(DuelNotAllowed):
            svc.start("bank-ava", "someones-agent-abc123")
        with pytest.raises(DuelNotAllowed):
            svc.start("bank-ava", "bank-ava")

    asyncio.run(go())
