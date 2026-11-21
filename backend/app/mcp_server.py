"""Red Room MCP server (plan V4-14): lets Mistral Vibe (or any MCP client)
red-team an agent and read its logbook, over stdio.

The server is a thin HTTP client for the Red Room FastAPI backend. It never
touches the database directly. Configuration comes from the environment:

- `RED_ROOM_API_URL`    base URL of the FastAPI backend (default http://localhost:8000)
- `RED_ROOM_CLERK_TOKEN`  Clerk session token, sent as `Authorization: Bearer ...`
- `RED_ROOM_API_KEY`      optional owner API key, used as the bearer token when
                          no Clerk session token is set

Tools:
- `list_agents(stream?)`            public agent list (GET /agents, or
                                    GET /leaderboard/agents?stream= when given)
- `attack_agent(agent_id, message, run_id?)`  start or continue a PRACTICE run
                                    (mode="practice", never Elo) and return the
                                    agent reply + tool events + outcome
- `end_run(run_id)`                 end a run (POST /runs/{id}/end)
- `get_logbook(agent_id)`           owner-only root-cause groups (no transcripts
                                    for non-owners; needs a token)
- `retest(agent_id, draft_id)`      start a retest job (owner-only)
- `retest_status(job_id, agent_id?)`  poll a retest job (owner-only)
- `publish(agent_id, draft_id)`     publish a draft version (owner-only)

Run it with `uv run python scripts/run_mcp.py` (stdio is the default transport
of the MCP Python SDK v2).
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server import MCPServer

ENV_API_URL = "RED_ROOM_API_URL"
ENV_CLERK_TOKEN = "RED_ROOM_CLERK_TOKEN"
ENV_API_KEY = "RED_ROOM_API_KEY"

DEFAULT_API_URL = "http://localhost:8000"


class RedRoomAuthError(Exception):
    """Raised when an owner-only tool is called without a token."""


class RedRoomClient:
    """Minimal async HTTP client for the Red Room FastAPI backend."""

    def __init__(
        self,
        base_url: str = DEFAULT_API_URL,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 120.0,
    ) -> None:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._http = httpx.AsyncClient(
            base_url=self.base_url, headers=headers, timeout=timeout, transport=transport
        )

    @classmethod
    def from_env(cls, transport: httpx.AsyncBaseTransport | None = None) -> "RedRoomClient":
        base_url = os.environ.get(ENV_API_URL, DEFAULT_API_URL)
        token = os.environ.get(ENV_CLERK_TOKEN) or os.environ.get(ENV_API_KEY) or None
        return cls(base_url=base_url, token=token, transport=transport)

    @property
    def has_token(self) -> bool:
        return self.token is not None

    def require_token(self, tool: str) -> None:
        if not self.token:
            raise RedRoomAuthError(
                f"{tool} is owner-only and needs a token: set ${ENV_CLERK_TOKEN} "
                f"(Clerk session token) or ${ENV_API_KEY} (owner API key) in the "
                "MCP server environment"
            )

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._http.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        resp = await self._http.post(path, json=payload or {})
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._http.aclose()


def build_tool_functions(client: RedRoomClient, jobs: dict[str, str]) -> dict[str, Any]:
    """The seven Red Room tools as plain async functions bound to `client`.

    `jobs` maps retest job_id -> agent_id so `retest_status` can be called
    with just the job id after `retest` returned it.
    """

    async def list_agents(stream: str | None = None) -> Any:
        """List the public Red Room agents (rating, grade, stats; never
        instructions or the knowledge graph). Pass `stream` ("banking",
        "refunds", "assistant") to filter by stream via the leaderboard."""
        if stream:
            return await client.get("/leaderboard/agents", params={"stream": stream})
        return await client.get("/agents")

    async def attack_agent(agent_id: str, message: str, run_id: str | None = None) -> dict[str, Any]:
        """Attack an agent in a PRACTICE run (never counts for Elo). Without
        `run_id` a new practice text run is started; with `run_id` the message
        continues that run. Returns the agent reply, tool events and outcome."""
        client.require_token("attack_agent")
        started = False
        if run_id is None:
            started_run = await client.post(
                "/runs", {"agent_id": agent_id, "channel": "text", "mode": "practice"}
            )
            run_id = started_run["run_id"]
            started = True
        turn = await client.post(f"/runs/{run_id}/message", {"text": message})
        return {"run_id": run_id, "started": started, **turn}

    async def end_run(run_id: str) -> Any:
        """End a run early (hang-up). Returns the final outcome."""
        client.require_token("end_run")
        return await client.post(f"/runs/{run_id}/end")

    async def get_logbook(agent_id: str) -> Any:
        """Owner-only: the agent's logbook grouped by root cause (no fix
        suggestions, no transcripts for non-owners)."""
        client.require_token("get_logbook")
        return await client.get(f"/agents/{agent_id}/logbook")

    async def retest(agent_id: str, draft_id: int) -> Any:
        """Owner-only: start a retest of draft `draft_id` against every open
        logbook failure (original + paraphrased siblings, 3x each). Returns a
        job_id; poll it with `retest_status`."""
        client.require_token("retest")
        result = await client.post(f"/agents/{agent_id}/drafts/{draft_id}/retest")
        jobs[result["job_id"]] = agent_id
        return result

    async def retest_status(job_id: str, agent_id: str | None = None) -> Any:
        """Owner-only: poll a retest job. `agent_id` may be omitted if the job
        came from `retest` in this same server process."""
        client.require_token("retest_status")
        agent_id = agent_id or jobs.get(job_id)
        if agent_id is None:
            raise RedRoomAuthError(
                f"retest_status needs the agent_id for job {job_id}: pass agent_id=... "
                "(or call retest first in the same session)"
            )
        return await client.get(f"/agents/{agent_id}/retest/{job_id}")

    async def publish(agent_id: str, draft_id: int) -> Any:
        """Owner-only: publish draft `draft_id` as the agent's new version
        (Elo carries over, agent returns to the arena)."""
        client.require_token("publish")
        return await client.post(f"/agents/{agent_id}/drafts/{draft_id}/publish")

    return {
        "list_agents": list_agents,
        "attack_agent": attack_agent,
        "end_run": end_run,
        "get_logbook": get_logbook,
        "retest": retest,
        "retest_status": retest_status,
        "publish": publish,
    }


def create_server(client: RedRoomClient | None = None) -> MCPServer:
    """Build the MCP server with all Red Room tools registered (stdio run)."""
    client = client or RedRoomClient.from_env()
    mcp = MCPServer("red-room")
    for name, fn in build_tool_functions(client, jobs={}).items():
        mcp.tool(name=name)(fn)
    return mcp


def main() -> None:
    """Entry point: serve over stdio (the MCP Python SDK v2 default)."""
    create_server().run()


if __name__ == "__main__":
    main()
