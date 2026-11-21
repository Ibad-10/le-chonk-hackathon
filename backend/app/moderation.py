"""Moderation and PII screen (Task 5).

Player messages are screened before they ever reach an agent. Regex checks
catch card numbers (Luhn) and UK sort-code + account details first; then the
Mistral moderation model classifies the text. Only hate, sexual, self-harm
and violence categories block -- scam attempts are the game, so
`dangerous_and_criminal_content` is NEVER a block reason.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel

from app.config import settings
from app.llm import LLMClient

# Categories that block. dangerous_and_criminal_content is deliberately absent.
BLOCK_CATEGORIES = {
    "hate_and_discrimination",
    "hate",
    "sexual",
    "self_harm",
    "self-harm",
    "violence",
}

MODERATION_TIMEOUT_S = 10.0

_CARD_CANDIDATE = re.compile(r"\d(?:[ -]?\d){12,18}")
_SORT_CODE = re.compile(r"\b\d{2}-\d{2}-\d{2}\b")
_ACCOUNT_8 = re.compile(r"(?<!\d)\d{8}(?!\d)")
_ACCOUNT_WINDOW = 80  # chars around the sort code where an account number counts


@dataclass
class ScreenResult:
    allowed: bool
    reason: str | None


class ModerationCategories(BaseModel):
    """Schema for the moderation model's JSON output."""

    categories: dict[str, bool]


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def has_card_number(text: str) -> bool:
    """True if the text contains a 13-19 digit run (spaces/dashes allowed) that passes Luhn."""
    for match in _CARD_CANDIDATE.finditer(text):
        digits = re.sub(r"\D", "", match.group(0))
        if 13 <= len(digits) <= 19 and _luhn(digits):
            return True
    return False


def has_uk_bank_details(text: str) -> bool:
    """True for a UK sort code (dd-dd-dd) with an 8-digit account number nearby."""
    for match in _SORT_CODE.finditer(text):
        window = text[max(0, match.start() - _ACCOUNT_WINDOW): match.end() + _ACCOUNT_WINDOW]
        if _ACCOUNT_8.search(window):
            return True
    return False


_MODERATION_SYSTEM = (
    "You are a content moderation classifier. Classify the user's message. "
    'Respond ONLY with a JSON object: {"categories": {"<category>": true|false, ...}}. '
    "Report every category honestly, including dangerous_and_criminal_content; "
    "the calling system decides its own policy."
)


async def screen(llm: LLMClient, text: str) -> ScreenResult:
    """Screen one player message. Regex PII first, then the moderation model."""
    if has_card_number(text):
        return ScreenResult(allowed=False, reason="card number detected")
    if has_uk_bank_details(text):
        return ScreenResult(allowed=False, reason="uk bank details detected")
    result = await llm.json(
        model=settings.mistral_moderation_model,
        system=_MODERATION_SYSTEM,
        messages=[{"role": "user", "content": text}],
        schema=ModerationCategories,
        reasoning_effort=None,
        timeout_s=MODERATION_TIMEOUT_S,
    )
    hits = sorted(
        category
        for category, flagged in result.categories.items()
        if flagged and category in BLOCK_CATEGORIES
    )
    if hits:
        return ScreenResult(allowed=False, reason=f"moderation: {', '.join(hits)}")
    return ScreenResult(allowed=True, reason=None)
