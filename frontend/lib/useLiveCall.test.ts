// Live-call mute toggle state machine: the call is always live; Space toggles
// the one round mic button (keydown only, auto-repeat ignored); barge-in moves
// agentSpeaking -> live. Pure function tests, no DOM needed.

import { describe, expect, it } from "vitest";

import { nextCallState, spaceKeyEvent } from "./useLiveCall";

describe("spaceKeyEvent", () => {
  it("maps Space keydown to a toggle", () => {
    expect(spaceKeyEvent({ type: "keydown", code: "Space" })).toBe("space");
  });

  it("ignores key auto-repeat", () => {
    expect(spaceKeyEvent({ type: "keydown", code: "Space", repeat: true })).toBe(
      "space_repeat",
    );
  });

  it("ignores keyup and other keys (keydown only)", () => {
    expect(spaceKeyEvent({ type: "keyup", code: "Space" })).toBeNull();
    expect(spaceKeyEvent({ type: "keydown", code: "Enter" })).toBeNull();
    expect(spaceKeyEvent({ type: "keypress", code: "Space" })).toBeNull();
  });
});

describe("nextCallState (live, muted, agentSpeaking, ended)", () => {
  it("toggles live <-> muted on Space", () => {
    expect(nextCallState("live", "space")).toBe("muted");
    expect(nextCallState("muted", "space")).toBe("live");
  });

  it("ignores auto-repeat in every state", () => {
    for (const s of ["live", "muted", "agentSpeaking", "ended"] as const) {
      expect(nextCallState(s, "space_repeat")).toBe(s);
    }
  });

  it("start opens the call live", () => {
    expect(nextCallState("ended", "start")).toBe("live");
  });

  it("agent audio moves live -> agentSpeaking, and back on audio end", () => {
    expect(nextCallState("live", "agent_audio_start")).toBe("agentSpeaking");
    expect(nextCallState("agentSpeaking", "agent_audio_end")).toBe("live");
  });

  it("stays muted while the agent speaks (mute only affects outgoing audio)", () => {
    expect(nextCallState("muted", "agent_audio_start")).toBe("muted");
    expect(nextCallState("muted", "agent_audio_end")).toBe("muted");
  });

  it("barge-in transition: agentSpeaking -> live", () => {
    expect(nextCallState("agentSpeaking", "barge_in")).toBe("live");
    expect(nextCallState("live", "barge_in")).toBe("live");
  });

  it("Space while the agent speaks barges in (agentSpeaking -> live)", () => {
    expect(nextCallState("agentSpeaking", "space")).toBe("live");
  });

  it("end ends the call from any state and ended is terminal", () => {
    for (const s of ["live", "muted", "agentSpeaking"] as const) {
      expect(nextCallState(s, "end")).toBe("ended");
    }
    expect(nextCallState("ended", "end")).toBe("ended");
    expect(nextCallState("ended", "space")).toBe("ended");
    expect(nextCallState("ended", "agent_audio_start")).toBe("ended");
    expect(nextCallState("ended", "barge_in")).toBe("ended");
  });
});
