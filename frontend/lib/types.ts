// Shared types mirroring backend/app/models.py (Pydantic v2 models).

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface Turn {
  role: string; // "player" | "agent" | "tool" | "system"
  content: string;
}

export interface Rule {
  id: string;
  agent_id: string;
  title: string;
  text: string;
  family: string;
  taught_by: string; // "teacher" | "owner" | "analyst"
}

export interface GuardianInput {
  agent_id: string;
  version: number;
  transcript: Turn[];
  call: ToolCall;
  context: Record<string, unknown>;
  rules: Rule[];
}

export type GuardianDecisionKind = "allow" | "step_up" | "block";

export interface GuardianDecision {
  decision: GuardianDecisionKind;
  risk: number; // 0-100
  reason: string;
  rule_ids: string[];
  signals: string[];
}

export type RunOutcome = "win" | "block" | "step_up" | "timeout" | "abandoned" | "error";
export type RunMode = "ladder" | "arena" | "genuine" | "ai_scammer" | "exam";
export type RunChannel = "text" | "voice";

export interface Run {
  id: string;
  player_id: string;
  agent_id: string;
  agent_version: number;
  channel: RunChannel;
  mode: RunMode;
  mission_id: string | null;
  wave: number | null;
  language: string; // "auto" or a language code
  transcript: Turn[];
  tool_calls: ToolCall[];
  outcome: RunOutcome | null;
  how_close: number;
  points: number;
  elo_delta: number;
  started_at: string; // ISO datetime
  ended_at: string | null;
}

export type GuardianMode =
  | "none"
  | "refuse_prompt"
  | "verify"
  | "frozen_v1"
  | "frozen_v1_stepup"
  | "live";

export interface TargetConfig {
  id: string;
  name: string;
  domain: string;
  voice: string;
  role_prompt: string;
  tools: string[];
  sensitive_tools: string[];
  data_source: string;
  win_conditions: Record<string, unknown>[];
  missions: string[];
  visibility: "public" | "private";
  owner: string;
  guardian_mode: GuardianMode;
}
