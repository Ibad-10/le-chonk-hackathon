// Admin "House agents lab" API helpers. Shapes mirror backend/app/routes/training.py.
// No mock fallback: errors are thrown and shown inline.

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const HOUSE_AGENTS = ["bank-ava", "shop-max", "assistant-pip", "bank-rex"] as const;

export interface TrainingCycle {
  created_at: string;
  agent_id: string;
  attacks_run: number;
  failures_found: number;
  sources: string[];
  tactics_used: string[];
  kept: boolean;
  published_version: number | null;
  draft_version?: number;
  reason: string;
  forced?: boolean;
}

export interface ResearchTactic {
  tactic_name: string;
  family: string;
  source_url: string;
}

export interface ResearchLatest {
  source: string | null;
  created_at: string | null;
  tactics: ResearchTactic[];
}

async function call<T>(path: string, token: string | null | undefined, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {}
    throw new Error(`${res.status} ${detail || res.statusText}`.trim());
  }
  return res.json() as Promise<T>;
}

export const runTrainingCycle = (agentId: string, token: string | null | undefined) =>
  call<TrainingCycle>(`/admin/training/${agentId}/run`, token, {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });

export const getTrainingCycles = (agentId: string, token: string | null | undefined) =>
  call<{ agent_id: string; cycles: TrainingCycle[] }>(
    `/admin/training/${agentId}/cycles`,
    token,
  ).then((r) => r.cycles);

export const getResearchLatest = (token?: string | null) =>
  call<ResearchLatest>("/research/latest", token);

export interface DuelSide {
  agent_id: string;
  grade: number;
  catch_rate: number;
  false_block_rate: number;
}

export interface DuelJob {
  job_id: string;
  status: "running" | "done" | "error";
  agents: string[];
  result: { sides: DuelSide[]; winner: string | null } | null;
  error?: string;
}

export const startDuel = (token: string | null | undefined, agent_a: string, agent_b: string) =>
  call<{ job_id: string }>("/admin/duels", token, { method: "POST", body: JSON.stringify({ agent_a, agent_b }) });

export const getDuel = (token: string | null | undefined, jobId: string) =>
  call<DuelJob>(`/admin/duels/${jobId}`, token);
