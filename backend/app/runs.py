"""Run lifecycle: start, message, end (Task 6).

Text runs last 180 s or 12 player messages; voice runs 120 s. Arena runs
consume one life at start; an `error` outcome or an abandon under 10 s refunds
it (a near miss, max Guardian risk >= 90, also refunds one). Runs record
`stopped_by` for the logbook: "agent" when the run ends without a win and no
tool was blocked, "guardian" / "hard_limit" when one was, "none" on a win.

Run state lives in memory plus a `RunsRepo` interface (in-memory implementation
here; Supabase comes later). The HTTP routes in app/routes/runs.py are thin
wrappers over `RunService`.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import partial
from pathlib import Path
from typing import Any, Awaitable, Callable, Protocol

from app.config import settings
from app.engine.agent_turn import ToolEvent, agent_turn
from app.engine.executor import GuardianFn
from app.engine.mock_state import MockState
from app.engine.targets import load_target
from app.engine.wins import check_win
from app.guardian import guardian_decide
from app.lives import Lives
from app.llm import LLMClient
from app.models import Run, RunChannel, RunMode, TargetConfig, ToolCall, Turn
from app.moderation import ScreenResult, screen as moderation_screen
from app.scoring import elo_update, how_close, points

TEXT_RUN_S = 180
VOICE_RUN_S = 120
MAX_TEXT_MESSAGES = 12
ABANDONED_REFUND_S = 10.0
NEAR_MISS_RISK = 90
START_ELO = 1200.0
START_RD = 200.0  # widened uncertainty right after (re)publishing a version

REPO_ROOT = Path(__file__).resolve().parents[2]
MISSIONS_PATH = REPO_ROOT / "data" / "missions.json"


class NoLivesAvailable(Exception):
    pass


class RunNotFound(KeyError):
    pass


# --- repository interface ---------------------------------------------------


class RunsRepo(Protocol):
    def create(self, run: Run) -> None: ...
    def get(self, run_id: str) -> Run | None: ...
    def update(self, run: Run) -> None: ...


class InMemoryRunsRepo:
    """In-memory RunsRepo. A Supabase implementation lands when keys are set."""

    def __init__(self) -> None:
        self._runs: dict[str, Run] = {}

    def create(self, run: Run) -> None:
        self._runs[run.id] = run

    def get(self, run_id: str) -> Run | None:
        return self._runs.get(run_id)

    def update(self, run: Run) -> None:
        self._runs[run.id] = run


# --- service ----------------------------------------------------------------


@dataclass
class RunSession:
    run: Run
    target: TargetConfig
    state: MockState
    tool_events: list[ToolEvent] = field(default_factory=list)
    max_risk_seen: int = 0
    player_messages: int = 0


ScreenFn = Callable[[str], Awaitable[ScreenResult]]
GuardianFactory = Callable[[TargetConfig], GuardianFn]


def _mission(mission_id: str | None) -> dict[str, Any]:
    if not mission_id:
        return {}
    data = json.loads(MISSIONS_PATH.read_text(encoding="utf-8"))
    return next((m for m in data["missions"] if m["id"] == mission_id), {})


class RunService:
    """In-memory run state + repo writes. Tests inject a fake LLM/guardian/clock."""

    def __init__(
        self,
        llm: LLMClient,
        repo: RunsRepo | None = None,
        guardian_factory: GuardianFactory | None = None,
        screen_fn: ScreenFn | None = None,
        now_fn: Callable[[], float] = time.time,
    ) -> None:
        self.llm = llm
        self.repo: RunsRepo = repo or InMemoryRunsRepo()
        self.guardian_factory = guardian_factory or (
            lambda target: partial(
                guardian_decide,
                llm,
                mode=target.guardian_mode,
                timeout_s=settings.guardian_timeout_s,
            )
        )
        self.screen_fn: ScreenFn = screen_fn or (lambda text: moderation_screen(llm, text))
        self._now = now_fn
        self._sessions: dict[str, RunSession] = {}
        self._lives: dict[str, Lives] = {}
        self._player_elo: dict[str, float] = {}
        self._agent_elo: dict[str, tuple[float, float]] = {}
        self._wins: set[tuple[str, str, str]] = set()  # (player, agent, mission)

    # -- helpers ----------------------------------------------------------

    def _now_dt(self) -> datetime:
        return datetime.fromtimestamp(self._now(), tz=timezone.utc)

    def lives_available(self, player_id: str, now: float) -> int:
        return self._lives[player_id].available(now)

    def _session(self, run_id: str) -> RunSession:
        try:
            return self._sessions[run_id]
        except KeyError:
            raise RunNotFound(run_id)

    # -- lifecycle ----------------------------------------------------------

    def start_run(
        self,
        agent_id: str,
        mission_id: str | None = None,
        channel: RunChannel = "text",
        mode: RunMode = "arena",
        player_id: str = "anon",
        language: str = "auto",
    ) -> Run:
        now = self._now()
        target = load_target(agent_id)
        if mode == "arena":
            lives = self._lives.setdefault(player_id, Lives(now))
            if not lives.consume(now):
                raise NoLivesAvailable(f"player {player_id} has no lives left")
        started = self._now_dt()
        duration = VOICE_RUN_S if channel == "voice" else TEXT_RUN_S
        run = Run(
            id=uuid.uuid4().hex,
            player_id=player_id,
            agent_id=agent_id,
            agent_version=1,
            channel=channel,
            mode=mode,
            mission_id=mission_id,
            language=language,
            started_at=started,
        )
        self.repo.create(run)
        self._sessions[run.id] = RunSession(
            run=run,
            target=target,
            state=MockState.from_customer("cust_margaret"),
        )
        return run

    def _ends_at(self, session: RunSession) -> float:
        duration = VOICE_RUN_S if session.run.channel == "voice" else TEXT_RUN_S
        return session.run.started_at.timestamp() + duration

    async def send_message(self, run_id: str, text: str) -> dict[str, Any]:
        session = self._session(run_id)
        run = session.run
        now = self._now()
        if run.outcome is None and now > self._ends_at(session):
            self._finish(session, "abandoned")
        if run.outcome is not None:
            return self._response(session, reply=None)

        # 1. moderation screen: a blocked message never reaches the agent
        verdict = await self.screen_fn(text)
        if not verdict.allowed:
            return {
                "run_id": run.id,
                "reply": None,
                "moderated": True,
                "reason": verdict.reason,
                "tool_events": [],
                "suspicion": session.max_risk_seen,
                "ended": False,
            }

        # 2. player turn -> agent turn (LLM + Guardian-gated tools)
        run.transcript.append(Turn(role="player", content=text))
        session.player_messages += 1
        guardian = self.guardian_factory(session.target)
        try:
            result = await agent_turn(
                self.llm,
                session.target,
                session.state,
                run.transcript,
                guardian,
                language=run.language,
            )
        except Exception:
            # agent LLM failure: the run ends as error (life refunded, no Elo)
            self._finish(session, "error")
            return self._response(session, reply=None)
        if result.reply:
            run.transcript.append(Turn(role="agent", content=result.reply))
        session.tool_events.extend(result.tool_events)
        for ev in result.tool_events:
            if ev.decision is not None:
                session.max_risk_seen = max(session.max_risk_seen, ev.decision.risk)

        # 3. end conditions
        executed = [ev.call for ev in session.tool_events if ev.ok]
        if any(ev.error for ev in session.tool_events):
            self._finish(session, "error")
        elif check_win(
            session.target, run.mission_id or "", executed, session.state, result.reply
        ):
            self._finish(session, "win")
        elif any(
            ev.decision is not None and ev.decision.decision == "step_up"
            for ev in session.tool_events
        ):
            self._finish(session, "step_up")
        elif run.channel == "text" and session.player_messages >= MAX_TEXT_MESSAGES:
            self._finish(session, "block")

        return self._response(session, reply=result.reply)

    def end_run(self, run_id: str) -> dict[str, Any]:
        session = self._session(run_id)
        if session.run.outcome is None:
            self._finish(session, "abandoned")
        return {"run_id": run_id, "outcome": session.run.outcome}

    # -- internals ----------------------------------------------------------

    def _response(self, session: RunSession, reply: str | None) -> dict[str, Any]:
        run = session.run
        return {
            "run_id": run.id,
            "reply": reply,
            "moderated": False,
            "tool_events": [ev.to_dict() for ev in session.tool_events],
            "suspicion": session.max_risk_seen,
            "ended": run.outcome is not None,
            "outcome": run.outcome,
        }

    def _finish(self, session: RunSession, outcome: str) -> None:
        run = session.run
        now = self._now()
        if run.outcome is not None:
            return
        run.outcome = outcome  # type: ignore[assignment]
        run.ended_at = self._now_dt()
        run.how_close = how_close(session.max_risk_seen, outcome)

        # stopped_by for the logbook
        if outcome == "win":
            run.stopped_by = "none"
        elif any(ev.stopped_by == "hard_limit" for ev in session.tool_events):
            run.stopped_by = "hard_limit"
        elif any(ev.stopped_by == "guardian" for ev in session.tool_events):
            run.stopped_by = "guardian"
        else:
            run.stopped_by = "agent"

        # points + Elo (arena only; error and abandoned skip Elo)
        if outcome in ("win", "block", "step_up"):
            mission = _mission(run.mission_id)
            key = (run.player_id, run.agent_id, run.mission_id or "")
            novelty = "known" if key in self._wins else "new"
            if outcome == "win":
                self._wins.add(key)
            seconds_left = max(0, int(self._ends_at(session) - now))
            run.points = points(
                int(mission.get("base_points", 0)),
                int(mission.get("difficulty", 1)),
                novelty,  # type: ignore[arg-type]
                seconds_left,
                0,
                outcome,
            )
            if run.mode == "arena":
                player_elo = self._player_elo.get(run.player_id, START_ELO)
                agent_elo, agent_rd = self._agent_elo.get(run.agent_id, (START_ELO, START_RD))
                new_p, new_a, new_rd = elo_update(player_elo, agent_elo, outcome, agent_rd)  # type: ignore[arg-type]
                self._player_elo[run.player_id] = new_p
                self._agent_elo[run.agent_id] = (new_a, new_rd)
                run.elo_delta = new_p - player_elo

        # lives refunds (arena only)
        if run.mode == "arena":
            lives = self._lives[run.player_id]
            duration = now - run.started_at.timestamp()
            if outcome == "error":
                lives.refund()
            elif outcome == "abandoned" and duration < ABANDONED_REFUND_S:
                lives.refund()
            elif outcome in ("block", "step_up") and session.max_risk_seen >= NEAR_MISS_RISK:
                lives.refund()  # near miss

        self.repo.update(run)
