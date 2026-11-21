// Knowledge-graph node appearance mapping.
// Rule: node type is NEVER encoded by colour alone — every type gets a distinct
// shape AND a distinct icon glyph AND a text label.

import type { GraphNodeType } from "./types";

export type NodeShape = "circle" | "square" | "diamond" | "triangle";

export interface NodeAppearance {
  shape: NodeShape;
  icon: string; // glyph drawn inside the node
  labelPrefix: string; // text label prefix so type is readable without colour
}

const APPEARANCE: Record<GraphNodeType, NodeAppearance> = {
  version: { shape: "square", icon: "V", labelPrefix: "version" },
  attack: { shape: "triangle", icon: "!", labelPrefix: "attack" },
  root_cause: { shape: "diamond", icon: "?", labelPrefix: "root cause" },
  learned: { shape: "circle", icon: "✓", labelPrefix: "learned" },
};

export function getNodeAppearance(type: GraphNodeType): NodeAppearance {
  return APPEARANCE[type];
}

export function nodeLabel(type: GraphNodeType, label: string): string {
  return `${APPEARANCE[type].labelPrefix}: ${label}`;
}
