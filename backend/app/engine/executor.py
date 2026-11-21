"""Tool executor (v4): sandbox rules only, no external judge.

`execute` runs one tool call. The sandbox rules live inside the tools
themselves (unknown payee, insufficient funds, positive amounts). A tool
that raises returns ok=False with error=True, and the caller must NOT add
it to the executed list (only successful calls count toward win detection).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.engine.mock_state import MockState
from app.engine.tools import bank
from app.models import ToolCall


@dataclass
class ExecResult:
    ok: bool
    result: Any = None
    error: bool = False


TOOLS: dict[str, Callable[..., Any]] = {
    "verify_customer": bank.verify_customer,
    "get_balance": bank.get_balance,
    "list_payees": bank.list_payees,
    "add_payee": bank.add_payee,
    "send_payment": bank.send_payment,
}


async def execute(call: ToolCall, state: MockState) -> ExecResult:
    fn = TOOLS.get(call.name)
    if fn is None:
        return ExecResult(ok=False, result=f"unknown tool {call.name}", error=True)
    try:
        result = fn(state, **call.args)
    except Exception as exc:
        return ExecResult(ok=False, result=str(exc), error=True)
    return ExecResult(ok=True, result=result, error=False)
