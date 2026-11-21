"use client";

import { useEffect, useMemo, useState } from "react";

import { getGraph } from "@/lib/api";
import {
  MOCK_BASE_GRAPH,
  buildVillage,
  toPublicVillage,
  type BaseEvent,
  type Village,
} from "@/lib/base";
import type { KnowledgeGraph, Stream } from "@/lib/types";

import BaseView from "./BaseView";

export interface LiveBaseProps {
  agentId: string;
  stream?: Stream;
  /** live run events as they stream in (playerMessage / agentReply / tools / runEnded) */
  events: BaseEvent[];
  height?: string;
}

/**
 * The player's LIVE battlefield on /play/[agentId]: the agent's base rendered
 * in the public view (unlabeled generic buildings — the attacker must never
 * learn defence names), driven in real time by the run event list. Troops
 * spawn the moment a message is sent; nothing blocks typing or talking.
 */
export default function LiveBase({ agentId, stream = "banking", events, height }: LiveBaseProps) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGraph(agentId)
      .then((g) => {
        if (cancelled) return;
        // rich mock base when the backend route is not built yet
        const rcs = g.nodes.filter((n) => n.type === "root_cause").length;
        setGraph(rcs >= 3 ? g : { ...MOCK_BASE_GRAPH, agent_id: agentId });
      })
      .catch(() => {
        if (!cancelled) setGraph({ ...MOCK_BASE_GRAPH, agent_id: agentId });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const village = useMemo<Village | null>(() => {
    if (!graph) return null;
    return toPublicVillage(buildVillage(agentId, graph, { stream }));
  }, [agentId, graph, stream]);

  if (!village) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-room-line bg-room-panel text-room-muted"
        style={{ height: height ?? "60vh" }}
      >
        Building the base…
      </div>
    );
  }

  return <BaseView village={village} events={events} owner={false} height={height} />;
}
