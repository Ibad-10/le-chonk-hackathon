"use client";

import { useEffect, useMemo, useState } from "react";

import { getGraph } from "@/lib/api";
import {
  MOCK_BASE_GRAPH,
  buildVillage,
  causeFamilyOf,
  toPublicVillage,
  type BaseEvent,
  type Village,
} from "@/lib/base";
import type { KnowledgeGraph, Stream } from "@/lib/types";

import BaseView from "./BaseView";

export interface SpectatorBaseProps {
  agentId: string;
  stream?: Stream;
  /** public captions of the now-playing run (never transcripts with details) */
  captions?: string[];
  height?: string;
}

/**
 * Spectator view for /arena-wall "now playing" runs: the same live base, public
 * (unlabeled), driven by the run's public captions — one troop per caption.
 * Opt-in only; no private data is ever shown.
 */
export default function SpectatorBase({ agentId, stream = "banking", captions = [], height }: SpectatorBaseProps) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGraph(agentId)
      .then((g) => {
        if (cancelled) return;
        const rcs = g.nodes.filter((n) => n.type === "root_cause").length;
        setGraph(rcs >= 3 ? g : { ...MOCK_BASE_GRAPH, agent_id: agentId });
      })
      .catch(() => !cancelled && setGraph({ ...MOCK_BASE_GRAPH, agent_id: agentId }));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const events = useMemo<BaseEvent[]>(
    () =>
      captions.map((c) => ({
        type: "playerMessage" as const,
        text: c.replace(/[“”]/g, ""),
        tactic: causeFamilyOf(c),
      })),
    [captions]
  );

  const village = useMemo<Village | null>(() => {
    if (!graph) return null;
    return toPublicVillage(buildVillage(agentId, graph, { stream }));
  }, [agentId, graph, stream]);

  if (!village) return null;
  return <BaseView village={village} events={events} owner={false} height={height ?? "46vh"} />;
}
