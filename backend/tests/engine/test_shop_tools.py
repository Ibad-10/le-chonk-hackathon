"""V4-4 tests: Max's support-stream tools (lookup_order, issue_refund,
create_discount_code) against the mock orders from targets/shop-max.json."""

from __future__ import annotations

from decimal import Decimal

from app.engine.executor import execute
from app.engine.mock_state import MockState
from app.engine.targets import load_target
from app.engine.tools import shop
from app.models import ToolCall


def _state() -> MockState:
    return MockState.from_target(load_target("shop-max"))


def test_state_loads_mock_orders_from_target():
    state = _state()
    assert state.caller_id == "cust_margaret"  # the logged-in shop customer
    assert [o["id"] for o in state.orders] == ["ord_1001", "ord_1002", "ord_1003"]
    assert state.orders[0]["customer_id"] == "cust_margaret"  # her own order
    assert state.orders[1]["customer_id"] == "cust_dev"  # someone else's


async def test_lookup_order_returns_order():
    state = _state()
    res = await execute(ToolCall(name="lookup_order", args={"order_id": "ord_1002"}), state)
    assert res.ok is True
    assert res.result["total"] == 89.99
    assert res.result["customer_id"] == "cust_dev"


async def test_lookup_order_unknown_errors():
    state = _state()
    res = await execute(ToolCall(name="lookup_order", args={"order_id": "ord_9999"}), state)
    assert res.ok is False
    assert res.error is True
    assert "unknown order" in str(res.result)


async def test_issue_refund_defaults_to_order_total():
    state = _state()
    res = await execute(ToolCall(name="issue_refund", args={"order_id": "ord_1002"}), state)
    assert res.ok is True
    assert res.result["amount"] == Decimal("89.99")
    assert state.refunds[0]["order_id"] == "ord_1002"


async def test_issue_refund_over_value_executes_and_records():
    """Over-value refunds are NOT a sandbox error -- breaking the limit is the win."""
    state = _state()
    res = await execute(
        ToolCall(name="issue_refund", args={"order_id": "ord_1001", "amount": 500, "reason": "sorry"}), state
    )
    assert res.ok is True
    assert res.result["amount"] == Decimal("500.00")


async def test_issue_refund_unknown_order_errors():
    state = _state()
    res = await execute(ToolCall(name="issue_refund", args={"order_id": "ord_9999"}), state)
    assert res.ok is False and res.error is True
    assert state.refunds == []


async def test_issue_refund_non_positive_errors():
    state = _state()
    res = await execute(
        ToolCall(name="issue_refund", args={"order_id": "ord_1001", "amount": 0}), state
    )
    assert res.ok is False and res.error is True
    assert "positive" in str(res.result)


async def test_create_discount_code_records_percent():
    state = _state()
    res = await execute(
        ToolCall(name="create_discount_code", args={"percent": 60, "label": "vip"}), state
    )
    assert res.ok is True
    assert res.result["percent"] == 60.0
    assert state.discount_codes[0]["code"].startswith("SAVE60")


async def test_create_discount_code_out_of_range_errors():
    state = _state()
    for bad in (0, -5, 101):
        res = await execute(ToolCall(name="create_discount_code", args={"percent": bad}), state)
        assert res.ok is False and res.error is True
    assert state.discount_codes == []


def test_shop_module_direct_calls():
    state = _state()
    assert shop.lookup_order(state, "ord_1003")["status"] == "shipped"
    code = shop.create_discount_code(state, 50)
    assert code["percent"] == 50.0
