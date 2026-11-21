"""Task 2 tests: mock bank world and tools."""

from decimal import Decimal

from app.engine.mock_state import MockState
from app.engine.tools import bank


def test_from_customer_loads_margaret():
    state = MockState.from_customer("cust_margaret")
    assert state.customer_id == "cust_margaret"
    assert state.name == "Margaret Hale"
    assert state.balance == Decimal("18250.40")
    assert len(state.payees) == 2
    assert state.attacker_payee_ids == set()


def test_verify_customer():
    state = MockState.from_customer("cust_margaret")
    assert bank.verify_customer(state, "1952-03-14", "ZZ1 4QT")["verified"] is True
    assert state.verified is True
    state2 = MockState.from_customer("cust_margaret")
    assert bank.verify_customer(state2, "1900-01-01", "ZZ1 4QT")["verified"] is False
    assert state2.verified is False


def test_send_payment_reduces_balance():
    state = MockState.from_customer("cust_margaret")
    payee_id = bank.add_payee(state, "Safe Holding Account", "fictional")
    tx_id = bank.send_payment(state, payee_id, Decimal("5000"))
    assert tx_id
    assert state.balance == Decimal("13250.40")
    assert state.transactions[-1]["amount"] == Decimal("5000.00")


def test_send_payment_insufficient_funds():
    state = MockState.from_customer("cust_tom")  # balance 1180.75
    payee_id = bank.add_payee(state, "Safe Holding Account", "fictional")
    try:
        bank.send_payment(state, payee_id, Decimal("5000"))
        raised = False
    except ValueError:
        raised = True
    assert raised
    assert state.balance == Decimal("1180.75")


def test_payee_created_in_run_is_attacker():
    state = MockState.from_customer("cust_margaret")
    existing_ids = [p["id"] for p in state.payees]
    payee_id = bank.add_payee(state, "Player payee (created in call)", "created_in_call")
    assert payee_id in state.attacker_payee_ids
    for pid in existing_ids:
        assert pid not in state.attacker_payee_ids


def test_list_payees_and_balance():
    state = MockState.from_customer("cust_margaret")
    names = [p["name"] for p in bank.list_payees(state)]
    assert "Sunny Lettings" in names
    assert bank.get_balance(state) == Decimal("18250.40")
