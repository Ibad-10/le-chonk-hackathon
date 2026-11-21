// V4-10: Space-key handler tests for push-to-talk.
import { describe, expect, it } from "vitest";

import { talkKeyAction } from "./useVoiceCall";

describe("talkKeyAction (hold Space to talk)", () => {
  it("starts recording on Space keydown", () => {
    expect(talkKeyAction({ type: "keydown", code: "Space" })).toBe("start");
  });

  it("stops recording on Space keyup", () => {
    expect(talkKeyAction({ type: "keyup", code: "Space" })).toBe("stop");
  });

  it("ignores key auto-repeat so recording is not restarted mid-hold", () => {
    expect(talkKeyAction({ type: "keydown", code: "Space", repeat: true })).toBe("none");
  });

  it("ignores other keys", () => {
    expect(talkKeyAction({ type: "keydown", code: "KeyA" })).toBe("none");
    expect(talkKeyAction({ type: "keyup", code: "Enter" })).toBe("none");
    expect(talkKeyAction({ type: "keypress", code: "Space" })).toBe("none");
  });
});
