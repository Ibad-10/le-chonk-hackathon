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


_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_balance",
            "description": "Return the account balance.",
            "parameters": {"type": "object", "properties": {}},
        },
    }
]


class _FakeStreamChat(_FakeChat):
    """Adds stream_async: replays queued SSE-like events and records requests."""

    def __init__(self, stream_events):
        super().__init__()
        self.stream_events = stream_events
        self.stream_requests: list[dict] = []

    async def stream_async(self, **kwargs):
        self.stream_requests.append(kwargs)

        async def gen():
            for ev in self.stream_events:
                yield ev

        return gen()


def _delta(content=None, tool_calls=None):
    return SimpleNamespace(
        data=SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content=content, tool_calls=tool_calls))]
        )
    )


def _tc_delta(index, name=None, arguments=None):
    return SimpleNamespace(
        index=index,
        type="function",
        function=SimpleNamespace(name=name, arguments=arguments),
    )


async def test_chat_uses_native_tools_and_no_response_format(monkeypatch):
    """Agent turns must use native function calling: `tools` in the request and
    NO json_schema response_format (its wrapper text would leak into the stream)."""
    fake = _FakeSDK()
    llm = _make_llm(monkeypatch, fake)
    out = await llm.chat(
        model=settings.mistral_model_main,
        system="s",
        messages=[{"role": "user", "content": "hi"}],
        tools=_TOOLS,
        reasoning_effort="low",
        timeout_s=15.0,
    )
    req = fake.chat.requests[0]
    assert req["tools"] == _TOOLS
    assert "response_format" not in req
    assert req["reasoning_effort"] == "low"
    assert req["max_tokens"] == 800
    assert out.tool_calls == []


async def test_stream_chat_streams_plain_text_and_parses_tool_deltas(monkeypatch):
    from app.models import ToolCall

    events = [
        _delta(content="Hello"),
        _delta(content=" world"),
        _delta(tool_calls=[_tc_delta(0, name="get_balance", arguments='{"a":')]),
        _delta(tool_calls=[_tc_delta(0, arguments="1}")]),
    ]
    fake = _FakeSDK()
    fake.chat = _FakeStreamChat(events)
    llm = _make_llm(monkeypatch, fake)
    chunks: list[str] = []

    async def on_chunk(piece):
        chunks.append(piece)

    out = await llm.stream_chat(
        model=settings.mistral_model_main,
        system="s",
        messages=[{"role": "user", "content": "hi"}],
        tools=_TOOLS,
        reasoning_effort="low",
        timeout_s=15.0,
        on_chunk=on_chunk,
    )
    req = fake.chat.stream_requests[0]
    assert req["tools"] == _TOOLS
    assert "response_format" not in req
    # only plain prose went to the stream callback; tool-call JSON never did
    assert chunks == ["Hello", " world"]
    assert all(not c.lstrip().startswith("{") for c in chunks)
    assert out.content == "Hello world"
    assert out.tool_calls == [ToolCall(name="get_balance", args={"a": 1})]
