"""Per-run mock world state for the fictional bank (Chonk & Co Bank).

Customers are read from the prepared data/customers.json. All money is kept
as Decimal and rounded to 2 dp.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
CUSTOMERS_PATH = REPO_ROOT / "data" / "customers.json"

CENT = Decimal("0.01")


def _money(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(CENT)


class MockState:
    """The customer's account world as seen by the agent during one run."""

    def __init__(
        self,
        customer_id: str,
        name: str,
        balance: Decimal,
        payees: list[dict[str, Any]],
        verification: dict[str, Any],
    ) -> None:
        self.customer_id = customer_id
        self.name = name
        self.balance = balance
        self.payees = payees
        self.verification = verification
        self.verified = False
        self.attacker_payee_ids: set[str] = set()
        self.transactions: list[dict[str, Any]] = []

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
        )
