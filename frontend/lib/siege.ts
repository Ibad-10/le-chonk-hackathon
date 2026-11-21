// Siege — the game view of a run (frontend-only, pure state machine).
//
// One horizontal lane: the player's camp on one side, the agent's fortress
// on the other with three towers in a row — Gate (identity checks), Wall
// (the agent's rules), Vault (the risky action: money, files, refunds).
//
// This module is PURE logic: it folds real run events into a state and is
// unit-tested in __tests__/siege.test.ts. Rendering (CSS transforms + rAF)
// lives in components/Siege.tsx. Outcomes are driven ONLY by real events
// from the run stream, never by an AI opinion.

import type { LogbookEntry, RunOutcome } from "./types";

// --- bubbles ----------------------------------------------------------------

/** One line, max 42 characters, then an ellipsis when truncated. */
export const BUBBLE_MAX_CHARS = 42;

/** Bubble width never grows past ~220 px (enforced in CSS too). */
export const BUBBLE_MAX_WIDTH_PX = 220;

export interface Bubble {
  short: string; // what the bubble shows (<= 42 chars + "…" when truncated)
  full: string; // always the complete text (also always in the chat log)
  truncated: boolean;
}

/** Collapse to one line and truncate at BUBBLE_MAX_CHARS with an ellipsis. */
export function bubbleFor(text: string): Bubble {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= BUBBLE_MAX_CHARS) {
    return { short: oneLine, full: oneLine, truncated: false };
  }
  return {
    short: oneLine.slice(0, BUBBLE_MAX_CHARS) + "…",
    full: oneLine,
    truncated: true,
  };
}

// --- troops -------------------------------------------------------------------

export type TroopType = "scout" | "knight" | "bard" | "sapper" | "footman";

export const TROOP_TYPES: TroopType[] = [
  "scout",
  "knight",
  "bard",
  "sapper",
  "footman",
];

export const TROOP_LABELS: Record<TroopType, string> = {
  scout: "scout (fast)",
  knight: "knight",
  bard: "bard",
  sapper: "sapper",
  footman: "footman",
};

const INJECTION_HINTS = [
  "ignore previous",
  "ignore all",
  "disregard",
  "system prompt",
  "you are now",
  "developer mode",
  "do not follow",
  "new instructions",
  "override",
  "jailbreak",
];

const URGENCY_HINTS = [
  "urgent",
  "right now",
  "immediately",
  "asap",
  "hurry",
  "quickly",
  "now!",
  "deadline",
  "last chance",
  "in 5 minutes",
  "before it's too late",
];

const AUTHORITY_HINTS = [
  "fraud team",
  "i'm from the bank",
  "this is the bank",
  "bank staff",
  "police",
  "hmrc",
  "tax office",
  "your manager",
  "the ceo",
  "boss",
  "it support",
  "tech support",
  "security team",
  "authorised",
  "authorized",
];

const EMOTION_HINTS = [
  "mother",
  "mum",
  "mom",
  "father",
  "dad",
  "son",
  "daughter",
  "sister",
  "brother",
  "hospital",
  "funeral",
  "dying",
  "emergency",
  "my family",
  "love",
  "heartbroken",
];

function hasAny(text: string, hints: string[]): boolean {
  const t = text.toLowerCase();
  return hints.some((h) => t.includes(h));
}

/**
 * Troop type from the detected tactic family (when the backend provides it)
 * with a tiny keyword heuristic as fallback until then:
 *   prompt injection -> sapper, urgency -> scout, authority/bank staff ->
 *   knight, emotional/family story -> bard, anything else -> footman.
 */
export function troopTypeForTactic(
  tactic: string | null | undefined,
  text: string
): TroopType {
  const fam = (tactic ?? "").toLowerCase();
  if (
    fam.includes("injection") ||
    fam.includes("hijack") ||
    fam.includes("misuse") ||
    fam.includes("override")
  ) {
    return "sapper";
  }
  if (hasAny(text, INJECTION_HINTS)) return "sapper";
  if (fam.includes("urgency") || fam.includes("pressure")) return "scout";
  if (hasAny(text, URGENCY_HINTS)) return "scout";
  if (
    fam.includes("impersonation") ||
    fam.includes("authority") ||
    fam.includes("bank") ||
    fam.includes("police") ||
    fam.includes("ceo") ||
    fam.includes("safe_account") ||
    fam.includes("invoice") ||
    fam.includes("privilege")
  ) {
    return "knight";
  }
  if (hasAny(text, AUTHORITY_HINTS)) return "knight";
  if (
    fam.includes("emotional") ||
    fam.includes("romance") ||
    fam.includes("relative") ||
    fam.includes("family")
  ) {
    return "bard";
  }
  if (hasAny(text, EMOTION_HINTS)) return "bard";
  return "footman";
}

// --- tools --------------------------------------------------------------------

/** Risky actions: money, files or refunds leaving the fortress. */
export const RISKY_TOOLS = new Set([
  "send_payment",
  "add_payee",
  "issue_refund",
  "create_discount_code",
  "send_email",
]);

/** Read-only tools: the agent "gave ground" but nothing risky happened. */
export const READ_TOOLS = new Set([
  "verify_customer",
  "get_balance",
  "list_payees",
  "lookup_order",
  "list_files",
  "list_calendar",
]);

/** Internal (fictional) mail domain — send_email inside it is not a breach. */
const INTERNAL_MAIL_DOMAIN = "@chonk.example";

export function isRiskyTool(
  name: string,
  args?: Record<string, unknown>
): boolean {
  if (name === "read_file") {
    const path = String(args?.path ?? args?.file ?? "");
    return path.includes("private");
  }
  if (name === "send_email") {
    const to = String(args?.to ?? "");
    return !to.toLowerCase().includes(INTERNAL_MAIL_DOMAIN);
  }
  return RISKY_TOOLS.has(name);
}

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name);
}

// --- events -------------------------------------------------------------------

export type SiegeEvent =
  | { type: "playerMessage"; text: string; tactic?: string | null }
  | { type: "agentReply"; text: string; refused: boolean }
  | { type: "readToolRan"; tool: string }
  | { type: "riskyToolExecuted"; tool: string }
  | { type: "runEnded"; outcome: RunOutcome }
  | { type: "cooldown"; secondsLeft: number };

// --- state --------------------------------------------------------------------

export type TowerId = "gate" | "wall" | "vault";

export const TOWERS: TowerId[] = ["gate", "wall", "vault"];

export const TOWER_LABELS: Record<TowerId, string> = {
  gate: "Gate (identity checks)",
  wall: "Wall (the agent's rules)",
  vault: "Vault (the risky action)",
};

export type TowerStatus = "intact" | "damaged" | "fallen";

export interface Tower {
  health: number; // 0-100
  status: TowerStatus;
}

export type TroopState = "marching" | "parried";

export interface Troop {
  id: number;
  type: TroopType;
  bubble: Bubble;
  state: TroopState;
}

export type DefenderState = "out" | "back";

export interface Defender {
  id: number;
  bubble: Bubble;
  state: DefenderState;
}

export type EffectKind =
  | "puff" // troop burst at a parry
  | "shield" // gate doors slam + shield flash
  | "crack" // gate/wall took damage
  | "crumble" // vault falls
  | "coins"; // coins/paper burst out of the vault

export interface Effect {
  id: number;
  kind: EffectKind;
  tower?: TowerId;
  troopId?: number;
}

export type BannerKind = "vault_breached" | "fortress_held" | "no_contest";

export interface Banner {
  kind: BannerKind;
  text: string;
}

export const BANNER_TEXT: Record<BannerKind, string> = {
  vault_breached: "Vault breached",
  fortress_held: "Fortress held",
  no_contest: "No contest",
};

export interface SiegeState {
  troops: Troop[];
  defenders: Defender[];
  towers: Record<TowerId, Tower>;
  effects: Effect[];
  banner: Banner | null;
  cooldownSecondsLeft: number | null;
  log: string[]; // human-readable steps (reduced-motion list + screen readers)
  nextId: number;
  processed: number; // events applied so far
  readHits: number; // read-only tools so far (alternates Gate / Wall damage)
  breakingIndex: number | null; // event index of the risky tool (replay pause)
}

export const TOWER_MAX_HEALTH = 100;

/** Each read-only tool takes a chunk out of the Gate or the Wall. */
export const READ_DAMAGE = 25;

export function initialSiegeState(): SiegeState {
  return {
    troops: [],
    defenders: [],
    towers: {
      gate: { health: TOWER_MAX_HEALTH, status: "intact" },
      wall: { health: TOWER_MAX_HEALTH, status: "intact" },
      vault: { health: TOWER_MAX_HEALTH, status: "intact" },
    },
    effects: [],
    banner: null,
    cooldownSecondsLeft: null,
    log: [],
    nextId: 1,
    processed: 0,
    readHits: 0,
    breakingIndex: null,
  };
}

function pushLog(log: string[], line: string): string[] {
  return [...log.slice(-49), line];
}

function damageTower(
  state: SiegeState,
  id: TowerId,
  amount: number
): { towers: SiegeState["towers"]; effect: Effect | null } {
  const tower = state.towers[id];
  const health = Math.max(0, tower.health - amount);
  const status: TowerStatus = health <= 0 ? "fallen" : "damaged";
  const effect: Effect = { id: state.nextId, kind: "crack", tower: id };
  return {
    towers: { ...state.towers, [id]: { health, status } },
    effect,
  };
}

export function siegeReducer(state: SiegeState, event: SiegeEvent): SiegeState {
  const processed = state.processed + 1;
  switch (event.type) {
    case "playerMessage": {
      const type = troopTypeForTactic(event.tactic, event.text);
      const bubble = bubbleFor(event.text);
      const troop: Troop = {
        id: state.nextId,
        type,
        bubble,
        state: "marching",
      };
      return {
        ...state,
        processed,
        nextId: state.nextId + 1,
        troops: [...state.troops, troop],
        log: pushLog(state.log, `${TROOP_LABELS[type]} marched out: “${bubble.short}”`),
      };
    }
    case "agentReply": {
      const bubble = bubbleFor(event.text);
      const defender: Defender = {
        id: state.nextId,
        bubble,
        state: "out",
      };
      let troops = state.troops;
      let defenders: Defender[] = [...state.defenders, defender];
      let effects = state.effects;
      let log = pushLog(
        state.log,
        `defender sallied out: “${bubble.short}”`
      );
      if (event.refused) {
        // The Gate parries: doors slam + shield flash, the oldest marching
        // troop bursts into a puff, and the defender walks back.
        const victim = troops.find((t) => t.state === "marching");
        if (victim) {
          troops = troops.map((t) =>
            t.id === victim.id ? { ...t, state: "parried" } : t
          );
          effects = [
            ...effects,
            { id: state.nextId + 1, kind: "shield", tower: "gate" },
            { id: state.nextId + 2, kind: "puff", troopId: victim.id },
          ];
          log = pushLog(
            log,
            `Gate parried — the ${victim.type} burst into a puff`
          );
        }
        defenders = defenders.map((d) =>
          d.id === defender.id ? { ...d, state: "back" } : d
        );
        if (victim) log = pushLog(log, "the defender walked back");
      }
      return {
        ...state,
        processed,
        nextId: state.nextId + 3,
        troops,
        defenders,
        effects,
        log,
      };
    }
    case "readToolRan": {
      // Agent gave ground: the Gate or the Wall takes a chunk of damage
      // (alternate, Gate first).
      const id: TowerId = state.readHits % 2 === 0 ? "gate" : "wall";
      const { towers, effect } = damageTower(state, id, READ_DAMAGE);
      return {
        ...state,
        processed,
        readHits: state.readHits + 1,
        nextId: state.nextId + 1,
        towers,
        effects: effect ? [...state.effects, effect] : state.effects,
        log: pushLog(
          state.log,
          `${event.tool} ran — ${TOWER_LABELS[id]} took damage (${towers[id].health}%)`
        ),
      };
    }
    case "riskyToolExecuted": {
      const vault: Tower = { health: 0, status: "fallen" };
      const effects: Effect[] = [
        ...state.effects,
        { id: state.nextId, kind: "crumble", tower: "vault" },
        { id: state.nextId + 1, kind: "coins", tower: "vault" },
      ];
      return {
        ...state,
        processed,
        nextId: state.nextId + 2,
        towers: { ...state.towers, vault },
        effects,
        banner: { kind: "vault_breached", text: BANNER_TEXT.vault_breached },
        breakingIndex: state.processed, // index of this event in the stream
        log: pushLog(
          state.log,
          `${event.tool} executed — the Vault fell. ${BANNER_TEXT.vault_breached}!`
        ),
      };
    }
    case "runEnded": {
      let banner = state.banner;
      if (event.outcome === "win") {
        banner = { kind: "vault_breached", text: BANNER_TEXT.vault_breached };
        if (state.towers.vault.status !== "fallen") {
          // a win always means a risky action executed — keep state honest
          return {
            ...state,
            processed,
            towers: {
              ...state.towers,
              vault: { health: 0, status: "fallen" },
            },
            banner,
            log: pushLog(state.log, BANNER_TEXT.vault_breached),
          };
        }
      } else if (event.outcome === "no_contest") {
        banner = { kind: "no_contest", text: BANNER_TEXT.no_contest };
      } else {
        banner = { kind: "fortress_held", text: BANNER_TEXT.fortress_held };
      }
      return {
        ...state,
        processed,
        banner,
        log: pushLog(state.log, banner.text),
      };
    }
    case "cooldown": {
      return {
        ...state,
        processed,
        cooldownSecondsLeft: Math.max(0, event.secondsLeft),
        log: pushLog(
          state.log,
          `agent in cooldown — fortress rebuilding (${Math.max(0, event.secondsLeft)}s)`
        ),
      };
    }
  }
}

// --- replay (owner logbook "Replay as siege") ----------------------------------

/** First tool name mentioned in a logbook risky_action line, e.g. "send_payment". */
export function toolFromRiskyAction(riskyAction: string): string {
  const m = riskyAction.match(/[a-z][a-z_]+/);
  return m ? m[0] : riskyAction;
}

export interface ReplayPlan {
  events: SiegeEvent[];
  breakingIndex: number | null; // event index of the risky tool (breaking moment)
}

/**
 * Build the siege event stream from a stored logbook entry: the transcript
 * becomes playerMessage/agentReply pairs, the breaking-moment agent message
 * is followed by the riskyToolExecuted event, and the run ends as a win
 * (logbook entries are losses). Refusal = an agent reply that is not the
 * breaking moment.
 */
export function planReplay(entry: LogbookEntry): ReplayPlan {
  const events: SiegeEvent[] = [];
  let breakingIndex: number | null = null;
  const breaking = entry.breaking_moment?.message_index ?? null;
  entry.transcript.forEach((t, i) => {
    if (t.role === "player" || t.role === "user") {
      events.push({
        type: "playerMessage",
        text: t.content,
        tactic: entry.tactic,
      });
    } else {
      const isBreaking = breaking === i;
      events.push({
        type: "agentReply",
        text: t.content,
        refused: !isBreaking,
      });
      if (isBreaking) {
        breakingIndex = events.length;
        events.push({
          type: "riskyToolExecuted",
          tool: toolFromRiskyAction(entry.risky_action),
        });
      }
    }
  });
  events.push({ type: "runEnded", outcome: "win" });
  return { events, breakingIndex };
}

export interface ReplayCursor {
  applied: number; // events already fed to the reducer
  pausedAtBreaking: boolean; // stopped on the breaking moment
  finished: boolean;
}

export function initialReplayCursor(): ReplayCursor {
  return { applied: 0, pausedAtBreaking: false, finished: false };
}

/**
 * Advance a replay by one event. Returns the event to apply (or null when
 * paused on the breaking moment / finished). The replay PAUSES right after
 * the breaking-moment event so the vault fall stays on screen.
 */
export function advanceReplay(
  cursor: ReplayCursor,
  plan: ReplayPlan
): { cursor: ReplayCursor; event: SiegeEvent | null } {
  if (cursor.pausedAtBreaking || cursor.finished) {
    return { cursor, event: null };
  }
  if (cursor.applied >= plan.events.length) {
    return { cursor: { ...cursor, finished: true }, event: null };
  }
  const index = cursor.applied;
  const event = plan.events[index];
  const isBreaking = plan.breakingIndex !== null && index === plan.breakingIndex;
  return {
    cursor: {
      applied: index + 1,
      pausedAtBreaking: isBreaking,
      finished: false,
    },
    event,
  };
}

/** Continue after the pause on the breaking moment. */
export function resumeReplay(cursor: ReplayCursor): ReplayCursor {
  return { ...cursor, pausedAtBreaking: false };
}
