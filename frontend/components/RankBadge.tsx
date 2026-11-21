import { Crown, Gem, Shield, Skull, type LucideIcon } from "lucide-react";

import type { Rank } from "@/lib/challengeApi";

const ICONS: Record<string, LucideIcon> = {
  Rookie: Shield,
  Grifter: Skull,
  "Con Artist": Gem,
  Mastermind: Crown,
};

/** Icon + rank name + progress bar to the next rank. `ranks` comes from getRanks(). */
export default function RankBadge({ xp, ranks }: { xp: number; ranks: Rank[] }) {
  const current = [...ranks].reverse().find((r) => xp >= r.min_xp) ?? ranks[0];
  if (!current) return null;
  const Icon = ICONS[current.name] ?? Shield;
  const pct =
    current.next_xp === null
      ? 100
      : Math.min(100, ((xp - current.min_xp) / (current.next_xp - current.min_xp)) * 100);
  return (
    <div className="inline-flex min-w-56 flex-col gap-1.5 rounded-xl border border-primary-line bg-primary-bg px-4 py-3">
      <div className="flex items-center gap-2 text-room-red-soft">
        <Icon size={18} aria-hidden="true" />
        <span className="font-semibold">{current.name}</span>
        <span className="ml-auto text-xs text-room-muted">{xp} XP</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Progress to next rank`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-1.5 overflow-hidden rounded-full bg-room-panel-2"
      >
        <div className="h-full bg-room-red" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-room-muted">
        {current.next_xp === null ? "Top rank" : `${current.next_xp - xp} XP to next rank`}
      </p>
    </div>
  );
}
