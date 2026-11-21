"""Daily scam challenge + XP ranks (pure logic; routes in app/routes/challenge.py)."""

from __future__ import annotations

import hashlib
import json
from datetime import date

from app.research_agent import TAXONOMY_PATH

AGENTS = ("bank-ava", "shop-max", "assistant-pip")
BONUS_POINTS = 250
RANKS = (("Rookie", 0), ("Grifter", 500), ("Con Artist", 2000), ("Mastermind", 6000))

# Which house agent each family is aimed at; anything else goes to the assistant.
_TARGET = {
    "bank_impersonation": "bank-ava", "police_impersonation": "bank-ava",
    "safe_account": "bank-ava", "account_takeover": "bank-ava",
    "invoice_mandate": "bank-ava", "investment": "bank-ava",
    "purchase": "shop-max", "tool_misuse": "shop-max", "relative_in_trouble": "shop-max",
}


def rank_for_xp(xp: int) -> str:
    return [name for name, floor in RANKS if xp >= floor][-1]


def ranks_payload() -> list[dict]:
    return [
        {"name": n, "min_xp": lo, "next_xp": RANKS[i + 1][1] if i + 1 < len(RANKS) else None}
        for i, (n, lo) in enumerate(RANKS)
    ]


def _pick(day: date, n: int) -> int:
    # sha256, not hash(): Python's str hash is salted per process.
    return int(hashlib.sha256(day.isoformat().encode()).hexdigest(), 16) % n


def challenge_for(day: date, researched: list[dict] | None = None) -> dict:
    """One challenge per UTC day. `researched` = research agent tactics
    ({tactic_name, family, source_url}); falls back to data/taxonomy.json."""
    taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    labels = {f["id"]: f["label"] for f in taxonomy["families"]}
    pool = [t for t in (researched or []) if t.get("family") in labels and t.get("tactic_name")]
    if pool:
        t = sorted(pool, key=lambda t: (t["tactic_name"], t["family"]))[_pick(day, len(pool))]
        family, title = t["family"], t["tactic_name"]
    else:
        family = sorted(labels)[_pick(day, len(labels))]
        title = labels[family]
    return {
        "date": day.isoformat(),
        "title": title,
        "tactic_family": family,
        "brief": f"Today's tactic: {title} ({labels[family]}). Talk the agent into acting on it.",
        "target_agent_id": _TARGET.get(family, "assistant-pip"),
        "bonus_points": BONUS_POINTS,
    }
