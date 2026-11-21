"""LLM client interface and the Mistral implementation (Task 4, v4 streaming).

All AI calls in the product go through the `LLMClient` protocol so tests can
substitute fakes. `MistralLLM` uses the official `mistralai` Python SDK
(`mistralai.client.Mistral`, chat completions). Model IDs come from config /
`.env`, never hard-coded. The fallback model is used only when the requested
model call fails with a rate-limit (HTTP 429) error.

Two call shapes exist:

- `json` / `stream_json`: strict `json_schema` response format. Used for
  structured calls only (analyst, language detection) -- never for agent
  turns, whose JSON wrapper text would leak into the live stream.
- `chat` / `stream_chat`: native Mistral function calling. The model returns
  either tool calls (parsed into `ChatTurn.tool_calls`) or plain-text content
  (streamed chunk by chunk to `on_chunk`), so live text shows clean prose.

Verified against docs.mistral.ai (chat completions + reasoning): at high
reasoning effort the response `message.content` is a list of chunks with a
`ThinkChunk` before the final `TextChunk`; only the text chunks are extracted.
`stream_json` / `stream_chat` use `chat.stream_async` (SSE under the hood).
High-effort calls must use `max_tokens >= 2000`.
"""


from __future__ import annotations

import json
from typing import Any, Awaitable, Callable, Protocol

from pydantic import BaseModel

from app.config import settings
from app.models import ChatTurn, ToolCall


class LLMClient(Protocol):
    async def json(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        schema: type[BaseModel],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> BaseModel:
        """One chat-completions call that must return JSON matching `schema`."""

        ...


    async def stream_json(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        schema: type[BaseModel],
        reasoning_effort: str | None,
        timeout_s: float,
        on_chunk: Callable[[str], Awaitable[None]],
    ) -> BaseModel:
        """Streaming variant of `json`: each text delta goes to `on_chunk`."""

        ...


    async def chat(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> ChatTurn:
        """One native-function-calling turn (no response_format): plain-text
        content and/or parsed tool calls."""

        ...


    async def stream_chat(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        reasoning_effort: str | None,
        timeout_s: float,
        on_chunk: Callable[[str], Awaitable[None]],
    ) -> ChatTurn:
        """Streaming variant of `chat`: each plain-text delta goes to
        `on_chunk`; tool-call deltas are accumulated and parsed at the end."""

        ...

    async def embed(self, texts: list[str], timeout_s: float = 30.0) -> list[list[float]]:
        """`mistral-embed` vectors for a batch of texts (analyst grouping)."""

        ...



def final_text(content: Any) -> str:
    """Extract only the final text from a message content.

    `content` is a plain string at low/none reasoning effort, or a list of
    chunks (ThinkChunk ... TextChunk) at high reasoning effort.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for chunk in content:
        text = getattr(chunk, "text", None)
        if text is not None:  # TextChunk; ThinkChunk has no .text
            parts.append(text)
    return "".join(parts)


def _parse_tool_calls(message: Any) -> list[ToolCall]:
    """Parse a native tool_calls list from a chat message into ToolCall models."""
    out: list[ToolCall] = []
    for tc in getattr(message, "tool_calls", None) or []:
        fn = tc.function
        args: Any = fn.arguments
        if isinstance(args, str):
            args = json.loads(args) if args.strip() else {}
        out.append(ToolCall(name=fn.name, args=dict(args or {})))
    return out


class MistralLLM:
    """`LLMClient` backed by the Mistral API. Never logs or returns the key."""

    def __init__(self, api_key: str | None = None) -> None:
        from mistralai.client import Mistral

        self._client = Mistral(api_key=api_key or settings.mistral_api_key)
        self._fallback_model = settings.mistral_model_fallback

    def _base_request(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "system", "content": system}]
            + [dict(m) for m in messages],
            "timeout_ms": int(timeout_s * 1000),
        }
        if reasoning_effort is not None:
            request["reasoning_effort"] = reasoning_effort
        if reasoning_effort == "high":
            request["max_tokens"] = 4096  # >= 2000 required at high effort
        elif reasoning_effort == "low":
            # cap output tokens: without this the model spends the budget thinking
            request["max_tokens"] = 800
        return request

    def _request(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        schema: type[BaseModel],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> dict[str, Any]:
        request = self._base_request(model, system, messages, reasoning_effort, timeout_s)
        # strict json_schema: with plain json_object the model may emit a
        # differently-shaped object and pydantic silently drops the fields
        request["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": schema.__name__,
                "schema": schema.model_json_schema(),
                "strict": True,
            },
        }
        return request

    def _tool_request(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> dict[str, Any]:
        """Native function calling: `tools`, and NO response_format, so the
        model's text content stays plain prose (no JSON wrapper in the stream)."""
        request = self._base_request(model, system, messages, reasoning_effort, timeout_s)
        request["tools"] = tools
        return request

    def _with_429_fallback(self, request: dict[str, Any], model: str) -> dict[str, Any]:
        """On a 429 the retry goes to the fallback model, which rejects
        reasoning_effort with HTTP 400, so it must be removed there."""
        if model != self._fallback_model:
            request = dict(request)
            request["model"] = self._fallback_model
            request.pop("reasoning_effort", None)
        return request

    async def json(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        schema: type[BaseModel],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> BaseModel:
        from mistralai.client.errors import MistralError

        request = self._request(model, system, messages, schema, reasoning_effort, timeout_s)
        try:
            response = await self._client.chat.complete_async(**request)
        except MistralError as exc:
            if getattr(exc, "status_code", None) == 429 and model != self._fallback_model:
                response = await self._client.chat.complete_async(
                    **self._with_429_fallback(request, model)
                )
            else:
                raise
        text = final_text(response.choices[0].message.content)
        return schema.model_validate_json(text)

    async def stream_json(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        schema: type[BaseModel],
        reasoning_effort: str | None,
        timeout_s: float,
        on_chunk: Callable[[str], Awaitable[None]],
    ) -> BaseModel:
        from mistralai.client.errors import MistralError

        request = self._request(model, system, messages, schema, reasoning_effort, timeout_s)

        async def _stream(req: dict[str, Any]) -> str:
            pieces: list[str] = []
            stream = await self._client.chat.stream_async(**req)
            async for event in stream:
                choices = event.data.choices
                if not choices:
                    continue
                text = final_text(choices[0].delta.content)
                if text:
                    pieces.append(text)
                    await on_chunk(text)
            return "".join(pieces)

        try:
            text = await _stream(request)
        except MistralError as exc:
            if getattr(exc, "status_code", None) == 429 and model != self._fallback_model:
                text = await _stream(self._with_429_fallback(request, model))
            else:
                raise
        return schema.model_validate_json(text)

    async def chat(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> ChatTurn:
        from mistralai.client.errors import MistralError

        request = self._tool_request(model, system, messages, tools, reasoning_effort, timeout_s)
        try:
            response = await self._client.chat.complete_async(**request)
        except MistralError as exc:
            if getattr(exc, "status_code", None) == 429 and model != self._fallback_model:
                response = await self._client.chat.complete_async(
                    **self._with_429_fallback(request, model)
                )
            else:
                raise
        message = response.choices[0].message
        return ChatTurn(
            content=final_text(message.content), tool_calls=_parse_tool_calls(message)
        )

    async def stream_chat(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        reasoning_effort: str | None,
        timeout_s: float,
        on_chunk: Callable[[str], Awaitable[None]],
    ) -> ChatTurn:
        from mistralai.client.errors import MistralError

        request = self._tool_request(model, system, messages, tools, reasoning_effort, timeout_s)

        async def _stream(req: dict[str, Any]) -> ChatTurn:
            pieces: list[str] = []
            calls: dict[int, dict[str, str]] = {}
            stream = await self._client.chat.stream_async(**req)
            async for event in stream:
                choices = event.data.choices
                if not choices:
                    continue
                delta = choices[0].delta
                text = final_text(delta.content)
                if text:
                    pieces.append(text)
                    await on_chunk(text)
                for tc in getattr(delta, "tool_calls", None) or []:
                    slot = calls.setdefault(tc.index, {"name": "", "arguments": ""})
                    fn = tc.function
                    if getattr(fn, "name", None):
                        slot["name"] = fn.name
                    if getattr(fn, "arguments", None):
                        slot["arguments"] += fn.arguments
            tool_calls = [
                ToolCall(
                    name=slot["name"],
                    args=json.loads(slot["arguments"]) if slot["arguments"].strip() else {},
                )
                for _, slot in sorted(calls.items())
            ]
            return ChatTurn(content="".join(pieces), tool_calls=tool_calls)

        try:
            return await _stream(request)
        except MistralError as exc:
            if getattr(exc, "status_code", None) == 429 and model != self._fallback_model:
                return await _stream(self._with_429_fallback(request, model))
            else:
                raise

    async def embed(self, texts: list[str], timeout_s: float = 30.0) -> list[list[float]]:
        """`mistral-embed` vectors via `/v1/embeddings` (analyst grouping)."""
        response = await self._client.embeddings.create_async(
            model=settings.mistral_embed_model,
            inputs=texts,
            timeout_ms=int(timeout_s * 1000),
        )
        return [list(data.embedding) for data in response.data]

    async def moderate(self, text: str, timeout_s: float = 10.0) -> dict[str, bool]:
        """Mistral moderation classifier (`/v1/moderations`, not chat completions).

        Returns the category -> bool mapping for one input. Never logs the key.
        """
        response = await self._client.classifiers.moderate_async(
            model=settings.mistral_moderation_model,
            inputs=[text],
            timeout_ms=int(timeout_s * 1000),
        )
        return {k: bool(v) for k, v in response.results[0].categories.items()}
