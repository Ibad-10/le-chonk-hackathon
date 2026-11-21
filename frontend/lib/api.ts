// Typed API client for the Red Room backend.
//
// Routes (backend builder, v4):
//   public: GET /agents, GET /agents/{id}, GET /leaderboard/players,
//           GET /leaderboard/agents?stream=, GET /agents/{id}/graph,
//           POST /runs (mode "arena" | "practice"), POST /runs/{id}/message,
//           GET /runs/{id}/stream (SSE), POST /runs/{id}/end, GET /health,
//           GET /events, GET /now-playing (arena wall).
//   owner (Bearer token): GET /agents/{id}/logbook, POST /agents/{id}/analyse,
//           POST /agents/{id}/drafts, GET /agents/{id}/drafts/{d},
//           POST /agents/{id}/drafts/{d}/retest -> {job_id},
//           GET /agents/{id}/retest/{job},
//           POST /agents/{id}/drafts/{d}/publish,
//           GET /agents/{id}/versions/diff?from=&to=.
// Every call falls back to the clearly marked mock in lib/mock.ts when the
// backend answers 404 or is unreachable, so pages still render.
//
// Auth: pass the Clerk session token; it is sent as `Authorization: Bearer` on
// every write call (and on owner reads).

import {
  MOCK_AGENT_LEADERBOARD,
  MOCK_AGENTS,
  MOCK_ARENA_EVENTS,
  MOCK_DRAFTS,
  MOCK_GRAPH,
  MOCK_LOGBOOK,
  MOCK_NOW_PLAYING,
  MOCK_PLAYER_LEADERBOARD,
  MOCK_RETEST_JOB,
  MOCK_RETEST_REPORT,
  MOCK_ROLE_BRIEF,
  MOCK_VERSIONS,
  MOCK_VERSION_DIFF,
} from "./mock";

import type {
  Agent,
  AgentLeaderboardEntry,
  AgentSummary,
  ArenaEvent,
  CreateAgentBody,
  Draft,
  DraftRecord,
  KnowledgeGraph,
  Logbook,
  MessageResponse,
  NowPlayingCard,
  PlacementJob,
  PlayerLeaderboardEntry,
  RetestJob,
  RetestReport,
  RoleBrief,
  RunResult,
  StartRunResponse,
  Stream,
  StreamDoneEvent,
  Version,
  VersionDiff,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

type Token = string | null | undefined;

function headers(token: Token, write: boolean): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  // Clerk session token on every write call (public reads stay open).
  if (write && token) h["Authorization"] = `Bearer ${token}`;
  if (!write && token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Backend URL explicitly configured (read at call time so tests can stub it). */
function backendConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_BACKEND_URL;
}

/** Thrown by run endpoints when the backend can't be reached. Never mocked. */
export class ConnectionError extends Error {
  constructor(message = "Connection to the agent lost.") {
    super(message);
    this.name = "ConnectionError";
  }
}

// "demo data" flag: set when a read-only browse call fell back to mock data.
let demoData = false;
const demoListeners = new Set<() => void>();
export const isDemoData = () => demoData;
export function subscribeDemoData(fn: () => void) {
  demoListeners.add(fn);
  return () => {
    demoListeners.delete(fn);
  };
}
function markDemo() {
  if (demoData) return;
  demoData = true;
  demoListeners.forEach((f) => f());
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: Token; write?: boolean; run?: boolean },
  fallbackFn: () => T
): Promise<T> {
  const { token, write = false, run = false, ...rest } = init;
  // Run endpoints never fall back to mock once the backend is configured:
  // a silent swap would replace real agent replies mid-run.
  const noMock = run && backendConfigured();
  const fallback = () => {
    markDemo();
    return fallbackFn();
  };
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: headers(token, write),
    });
    if (res.status === 404 && !noMock) return fallback(); // route not built yet -> mock
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (noMock) throw new ConnectionError();
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

// --- health + runs -------------------------------------------------------------

export async function health(): Promise<{ status: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

/** POST /runs — mode "arena" (Elo) or "practice" (no Elo). */
export async function startRun(
  agentId: string,
  opts: { channel?: "text" | "voice"; mode?: "arena" | "practice"; playerId?: string; token?: Token } = {}
): Promise<StartRunResponse> {
  const res = await request<StartRunResponse>(
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
      run: true,
    },
    () => {
      // MOCK fallback: backend unreachable -> local mock run so the play page renders.
      return {
        run_id: `mock-${Date.now()}`,
        agent_id: agentId,
        ends_at: Date.now() / 1000 + 600,
      };
    }
  );
  return { ...res, brief: toRoleBrief(res.brief) };
}

export async function sendMessage(
  runId: string,
  text: string,
  token?: Token
): Promise<MessageResponse> {
  return request<MessageResponse>(
    `/runs/${runId}/message`,
    { method: "POST", body: JSON.stringify({ text }), token, write: true, run: true },
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
  } catch {
    if (backendConfigured()) throw new ConnectionError();
    // MOCK fallback (backend not configured, local dev only).
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
  if (!res.ok || !res.body) throw new ApiError(res.status, "stream unavailable");
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
    { method: "POST", body: "{}", token, write: true, run: true },
    () => ({
      run_id: runId,
      outcome: "no_contest",
      points: 0,
      elo_delta: 0,
      reason: "(mock) run ended",
    })
  );
}

/**
 * Backend brief (POST /runs) -> RoleBrief. Backend shapes:
 * scammer {mission: {title, brief}, dossier: string[]};
 * genuine {need: string, verification: {dob: ..., postcode: ...}}.
 */
export function toRoleBrief(raw: unknown): RoleBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.role === "genuine") {
    const verification = (r.verification ?? {}) as Record<string, unknown>;
    return {
      role: "genuine",
      need: String(r.need ?? ""),
      details: Object.entries(verification).map(
        ([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`
      ),
    };
  }
  if (r.role === "scammer") {
    const m = r.mission;
    const mission =
      typeof m === "string"
        ? m
        : m && typeof m === "object"
          ? [(m as Record<string, unknown>).title, (m as Record<string, unknown>).brief].filter(Boolean).join(": ")
          : "";
    return { role: "scammer", mission, dossier: Array.isArray(r.dossier) ? r.dossier.map(String) : [] };
  }
  return null;
}

/** Dealt hidden role + brief for a run (v4.1). Route not built -> mock. */
export async function getRoleBrief(runId: string): Promise<RoleBrief> {
  return request<RoleBrief>(
    `/runs/${runId}/brief`,
    { method: "GET", run: true },
    () => MOCK_ROLE_BRIEF
  );
}

// --- agents + leaderboards (public) ----------------------------------------------

/** GET /agents */
export async function listAgents(): Promise<AgentSummary[]> {
  return request<AgentSummary[]>("/agents", { method: "GET" }, () => MOCK_AGENTS);
}

/** GET /agents/{id} — summary + stats {runs, breaks, holds}. */
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

/** Owner's agents. Route not in the public list yet -> mock. */
export async function getMyAgents(token?: Token): Promise<AgentSummary[]> {
  return request<AgentSummary[]>(
    "/agents/mine",
    { method: "GET", token },
    () => MOCK_AGENTS.filter((a) => !a.is_house)
  );
}

/** GET /leaderboard/players */
export async function getPlayersLeaderboard(): Promise<PlayerLeaderboardEntry[]> {
  return request<PlayerLeaderboardEntry[]>(
    "/leaderboard/players",
    { method: "GET" },
    () => MOCK_PLAYER_LEADERBOARD
  );
}

/** GET /leaderboard/agents?stream= */
export async function getAgentLeaderboard(
  stream: Stream
): Promise<AgentLeaderboardEntry[]> {
  return request<AgentLeaderboardEntry[]>(
    `/leaderboard/agents?stream=${stream}`,
    { method: "GET" },
    () => MOCK_AGENT_LEADERBOARD[stream] ?? []
  );
}

// --- arena wall (public, polled every 5 s) ----------------------------------------

/** GET /events — public ticker events (tactic family only, never transcripts). */
export async function getArenaEvents(): Promise<ArenaEvent[]> {
  return request<ArenaEvent[]>("/events", { method: "GET" }, () => MOCK_ARENA_EVENTS);
}

/** GET /now-playing — opted-in live calls, captions only. */
export async function getNowPlaying(): Promise<NowPlayingCard[]> {
  return request<NowPlayingCard[]>(
    "/now-playing",
    { method: "GET" },
    () => MOCK_NOW_PLAYING
  );
}

// --- owner routes (Bearer token) ---------------------------------------------------

/** GET /agents/{id}/logbook */
export async function getLogbook(agentId: string, token?: Token): Promise<Logbook> {
  const raw = await request<Logbook>(
    `/agents/${agentId}/logbook`,
    { method: "GET", token },
    () => MOCK_LOGBOOK
  );
  // Backend returns {entries} only; groups come from POST /analyse. Never let a missing list crash a page.
  const r = (raw ?? {}) as Partial<Logbook> & Record<string, unknown>;
  return { ...r, groups: Array.isArray(r.groups) ? r.groups : [], entries: Array.isArray(r.entries) ? r.entries : [] } as Logbook;
}

/** POST /agents/{id}/analyse — Large 4 analyst groups losses by root cause. */
export async function analyseLogbook(agentId: string, token?: Token): Promise<Logbook> {
  return request<Logbook>(
    `/agents/${agentId}/analyse`,
    { method: "POST", body: "{}", token, write: true },
    () => MOCK_LOGBOOK
  );
}

/** POST /agents/{id}/drafts — create a draft, returns it with an id. */
export async function createDraft(
  agentId: string,
  draft: Draft,
  token?: Token
): Promise<DraftRecord> {
  return request<DraftRecord>(
    `/agents/${agentId}/drafts`,
    { method: "POST", body: JSON.stringify(draft), token, write: true },
    () => ({ ...MOCK_DRAFTS[0], ...draft, id: MOCK_DRAFTS[0].id })
  );
}

/** GET /agents/{id}/drafts/{d} */
export async function getDraft(
  agentId: string,
  draftId: string,
  token?: Token
): Promise<DraftRecord> {
  return request<DraftRecord>(
    `/agents/${agentId}/drafts/${draftId}`,
    { method: "GET", token },
    () => {
      const found = MOCK_DRAFTS.find((d) => d.id === draftId) ?? MOCK_DRAFTS[0];
      return found;
    }
  );
}

/** POST /agents/{id}/drafts/{d}/retest -> {job_id} */
export async function startRetest(
  agentId: string,
  draftId: string,
  token?: Token
): Promise<{ job_id: string }> {
  return request<{ job_id: string }>(
    `/agents/${agentId}/drafts/${draftId}/retest`,
    { method: "POST", body: "{}", token, write: true },
    () => ({ job_id: MOCK_RETEST_JOB.job_id })
  );
}

/** GET /agents/{id}/retest/{job} — progress + report. */
export async function getRetestJob(
  agentId: string,
  jobId: string,
  token?: Token
): Promise<RetestJob> {
  return request<RetestJob>(
    `/agents/${agentId}/retest/${jobId}`,
    { method: "GET", token },
    () => ({ ...MOCK_RETEST_JOB, agent_id: agentId, job_id: jobId })
  );
}

/** GET /agents/{id}/retest/latest — convenience for the last job (mock until built). */
export async function getLatestRetestReport(
  agentId: string,
  token?: Token
): Promise<RetestReport> {
  return request<RetestReport>(
    `/agents/${agentId}/retest/latest`,
    { method: "GET", token },
    () => MOCK_RETEST_REPORT
  );
}

/** POST /agents/{id}/drafts/{d}/publish */
export async function publishDraft(
  agentId: string,
  draftId: string,
  opts: { force?: boolean; token?: Token } = {}
): Promise<Agent> {
  return request<Agent>(
    `/agents/${agentId}/drafts/${draftId}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ force: opts.force ?? false }),
      token: opts.token,
      write: true,
    },
    () => {
      const base = MOCK_AGENTS.find((a) => a.id === agentId) ?? MOCK_AGENTS[0];
      return { ...base, cooldown_until: null, rating_deviation: 200 };
    }
  );
}

/** GET /agents/{id}/versions/diff?from=&to= */
export async function getVersionDiff(
  agentId: string,
  from: string,
  to: string,
  token?: Token
): Promise<VersionDiff> {
  return request<VersionDiff>(
    `/agents/${agentId}/versions/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { method: "GET", token },
    () => ({ ...MOCK_VERSION_DIFF, from, to })
  );
}

/** GET /agents/{id}/versions (mock until built) — used to seed the draft editor. */
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

/** GET /agents/{id}/graph — knowledge graph (owner-only page). */
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

// --- create-agent wizard ----------------------------------------------------------

/** POST /agents — 409 = limit of 3 agents, 422 = invalid body (both throw ApiError). */
export async function createAgent(body: CreateAgentBody, token?: Token): Promise<Agent> {
  return request<Agent>(
    "/agents",
    { method: "POST", body: JSON.stringify(body), token, write: true },
    () => ({
      id: `mock-${body.name.toLowerCase().replace(/\W+/g, "-")}`,
      name: body.name,
      stream: body.stream,
      rating: 1000,
      rating_deviation: 350,
      grade: null,
      helpfulness: null,
      current_version: "1.0",
      cooldown_until: null,
      is_house: false,
      owner_id: "mock",
      stats: { runs: 0, breaks: 0, holds: 0 },
    })
  );
}

/** POST /agents/{id}/placement -> {job_id} */
export async function startPlacement(agentId: string, token?: Token): Promise<{ job_id: string }> {
  return request<{ job_id: string }>(
    `/agents/${agentId}/placement`,
    { method: "POST", body: "{}", token, write: true },
    () => ({ job_id: `mock-placement-${Date.now()}` })
  );
}

const mockPlacementStart = new Map<string, number>();

/** GET /agents/{id}/placement/{job} — progress, then grade + starting rating. */
export async function getPlacementJob(
  agentId: string,
  jobId: string,
  token?: Token
): Promise<PlacementJob> {
  // Backend shape: {job_id, agent_id, status, result: {grade, grade_score, catch_rate, false_block_rate, rating} | null, error}.
  const raw = await request<PlacementJob & { result?: { grade?: PlacementJob["grade"]; rating?: number } | null }>(
    `/agents/${agentId}/placement/${jobId}`,
    { method: "GET", token },
    () => {
      // MOCK fallback: fake a ~4 s placement test so the wizard is demoable offline.
      const t0 = mockPlacementStart.get(jobId) ?? Date.now();
      mockPlacementStart.set(jobId, t0);
      const done = Math.min(10, Math.floor((Date.now() - t0) / 400));
      const finished = done >= 10;
      return {
        job_id: jobId,
        agent_id: agentId,
        status: finished ? "done" : "running",
        progress: { done, total: 10 },
        grade: finished ? "C" : null,
        rating: finished ? 1100 : null,
      };
    }
  );
  const done = raw.status === "done";
  return {
    job_id: raw.job_id,
    agent_id: raw.agent_id ?? agentId,
    status: raw.status,
    progress: raw.progress ?? { done: done ? 1 : 0, total: 1 },
    grade: raw.grade ?? raw.result?.grade ?? null,
    rating: raw.rating ?? (raw.result?.rating != null ? Math.round(raw.result.rating) : null),
  };
}
