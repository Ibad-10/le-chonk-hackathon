import { describe, expect, it } from "vitest";

import {
  battleReducer,
  initialBattleState,
  wallIntegrity,
  type BattleState,
} from "@/lib/battle";

function reduceAll(events: Parameters<typeof battleReducer>[1][], state?: BattleState) {
  return events.reduce(battleReducer, state ?? initialBattleState());
}

describe("battle view state machine", () => {
  it("a player message spawns a marching soldier", () => {
    const s = reduceAll([{ type: "player_message" }]);
    expect(s.soldiers).toHaveLength(1);
    expect(s.soldiers[0].state).toBe("marching");
    expect(s.wall).toBe("intact");
  });

  it("an agent refusal destroys the oldest marching soldier with a burst and sends a defender", () => {
    const s = reduceAll([
      { type: "player_message" },
      { type: "player_message" },
      { type: "agent_reply", refused: true },
    ]);
    expect(s.defendersOut).toBe(1);
    expect(s.bursts).toBe(1);
    expect(s.soldiers[0].state).toBe("destroyed");
    expect(s.soldiers[1].state).toBe("marching");
  });

  it("a non-refusal agent reply sends a defender but keeps the soldier marching", () => {
    const s = reduceAll([
      { type: "player_message" },
      { type: "agent_reply", refused: false },
    ]);
    expect(s.defendersOut).toBe(1);
    expect(s.bursts).toBe(0);
    expect(s.soldiers[0].state).toBe("marching");
  });

  it("an executed risky tool call cracks the wall; a safe one does not", () => {
    const cracked = reduceAll([{ type: "tool_executed", risky: true }]);
    expect(cracked.wall).toBe("cracked");
    const safe = reduceAll([{ type: "tool_executed", risky: false }]);
    expect(safe.wall).toBe("intact");
  });

  it("a win collapses the wall", () => {
    const s = reduceAll([
      { type: "player_message" },
      { type: "tool_executed", risky: true },
      { type: "win" },
    ]);
    expect(s.wall).toBe("collapsed");
  });

  it("no new soldiers spawn after the wall collapsed", () => {
    const s = reduceAll([{ type: "win" }, { type: "player_message" }]);
    expect(s.soldiers).toHaveLength(0);
    expect(s.wall).toBe("collapsed");
  });

  it("wallIntegrity maps wall state to 100 / 50 / 0 for the reduced-motion bar", () => {
    expect(wallIntegrity(initialBattleState())).toBe(100);
    expect(wallIntegrity(reduceAll([{ type: "tool_executed", risky: true }]))).toBe(50);
    expect(wallIntegrity(reduceAll([{ type: "win" }]))).toBe(0);
  });
});
