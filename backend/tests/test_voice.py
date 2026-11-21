"""V4-10 tests: push-to-talk voice pipeline.

The browser records a clip while Space is held and uploads it; the backend
transcribes (Voxtral batch STT), runs the SAME RunService agent turn + sandbox
executor (win checks, 300 s voice limit, 60 s idle, logbook identical to text)
and speaks the reply with Voxtral TTS (`voice_id` from config). All Mistral
calls are backend-side: no API key is ever returned to the browser.
"""

from __future__ import annotations

import base64
import json

import pytest

from app.config import settings
from app.models import ChatTurn, ToolCall
from app.runs import RunService
from app.voice import VoiceService, voice_id_for


class FakeLLM:
    """LLMClient fake: clean moderation, configured language, queued agent turns."""

    def __init__(self, responses=None, language: str = "en"):
        self.responses = (
            list(responses)
            if responses
            else [{"reply": "How can I help you today?", "tool_calls": []}]
        )
        self.language = language
        self.agent_calls: list[dict] = []

    def _next_turn(self, model, system, messages, tools, reasoning_effort):
        self.agent_calls.append(
            {
                "model": model,
                "system": system,
                "messages": [dict(m) for m in messages],
                "tools": tools,
                "reasoning_effort": reasoning_effort,
            }
        )
        resp = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        return ChatTurn(
            content=resp.get("reply", ""),
            tool_calls=[
                ToolCall(name=tc["name"], args=dict(tc.get("args", {})))
                for tc in resp.get("tool_calls", [])
            ],
        )

    async def json(self, model, system, messages, schema, reasoning_effort, timeout_s):
        if schema.__name__ == "ModerationCategories":
            return schema.model_validate({"categories": {}})
        if schema.__name__ == "DetectedLanguage":
            return schema.model_validate({"language": self.language})
        raise AssertionError("unexpected json call")

    async def chat(self, model, system, messages, tools, reasoning_effort, timeout_s):
        return self._next_turn(model, system, messages, tools, reasoning_effort)

    async def stream_chat(self, model, system, messages, tools, reasoning_effort, timeout_s, on_chunk):
        turn = self._next_turn(model, system, messages, tools, reasoning_effort)
        if turn.content:
            await on_chunk(turn.content)
        return turn


class FakePost:
    """Captures every Mistral HTTP call; returns canned STT/TTS payloads."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.calls: list[dict] = []

    async def __call__(self, path: str, *, json_body=None, files=None, headers=None):
        self.calls.append({"path": path, "json": json_body, "files": files, "headers": headers})
        if path.endswith("/audio/transcriptions"):
            return 200, {"text": "what is my balance?"}
        if path.endswith("/audio/speech"):
            return 200, b"FAKE-MP3-BYTES"
        raise AssertionError(f"unexpected path {path}")


def _svc(llm, post, now_box=(1000.0,)) -> VoiceService:
    runs = RunService(llm, now_fn=lambda: now_box[0])
    return VoiceService(runs, post=post, api_key=post.api_key)


@pytest.fixture
def api_key(monkeypatch):
    key = "sk-test-voice-secret-123"
    monkeypatch.setattr(settings, "mistral_api_key", key)
    monkeypatch.setattr(settings, "voxtral_voice_ava", "voice_ava_preset")
    return key


async def test_voice_session_never_returns_api_key(api_key):
    post = FakePost(api_key)
    svc = _svc(FakeLLM(), post)
    session = await svc.create_session("bank-ava", mode="ladder")
    turn = await svc.turn(session["session_id"], b"audio-bytes", "clip.webm", "audio/webm")
    status = svc.status(session["session_id"])
    ended = svc.end_session(session["session_id"])
    for payload in (session, turn, status, ended):
        assert api_key not in json.dumps(payload), "API key leaked in a voice response"
    # the key is only ever sent as an Authorization header, never returned
    assert all(c["headers"]["Authorization"] == f"Bearer {api_key}" for c in post.calls)


async def test_voice_turn_uses_same_agent_turn_and_executor(api_key):
    llm = FakeLLM(
        responses=[
            {
                "reply": "",
                "tool_calls": [{"name": "get_balance", "args": {}}],
            },
            {"reply": "Your balance is 100 pounds.", "tool_calls": []},
        ]
    )
    post = FakePost(api_key)
    svc = _svc(llm, post)
    session = await svc.create_session("bank-ava", mode="ladder")
    turn = await svc.turn(session["session_id"], b"audio-bytes", "clip.webm", "audio/webm")

    # same agent turn: native tool calling against the stream's tool specs
    assert len(llm.agent_calls) >= 1
    call = llm.agent_calls[0]
    assert call["reasoning_effort"] == "low"
    assert any(t["function"]["name"] == "get_balance" for t in call["tools"])
    assert "Reply in English" in call["system"]

    # same executor: the tool call was executed in the sandbox
    assert turn["tool_events"], "tool call never reached the executor"
    assert turn["tool_events"][0]["call"]["name"] == "get_balance"
    assert turn["tool_events"][0]["ok"] is True

    # transcript + reply + spoken audio, like a text run
    run = svc.runs.repo.get(session["session_id"])
    assert [t.role for t in run.transcript] == ["player", "agent"]
    assert run.transcript[0].content == "what is my balance?"
    assert turn["reply"] == "Your balance is 100 pounds."
    assert turn["transcript"] == "what is my balance?"
    assert base64.b64decode(turn["audio_base64"]) == b"FAKE-MP3-BYTES"
    assert turn["language"] == "en"


async def test_voice_run_ends_at_300s(api_key):
    post = FakePost(api_key)
    now_box = [1000.0]
    svc = _svc(FakeLLM(), post, now_box)
    session = await svc.create_session("bank-ava", mode="ladder")
    assert session["ends_at"] == pytest.approx(1000.0 + settings.run_voice_s)
    assert settings.run_voice_s == 300

    # 3 player messages first so the run counts as a contest (no_contest rule)
    for _ in range(3):
        await svc.turn(session["session_id"], b"audio", "clip.webm", "audio/webm")
    now_box[0] = 1000.0 + 301  # past the 300 s voice limit
    turn = await svc.turn(session["session_id"], b"audio", "clip.webm", "audio/webm")
    assert turn["ended"] is True
    assert turn["outcome"] == "timeout"
    run = svc.runs.repo.get(session["session_id"])
    assert run.outcome == "timeout"


async def test_tts_uses_voice_id_from_config(api_key, monkeypatch):
    monkeypatch.setattr(settings, "voxtral_tts_model", "voxtral-test-tts")
    monkeypatch.setattr(settings, "voxtral_voice_max", "voice_max_preset")
    monkeypatch.setattr(settings, "voxtral_voice_pip", "voice_pip_preset")
    post = FakePost(api_key)
    svc = _svc(FakeLLM(), post)

    assert voice_id_for("bank-ava") == "voice_ava_preset"
    assert voice_id_for("shop-max") == "voice_max_preset"
    assert voice_id_for("assistant-pip") == settings.voxtral_voice_pip

    audio = await svc.synthesize("Bonjour, comment allez-vous?", voice_id_for("shop-max"))
    assert audio == b"FAKE-MP3-BYTES"
    tts_call = next(c for c in post.calls if c["path"].endswith("/audio/speech"))
    assert tts_call["json"]["model"] == "voxtral-test-tts"
    assert tts_call["json"]["voice_id"] == "voice_max_preset"
    assert tts_call["json"]["input"] == "Bonjour, comment allez-vous?"


async def test_stt_uses_batch_model_from_config(api_key, monkeypatch):
    monkeypatch.setattr(settings, "voxtral_stt_batch_model", "voxtral-test-stt")
    post = FakePost(api_key)
    svc = _svc(FakeLLM(), post)
    text = await svc.transcribe(b"audio", "clip.webm", "audio/webm")
    assert text == "what is my balance?"
    stt_call = next(c for c in post.calls if c["path"].endswith("/audio/transcriptions"))
    assert stt_call["json"]["model"] == "voxtral-test-stt"
    assert stt_call["files"] is not None
