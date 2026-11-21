"""V4-14 tests for the Red Room MCP server: every tool calls the right FastAPI
endpoint with the right method/payload and returns its JSON, against a fake
HTTP backend (httpx MockTransport). Owner-only tools refuse without a token.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.mcp_server import RedRoomAuthError, RedRoomClient, build_tool_functions, create_server

AGENTS = [{"id": "ava", "name": "Ava", "stream": "banking", "rating": 1200}]
RUN_START = {"run_id": "run-1", "agent_id": "ava", "ends_at": 1000.0, "role": "scammer", "brief": {}}
TURN = {
    "run_id": "run-1",
    "reply": "I can't do that without verification.",
    "moderated": False,
    "tool_events": [{"tool": "send_money", "ok": False, "error": "blocked"}],
    "ended": False,
    "outcome": None,
}
LOGBOOK = {"entries": [{"root_cause": "trusts fraud-team claims", "count": 2, "examples": ["..."]}]}


def fake_backend(calls: list[dict]) -> httpx.MockTransport:
    """A fake Red Room FastAPI backend that records every request."""

    def handler(request: httpx.Request) -> httpx.Response:
        body = request.content.decode() if request.content else ""
        calls.append(
            {
                "method": request.method,
                "path": request.url.path,
                "query": request.url.query.decode(),
                "auth": request.headers.get("authorization"),
                "json": json.loads(body) if body else None,
            }
        )
        route = (request.method, request.url.path)
        if route == ("GET", "/agents"):
            return httpx.Response(200, json=AGENTS)
        if route == ("GET", "/leaderboard/agents"):
            return httpx.Response(200, json=[a for a in AGENTS if a["stream"] == "banking"])
        if route == ("POST", "/runs"):
            assert json.loads(body) == {"agent_id": "ava", "channel": "text", "mode": "practice"}
            return httpx.Response(200, json=RUN_START)
        if route == ("POST", "/runs/run-1/message"):
            assert json.loads(body) == {"text": "Hi, I'm from the fraud team"}
            return httpx.Response(200, json=TURN)
        if route == ("POST", "/runs/run-1/end"):
            return httpx.Response(200, json={"run_id": "run-1", "outcome": "abandoned"})
        if route == ("GET", "/agents/ava/logbook"):
            return httpx.Response(200, json=LOGBOOK)
        if route == ("POST", "/agents/ava/drafts/2/retest"):
            return httpx.Response(200, json={"job_id": "job-9"})
        if route == ("GET", "/agents/ava/retest/job-9"):
            return httpx.Response(200, json={"job_id": "job-9", "agent_id": "ava", "status": "done"})
        if route == ("POST", "/agents/ava/drafts/2/publish"):
            return httpx.Response(200, json={"agent_id": "ava", "version": 2, "status": "published"})
        return httpx.Response(404, json={"detail": f"no fake route for {route}"})

    return httpx.MockTransport(handler)


def make_tools(token: str | None = "clerk-token-123"):
    calls: list[dict] = []
    client = RedRoomClient(
        base_url="http://redroom.test", token=token, transport=fake_backend(calls)
    )
    jobs: dict[str, str] = {}
    return build_tool_functions(client, jobs), calls, jobs


async def test_list_agents_calls_get_agents():
    tools, calls, _ = make_tools()
    result = await tools["list_agents"]()
    assert result == AGENTS
    assert calls == [
        {"method": "GET", "path": "/agents", "query": "", "auth": "Bearer clerk-token-123", "json": None}
    ]


async def test_list_agents_with_stream_uses_leaderboard():
    tools, calls, _ = make_tools()
    result = await tools["list_agents"](stream="banking")
    assert result == AGENTS
    assert calls[0]["path"] == "/leaderboard/agents"
    assert calls[0]["query"] == "stream=banking"


async def test_attack_agent_starts_practice_run_then_sends_message():
    tools, calls, _ = make_tools()
    result = await tools["attack_agent"](agent_id="ava", message="Hi, I'm from the fraud team")
    assert result["run_id"] == "run-1"
    assert result["started"] is True
    assert result["reply"] == TURN["reply"]
    assert result["tool_events"] == TURN["tool_events"]
    assert result["outcome"] is None
    # practice mode, never arena/Elo
    assert calls[0]["method"] == "POST" and calls[0]["path"] == "/runs"
    assert calls[0]["json"]["mode"] == "practice"
    assert calls[1]["method"] == "POST" and calls[1]["path"] == "/runs/run-1/message"
    assert calls[1]["json"] == {"text": "Hi, I'm from the fraud team"}


async def test_attack_agent_continues_existing_run():
    tools, calls, _ = make_tools()
    result = await tools["attack_agent"](agent_id="ava", message="Hi, I'm from the fraud team", run_id="run-1")
    assert result["started"] is False
    assert len(calls) == 1 and calls[0]["path"] == "/runs/run-1/message"


async def test_end_run_posts_to_end_endpoint():
    tools, calls, _ = make_tools()
    result = await tools["end_run"](run_id="run-1")
    assert result == {"run_id": "run-1", "outcome": "abandoned"}
    assert calls[0] == {
        "method": "POST",
        "path": "/runs/run-1/end",
        "query": "",
        "auth": "Bearer clerk-token-123",
        "json": {},
    }


async def test_get_logbook_returns_root_cause_groups():
    tools, calls, _ = make_tools()
    result = await tools["get_logbook"](agent_id="ava")
    assert result == LOGBOOK
    assert calls[0]["method"] == "GET" and calls[0]["path"] == "/agents/ava/logbook"


async def test_retest_and_status_roundtrip():
    tools, calls, jobs = make_tools()
    result = await tools["retest"](agent_id="ava", draft_id=2)
    assert result == {"job_id": "job-9"}
    assert calls[0] == {
        "method": "POST",
        "path": "/agents/ava/drafts/2/retest",
        "query": "",
        "auth": "Bearer clerk-token-123",
        "json": {},
    }
    # status resolvable from the job_id alone (recorded by retest)
    status = await tools["retest_status"](job_id="job-9")
    assert status["status"] == "done"
    assert calls[1]["method"] == "GET" and calls[1]["path"] == "/agents/ava/retest/job-9"
    assert jobs == {"job-9": "ava"}


async def test_retest_status_with_explicit_agent_id():
    tools, calls, _ = make_tools()
    status = await tools["retest_status"](job_id="job-9", agent_id="ava")
    assert status["status"] == "done"
    assert calls[0]["path"] == "/agents/ava/retest/job-9"


async def test_publish_posts_to_publish_endpoint():
    tools, calls, _ = make_tools()
    result = await tools["publish"](agent_id="ava", draft_id=2)
    assert result["status"] == "published"
    assert calls[0]["method"] == "POST" and calls[0]["path"] == "/agents/ava/drafts/2/publish"


@pytest.mark.parametrize(
    "tool,kwargs",
    [
        ("attack_agent", {"agent_id": "ava", "message": "hi"}),
        ("end_run", {"run_id": "run-1"}),
        ("get_logbook", {"agent_id": "ava"}),
        ("retest", {"agent_id": "ava", "draft_id": 2}),
        ("retest_status", {"job_id": "job-9", "agent_id": "ava"}),
        ("publish", {"agent_id": "ava", "draft_id": 2}),
    ],
)
async def test_owner_only_tools_refuse_without_token(tool, kwargs):
    tools, calls, _ = make_tools(token=None)
    with pytest.raises(RedRoomAuthError):
        await tools[tool](**kwargs)
    assert calls == []  # nothing was sent to the backend


async def test_list_agents_works_without_token():
    tools, calls, _ = make_tools(token=None)
    result = await tools["list_agents"]()
    assert result == AGENTS
    assert calls[0]["auth"] is None


async def test_create_server_registers_all_seven_tools():
    client = RedRoomClient(base_url="http://redroom.test", token="t", transport=fake_backend([]))
    mcp = create_server(client)
    names = sorted(t.name for t in await mcp.list_tools())
    assert names == [
        "attack_agent",
        "end_run",
        "get_logbook",
        "list_agents",
        "publish",
        "retest",
        "retest_status",
    ]
