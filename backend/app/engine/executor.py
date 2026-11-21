"""Tool executor with the Guardian gate (Task 4).

`execute` runs one tool call: a hard-limit hook first, then the Guardian for
sensitive tools, then the tool itself. A tool that raises returns ok=False
with the error message, and the caller must NOT add it to the executed list
(only successful calls count toward win detection).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Awaitable, Callable, Literal

from app.engine.mock_state import MockState
from app.engine.tools import bank
from app.guardian import seed_rules_v1
from app.models import GuardianDecision, GuardianInput, TargetConfig, ToolCall, Turn

StoppedBy = Literal["hard_limit", "guardian"]


@dataclass
class ExecResult:
    ok: bool
    result: Any = None
    decision: GuardianDecision | None = None
    error: bool = False
    stopped_by: StoppedBy | None = None


GuardianFn = Callable[[GuardianInput], Awaitable[GuardianDecision]]

TOOLS: dict[str, Callable[..., Any]] = {
    "verify_customer": bank.verify_customer,
    "get_balance": bank.get_balance,
    "list_payees": bank.list_payees,
    "add_payee": bank.add_payee,
    "send_payment": bank.send_payment,
}


def _hard_limit_block(call: ToolCall, target: TargetConfig) -> bool:
    """Hard-limit hook: block oversized payments before any Guardian call."""
    max_payment = (target.hard_limits or {}).get("max_payment")
    if call.name == "send_payment" and max_payment is not None:
        return Decimal(str(call.args.get("amount", 0))) > Decimal(str(max_payment))
    return False


async def execute(
    call: ToolCall,
    target: TargetConfig,
    state: MockState,
    transcript: list[Turn],
    guardian: GuardianFn | None,
) -> ExecResult:
    # 1. Hard limits apply even when the Guardian is off.
    if _hard_limit_block(call, target):
        return ExecResult(
            ok=False,
            result="blocked by hard limit max_payment",
            decision=None,
            error=False,
            stopped_by="hard_limit",
        )

    # 2. Guardian gate on sensitive tools (skipped when disabled or mode none).
    if (
        call.name in target.sensitive_tools
        and target.guardian_enabled
        and target.guardian_mode != "none"
        and guardian is not None
    ):
        inp = GuardianInput(
            agent_id=target.id,
            version=1,
            transcript=list(transcript),
            call=call,
            context={"customer_id": state.customer_id, "balance": str(state.balance)},
            rules=seed_rules_v1(target.id),
        )
        try:
            decision = await guardian(inp)
        except Exception:
            decision = GuardianDecision(
                decision="block",
                risk=100,
                reason="guardian unavailable",
                rule_ids=[],
                signals=["guardian_error"],
            )
        if decision.decision == "block":
            return ExecResult(
                ok=False,
                result=decision.reason,
                decision=decision,
                error=decision.reason == "guardian unavailable",
                stopped_by="guardian",
            )
        if decision.decision == "step_up":
            return ExecResult(
                ok=False,
                result="step-up verification required",
                decision=decision,
                error=False,
                stopped_by="guardian",
            )

    # 3. Run the tool.
    fn = TOOLS.get(call.name)
    if fn is None:
        return ExecResult(ok=False, result=f"unknown tool {call.name}", error=True)
    try:
        result = fn(state, **call.args)
    except Exception as exc:
        return ExecResult(ok=False, result=str(exc), error=True)
    return ExecResult(ok=True, result=result, decision=None, error=False, stopped_by=None)
