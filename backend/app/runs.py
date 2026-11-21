"""Run lifecycle: start, message, stream, end (v4).

Text runs last RUN_TEXT_S (600 s) or RUN_TEXT_MESSAGES (20) player messages;
voice runs RUN_VOICE_S (300 s); a run also ends after RUN_IDLE_S (60 s) without
a player message (all configurable in .env). Arena runs consume one life at
start; an `error` outcome or an abandon under 10 s refunds it. Runs record
`stopped_by` for the logbook: "agent" when the run ends without a win, "none"
on a win — there is no external judge in v4.

The caller's language is detected on the first message (main model, low
reasoning, ISO 639-1 code) and stored on the run; the agent replies in it.
`stream_message` yields the agent's reply chunk by chunk (Mistral streaming)
and finishes with a done event carrying tool_events, ended and outcome.

Run state lives in memory plus a `RunsRepo` interface (in-memory implementation
here; SQLite/Supabase comes later). The HTTP routes in app/routes/runs.py are
thin wrappers over `RunService`.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Awaitable, Callable, Protocol

from app.config import settings
from app.engine.agent_turn import ToolEvent, agent_turn
from app.engine.mock_state import MockState
from app.engine.targets import load_target
from app.engine.wins import check_win
from app.lives import Lives
from app.llm import LLMClient
from app.models import DetectedLanguage, Run, RunChannel, RunMode, TargetConfig, Turn
from app.moderation import ScreenResult, screen as moderation_screen
from app.scoring import elo_update, how_close, points

ABANDONED_REFUND_S = 10.0
START_ELO = 1200.0
START_RD = 200.0  # widened uncertainty right after (re)publishing a version
LANGUAGE_TIMEOUT_S = 10.0

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
    """In-memory RunsRepo. A SQLite/Supabase implementation lands when keys are set."""

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
    player_messages: int = 0
    last_activity: float = 0.0
    language_detected: bool = False


ScreenFn = Callable[[str], Awaitable[ScreenResult]]


def _mission(mission_id: str | None) -> dict[str, Any]:
    if not mission_id:
        return {}
    data = json.loads(MISSIONS_PATH.read_text(encoding="utf-8"))
    return next((m for m in data["missions"] if m["id"] == mission_id), {})


class RunService:
    """In-memory run state + repo writes. Tests inject a fake LLM/clock."""

    def __init__(
        self,
        llm: LLMClient,
        repo: RunsRepo | None = None,
        screen_fn: ScreenFn | None = None,
        now_fn: Callable[[], float] = time.time,
    ) -> None:
        self.llm = llm
        self.repo: RunsRepo = repo or InMemoryRunsRepo()
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
            last_activity=now,
            language_detected=language != "auto",
        )
        return run

    def _duration(self, channel: RunChannel) -> float:
        return settings.run_voice_s if channel == "voice" else settings.run_text_s

    def _ends_at(self, session: RunSession) -> float:
        return session.run.started_at.timestamp() + self._duration(session.run.channel)

    async def _detect_language(self, text: str) -> str:
        """ISO 639-1 code of the caller's language via the main model, low effort."""
        try:
            det = await self.llm.json(
                model=settings.mistral_model_main,
                system=(
                    "Return the ISO 639-1 code (e.g. en, fr, es) of the language of "
                    "the user message. Respond only with the code."
                ),
                messages=[{"role": "user", "content": text[:500]}],
                schema=DetectedLanguage,
                reasoning_effort="low",
                timeout_s=LANGUAGE_TIMEOUT_S,
            )
            code = det.language.strip().lower()[:2]
            return code or "en"
        except Exception:
            return "en"

    async def send_message(self, run_id: str, text: str) -> dict[str, Any]:
        session = self._session(run_id)
        return await self._handle_message(session, text)

    async def stream_message(self, run_id: str, text: str) -> AsyncIterator[dict[str, Any]]:
        """Like send_message, but yields {"type": "chunk", "text": ...} events as
        the agent's reply streams in, then one final {"type": "done", ...} event
        with tool_events, ended and outcome."""
        session = self._session(run_id)
        queue: asyncio.Queue = asyncio.Queue()

        async def on_chunk(piece: str) -> None:
            await queue.put(("chunk", piece))

        async def sentinel() -> None:
            await queue.put(("done", None))

        task = asyncio.create_task(self._handle_message(session, text, on_chunk=on_chunk))
        asyncio.create_task(self._drain(task, sentinel))
        while True:
            kind, payload = await queue.get()
            if kind == "chunk":
                yield {"type": "chunk", "text": payload}
            else:
                break
        response = await task
        yield {
            "type": "done",
            "run_id": response["run_id"],
            "reply": response["reply"],
            "tool_events": response["tool_events"],
            "ended": response["ended"],
            "outcome": response["outcome"],
        }

    async def _drain(self, task: asyncio.Task, sentinel: Callable[[], Awaitable[None]]) -> None:
        try:
            await task
        finally:
            await sentinel()

    def end_run(self, run_id: str) -> dict[str, Any]:
        session = self._session(run_id)
        if session.run.outcome is None:
            self._finish(session, "abandoned")
        return {"run_id": run_id, "outcome": session.run.outcome}

    # -- internals ----------------------------------------------------------

    async def _handle_message(
        self,
        session: RunSession,
        text: str,
        on_chunk: Callable[[str], Awaitable[None]] | None = None,
    ) -> dict[str, Any]:
        run = session.run
        now = self._now()
        if run.outcome is None and now > self._ends_at(session):
            self._finish(session, "timeout")
        elif (
            run.outcome is None
            and now - session.last_activity > settings.run_idle_s
        ):
            self._finish(session, "timeout")
        if run.outcome is not None:
            return self._response(session, reply=None)
        session.last_activity = now

        # 1. moderation screen: a blocked message never reaches the agent
        verdict = await self.screen_fn(text)
        if not verdict.allowed:
            return {
                "run_id": run.id,
                "reply": None,
                "moderated": True,
                "reason": verdict.reason,
                "tool_events": [],
                "ended": False,
            }

        # 2. language detect on the first message; stored on the run
        if not session.language_detected:
            run.language = await self._detect_language(text)
            session.language_detected = True
            self.repo.update(run)

        # 3. player turn -> agent turn (LLM + sandbox-gated tools)
        run.transcript.append(Turn(role="player", content=text))
        session.player_messages += 1
        try:
            result = await agent_turn(
                self.llm,
                session.target,
                session.state,
                run.transcript,
                language=run.language,
                on_chunk=on_chunk,
            )
        except Exception:
            # agent LLM failure: the run ends as error (life refunded, no Elo)
            self._finish(session, "error")
            return self._response(session, reply=None)
        if result.reply:
            run.transcript.append(Turn(role="agent", content=result.reply))
        session.tool_events.extend(result.tool_events)

        # 4. end conditions
        executed = [ev.call for ev in session.tool_events if ev.ok]
        if any(ev.error for ev in session.tool_events):
            self._finish(session, "error")
        elif check_win(
            session.target, run.mission_id or "", executed, session.state, result.reply
        ):
            self._finish(session, "win")
        elif run.channel == "text" and session.player_messages >= settings.run_text_messages:
            self._finish(session, "timeout")

        return self._response(session, reply=result.reply)

    def _response(self, session: RunSession, reply: str | None) -> dict[str, Any]:
        run = session.run
        return {
            "run_id": run.id,
            "reply": reply,
            "moderated": False,
            "tool_events": [ev.to_dict() for ev in session.tool_events],
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
        run.how_close = how_close(0, outcome)
        run.stopped_by = "none" if outcome == "win" else "agent"

        # points + Elo (arena only; error, timeout and abandoned skip Elo)
        if outcome == "win":
            mission = _mission(run.mission_id)
            key = (run.player_id, run.agent_id, run.mission_id or "")
            novelty = "known" if key in self._wins else "new"
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

        self.repo.update(run)
