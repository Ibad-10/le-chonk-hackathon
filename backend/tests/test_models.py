"""Task 1 tests: shared Pydantic models."""

import pytest
from pydantic import ValidationError

from app.models import GuardianDecision, ToolCall, Turn


def _decision(**overrides) -> GuardianDecision:
    kwargs = dict(
        decision="allow",
        risk=50,
        reason="ok",
        rule_ids=[],
        signals=[],
    )
    kwargs.update(overrides)
    return GuardianDecision(**kwargs)


def test_guardian_decision_rejects_unknown_decision():
    with pytest.raises(ValidationError):
        _decision(decision="maybe")


def test_risk_bounds():
    with pytest.raises(ValidationError):
        _decision(risk=101)
    with pytest.raises(ValidationError):
        _decision(risk=-1)
    # boundary values are valid
    assert _decision(risk=0).risk == 0
    assert _decision(risk=100).risk == 100


def test_guardian_decision_accepts_all_valid_decisions():
    for d in ("allow", "step_up", "block"):
        assert _decision(decision=d).decision == d


def test_tool_call_and_turn_roundtrip():
    call = ToolCall(name="send_payment", args={"amount": 5000})
    assert call.args["amount"] == 5000
    turn = Turn(role="player", content="hello")
    assert turn.content == "hello"
