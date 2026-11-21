"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, Shield, ShieldOff, Trophy } from "lucide-react";

import { starsForEvents, type BaseEvent, type EndBanner } from "@/lib/base";
import type { RunResult } from "@/lib/types";

import { usePrefersReducedMotion } from "./base/usePrefersReducedMotion";
import Stars from "./Stars";

/**
 * Breach %: how far into the base the attack got, from the same tool events
 * that decide the stars (read tool = outer defence hit, risky tool = treasury).
 */
export function breachPercent(events: BaseEvent[]): number {
  return [0, 35, 66, 100][starsForEvents(events)];
}

/** Counts up to `value` (instant under reduced motion). */
export function useCountUp(value: number, ms = 900): number {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const from = shown;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setShown(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced, ms]);
  return shown;
}

export function BreachMeter({ events }: { events: BaseEvent[] }) {
  const pct = breachPercent(events);
  const shown = useCountUp(pct, 600);
  return (
    <div className="min-w-[150px]" aria-label={`Breach ${pct} percent`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-room-muted">Breach</span>
        <span className="font-mono text-lg font-bold tabular-nums text-room-text">{shown}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-room-panel-2">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            pct >= 100 ? "bg-danger" : "bg-room-red"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Remaining messages as pips (energy). */
export function MessagePips({ used, max }: { used: number; max: number }) {
  return (
    <div aria-label={`${max - used} of ${max} messages left`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-room-muted">Messages</span>
        <span className="font-mono text-sm tabular-nums text-room-text">
          {max - used}/{max}
        </span>
      </div>
      <div className="mt-1 flex gap-[3px]">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-[6px] rounded-sm ${i < max - used ? "bg-agent" : "bg-room-panel-2"}`}
          />
        ))}
      </div>
    </div>
  );
}

const HEADLINE: Record<EndBanner["kind"], string> = {
  conquest: "Vault cracked",
  stars: "Raid repelled",
  defended: "Base defended",
  treaty: "Peace treaty",
  helped: "Customer helped",
};

/** End-of-raid overlay: star ribbon, one headline, points and Elo counting up. */
export function RaidResult({
  banner,
  result,
  breach,
  detail,
  onPlayAgain,
}: {
  banner: EndBanner | null;
  result: RunResult;
  breach: number;
  detail: string;
  onPlayAgain: () => void;
}) {
  const points = useCountUp(result.points, 1100);
  const elo = useCountUp(result.elo_delta, 1100);
  const won = result.outcome === "win";
  const headline = banner ? HEADLINE[banner.kind] : won ? "Vault cracked" : "Raid over";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="raid-result-title"
      className="absolute inset-0 z-30 flex items-center justify-center bg-room-bg/70 p-4 backdrop-blur-sm"
    >
      <div className="raid-pop w-full max-w-md rounded-2xl border border-room-line bg-room-panel p-6 text-center shadow-2xl">
        <div className="flex justify-center">
          {banner?.stars != null ? (
            <Stars count={banner.stars} size={52} pop />
          ) : won ? (
            <ShieldOff size={52} className="text-danger" aria-hidden="true" />
          ) : (
            <Shield size={52} className="text-agent" aria-hidden="true" />
          )}
        </div>
        <h2 id="raid-result-title" className="mt-3 font-display text-5xl text-room-text">
          {headline}
        </h2>
        <p className="mt-2 text-sm text-room-muted">{detail}</p>
        <dl className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-room-panel-2 px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-room-muted">Breach</dt>
            <dd className="font-mono text-2xl font-bold tabular-nums text-room-text">{breach}%</dd>
          </div>
          <div className="rounded-lg bg-room-panel-2 px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-room-muted">Points</dt>
            <dd className="font-mono text-2xl font-bold tabular-nums text-room-red-soft">+{points}</dd>
          </div>
          <div className="rounded-lg bg-room-panel-2 px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wider text-room-muted">Elo</dt>
            <dd
              className={`font-mono text-2xl font-bold tabular-nums ${
                result.elo_delta >= 0 ? "text-success-soft" : "text-danger-soft"
              }`}
            >
              {elo >= 0 ? "+" : ""}
              {elo}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-room-red px-4 py-3 text-sm font-bold text-room-bg hover:bg-room-red-soft"
          >
            <RotateCcw size={16} aria-hidden="true" /> Raid again
          </button>
          <Link
            href="/leaderboard"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-room-line bg-room-panel-2 px-4 py-3 text-sm font-semibold text-room-text hover:border-room-red/70"
          >
            <Trophy size={16} aria-hidden="true" /> Leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}
