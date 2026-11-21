"use client";

import Link from "next/link";
import { CalendarCheck, Landmark, ReceiptText, Swords, type LucideIcon } from "lucide-react";

import CooldownBadge from "@/components/CooldownBadge";
import type { AgentSummary, Stream } from "@/lib/types";

const STREAM_ICON: Record<string, LucideIcon> = {
  banking: Landmark,
  support: ReceiptText,
  assistant: CalendarCheck,
};

/** Difficulty tier from the agent's rating (display only). */
export function difficulty(rating: number): { label: string; pips: number } {
  if (rating >= 1400) return { label: "Elite", pips: 4 };
  if (rating >= 1275) return { label: "Hard", pips: 3 };
  if (rating >= 1150) return { label: "Medium", pips: 2 };
  return { label: "Easy", pips: 1 };
}

export default function AgentCard({ agent }: { agent: AgentSummary }) {
  const inCooldown = !!agent.cooldown_until;
  const Icon = STREAM_ICON[agent.stream as Stream] ?? Landmark;
  const tier = difficulty(agent.rating);
  return (
    <Link
      href={`/play/${agent.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-room-line bg-room-panel transition hover:-translate-y-0.5 hover:border-room-red/70"
      aria-label={`Raid ${agent.name}, ${agent.stream} agent, rating ${Math.round(agent.rating)}, ${tier.label}`}
    >
      <div className="flex items-start gap-4 p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-bg text-room-red">
          <Icon size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-3xl leading-none text-room-text">{agent.name}</h3>
            {agent.grade && (
              <span className="rounded-md border border-room-line px-2 py-0.5 font-mono text-sm font-bold text-room-text">
                {agent.grade}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-room-muted">
            {agent.stream} · v{agent.current_version}
            {agent.is_house ? " · house" : ""}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-y border-room-line bg-room-line">
        <div className="bg-room-panel px-5 py-3">
          <dt className="text-[11px] uppercase tracking-wider text-room-muted">Rating</dt>
          <dd className="font-mono text-xl font-bold tabular-nums text-room-text">
            {Math.round(agent.rating)}
            <span className="text-sm font-normal text-room-muted"> ±{Math.round(agent.rating_deviation)}</span>
          </dd>
        </div>
        <div className="bg-room-panel px-5 py-3">
          <dt className="text-[11px] uppercase tracking-wider text-room-muted">Difficulty</dt>
          <dd className="flex items-center gap-2">
            <span className="text-sm font-semibold text-room-text">{tier.label}</span>
            <span className="flex gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4].map((p) => (
                <span key={p} className={`h-3 w-1.5 rounded-sm ${p <= tier.pips ? "bg-danger" : "bg-room-panel-2"}`} />
              ))}
            </span>
          </dd>
        </div>
      </dl>

      <div className="p-4">
        {inCooldown ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-room-muted">Shielded after a raid</span>
            <CooldownBadge cooldownUntil={agent.cooldown_until} />
          </div>
        ) : (
          <span className="flex w-full items-center justify-center gap-2 rounded-xl bg-room-red py-3 text-base font-bold text-room-bg transition group-hover:bg-room-red-soft">
            <Swords size={18} aria-hidden="true" /> Raid {agent.name}
          </span>
        )}
      </div>
    </Link>
  );
}
