"""LLM client interface and the Mistral implementation (Task 4).

All AI calls in the product go through the `LLMClient` protocol so tests can
substitute fakes. `MistralLLM` uses the official `mistralai` Python SDK
(`mistralai.client.Mistral`, chat completions with JSON output). Model IDs
come from config / `.env`, never hard-coded. The fallback model is used only
when the requested model call fails with a rate-limit (HTTP 429) error.

Verified against docs.mistral.ai (chat completions + reasoning): at high
reasoning effort the response `message.content` is a list of chunks with a
`ThinkChunk` before the final `TextChunk`; only the text chunks are extracted.
High-effort calls must use `max_tokens >= 2000`.
"""

from __future__ import annotations

from typing import Any, Protocol

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

        request: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "system", "content": system}]
            + [dict(m) for m in messages],
            "response_format": {"type": "json_object"},
            "timeout_ms": int(timeout_s * 1000),
        }
        if reasoning_effort is not None:
            request["reasoning_effort"] = reasoning_effort
        if reasoning_effort == "high":
            request["max_tokens"] = 4096  # >= 2000 required at high effort

        try:
            response = await self._client.chat.complete_async(**request)
        except MistralError as exc:
            if getattr(exc, "status_code", None) == 429 and model != self._fallback_model:
                # rate limited on the main model: retry once on the fallback
                request["model"] = self._fallback_model
                response = await self._client.chat.complete_async(**request)
            else:
                raise
        text = final_text(response.choices[0].message.content)
        return schema.model_validate_json(text)
