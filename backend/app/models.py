"""Shared Pydantic v2 types used across the backend and mirrored in
frontend/lib/types.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# --- Turns and tool calls -------------------------------------------------

class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class Turn(BaseModel):
    role: str  # "player" | "agent" | "tool" | "system"
    content: str


class ChatTurn(BaseModel):
    """One native-function-calling agent turn: plain-text content plus any
    tool calls the model asked for (already parsed to name + args dict)."""

    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)


# --- Language detection ------------------------------------------------------

class DetectedLanguage(BaseModel):
    """ISO 639-1 code of the caller's language, detected on the first message."""

    language: str


# --- Runs ------------------------------------------------------------------

RunOutcome = Literal["win", "timeout", "abandoned", "error", "no_contest"]
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
    stopped_by: Literal["agent", "none"] | None = None
    how_close: int = 0
    points: int = 0
    elo_delta: float = 0.0
    started_at: datetime
    ended_at: datetime | None = None


# --- Target config ----------------------------------------------------------

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
    hard_limits: dict[str, Any] = Field(default_factory=dict)  # e.g. {"max_payment": 1000}
