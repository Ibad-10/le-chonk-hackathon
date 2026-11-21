"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { getGraph, getLogbook } from "@/lib/api";
import {
  MOCK_BASE_GRAPH,
  buildVillage,
  causeFamilyOf,
  eventsFromTranscript,
  type BaseBuilding,
  type BaseEvent,
  type Village,
} from "@/lib/base";
import type { KnowledgeGraph, Logbook } from "@/lib/types";

// three.js needs the DOM — no SSR.
const BaseView = dynamic(() => import("@/components/base/BaseView"), {
  ssr: false,
  loading: () => <p className="p-8 text-room-muted">Raising the base…</p>,
});

export default function BasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-room-muted">Loading…</p>}>
      <BasePageInner params={params} />
    </Suspense>
  );
}

function BasePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [logbook, setLogbook] = useState<Logbook | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [replayEvents, setReplayEvents] = useState<BaseEvent[] | null>(null);

  // owner-only: redirect when signed out
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    getToken()
      .then((token) =>
        Promise.all([getGraph(id, token), getLogbook(id, token)]).then(
          ([g, l]) => {
            setGraph(g);
            setLogbook(l);
          }
        )
      )
      .catch(() => {});
  }, [id, isLoaded, isSignedIn, getToken]);

  const village = useMemo<Village | null>(() => {
    if (!graph) return null;
    // rich mock base when the backend route is not built yet
    const effective =
      graph.nodes.filter((n) => n.type === "root_cause").length >= 3
        ? graph
        : { ...MOCK_BASE_GRAPH, agent_id: id };
    // fold logbook group sizes in as counts (keyed by matching cause family)
    const groupStats: Record<string, { total: number; failing: number }> = {};
    if (logbook) {
      for (const rc of effective.nodes.filter((n) => n.type === "root_cause")) {
        const family = causeFamilyOf(rc.label);
        const group = logbook.groups.find(
          (g) => causeFamilyOf(g.family, g.root_cause) === family
        );
        if (group) {
          groupStats[rc.id] = {
            total: group.count,
            failing: group.reopened ? group.count : 0,
          };
        }
      }
    }
    return buildVillage(id, effective, { stream: "banking", groupStats });
  }, [id, graph, logbook]);

  const onReplay = (building: BaseBuilding) => {
    // replay the linked attack from the logbook transcript
    const group = logbook?.groups.find(
      (g) => causeFamilyOf(g.family, g.root_cause) === building.family
    );
    const entry = group?.entries[0];
    if (entry) {
      setReplayEvents(eventsFromTranscript(entry));
      setReplayKey((k) => k + 1);
    }
  };

  if (isLoaded && !isSignedIn) {
    return <p className="p-8 text-room-muted">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-room-text">Base — agent {id}</h1>
        <nav className="flex gap-2" aria-label="View">
          <span
            aria-current="page"
            className="rounded-md border border-room-red bg-room-red/15 px-3 py-1.5 text-sm font-semibold text-room-red-soft"
          >
            Base
          </span>
          <Link
            href={`/agents/${id}/graph`}
            className="rounded-md border border-room-line bg-room-panel px-3 py-1.5 text-sm font-semibold text-room-muted hover:text-room-text"
          >
            Graph
          </Link>
        </nav>
      </div>
      <p className="mb-4 text-sm text-room-muted">
        The agent&apos;s knowledge as a village: the {village ? "treasury" : "…"} in the
        centre, one defensive building per root cause. Scaffolding marks a group
        that is still open. Click a building for its cause, fixed/flaky/failing
        counts and the attack chat.
      </p>
      {village && (
        <div key={replayKey}>
          <BaseView
            village={village}
            events={replayEvents}
            owner
            onReplay={onReplay}
            height="72vh"
          />
        </div>
      )}
    </div>
  );
}
