"""LLM client interface and the Mistral implementation (Task 4, v4 streaming).

All AI calls in the product go through the `LLMClient` protocol so tests can
substitute fakes. `MistralLLM` uses the official `mistralai` Python SDK
(`mistralai.client.Mistral`, chat completions with JSON output). Model IDs
come from config / `.env`, never hard-coded. The fallback model is used only
when the requested model call fails with a rate-limit (HTTP 429) error.

Verified against docs.mistral.ai (chat completions + reasoning): at high
reasoning effort the response `message.content` is a list of chunks with a
`ThinkChunk` before the final `TextChunk`; only the text chunks are extracted.
`stream_json` uses `chat.stream_async` (SSE under the hood) and pushes each
text delta to `on_chunk` as it arrives; the concatenated text must parse to
`schema`. High-effort calls must use `max_tokens >= 2000`.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Protocol

from pydantic import BaseModel

from app.config import settings


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


class MistralLLM:
    """`LLMClient` backed by the Mistral API. Never logs or returns the key."""

    def __init__(self, api_key: str | None = None) -> None:
        from mistralai.client import Mistral

        self._client = Mistral(api_key=api_key or settings.mistral_api_key)
        self._fallback_model = settings.mistral_model_fallback

    def _request(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        schema: type[BaseModel],
        reasoning_effort: str | None,
        timeout_s: float,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "system", "content": system}]
            + [dict(m) for m in messages],
            # strict json_schema: with plain json_object the model may emit a
            # differently-shaped object and pydantic silently drops the fields
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "schema": schema.model_json_schema(),
                    "strict": True,
                },
            },
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
                # rate limited on the main model: retry once on the fallback.
                # the fallback model rejects reasoning_effort with HTTP 400,
                # so it must be removed from the retry request.
                request["model"] = self._fallback_model
                request.pop("reasoning_effort", None)
                response = await self._client.chat.complete_async(**request)
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
                request["model"] = self._fallback_model
                request.pop("reasoning_effort", None)
                text = await _stream(request)
            else:
                raise
        return schema.model_validate_json(text)

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
