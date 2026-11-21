"use client";

import Link from "next/link";

import CooldownBadge from "@/components/CooldownBadge";
import type { AgentSummary } from "@/lib/types";

export default function AgentCard({ agent }: { agent: AgentSummary }) {
  const inCooldown = !!agent.cooldown_until;
  return (
    <Link
      href={`/play/${agent.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-room-line bg-room-panel p-5 transition-colors hover:border-room-red/70 hover:bg-room-panel-2"
      aria-label={`${agent.name}, ${agent.stream} agent, rating ${Math.round(agent.rating)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-2xl text-room-text group-hover:text-room-red-soft">
          {agent.name}
        </h3>
        <span className="rounded-full border border-room-line px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-room-muted">
          {agent.stream}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-mono text-room-text">
          {Math.round(agent.rating)}
          <span className="text-room-muted"> ±{Math.round(agent.rating_deviation)}</span>
        </span>
        {agent.grade && (
          <span className="rounded border border-room-line px-2 py-0.5 font-mono text-xs font-bold text-room-text">
            grade {agent.grade}
          </span>
        )}
        <span className="text-room-muted">v{agent.current_version}</span>
      </div>
      <div className="mt-auto pt-1">
        {inCooldown ? (
          <CooldownBadge cooldownUntil={agent.cooldown_until} />
        ) : (
          <span className="text-sm font-semibold text-room-red-soft">
            in the arena →
          </span>
        )}
      </div>
    </Link>
  );
}
