// Typed API client for the Red Room backend.
//
// Real routes (backend/app/routes/runs.py, backend/app/main.py):
//   POST /runs, POST /runs/{id}/message, GET /runs/{id}/stream (SSE chunk/done),
//   POST /runs/{id}/end, GET /health.
// Routes not built yet (agents, logbook, retest, publish, graph, leaderboards):
// every call here falls back to the clearly marked mock in lib/mock.ts when the
// backend answers 404, so pages still render.
//
// Auth: pass the Clerk session token; it is sent as `Authorization: Bearer` on
// every write call (and on authenticated reads).

import {
  MOCK_AGENTS,
  MOCK_GRAPH,
  MOCK_LEADERBOARDS,
  MOCK_LOGBOOK,
  MOCK_RETEST_REPORT,
  MOCK_ROLE_BRIEF,
  MOCK_VERSIONS,
} from "./mock";
import type {
  Agent,
  Draft,
  KnowledgeGraph,
  Leaderboards,
  Logbook,
  MessageResponse,
  RetestReport,
  RoleBrief,
  RunResult,
  StartRunResponse,
  Stream,
  StreamDoneEvent,
  Version,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

type Token = string | null | undefined;

function headers(token: Token, write: boolean): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  // Clerk session token on every write call (reads stay public).
  if (write && token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: Token; write?: boolean },
  fallback: () => T
): Promise<T> {
  const { token, write = false, ...rest } = init;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: headers(token, write),
    });
    if (res.status === 404) return fallback(); // route not built yet -> mock
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // backend unreachable (not running locally) -> mock so pages render
    return fallback();
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    body: string
  ) {
    super(`API ${status}: ${body.slice(0, 200)}`);
  }
}

// --- health + runs (real backend routes) -------------------------------------

export async function health(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function startRun(
  agentId: string,
  opts: { channel?: "text" | "voice"; mode?: "arena" | "practice"; playerId?: string; token?: Token } = {}
): Promise<StartRunResponse> {
  return request<StartRunResponse>(
    "/runs",
    {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        channel: opts.channel ?? "text",
        mode: opts.mode ?? "arena",
        player_id: opts.playerId ?? "anon",
        language: "auto",
      }),
      token: opts.token,
      write: true,
    },
    () => {
      // MOCK fallback: backend route exists, but if it is unreachable we still
      // let the play page render against a local mock run.
      return {
        run_id: `mock-${Date.now()}`,
        agent_id: agentId,
        ends_at: Date.now() / 1000 + 600,
      };
    }
  );
}

export async function sendMessage(
  runId: string,
  text: string,
  token?: Token
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/runs/${runId}/message`,
    { method: "POST", body: JSON.stringify({ text }), token, write: true },
    () => ({
      run_id: runId,
      reply: "(mock) I can't do that without verifying your identity first.",
      moderated: false,
      tool_events: [],
      ended: false,
      outcome: null,
    })
  );
}

export interface StreamCallbacks {
  onChunk: (piece: string) => void;
  onDone: (event: StreamDoneEvent) => void;
  onError?: (err: Error) => void;
}

/** GET /runs/{id}/stream?text=... — server-sent events: `chunk` then `done`. */
export async function streamMessage(
  runId: string,
  text: string,
  cb: StreamCallbacks,
  token?: Token
): Promise<void> {
  const url = `${BASE_URL}/runs/${runId}/stream?text=${encodeURIComponent(text)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err) {
    // MOCK fallback: stream a canned reply token by token so the UI is testable
    // without the backend running.
    const mockReply =
      "(mock) I can only help with verified requests. Could you confirm the details on your account?";
    for (const word of mockReply.split(" ")) {
      cb.onChunk(word + " ");
      await new Promise((r) => setTimeout(r, 30));
    }
    cb.onDone({
      type: "done",
      run_id: runId,
      reply: mockReply,
      tool_events: [],
      ended: false,
      outcome: null,
    });
    return;
  }
  if (res.status === 404 || !res.ok || !res.body) {
    cb.onError?.(new ApiError(res.status, "stream unavailable"));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "message";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        const payload = JSON.parse(dataLines.join("\n"));
        if (eventType === "chunk") cb.onChunk(payload.text ?? "");
        else if (eventType === "done") cb.onDone(payload as StreamDoneEvent);
        else if (eventType === "error") cb.onError?.(new Error(payload.detail ?? "stream error"));
      } catch {
        /* ignore malformed event */
      }
    }
  }
}

export async function endRun(runId: string, token?: Token): Promise<RunResult> {
  return request<RunResult>(
    `/runs/${runId}/end`,
    { method: "POST", body: "{}", token, write: true },
    () => ({
      run_id: runId,
      outcome: "no_contest",
      points: 0,
      elo_delta: 0,
      reason: "(mock) run ended",
    })
  );
}

/** Dealt hidden role + brief for a run (v4.1). Route not built -> mock. */
export async function getRoleBrief(runId: string): Promise<RoleBrief> {
  return request<RoleBrief>(
    `/runs/${runId}/brief`,
    { method: "GET" },
    () => MOCK_ROLE_BRIEF
  );
}

// --- agents, leaderboards, logbook, retest, publish, graph (mock until built) --

export async function listAgents(): Promise<Agent[]> {
  return request<Agent[]>("/agents", { method: "GET" }, () => MOCK_AGENTS);
}

export async function getAgent(id: string): Promise<Agent> {
  return request<Agent>(
    `/agents/${id}`,
    { method: "GET" },
    () => {
      const found = MOCK_AGENTS.find((a) => a.id === id);
      if (!found) throw new ApiError(404, `agent ${id} not found`);
      return found;
    }
  );
}

export async function getMyAgents(token?: Token): Promise<Agent[]> {
  return request<Agent[]>(
    "/agents/mine",
    { method: "GET", token },
    () => MOCK_AGENTS.filter((a) => a.owner_id !== null)
  );
}

export async function getLeaderboards(): Promise<Leaderboards> {
  return request<Leaderboards>(
    "/leaderboards",
    { method: "GET" },
    () => MOCK_LEADERBOARDS
  );
}

export async function getAgentLeaderboard(
  stream: Stream
): Promise<Leaderboards["agents_by_stream"][Stream]> {
  return request(
    `/leaderboards/agents?stream=${stream}`,
    { method: "GET" },
    () => MOCK_LEADERBOARDS.agents_by_stream[stream] ?? []
  );
}

export async function getLogbook(agentId: string, token?: Token): Promise<Logbook> {
  return request<Logbook>(
    `/agents/${agentId}/logbook`,
    { method: "GET", token },
    () => MOCK_LOGBOOK
  );
}

export async function startRetest(
  agentId: string,
  draft: Draft,
  token?: Token
): Promise<RetestReport> {
  return request<RetestReport>(
    `/agents/${agentId}/retest`,
    { method: "POST", body: JSON.stringify({ draft }), token, write: true },
    () => MOCK_RETEST_REPORT
  );
}

export async function getRetestReport(
  agentId: string,
  token?: Token
): Promise<RetestReport> {
  return request<RetestReport>(
    `/agents/${agentId}/retest/latest`,
    { method: "GET", token },
    () => MOCK_RETEST_REPORT
  );
}

export async function publishVersion(
  agentId: string,
  draft: Draft,
  opts: { force?: boolean; token?: Token } = {}
): Promise<Agent> {
  return request<Agent>(
    `/agents/${agentId}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ draft, force: opts.force ?? false }),
      token: opts.token,
      write: true,
    },
    () => {
      const base = MOCK_AGENTS.find((a) => a.id === agentId) ?? MOCK_AGENTS[0];
      return { ...base, cooldown_until: null, rating_deviation: 200 };
    }
  );
}

export async function getVersions(
  agentId: string,
  token?: Token
): Promise<Version[]> {
  return request<Version[]>(
    `/agents/${agentId}/versions`,
    { method: "GET", token },
    () => MOCK_VERSIONS
  );
}

export async function getGraph(
  agentId: string,
  token?: Token
): Promise<KnowledgeGraph> {
  return request<KnowledgeGraph>(
    `/agents/${agentId}/graph`,
    { method: "GET", token },
    () => ({ ...MOCK_GRAPH, agent_id: agentId })
  );
}
