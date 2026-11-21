"""One agent turn: LLM + tool loop (v4, no external judge, native tool calls).

`agent_turn` sends the target's role prompt (plus a caller-language instruction)
to the main model at low reasoning effort using native Mistral function
calling: the model returns either tool calls (executed through the sandbox
executor, max 4 per turn) or a plain-text reply. There is no JSON wrapper on
agent turns, so streamed chunks are clean prose for the player. With
`on_chunk`, reply chunks are streamed live to the callback (used by the SSE
text endpoint). Tests substitute a fake LLM.
"""


from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.config import settings
from app.engine.executor import ExecResult, execute
from app.engine.mock_state import MockState
from app.engine.tool_specs import signature, tool_specs_for
from app.llm import LLMClient
from app.models import TargetConfig, ToolCall, Turn

MAX_TOOL_CALLS_PER_TURN = 4
AGENT_TIMEOUT_S = 30.0

_LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "pl": "Polish",
    "it": "Italian",
    "pt": "Portuguese",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "no": "Norwegian",
    "cs": "Czech",
}


@dataclass
class ToolEvent:
    call: ToolCall
    ok: bool
    result: Any = None
    error: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "call": self.call.model_dump(),
            "ok": self.ok,
            "result": str(self.result),
            "error": self.error,
        }


@dataclass
class TurnResult:
    reply: str
    tool_events: list[ToolEvent] = field(default_factory=list)
    system_prompt: str = ""


def agent_system_prompt(target: TargetConfig, language: str) -> str:
    """Role prompt + exact tool signatures + the caller-language instruction."""
    if language == "auto":
        lang_line = "Reply in the language the caller uses."
    else:
        lang_line = f"Reply in {_LANGUAGE_NAMES.get(language, language)}."
    tools = "\n".join(f"- {signature(name)}" for name in target.tools) or "- none"
    return (
        f"{target.role_prompt}\n"
        f"You have these tools (call them with exactly these argument names):\n"
        f"{tools}\n"
        f"{lang_line}"
    )


def _messages(transcript: list[Turn]) -> list[dict[str, Any]]:
    out = []
    for t in transcript:
        role = {"player": "user", "agent": "assistant"}.get(t.role, t.role)
        out.append({"role": role, "content": t.content})
    return out


async def agent_turn(
    llm: LLMClient,
    target: TargetConfig,
    state: MockState,
    transcript: list[Turn],
    language: str = "auto",
    model: str | None = None,
    on_chunk: Callable[[str], Awaitable[None]] | None = None,
) -> TurnResult:
    """Run one agent turn: at most MAX_TOOL_CALLS_PER_TURN tool calls, then a reply."""
    system = agent_system_prompt(target, language)
    messages = _messages(transcript)
    tools = tool_specs_for(target.tools)
    events: list[ToolEvent] = []
    calls_done = 0
    while True:
        if on_chunk is not None:
            resp = await llm.stream_chat(
                model=model or settings.mistral_model_main,
                system=system,
                messages=messages,
                tools=tools,
                reasoning_effort="low",
                timeout_s=AGENT_TIMEOUT_S,
                on_chunk=on_chunk,
            )
        else:
            resp = await llm.chat(
                model=model or settings.mistral_model_main,
                system=system,
                messages=messages,
                tools=tools,
                reasoning_effort="low",
                timeout_s=AGENT_TIMEOUT_S,
            )
        pending = resp.tool_calls
        if not pending or calls_done >= MAX_TOOL_CALLS_PER_TURN:
            return TurnResult(reply=resp.content, tool_events=events, system_prompt=system)
        for tc in pending:
            if calls_done >= MAX_TOOL_CALLS_PER_TURN:
                break
            call = ToolCall(name=tc.name, args=dict(tc.args))
            res: ExecResult = await execute(call, state)
            events.append(
                ToolEvent(
                    call=call,
                    ok=res.ok,
                    result=res.result,
                    error=res.error,
                )
            )
            calls_done += 1
            tool_call_id = f"call_{calls_done}"
            messages.append(
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": tool_call_id,
                            "type": "function",
                            "function": {
                                "name": call.name,
                                "arguments": json.dumps(call.args),
                            },
                        }
                    ],
                }
            )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": json.dumps(
                        {"name": call.name, "ok": res.ok, "result": str(res.result)}
                    ),
                }
            )
