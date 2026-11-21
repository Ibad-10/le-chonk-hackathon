"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";

import { getAgent } from "@/lib/api";
import type { Agent } from "@/lib/types";

/** Public agent page: rating, grade, stats only — never graph, prompt or transcripts. */
export default function AgentPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-room-muted">Loading…</p>}>
      <AgentPublicPageInner params={params} />
    </Suspense>
  );
}

function AgentPublicPageInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgent(id)
      .then(setAgent)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p role="alert" className="text-room-red-soft">
          {error}
        </p>
      </div>
    );
  }
  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-room-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm uppercase tracking-wide text-room-muted">
        {agent.stream} stream {agent.is_house ? "· house agent" : ""}
      </p>
      <h1 className="mt-1 font-display text-4xl text-room-text">{agent.name}</h1>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {(
          [
            ["Rating", `${Math.round(agent.rating)} ±${Math.round(agent.rating_deviation)}`],
            ["Grade", agent.grade ?? "not graded"],
            ["Version", `v${agent.current_version}`],
            [
              "Helpfulness",
              agent.helpfulness == null ? "—" : `${Math.round(agent.helpfulness * 100)}%`,
            ],
            ["Runs", `${agent.stats.runs}`],
            ["Record", `${agent.stats.holds} held / ${agent.stats.breaks} broken`],
          ] as [string, string][]
        ).map(([term, value]) => (
          <div
            key={term}
            className="rounded-xl border border-room-line bg-room-panel p-4"
          >
            <dt className="text-xs uppercase tracking-wide text-room-muted">{term}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-room-text">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex gap-3">
        <Link
          href={`/play/${agent.id}`}
          className="rounded-md bg-room-red px-4 py-2 text-sm font-semibold text-white hover:bg-room-red-soft"
        >
          Chat with {agent.name}
        </Link>
        <Link
          href="/"
          className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text"
        >
          Arena
        </Link>
      </div>
    </div>
  );
}
