import { describe, expect, it } from "vitest";

import { getNodeAppearance, nodeLabel } from "@/lib/graph-style";
import type { GraphNodeType } from "@/lib/types";

const TYPES: GraphNodeType[] = ["version", "attack", "root_cause", "learned"];

describe("graph node type -> shape/label mapping", () => {
  it("gives every node type a distinct shape", () => {
    const shapes = TYPES.map((t) => getNodeAppearance(t).shape);
    expect(new Set(shapes).size).toBe(TYPES.length);
  });

  it("gives every node type a distinct icon and non-empty label prefix", () => {
    const icons = TYPES.map((t) => getNodeAppearance(t).icon);
    expect(new Set(icons).size).toBe(TYPES.length);
    for (const t of TYPES) {
      expect(getNodeAppearance(t).labelPrefix.length).toBeGreaterThan(0);
    }
  });

  it("labels nodes with their type in text (never colour alone)", () => {
    expect(nodeLabel("version", "v2.1")).toBe("version: v2.1");
    expect(nodeLabel("attack", "hospital emergency")).toBe(
      "attack: hospital emergency"
    );
    expect(nodeLabel("root_cause", "unverified stories")).toBe(
      "root cause: unverified stories"
    );
    expect(nodeLabel("learned", "verify before payment")).toBe(
      "learned: verify before payment"
    );
  });
});
