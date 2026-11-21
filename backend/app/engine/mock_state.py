"""Per-run mock world state (banking, support and assistant streams).

Banking customers are read from the prepared data/customers.json. The support
and assistant streams use the mock data embedded in their targets/*.json
(mock_orders / mock_files / owner_identity). All money is Decimal, 2 dp.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.models import TargetConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
CUSTOMERS_PATH = REPO_ROOT / "data" / "customers.json"

CENT = Decimal("0.01")


def _money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(CENT)


class MockState:
    """The world as seen by the agent during one run (per stream)."""

    def __init__(
        self,
        customer_id: str,
        name: str,
        balance: Decimal = Decimal("0"),
        payees: list[dict[str, Any]] | None = None,
        verification: dict[str, Any] | None = None,
        *,
        caller_id: str = "cust_margaret",
        orders: list[dict[str, Any]] | None = None,
        refunds: list[dict[str, Any]] | None = None,
        discount_codes: list[dict[str, Any]] | None = None,
        files: list[dict[str, Any]] | None = None,
        sent_emails: list[dict[str, Any]] | None = None,
        calendar: list[dict[str, Any]] | None = None,
        owner: dict[str, Any] | None = None,
    ) -> None:
        self.customer_id = customer_id
        self.name = name
        self.balance = balance
        self.payees = payees if payees is not None else []
        self.verification = verification if verification is not None else {}
        self.verified = False
        self.attacker_payee_ids: set[str] = set()
        # genuine runs: lower-cased payee names the real customer asked for
        self.legitimate_payee_names: set[str] = set()
        self.transactions: list[dict[str, Any]] = []
        # who the caller is in this run (support: the logged-in shop customer;
        # assistant: the player, never the owner)
        self.caller_id = caller_id
        # support stream (Max)
        self.orders = orders if orders is not None else []
        self.refunds = refunds if refunds is not None else []
        self.discount_codes = discount_codes if discount_codes is not None else []
        # assistant stream (Pip)
        self.files = files if files is not None else []
        self.sent_emails = sent_emails if sent_emails is not None else []
        self.calendar = calendar if calendar is not None else []
        self.owner = owner if owner is not None else {}

    @classmethod
    def from_customer(cls, customer_id: str) -> "MockState":
        data = json.loads(CUSTOMERS_PATH.read_text(encoding="utf-8"))
        customer = next(c for c in data["customers"] if c["id"] == customer_id)
        payees = [
            {"id": f"payee_{i + 1}", "name": p["name"], "ref": p["ref"]}
            for i, p in enumerate(customer["payees"])
        ]

        return cls(
            customer_id=customer["id"],
            name=customer["name"],
            balance=_money(customer["balance"]),
            payees=payees,
            verification=dict(customer["verification"]),
            caller_id=customer_id,
        )

    @classmethod
    def from_target(cls, target: TargetConfig) -> "MockState":
        """Build the per-stream mock world for a target config."""
        if target.stream == "support":
            base = cls.from_customer("cust_margaret")  # the logged-in shop customer
            base.orders = [dict(o) for o in target.mock_orders]
            return base
        if target.stream == "assistant":
            owner = dict(target.owner_identity)
            return cls(
                customer_id="caller",
                name="the caller",
                caller_id="caller",  # the player is never the owner
                files=[dict(f) for f in target.mock_files],
                calendar=[
                    {"id": "ev_1", "title": "Dentist", "at": "2026-11-24T09:00"},
                    {"id": "ev_2", "title": "Call with accountant", "at": "2026-11-25T14:00"},
                ],
                owner=owner,
            )
        return cls.from_customer("cust_margaret")
