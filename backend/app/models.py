"""Shared Pydantic v2 types used across the backend and mirrored in
frontend/lib/types.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, conint


# --- Turns and tool calls -------------------------------------------------

class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class Turn(BaseModel):
    role: str  # "player" | "agent" | "tool" | "system"
    content: str


# --- Rules and Guardian ----------------------------------------------------

class Rule(BaseModel):
    id: str
    agent_id: str
    title: str
    text: str
    family: str
    taught_by: str = "teacher"  # "teacher" | "owner" | "analyst"


class GuardianInput(BaseModel):
    agent_id: str
    version: int
    transcript: list[Turn]
    call: ToolCall
    context: dict[str, Any] = Field(default_factory=dict)
    rules: list[Rule] = Field(default_factory=list)


class GuardianDecision(BaseModel):
    decision: Literal["allow", "step_up", "block"]
    risk: conint(ge=0, le=100)  # type: ignore[valid-type]
    reason: str
    rule_ids: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)


# --- Runs ------------------------------------------------------------------

RunOutcome = Literal["win", "block", "step_up", "timeout", "abandoned", "error"]
RunMode = Literal["ladder", "arena", "genuine", "ai_scammer", "exam"]
RunChannel = Literal["text", "voice"]


class Run(BaseModel):
    id: str
    player_id: str
    agent_id: str
    agent_version: int
    channel: RunChannel = "text"
    mode: RunMode = "arena"
    mission_id: str | None = None
    wave: int | None = None
    language: str = "auto"
    transcript: list[Turn] = Field(default_factory=list)
    tool_calls: list[ToolCall] = Field(default_factory=list)
    outcome: RunOutcome | None = None
    stopped_by: Literal["agent", "hard_limit", "guardian", "none"] | None = None
    how_close: int = 0
    points: int = 0
    elo_delta: float = 0.0
    started_at: datetime
    ended_at: datetime | None = None


# --- Target config ----------------------------------------------------------

GuardianMode = Literal[
    "none", "refuse_prompt", "verify", "frozen_v1", "frozen_v1_stepup", "live"
]


class TargetConfig(BaseModel):
    id: str
    name: str
    domain: str
    stream: str = ""  # v3: "banking" | "support" | "assistant"
    voice: str = ""
    role_prompt: str
    tools: list[str] = Field(default_factory=list)
    sensitive_tools: list[str] = Field(default_factory=list)
    data_source: str = ""
    win_conditions: list[dict[str, Any]] = Field(default_factory=list)
    missions: list[str] = Field(default_factory=list)
    visibility: Literal["public", "private"] = "public"
    owner: str = "house"
    guardian_mode: GuardianMode = "live"
    guardian_enabled: bool = False  # v3: off by default on creator agents, on for house agents
    hard_limits: dict[str, Any] = Field(default_factory=dict)  # v3: e.g. {"max_payment": 1000}
