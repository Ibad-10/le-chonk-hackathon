"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, Link2, Swords } from "lucide-react";
import { toast } from "sonner";

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
        <p role="alert" className="text-danger-soft">
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
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary-bg text-room-red">
          <Landmark size={28} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">
            {agent.stream} stream {agent.is_house ? "· house agent" : ""}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none text-room-text">{agent.name}</h1>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-room-line bg-room-line sm:grid-cols-3">
        {(
          [
            ["Rating", `${Math.round(agent.rating)} ±${Math.round(agent.rating_deviation)}`],
            ["Grade", agent.grade ?? "Unrated"],
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
            className="bg-room-panel px-5 py-3"
          >
            <dt className="text-[11px] uppercase tracking-wider text-room-muted">{term}</dt>
            <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-room-text">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/play/${agent.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-room-red px-5 py-3 font-bold text-room-bg transition-transform hover:-translate-y-0.5 hover:bg-room-red-soft"
        >
          <Swords size={18} aria-hidden="true" /> Raid {agent.name}
        </Link>
        <button
          type="button"
          onClick={() => {
            const url = `${window.location.origin}/play/${agent.id}`;
            navigator.clipboard
              .writeText(`Can you talk ${agent.name} into it? ${url}`)
              .then(() => toast.success("Challenge link copied. Send it to a friend."))
              .catch(() => toast.error(url));
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-room-line bg-room-panel-2 px-5 py-3 font-semibold text-room-text hover:border-room-red/70"
        >
          <Link2 size={18} aria-hidden="true" /> Share challenge link
        </button>
        <Link
          href="/"
          className="inline-flex items-center rounded-xl border border-room-line bg-room-panel-2 px-5 py-3 font-semibold text-room-text hover:border-room-red/70"
        >
          Arena
        </Link>
      </div>
    </div>
  );
}
