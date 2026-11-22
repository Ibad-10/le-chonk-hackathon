"""Run lifecycle: start, message, stream, end (v4).

Text runs last RUN_TEXT_S (600 s) or RUN_TEXT_MESSAGES (20) player messages;
voice runs RUN_VOICE_S (300 s); a run also ends after RUN_IDLE_S (60 s) without
a player message (all configurable in .env). Arena runs consume one life at
start; only an `error` outcome refunds it (no_contest does not). Runs record
`stopped_by` for the logbook: "agent" when the run ends without a win, "none"
on a win — there is no external judge in v4.

The caller's language is detected on the first message (main model, low
reasoning, ISO 639-1 code) and stored on the run; the agent replies in it.
`stream_message` yields the agent's reply chunk by chunk (Mistral streaming)
and finishes with a done event carrying tool_events, ended and outcome.

Run state lives in memory plus a `RunsRepo` interface (in-memory implementation
here; SQLite comes in V4-3). The HTTP routes in app/routes/runs.py are
thin wrappers over `RunService`.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Awaitable, Callable, Protocol

from app.config import settings
from app.db import LogbookEntry
from app.engine.agent_turn import ToolEvent, agent_turn, normalize_language
from app.engine.mock_state import MockState
from app.creator import load_runtime_versioned
from app.engine.wins import check_win
from app.lives import Lives
from app.llm import LLMClient
from app.models import DetectedLanguage, Run, RunChannel, RunMode, TargetConfig, Turn
from app.moderation import ScreenResult, screen as moderation_screen
from app.repo import LogbookRepo
from app.roles import (
    deal_role,
    genuine_brief,
    genuine_need,
    legitimate_action_completed,
    scammer_brief,
)
from app.scoring import elo_update, how_close, points

VOICE_AGENT_MAX_TOKENS = 300  # latency: small output cap on live voice turns
MIN_MESSAGES_FOR_CONTEST = 3  # fewer player messages (or a hang-up) = no contest
START_ELO = 1200.0
START_RD = 200.0  # widened uncertainty right after (re)publishing a version
LANGUAGE_TIMEOUT_S = 10.0

REPO_ROOT = Path(__file__).resolve().parents[2]
MISSIONS_PATH = REPO_ROOT / "data" / "missions.json"


class NoLivesAvailable(Exception):
    pass


class AgentInCooldown(Exception):
    pass


class RunNotFound(KeyError):
    pass


class RunForbidden(Exception):
    """The caller may not start this run (route maps it to 403)."""


class AgentNotFound(Exception):
    """No such agent (route maps it to 404; never leaks file paths)."""


PLAYER_MODES = ("arena", "practice")  # genuine is dealt by the server; the rest are admin-only


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


class InMemoryLogbookRepo:
    """In-memory LogbookRepo for tests."""

    def __init__(self) -> None:
        self.entries: list[LogbookEntry] = []

    def record(self, entry: LogbookEntry) -> None:
        self.entries.append(entry)

    def open_entries(self, agent_id: str) -> list[LogbookEntry]:
        return [e for e in self.entries if e.agent_id == agent_id and e.open]


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
    brief: dict[str, Any] | None = None  # v4.1: player-only brief for the dealt role
    need: dict[str, Any] | None = None  # genuine need, when role == "genuine"
    owner_instructions: str = ""  # creator agents: current version instructions + knowledge
    knowledge: list[Any] = field(default_factory=list)


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
        rng: random.Random | None = None,
        logbook: LogbookRepo | None = None,
        engine: Any = None,
    ) -> None:
        self.llm = llm
        self.repo: RunsRepo = repo or InMemoryRunsRepo()
        self.screen_fn: ScreenFn = screen_fn or (lambda text: moderation_screen(llm, text))
        self._now = now_fn
        self._rng = rng or random.Random()
        self.logbook: LogbookRepo | None = logbook
        self._engine = engine  # v4.1: public_events sink (arena wall)
        self._sessions: dict[str, RunSession] = {}
        self._lives: dict[str, Lives] = {}
        self._player_elo: dict[str, float] = {}
        self._agent_elo: dict[str, tuple[float, float]] = {}
        self._wins: set[tuple[str, str, str]] = set()  # (player, agent, mission)
        self._cooldown_until: dict[str, float] = {}  # agent_id -> unix time (V4-5)

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

    def arena_available(self, agent_id: str, now: float | None = None) -> bool:
        """V4-5 cooldown: after an arena loss the agent is hidden from the arena
        until `cooldown_until`."""
        until = self._cooldown_until.get(agent_id)
        return until is None or (now if now is not None else self._now()) >= until

    def cooldown_until(self, agent_id: str) -> datetime | None:
        """The active cooldown end for the arena list, or None (practice runs by
        the owner are allowed during cooldown and never touch Elo/points)."""
        until = self._cooldown_until.get(agent_id)
        if until is None or until <= self._now():
            return None
        return datetime.fromtimestamp(until, tz=timezone.utc)

    def clear_cooldown(self, agent_id: str) -> None:
        """Publishing a fixed version clears the cooldown (V4-5)."""
        self._cooldown_until.pop(agent_id, None)

    def owner_of(self, run_id: str) -> str:
        """The player id that started the run (route ownership checks)."""
        return self._session(run_id).run.player_id

    def brief_for(self, run_id: str) -> dict[str, Any] | None:
        """The player-only brief for the dealt role (never sent to the agent)."""
        return self._session(run_id).brief

    def _record_public_event(self, type_: str, agent_id: str, payload: dict[str, Any]) -> None:
        """V4-22: write a sanitized public event (arena wall ticker). Payload is
        restricted to tactic family / version / run id — never transcripts."""
        if self._engine is None:
            return
        from sqlmodel import Session

        from app.db import PublicEvent

        with Session(self._engine) as session:
            session.add(PublicEvent(type=type_, agent_id=agent_id, payload=payload))
            session.commit()

    def now_playing(self, max_captions: int = 3) -> list[dict[str, Any]]:
        """V4-22: live runs whose player opted in (`spectate`): agent, channel,
        elapsed and the last caption lines only — never the full transcript."""
        now = self._now()
        cards: list[dict[str, Any]] = []
        for session in self._sessions.values():
            run = session.run
            if run.outcome is not None or not run.spectate:
                continue
            captions = [t.content for t in run.transcript[-max_captions:]]
            cards.append(
                {
                    # opaque spectate id: the real run id is a capability for
                    # the run's owner and never goes on the public wall
                    "run_id": hashlib.sha256(f"spectate:{run.id}".encode()).hexdigest()[:16],
                    "agent_id": run.agent_id,
                    "agent_name": session.target.name,
                    "stream": session.target.stream,
                    "channel": run.channel,
                    "started_at": run.started_at.isoformat(),
                    "elapsed_s": max(0, int(now - run.started_at.timestamp())),
                    "captions": captions,
                }
            )
        cards.sort(key=lambda c: c["started_at"])
        return cards

    def start_run(
        self,
        agent_id: str,
        mission_id: str | None = None,
        channel: RunChannel = "text",
        mode: RunMode = "arena",
        player_id: str = "anon",
        language: str = "auto",
        role: str | None = None,
        spectate: bool = False,
        caller: Any = None,
    ) -> Run:
        """`caller` (the verified Player) is set by every player-facing route
        (POST /runs, POST /voice/sessions): it enforces the mode gate, owner-only
        practice and the arena rules, and the run belongs to caller.id. Internal
        jobs (AI scammer, tests) pass no caller."""
        now = self._now()
        language = normalize_language(language)
        if caller is not None:
            player_id = caller.id
            self._authorize(caller, agent_id, mode)
        try:
            target, owner_instructions, knowledge, version = load_runtime_versioned(self._engine, agent_id)
        except FileNotFoundError:
            raise AgentNotFound(agent_id)
        if mode == "arena":
            if not self.arena_available(agent_id, now):
                raise AgentInCooldown(f"agent {agent_id} is in cooldown")
            lives = self._lives.setdefault(player_id, Lives(now))
            if not lives.consume(now):
                raise NoLivesAvailable(f"player {player_id} has no lives left")
        started = self._now_dt()
        run = Run(
            id=uuid.uuid4().hex,
            player_id=player_id,
            agent_id=agent_id,
            agent_version=version,
            channel=channel,
            mode=mode,
            mission_id=mission_id,
            language=language,
            started_at=started,
            spectate=spectate,
        )
        state = MockState.from_target(target)
        brief: dict[str, Any] | None = None
        need: dict[str, Any] | None = None
        if mode == "arena":
            # v4.1: deal the hidden role; the agent never sees it
            run.role = role or deal_role(self._rng)  # type: ignore[assignment]
            if run.role == "genuine":
                need = genuine_need(target.stream, self._rng)
                brief = genuine_brief(state, need)
                if need.get("payee"):
                    # the genuine customer's own new payee is not an attacker payee
                    state.legitimate_payee_names.add(need["payee"].strip().lower())
            else:
                brief = scammer_brief(state, mission_id)
        self.repo.create(run)
        self._sessions[run.id] = RunSession(
            run=run,
            target=target,
            state=state,
            last_activity=now,
            language_detected=language != "auto",
            brief=brief,
            need=need,
            owner_instructions=owner_instructions,
            knowledge=knowledge,
        )
        return run

    def _authorize(self, caller: Any, agent_id: str, mode: str) -> None:
        from sqlmodel import Session

        from app.auth import is_admin, is_agent_owner
        from app.db import Agent

        if mode not in PLAYER_MODES and not is_admin(caller):
            raise RunForbidden(f"mode {mode} is admin-only")
        if self._engine is None:
            return  # no database (unit tests): house targets only, public, ownerless
        with Session(self._engine) as db:
            agent = db.get(Agent, agent_id)
        if agent is None:
            raise AgentNotFound(agent_id)
        if mode == "practice" and not is_agent_owner(agent, caller):
            # owner practice runs: allowed even in cooldown; never Elo/points
            raise RunForbidden("practice runs are owner-only")
        if mode == "arena":
            # no point/Elo farming: private agents are not in the arena, and
            # creators practise on their own agents instead
            if agent.visibility != "public":
                raise RunForbidden("this agent is private: it is not in the arena")
            if agent.owner_id is not None and agent.owner_id == caller.id:
                raise RunForbidden("this is your agent: use a practice run")

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

    def end_run(self, run_id: str, outcome: str = "abandoned") -> dict[str, Any]:
        session = self._session(run_id)
        if session.run.outcome is None:
            self._finish(session, outcome)
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
        # latency: live voice turns use VOICE_AGENT_MODEL (default: main model)
        # with a small max_tokens cap and low reasoning effort
        voice = run.channel == "voice"
        try:
            result = await agent_turn(
                self.llm,
                session.target,
                session.state,
                run.transcript,
                language=run.language,
                owner_instructions=session.owner_instructions,
                knowledge=session.knowledge,
                model=settings.voice_agent_model if voice else None,
                max_tokens=VOICE_AGENT_MAX_TOKENS if voice else None,
                on_chunk=on_chunk,
            )
        except Exception:
            # agent LLM failure: the run ends as error (life refunded, no Elo)
            self._finish(session, "error")
            return self._response(session, reply=None)
        if result.reply:
            run.transcript.append(Turn(role="agent", content=result.reply))
        session.tool_events.extend(result.tool_events)

        # 4. end conditions. Tool errors (unknown payee, insufficient funds...)
        # went back to the agent as ok=false tool results inside agent_turn;
        # only LLM/infra failures (the except above) end the run as error.
        executed = [ev.call for ev in session.tool_events if ev.ok]
        if check_win(
            session.target, run.mission_id or "", executed, session.state, result.reply
        ):
            self._finish(session, "win")
        elif session.player_messages >= settings.run_text_messages:
            # the message cap applies to text and voice alike
            self._finish(session, "timeout")

        self.repo.update(run)  # persist transcript after every handled message
        return self._response(session, reply=result.reply)

    def _apply_elo(self, run: Run, result: str) -> None:
        """Elo update for an arena run; persisted to the DB when there is one
        (agents.rating/rating_deviation, players.xp += points). The player's
        rating is derived from the sum of persisted runs.elo_delta."""
        player_elo = self._player_elo.get(run.player_id)
        agent = self._agent_elo.get(run.agent_id)
        if self._engine is not None and (player_elo is None or agent is None):
            from sqlmodel import Session, func, select

            from app.db import Agent, RunRow

            with Session(self._engine) as db:
                if player_elo is None:
                    total = db.exec(
                        select(func.sum(RunRow.elo_delta)).where(
                            RunRow.player_id == run.player_id, RunRow.id != run.id
                        )
                    ).one()
                    player_elo = START_ELO + float(total or 0.0)
                if agent is None:
                    row = db.get(Agent, run.agent_id)
                    if row is not None:
                        agent = (row.rating, row.rating_deviation)
        player_elo = START_ELO if player_elo is None else player_elo
        agent_elo, agent_rd = agent or (START_ELO, START_RD)
        new_p, new_a, new_rd = elo_update(player_elo, agent_elo, result, agent_rd)  # type: ignore[arg-type]
        self._player_elo[run.player_id] = new_p
        self._agent_elo[run.agent_id] = (new_a, new_rd)
        run.elo_delta = new_p - player_elo
        if self._engine is not None:
            from sqlmodel import Session

            from app.db import Agent, Player

            with Session(self._engine) as db:
                row = db.get(Agent, run.agent_id)
                if row is not None:
                    row.rating, row.rating_deviation = new_a, new_rd
                player = db.get(Player, run.player_id)
                if player is not None:
                    player.xp += run.points
                db.commit()

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
        # v4 no-contest rule: a run the agent held is a win for
        # the agent only once the player actually played (>= 3 messages); fewer
        # messages, or a hang-up before that, is "no contest" (no Elo, no
        # points, life refunded). A break is always a win for the player.
        if (
            outcome in ("timeout", "abandoned")
            and session.player_messages < MIN_MESSAGES_FOR_CONTEST
        ):
            outcome = "no_contest"
        run.outcome = outcome  # type: ignore[assignment]
        run.ended_at = self._now_dt()
        run.how_close = how_close(0, outcome)
        run.stopped_by = "none" if outcome == "win" else "agent"

        # v4.1 dealt roles: the loss kind comes from the dealt role + sandbox truth
        executed = [ev.call for ev in session.tool_events if ev.ok]
        if outcome == "win":
            run.loss_kind = "security"  # a scammer broke the agent
        elif (
            run.role == "genuine"
            and outcome in ("timeout", "abandoned")
            and session.player_messages >= MIN_MESSAGES_FOR_CONTEST
            and session.state.verified
            and not (
                session.need
                and legitimate_action_completed(session.need, executed, session.state)
            )
        ):
            # correct verification, but the legitimate action was refused or
            # never completed within the limits: a false block
            run.loss_kind = "helpfulness"

        # V4-5: every arena loss goes to the logbook; an arena loss starts the
        # cooldown. Practice/ladder runs never touch the logbook, Elo or points.
        if run.loss_kind is not None and run.mode == "arena":
            if self.logbook is not None:
                self.logbook.record(
                    LogbookEntry(
                        id=uuid.uuid4().hex,
                        agent_id=run.agent_id,
                        version=run.agent_version,
                        run_id=run.id,
                        outcome=outcome,
                        stopped_by=run.stopped_by,
                        language=run.language,
                        loss_kind=run.loss_kind,
                        how_close=run.how_close,
                    )
                )
            if run.mode == "arena":
                self._cooldown_until[run.agent_id] = now + settings.arena_cooldown_s

        # V4-22: sanitized public events for the arena wall — a break carries the
        # tactic family only (filled in by the analyst), a hold carries none.
        # Never transcripts or tool arguments.
        if run.mode == "arena":
            if outcome == "win":
                self._record_public_event(
                    "agent_broken",
                    run.agent_id,
                    {"tactic_family": None, "version": run.agent_version, "run_id": run.id},
                )
            elif outcome in ("timeout", "abandoned"):
                self._record_public_event(
                    "agent_held",
                    run.agent_id,
                    {"tactic_family": None, "version": run.agent_version, "run_id": run.id},
                )

        # points + Elo (arena only; error and no_contest skip Elo)
        if outcome == "win":
            mission = _mission(run.mission_id)
            key = (run.player_id, run.agent_id, run.mission_id or "")
            novelty = "known" if key in self._wins else "new"
            self._wins.add(key)
            seconds_left = max(0, int(self._ends_at(session) - now))
            run.points = points(  # practice runs never score points
                int(mission.get("base_points", 0)),
                int(mission.get("difficulty", 1)),
                novelty,  # type: ignore[arg-type]
                seconds_left,
                0,
                outcome,
            ) if run.mode == "arena" else 0
            if run.mode == "arena":
                self._apply_elo(run, outcome)
        elif outcome in ("timeout", "abandoned") and run.mode == "arena":
            # the agent was not broken after >= 3 player messages: a win for
            # the agent ("block")
            self._apply_elo(run, "block")

        # lives refund (arena only): only our own failure (error) gives the
        # life back. A no_contest (fewer than 3 messages, or a quick hang-up)
        # costs the life, or players could probe agents for free forever.
        if run.mode == "arena" and outcome == "error":
            self._lives[run.player_id].refund()

        self.repo.update(run)
