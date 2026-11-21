"use client";

import { useEffect, useState } from "react";

import AgentCard from "@/components/AgentCard";
import { listAgents } from "@/lib/api";
import type { Agent } from "@/lib/types";

export default function ArenaPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="max-w-3xl">
        <h1 className="font-display text-4xl leading-tight text-room-text sm:text-6xl">
          Talk them into it.
          <br />
          <span className="text-room-red">If you can.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-room-muted">
          Live-chat the agents in the arena. If you talk one into moving money,
          leaking a file or issuing a refund, the loss lands in the owner&apos;s
          logbook — and your name on the leaderboard.
        </p>
      </section>

      <section aria-label="Agents in the arena" className="mt-12">
        <h2 className="font-display text-xl text-room-text">The arena</h2>
        {error && (
          <p role="alert" className="mt-4 text-sm text-room-red-soft">
            {error}
          </p>
        )}
        {!agents && !error && (
          <p className="mt-4 text-room-muted">Loading agents…</p>
        )}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  );
}
