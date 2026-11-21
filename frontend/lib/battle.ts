// Battle view state machine (Clash-Royale-style duel on the play page).
// Pure logic — unit-tested in __tests__/battle.test.ts. The animated rendering
// lives in components/BattleView.tsx.

export type BattleEvent =
  | { type: "player_message" } // player sent a message -> a soldier spawns
  | { type: "agent_reply"; refused: boolean } // agent replied; refusal kills the soldier
  | { type: "tool_executed"; risky: boolean } // risky tool call executed -> wall cracks
  | { type: "win" }; // player broke the agent -> wall collapses

export type SoldierState = "marching" | "destroyed";

export interface Soldier {
  id: number;
  state: SoldierState;
}

export type WallState = "intact" | "cracked" | "collapsed";

export interface BattleState {
  soldiers: Soldier[]; // soldiers spawned by player messages
  defendersOut: number; // defenders sent out by agent replies
  bursts: number; // refusal bursts shown
  wall: WallState;
  nextSoldierId: number;
}

export function initialBattleState(): BattleState {
  return {
    soldiers: [],
    defendersOut: 0,
    bursts: 0,
    wall: "intact",
    nextSoldierId: 1,
  };
}

export function battleReducer(
  state: BattleState,
  event: BattleEvent
): BattleState {
  switch (event.type) {
    case "player_message": {
      if (state.wall === "collapsed") return state;
      return {
        ...state,
        nextSoldierId: state.nextSoldierId + 1,
        soldiers: [
          ...state.soldiers,
          { id: state.nextSoldierId, state: "marching" },
        ],
      };
    }
    case "agent_reply": {
      const marching = state.soldiers.filter((s) => s.state === "marching");
      const defendersOut = state.defendersOut + 1;
      if (event.refused && marching.length > 0) {
        // refusal destroys the oldest marching soldier with a burst
        const victim = marching[0];
        return {
          ...state,
          defendersOut,
          bursts: state.bursts + 1,
          soldiers: state.soldiers.map((s) =>
            s.id === victim.id ? { ...s, state: "destroyed" } : s
          ),
        };
      }
      return { ...state, defendersOut };
    }
    case "tool_executed": {
      if (!event.risky || state.wall === "collapsed") return state;
      return { ...state, wall: "cracked" };
    }
    case "win": {
      return { ...state, wall: "collapsed" };
    }
  }
}

/** Wall integrity 0-100 for the reduced-motion progress bar. */
export function wallIntegrity(state: BattleState): number {
  switch (state.wall) {
    case "collapsed":
      return 0;
    case "cracked":
      return 50;
    case "intact":
      return 100;
  }
}
