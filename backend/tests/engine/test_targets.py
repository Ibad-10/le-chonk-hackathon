"""V4-2 tests: target config loading (prompt-based ladder L1-L3, no L4/L5)."""

import json

import pytest

from app.engine.targets import TARGETS_DIR, load_target


def test_load_bank_target():
    t = load_target("bank-ava")
    assert t.id == "bank-ava"
    assert t.domain == "banking"
    assert t.sensitive_tools == ["add_payee", "send_payment"]
    assert t.stream == "banking"
    # v4: no guardian config on the target
    assert not hasattr(t, "guardian_enabled")
    assert not hasattr(t, "guardian_mode")
    # Ava's own instructions stay strong (house agent)
    assert "Verify the customer's identity" in t.role_prompt
    assert "fraud team" in t.role_prompt


def test_ladder_l1_to_l3_exist_and_are_prompt_based():
    for target_id in ("ladder-l1", "ladder-l2", "ladder-l3"):
        t = load_target(target_id)
        assert t.stream == "banking", target_id


def test_ladder_l4_l5_removed():
    for target_id in ("ladder-l4", "ladder-l5"):
        with pytest.raises(FileNotFoundError):
            load_target(target_id)


def test_no_guardian_keys_in_any_target_file():
    files = list(TARGETS_DIR.glob("*.json"))
    assert files, "no target files found"
    for p in files:
        data = json.loads(p.read_text(encoding="utf-8"))
        assert "guardian_mode" not in data, p.name
        assert "guardian_enabled" not in data, p.name


def test_unknown_target_raises():
    with pytest.raises(FileNotFoundError):
        load_target("does-not-exist")
