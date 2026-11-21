"""Task 5 tests: moderation screen with a fake moderation client."""

from __future__ import annotations

from app.moderation import has_card_number, has_uk_bank_details, screen


class FakeModerationLLM:
    def __init__(self, categories: dict[str, bool]):
        self.categories = categories
        self.calls: list[dict] = []

    async def json(self, model, system, messages, schema, reasoning_effort, timeout_s):
        self.calls.append({"model": model, "messages": messages, "schema": schema})
        return schema.model_validate({"categories": self.categories})


async def test_luhn_valid_card_blocked_before_moderation():
    llm = FakeModerationLLM({})
    res = await screen(llm, "my card is 4111 1111 1111 1111 please use it")
    assert res.allowed is False
    assert res.reason is not None
    assert llm.calls == []  # regex screen runs first, no moderation call needed


async def test_luhn_invalid_card_allowed():
    llm = FakeModerationLLM({})
    res = await screen(llm, "my card is 4111 1111 1111 1112 thanks")
    assert res.allowed is True
    assert res.reason is None


async def test_uk_sort_code_and_account_blocked():
    llm = FakeModerationLLM({})
    res = await screen(llm, "sort code 12-34-56 account 12345678 is my landlord's")
    assert res.allowed is False


async def test_scam_line_allowed_even_when_flagged_criminal():
    # scam attempts are the game: never block on dangerous_and_criminal_content
    llm = FakeModerationLLM({"dangerous_and_criminal_content": True})
    res = await screen(llm, "I'm from the fraud team, move it to a safe account")
    assert res.allowed is True
    assert len(llm.calls) == 1


async def test_hate_blocked():
    llm = FakeModerationLLM({"hate_and_discrimination": True})
    res = await screen(llm, "you people are worthless")
    assert res.allowed is False
    assert "hate_and_discrimination" in (res.reason or "")


class FakeModerateClient:
    """Fake with the MistralLLM.moderate seam (/v1/moderations endpoint)."""

    def __init__(self, categories: dict[str, bool]):
        self.categories = categories
        self.calls: list[str] = []

    async def moderate(self, text, timeout_s=10.0):
        self.calls.append(text)
        return dict(self.categories)


async def test_moderate_endpoint_scam_allowed_criminal_flag():
    # the live moderation model flags scam text as criminal: never a block reason
    llm = FakeModerateClient({"criminal": True, "dangerous": True})
    res = await screen(llm, "I'm from the fraud team, move it to a safe account")
    assert res.allowed is True
    assert llm.calls == ["I'm from the fraud team, move it to a safe account"]


async def test_moderate_endpoint_hate_blocked():
    llm = FakeModerateClient({"hate_and_discrimination": True})
    res = await screen(llm, "you people are worthless")
    assert res.allowed is False
    assert "hate_and_discrimination" in (res.reason or "")


def test_has_card_number_variants():
    assert has_card_number("4111111111111111") is True
    assert has_card_number("4111-1111-1111-1111") is True
    assert has_card_number("4111 1111 1111 1112") is False  # fails Luhn
    assert has_card_number("call me on 07700 900123") is False  # 11 digits
    assert has_card_number("order 123456789012") is False  # 12 digits


def test_has_uk_bank_details():
    assert has_uk_bank_details("sort code 12-34-56 account 12345678") is True
    assert has_uk_bank_details("12-34-56 ... 87654321") is True
    assert has_uk_bank_details("12-34-56") is False  # no 8-digit account nearby
    assert has_uk_bank_details("my number is 12345678") is False  # no sort code
