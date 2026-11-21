// Arena wall (projector mode) — pure rotation/polling logic, unit-tested in
// __tests__/arena-wall.test.tsx.

import type { ArenaEvent } from "./types";

export const WALL_VIEWS = ["ticker", "leaderboard", "now_playing"] as const;

export type WallView = (typeof WALL_VIEWS)[number];

export const WALL_VIEW_LABELS: Record<WallView, string> = {
  ticker: "Live ticker",
  leaderboard: "Agent leaderboard",
  now_playing: "Now playing",
};

/** Rotate to the next projector panel every 15 s. */
export const WALL_ROTATION_MS = 15_000;

/** Poll the public endpoints every 5 s (Supabase realtime can come later). */
export const WALL_POLL_MS = 5_000;

export function nextWallView(view: WallView): WallView {
  const i = WALL_VIEWS.indexOf(view);
  return WALL_VIEWS[(i + 1) % WALL_VIEWS.length];
}

/** One-line, privacy-safe ticker text: tactic family only, never transcripts. */
export function formatArenaEvent(ev: ArenaEvent): string {
  if (ev.kind === "agent_broken") {
    return `${ev.agent_name} broken${ev.tactic_family ? ` · ${ev.tactic_family.replace(/_/g, " ")}` : ""}`;
  }
  return `${ev.agent_name} published v${ev.version ?? "?"}`;
}
