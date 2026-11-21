"""Task 1 tests: shared Pydantic models (v4: stopped_by is agent/none only)."""

import pytest
from pydantic import ValidationError

from app.models import Run, ToolCall, Turn
from datetime import datetime, timezone


def test_stopped_by_only_agent_or_none():
    base = dict(
        id="r1", player_id="p", agent_id="bank-ava", agent_version=1,
        started_at=datetime.now(timezone.utc),
    )
    assert Run(**base, stopped_by="agent").stopped_by == "agent"
    assert Run(**base, stopped_by="none").stopped_by == "none"
    with pytest.raises(ValidationError):
        Run(**base, stopped_by="guardian")
    with pytest.raises(ValidationError):
        Run(**base, stopped_by="hard_limit")


def test_tool_call_and_turn_roundtrip():
    call = ToolCall(name="send_payment", args={"amount": 5000})
    assert call.args["amount"] == 5000
    turn = Turn(role="player", content="hello")
    assert turn.content == "hello"
