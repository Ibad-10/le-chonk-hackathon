"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hammer, ShieldAlert, ShieldCheck, Swords } from "lucide-react";

import AgentCard from "@/components/AgentCard";
import { getArenaEvents, listAgents } from "@/lib/api";
import { formatArenaEvent } from "@/lib/arena-wall";
import { fixtureVillage, toPublicVillage } from "@/lib/base";
import type { AgentSummary, ArenaEvent } from "@/lib/types";

// three.js needs the DOM — no SSR.
const BaseView = dynamic(() => import("@/components/base/BaseView"), { ssr: false });

/** Live events ticker (marquee); duplicated once so the loop is seamless. */
function Ticker({ events }: { events: ArenaEvent[] }) {
  if (events.length === 0) return null;
  const items = [...events, ...events];
  return (
    <div className="relative overflow-hidden border-y border-room-line bg-room-panel/80" aria-label="Live arena events">
      <ul className="ticker flex w-max gap-10 py-2.5 pl-6">
        {items.map((ev, i) => (
          <li key={`${ev.id}-${i}`} aria-hidden={i >= events.length} className="flex items-center gap-2 whitespace-nowrap text-sm">
            {ev.kind === "agent_broken" ? (
              <ShieldAlert size={16} aria-hidden="true" className="text-danger" />
            ) : (
              <ShieldCheck size={16} aria-hidden="true" className="text-agent" />
            )}
            <span className="text-room-text">{formatArenaEvent(ev)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ArenaPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const village = useMemo(() => toPublicVillage(fixtureVillage("arena-home")), []);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((e) => setError(e.message));
    getArenaEvents()
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const open = agents?.filter((a) => !a.cooldown_until) ?? [];

  /** Find a target: a random agent that is not shielded (in cooldown). */
  const findTarget = () => {
    const pool = open.length > 0 ? open : agents ?? [];
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/play/${pick.id}`);
  };

  return (
    <div>
      {/* hero: a live village behind the call to action */}
      <section className="relative h-[68vh] min-h-[460px] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-90" aria-hidden="true">
          <BaseView village={village} height="100%" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-room-bg via-room-bg/75 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-room-bg to-transparent" />

        <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">
            The arena for AI agents
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-5xl leading-[0.95] text-room-text sm:text-7xl">
            Talk them into it.
            <br />
            <span className="text-room-red">If you can.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-room-muted sm:text-lg">
            Raid an agent by voice or chat. Get it to move money, leak a file or refund
            what it shouldn&apos;t, and the treasury falls.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={findTarget}
              disabled={!agents || agents.length === 0}
              className="inline-flex items-center gap-2.5 rounded-xl bg-room-red px-7 py-4 text-lg font-bold text-room-bg shadow-[0_8px_30px_-8px_rgba(255,197,61,0.6)] transition-transform hover:-translate-y-0.5 hover:bg-room-red-soft disabled:opacity-60"
            >
              <Swords size={22} aria-hidden="true" /> Find a target
            </button>
            <Link
              href="/my-agents"
              className="inline-flex items-center gap-2.5 rounded-xl border border-room-line bg-room-panel/80 px-6 py-4 text-lg font-semibold text-room-text backdrop-blur hover:border-room-red/70"
            >
              <Hammer size={20} aria-hidden="true" /> Build your own
            </Link>
          </div>
        </div>
      </section>

      <Ticker events={events} />

      <section aria-label="Agents in the arena" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl text-room-text">Pick a target</h2>
            <p className="mt-1 text-sm text-room-muted">
              Shielded agents are being repaired after a raid. Higher rating, harder vault.
            </p>
          </div>
          <span className="font-mono text-sm text-room-muted">
            {open.length}/{agents?.length ?? 0} open
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-soft">
            {error}
          </p>
        )}
        {!agents && !error && <p className="mt-4 text-room-muted">Loading agents…</p>}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  );
}
