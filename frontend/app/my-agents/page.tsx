"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Castle, Plus, Shield, Swords } from "lucide-react";

import CooldownBadge from "@/components/CooldownBadge";
import { getMyAgents } from "@/lib/api";
import type { AgentSummary } from "@/lib/types";

export default function MyAgentsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    getToken().then((token) =>
      getMyAgents(token).then(setAgents).catch(() => setAgents([]))
    );
  }, [isLoaded, isSignedIn, getToken]);

  if (isLoaded && !isSignedIn) {
    return <p className="p-8 text-room-muted">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Defend</p>
          <h1 className="mt-1 font-display text-4xl text-room-text">My agents</h1>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 rounded-xl bg-room-red px-5 py-3 font-bold text-room-bg transition-transform hover:-translate-y-0.5 hover:bg-room-red-soft"
        >
          <Plus size={18} aria-hidden="true" /> Create agent
        </Link>
      </div>
      {!agents && <p className="mt-6 text-room-muted">Loading…</p>}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents?.map((a) => (
          <article
            key={a.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-room-line bg-room-panel"
          >
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-3xl leading-none text-room-text">{a.name}</h2>
                {a.grade && (
                  <span className="rounded-md border border-room-line px-2 py-0.5 font-mono text-sm font-bold text-room-text">
                    {a.grade}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-room-muted">
                {a.stream} · v{a.current_version}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-px border-y border-room-line bg-room-line">
              <div className="bg-room-panel px-5 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-room-muted">Rating</dt>
                <dd className="font-mono text-xl font-bold tabular-nums text-room-text">
                  {Math.round(a.rating)}
                  <span className="text-sm font-normal text-room-muted"> ±{Math.round(a.rating_deviation)}</span>
                </dd>
              </div>
              <div className="bg-room-panel px-5 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-room-muted">Status</dt>
                <dd className="text-sm font-semibold text-room-text">
                  {a.cooldown_until ? (
                    <CooldownBadge cooldownUntil={a.cooldown_until} />
                  ) : (
                    "Open to raids"
                  )}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 p-4">
              <Link
                href={`/agents/${a.id}/owner`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-room-red px-3 py-2 text-sm font-semibold text-room-bg hover:bg-room-red-soft"
              >
                <Shield size={16} aria-hidden="true" /> Defend
              </Link>
              <Link
                href={`/agents/${a.id}/base`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-room-line bg-room-panel-2 px-3 py-2 text-sm font-semibold text-room-text hover:border-room-red/70"
              >
                <Castle size={16} aria-hidden="true" /> Base
              </Link>
              <Link
                href={`/play/${a.id}?mode=practice`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-room-line bg-room-panel-2 px-3 py-2 text-sm font-semibold text-room-text hover:border-room-red/70"
              >
                <Swords size={16} aria-hidden="true" /> Practice
              </Link>
            </div>
          </article>
        ))}
      </div>
      {agents?.length === 0 && (
        <p className="mt-6 text-sm text-room-muted">
          You have no agents yet. Create one to start defending.
        </p>
      )}
    </div>
  );
}
