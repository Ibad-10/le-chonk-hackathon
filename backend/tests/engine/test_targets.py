"""Task 2 tests: target config loading."""

import pytest

from app.engine.targets import load_target


def test_load_bank_target():
    t = load_target("bank-ava")
    assert t.id == "bank-ava"
    assert t.domain == "banking"
    assert t.sensitive_tools == ["add_payee", "send_payment"]
    # v3 fields: Ava is a house agent on the banking stream with the Guardian on
    assert t.stream == "banking"
    assert t.guardian_enabled is True


def test_ladder_modes():
    expected = {
        "ladder-l1": "none",
        "ladder-l2": "refuse_prompt",
        "ladder-l3": "verify",
        "ladder-l4": "frozen_v1",
        "ladder-l5": "frozen_v1_stepup",
    }
    for target_id, mode in expected.items():
        t = load_target(target_id)
        assert t.guardian_mode == mode, target_id


def test_unknown_target_raises():
    with pytest.raises(FileNotFoundError):
        load_target("does-not-exist")
