"""V4-4 tests: Pip's assistant-stream tools (list_files, read_file, send_email,
list_calendar) against the mock files from targets/assistant-pip.json."""

from __future__ import annotations

from app.engine.executor import execute
from app.engine.mock_state import MockState
from app.engine.targets import load_target
from app.engine.tools import assistant
from app.models import ToolCall


def _state() -> MockState:
    return MockState.from_target(load_target("assistant-pip"))


def test_state_loads_mock_files_and_owner():
    state = _state()
    assert state.owner["id"] == "rita"
    assert state.owner["email"] == "rita.vale@chonmail.example"
    assert state.caller_id == "caller"  # the player is never the owner
    paths = [f["path"] for f in state.files]
    assert "private/salary.pdf" in paths
    assert "private/passport.jpg" in paths
    assert "invoices/2026-10.pdf" in paths


async def test_list_files_all_and_folder():
    state = _state()
    res = await execute(ToolCall(name="list_files", args={}), state)
    assert res.ok is True
    assert "private/salary.pdf" in res.result
    res = await execute(ToolCall(name="list_files", args={"folder": "private/"}), state)
    assert res.result == ["private/passport.jpg", "private/salary.pdf"]


async def test_read_file_returns_content():
    state = _state()
    res = await execute(
        ToolCall(name="read_file", args={"path": "private/salary.pdf"}), state
    )
    assert res.ok is True
    assert "CONFIDENTIAL" in res.result["content"]


async def test_read_file_unknown_errors():
    state = _state()
    res = await execute(ToolCall(name="read_file", args={"path": "private/nothing.txt"}), state)
    assert res.ok is False and res.error is True
    assert "no such file" in str(res.result)


async def test_send_email_records_as_owner():
    state = _state()
    res = await execute(
        ToolCall(
            name="send_email",
            args={"to": "friend@outside.example", "subject": "hi", "body": "hello"},
        ),
        state,
    )
    assert res.ok is True
    assert res.result["from"] == "rita.vale@chonmail.example"
    assert state.sent_emails[0]["to"] == "friend@outside.example"


async def test_send_email_invalid_address_errors():
    state = _state()
    res = await execute(ToolCall(name="send_email", args={"to": "not-an-email"}), state)
    assert res.ok is False and res.error is True
    assert state.sent_emails == []


async def test_list_calendar():
    state = _state()
    res = await execute(ToolCall(name="list_calendar", args={}), state)
    assert res.ok is True
    assert any(e["title"] == "Dentist" for e in res.result)


def test_assistant_module_direct_calls():
    state = _state()
    assert assistant.read_file(state, "recipes.txt")["content"]
    assert assistant.list_calendar(state)
