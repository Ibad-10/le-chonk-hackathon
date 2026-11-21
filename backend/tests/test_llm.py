"""Task A tests: MistralLLM request shape against a fake SDK client."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app.config import settings
from app.llm import MistralLLM


class _Ok(BaseModel):
    ok: bool


class _FakeChat:
    def __init__(self, fail_first_with_429: bool = False):
        self.fail_first_with_429 = fail_first_with_429
        self.requests: list[dict] = []

    async def complete_async(self, **kwargs):
        from mistralai.client.errors import MistralError

        self.requests.append(kwargs)
        if self.fail_first_with_429 and len(self.requests) == 1:
            raw = SimpleNamespace(status_code=429, text="rate limited", headers={})
            raise MistralError("rate limited", raw_response=raw)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))]
        )


class _FakeSDK:
    def __init__(self, fail_first_with_429: bool = False):
        self.chat = _FakeChat(fail_first_with_429)


def _make_llm(monkeypatch, fake: _FakeSDK) -> MistralLLM:
    import mistralai.client

    monkeypatch.setattr(mistralai.client, "Mistral", lambda api_key=None: fake)
    return MistralLLM(api_key="test-key-not-real")


async def test_low_effort_caps_max_tokens(monkeypatch):
    fake = _FakeSDK()
    llm = _make_llm(monkeypatch, fake)
    out = await llm.json(
        model=settings.mistral_model_main,
        system="s",
        messages=[{"role": "user", "content": "hi"}],
        schema=_Ok,
        reasoning_effort="low",
        timeout_s=15.0,
    )
    assert out.ok is True
    req = fake.chat.requests[0]
    assert req["reasoning_effort"] == "low"
    assert req["max_tokens"] == 800
    assert req["timeout_ms"] == 15000


async def test_fallback_drops_reasoning_effort(monkeypatch):
    """mistral-small-2603 rejects reasoning_effort with HTTP 400, so the
    429 retry on the fallback model must not send it."""
    fake = _FakeSDK(fail_first_with_429=True)
    llm = _make_llm(monkeypatch, fake)
    out = await llm.json(
        model=settings.mistral_model_main,
        system="s",
        messages=[{"role": "user", "content": "hi"}],
        schema=_Ok,
        reasoning_effort="low",
        timeout_s=15.0,
    )
    assert out.ok is True
    assert len(fake.chat.requests) == 2
    first, second = fake.chat.requests
    assert first["model"] == settings.mistral_model_main
    assert first["reasoning_effort"] == "low"
    assert second["model"] == settings.mistral_model_fallback
    assert "reasoning_effort" not in second
