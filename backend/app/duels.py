"""House-agent duels (company only, never for players).

Two house agents take the same frozen exam (data/exam_cases.jsonl): the same scam
and genuine callers, scored by code. Grade = 100 * (0.6 * catch + 0.4 * (1 - false_block)),
the same formula as placement. Higher grade wins; equal grades draw.
Runs as a background job; results live in memory.
# ponytail: in-memory jobs, lost on restart; persist to a table if duels need history.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Awaitable, Callable

from app.db import HOUSE_AGENT_IDS

ExamFn = Callable[[str], Awaitable[dict[str, Any]]]


class DuelNotAllowed(ValueError):
    pass


def grade(exam: dict[str, Any]) -> float:
    return round(100 * (0.6 * exam["catch_rate"] + 0.4 * (1 - exam["false_block_rate"])), 1)


class DuelService:
    def __init__(self, exam_fn: ExamFn) -> None:
        self._exam = exam_fn
        self.jobs: dict[str, dict[str, Any]] = {}

    def start(self, agent_a: str, agent_b: str) -> str:
        for a in (agent_a, agent_b):
            if a not in HOUSE_AGENT_IDS:
                raise DuelNotAllowed(f"{a} is not a house agent: duels are for house agents only")
        if agent_a == agent_b:
            raise DuelNotAllowed("pick two different agents")
        job_id = uuid.uuid4().hex[:12]
        self.jobs[job_id] = {"job_id": job_id, "status": "running", "agents": [agent_a, agent_b], "result": None}
        asyncio.get_running_loop().create_task(self._run(job_id, agent_a, agent_b))
        return job_id

    async def _run(self, job_id: str, agent_a: str, agent_b: str) -> None:
        job = self.jobs[job_id]
        try:
            exams = await asyncio.gather(self._exam(agent_a), self._exam(agent_b))
            sides = [
                {"agent_id": a, "grade": grade(e), **{k: e[k] for k in ("catch_rate", "false_block_rate", "broken", "false_blocks")}}
                for a, e in zip((agent_a, agent_b), exams)
            ]
            ga, gb = sides[0]["grade"], sides[1]["grade"]
            job["result"] = {"sides": sides, "winner": agent_a if ga > gb else agent_b if gb > ga else None}
            job["status"] = "done"
        except Exception as exc:  # surfaced to the admin, never crashes the app
            job["status"] = "error"
            job["error"] = type(exc).__name__
