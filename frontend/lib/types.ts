// Red Room v4 shared types (frontend mirror of the backend API + v4.1 additions).
// v4: no Guardian anywhere — an agent is only its stream base prompt, owner
// instructions and knowledge. `stopped_by` is "agent" | "none".

export type Stream = "banking" | "support" | "assistant";

export const STREAMS: Stream[] = ["banking", "support", "assistant"];

export type Grade = "A" | "B" | "C" | "D" | "E" | "F";

export interface AgentStats {
  runs: number;
  losses: number;
  blocks: number;
  generalisation_score: number | null; // sibling variants blocked / tried
}

export interface Agent {
  id: string;
  name: string;
  stream: Stream;
  house: boolean; // Red Room house agent (Ava, Max, Pip)
  owner_id: string | null;
  version: string; // e.g. "2.3"
  rating: number; // Elo, never reset between versions
  rating_deviation: number; // Glicko-style uncertainty (widened after publish)
  grade: Grade | null; // from the held-out exam
  helpfulness: number | null; // genuine requests completed / attempted
  cooldown_until: string | null; // ISO datetime; agent hidden from arena until then
  stats: AgentStats;
}

// --- runs -------------------------------------------------------------------

export type RunChannel = "text" | "voice";
export type RunMode = "arena" | "practice";

// v4 outcomes: win (player broke the agent), block (agent held, >=3 messages),
// timeout, abandoned, no_contest, error. Helpfulness losses are reported via
// `helpfulness` on the result when the dealt role was a genuine customer.
export type RunOutcome =
  | "win"
  | "block"
  | "timeout"
  | "abandoned"
  | "no_contest"
  | "error";

export interface StartRunResponse {
  run_id: string;
  agent_id: string;
  ends_at: number; // unix seconds
}

export interface ToolEvent {
  call: { name: string; args: Record<string, unknown> };
  ok: boolean;
  error: string | null;
  result?: unknown;
}

export interface MessageResponse {
  run_id: string;
  reply: string | null;
  moderated?: boolean;
  reason?: string;
  tool_events: ToolEvent[];
  ended: boolean;
  outcome: RunOutcome | null;
}

export interface StreamDoneEvent extends MessageResponse {
  type: "done";
}

export interface RunResult {
  run_id: string;
  outcome: RunOutcome | null;
  // v4.1 dealt hidden role: "scammer" (~80%) or "genuine" (~20%)
  role?: DealtRole;
  helpfulness?: boolean; // true when a genuine customer was wrongly blocked
  points: number;
  elo_delta: number;
  reason?: string;
}

// --- v4.1 dealt roles --------------------------------------------------------

export type DealtRole = "scammer" | "genuine";

export interface ScammerBrief {
  role: "scammer";
  mission: string; // what to talk the agent into doing
  dossier: string[]; // public facts only — never the verification answers
}

export interface GenuineBrief {
  role: "genuine";
  need: string; // the real request, e.g. "pay new landlord £950, ref FLAT4B"
  details: string[]; // real customer details for verification (DOB, postcode, payees)
}

export type RoleBrief = ScammerBrief | GenuineBrief;

// --- logbook (v4.1: breaking moment, tactic/persona detection, per-language) --

export interface BreakingMoment {
  run_id: string;
  message_index: number; // transcript index where the agent gave in
  reason: string; // one line, e.g. "accepted 'hospital emergency' as a reason to skip verification"
}

export interface LogbookEntry {
  id: string;
  run_id: string;
  agent_version: string;
  transcript: { role: string; content: string }[];
  risky_action: string;
  tactic: string | null; // tactic family detected from the transcript
  persona: string | null; // what the caller pretended to be
  language: string;
  how_close: number;
  breaking_moment: BreakingMoment | null;
  created_at: string;
}

export interface LogbookGroup {
  root_cause: string; // analyst's plain-words cause, never a fix suggestion
  family: string;
  count: number;
  quotes: string[]; // 2-3 example quotes
  example_run_ids: string[];
  entries: LogbookEntry[];
  reopened?: boolean; // "your fix didn't generalise"
}

export interface LanguageWeakness {
  language: string;
  failures: number;
  runs: number;
  rate: number; // failures / runs
}

export interface Logbook {
  groups: LogbookGroup[];
  weakness_by_language: LanguageWeakness[];
}

// --- drafts, retest, publish --------------------------------------------------

export interface Draft {
  instructions: string; // owner instructions, max 2000 chars
  knowledge: string; // owner knowledge (FAQs, policies)
}

export const MAX_INSTRUCTIONS_CHARS = 2000;

export interface Version {
  version: string;
  instructions: string;
  knowledge: string;
  published_at: string;
  rating: number;
  rating_deviation: number;
}

export type RetestStatus = "fixed" | "flaky" | "still_failing";

export interface RetestFailureResult {
  entry_id: string;
  root_cause: string;
  status: RetestStatus;
  blocked: number; // of 12 replayed cases (original + 3 siblings x 3 repeats)
  tried: number;
}

export interface RetestReport {
  agent_id: string;
  draft: Draft;
  started_at: string;
  finished_at: string | null;
  progress: { done: number; total: number };
  results: RetestFailureResult[];
  fixed: string[]; // entry ids
  flaky: string[];
  still_failing: string[];
  generalisation_score: number; // sibling variants blocked / tried
  genuine_newly_blocked: string[]; // genuine-customer case ids the draft now blocks
}

// --- knowledge graph (owner-only) ---------------------------------------------

export type GraphNodeType = "version" | "attack" | "root_cause" | "learned";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  detail?: string;
  at?: string; // ISO datetime
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface KnowledgeGraph {
  agent_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- leaderboards ---------------------------------------------------------------

export interface PlayerLeaderboardEntry {
  player_id: string;
  name: string;
  rating: number;
  wins: number;
  points: number;
}

export interface AgentLeaderboardEntry {
  agent_id: string;
  name: string;
  stream: Stream;
  rating: number;
  rating_deviation: number;
  grade: Grade | null;
  version: string;
}

export interface Leaderboards {
  players: PlayerLeaderboardEntry[];
  agents_by_stream: Record<Stream, AgentLeaderboardEntry[]>;
}
