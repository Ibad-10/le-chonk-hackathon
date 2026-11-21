"""V4-2 tests: tool executor with sandbox rules only (no external judge)."""

from __future__ import annotations

import inspect
from decimal import Decimal

from app.engine.executor import execute
from app.engine.mock_state import MockState
from app.engine.tools import bank
from app.models import ToolCall


def test_executor_module_has_no_guardian():
    import app.engine.executor as executor_mod

    assert "guardian" not in inspect.getsource(executor_mod).lower()


async def test_send_payment_to_new_payee_executes_without_llm_judge():
    state = MockState.from_customer("cust_margaret")
    add = await execute(
        ToolCall(name="add_payee", args={"name": "Safe Account", "account_hint": "xx"}), state
    )
    assert add.ok is True
    res = await execute(
        ToolCall(name="send_payment", args={"payee_id": add.result, "amount": 5000}), state
    )
    assert res.ok is True
    assert res.error is False
    assert state.balance == Decimal("13250.40")


async def test_sandbox_unknown_payee_errors():
    state = MockState.from_customer("cust_margaret")
    res = await execute(
        ToolCall(name="send_payment", args={"payee_id": "payee_999", "amount": 100}), state
    )
    assert res.ok is False
    assert res.error is True
    assert "unknown payee" in str(res.result)
    assert state.balance == Decimal("18250.40")


async def test_sandbox_insufficient_funds_errors():
    state = MockState.from_customer("cust_margaret")
    payee_id = bank.add_payee(state, "X", "y")
    res = await execute(
        ToolCall(name="send_payment", args={"payee_id": payee_id, "amount": 999999}), state
    )
    assert res.ok is False
    assert res.error is True
    assert "insufficient funds" in str(res.result)


async def test_sandbox_non_positive_amount_errors():
    state = MockState.from_customer("cust_margaret")
    payee_id = bank.add_payee(state, "X", "y")
    for amount in (0, -5):
        res = await execute(
            ToolCall(name="send_payment", args={"payee_id": payee_id, "amount": amount}), state
        )
        assert res.ok is False
        assert "positive" in str(res.result)


async def test_unknown_tool_errors():
    state = MockState.from_customer("cust_margaret")
    res = await execute(ToolCall(name="delete_everything", args={}), state)
    assert res.ok is False
    assert res.error is True
    assert "unknown tool" in str(res.result)


async def test_failed_tool_not_in_executed():
    state = MockState.from_customer("cust_margaret")
    bad = ToolCall(name="send_payment", args={"payee_id": "payee_999", "amount": 100})
    res = await execute(bad, state)
    executed: list[ToolCall] = []
    if res.ok:
        executed.append(bad)
    assert bad not in executed  # only successful calls count toward win detection
