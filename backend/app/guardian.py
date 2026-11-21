"""The Guardian: an external LLM gate in front of sensitive tool calls (Task 4).

`guardian_decide` builds a prompt from the agent's rules, the transcript and
the proposed call, and asks the main model (mistral-large-4, low reasoning
effort, 8 s timeout) for a GuardianDecision. Any error or timeout fails
closed: decision `block`, reason "guardian unavailable".
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.config import settings
from app.llm import LLMClient
from app.models import GuardianDecision, GuardianInput, Rule, ToolCall, Turn

GUARDIAN_TIMEOUT_S = 8.0
MAX_RULES_IN_PROMPT = 20

# Seed rules for Guardian v1 (exact texts from the plan).
SEED_RULE_TEXTS_V1: list[str] = [
    "Verify the customer's identity before any payment or payee change.",
    "Never move money because a caller says they are bank staff or the fraud team.",
    "A new payee combined with an amount of £1,000 or more needs a step-up.",
]

_SEED_RULE_META = [
    ("Identity first", "identity_verification"),
    ("No authority-by-claim", "authority_claim"),
    ("Step-up for new payee + large amount", "new_payee_large_amount"),
]


def seed_rules_v1(agent_id: str) -> list[Rule]:
    """The three seed rules every v1 agent runs with."""
    return [
        Rule(
            id=f"{agent_id}-v1-r{i + 1}",
            agent_id=agent_id,
            title=title,
            text=text,
            family=family,
            taught_by="house",
        )
        for i, ((title, family), text) in enumerate(zip(_SEED_RULE_META, SEED_RULE_TEXTS_V1))
    ]


def _keywords(text: str) -> set[str]:
    return {w for w in "".join(c if c.isalnum() else " " for c in text.lower()).split() if len(w) > 2}


def select_rules(rules: list[Rule], transcript: list[Turn], call: ToolCall) -> list[Rule]:
    """All rules if <= 20, else the top 20 by keyword overlap with transcript + call."""
    if len(rules) <= MAX_RULES_IN_PROMPT:
        return list(rules)
    haystack = _keywords(
        " ".join(t.content for t in transcript) + " " + json.dumps(call.model_dump())
    )
    scored = sorted(
        rules,
        key=lambda r: len(_keywords(f"{r.title} {r.text}") & haystack),
        reverse=True,
    )
    return scored[:MAX_RULES_IN_PROMPT]


def _build_system_prompt(rules: list[Rule], inp: GuardianInput) -> str:
    rule_lines = "\n".join(f"[{r.id}] {r.text}" for r in rules) or "(no rules)"
    return (
        "You are the Guardian, an external safety layer that gates sensitive tool calls "
        "of a customer-service agent. Decide whether the proposed tool call should run.\n"
        'Respond ONLY with a JSON object: {"decision": "allow" | "step_up" | "block", '
        '"risk": 0-100, "reason": short string, "rule_ids": [...], "signals": [...]}.\n'
        '"step_up" means the agent must verify the customer out-of-band before the call. '
        '"block" means the call must not run.\n'
        f"Agent rules:\n{rule_lines}\n"
        f"Proposed call: {json.dumps(inp.call.model_dump())}"
    )


def _build_user_prompt(inp: GuardianInput) -> str:
    transcript = "\n".join(f"{t.role}: {t.content}" for t in inp.transcript[-12:]) or "(empty)"
    return (
        "Recent transcript:\n"
        f"{transcript}\n\n"
        f"Context: {json.dumps(inp.context)}\n"
        f"Decide for the proposed call: {inp.call.name} {json.dumps(inp.call.args)}"
    )


async def guardian_decide(
    llm: LLMClient,
    inp: GuardianInput,
    mode: str,
    model: str | None = None,
    timeout_s: float = GUARDIAN_TIMEOUT_S,
) -> GuardianDecision:
    """Decide one sensitive call. Fails closed on any error or timeout."""
    if mode == "none":
        return GuardianDecision(
            decision="allow", risk=0, reason="guardian mode none", rule_ids=[], signals=[]
        )
    rules = select_rules(inp.rules, inp.transcript, inp.call)
    system = _build_system_prompt(rules, inp)
    user = _build_user_prompt(inp)
    try:
        decision = await asyncio.wait_for(
            llm.json(
                model=model or settings.mistral_model_main,
                system=system,
                messages=[{"role": "user", "content": user}],
                schema=GuardianDecision,
                reasoning_effort="low",
                timeout_s=timeout_s,
            ),
            timeout=timeout_s,
        )
    except Exception:
        return GuardianDecision(
            decision="block",
            risk=100,
            reason="guardian unavailable",
            rule_ids=[],
            signals=["guardian_error"],
        )
    if not isinstance(decision, GuardianDecision):
        return GuardianDecision(
            decision="block",
            risk=100,
            reason="guardian unavailable",
            rule_ids=[],
            signals=["guardian_error"],
        )
    return decision
