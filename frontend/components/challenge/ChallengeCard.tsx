import Link from "next/link";
import { Swords, Target } from "lucide-react";

import type { Challenge } from "@/lib/challengeApi";

export default function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return (
    <article className="rounded-2xl border border-room-line bg-room-panel p-6 sm:p-8">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">
        <Target size={14} aria-hidden="true" />
        Daily challenge · {challenge.date}
      </p>
      <h2 className="mt-3 font-display text-4xl leading-tight text-room-text">{challenge.title}</h2>
      <p className="mt-3 max-w-xl text-room-muted">{challenge.brief}</p>
      <dl className="mt-5 flex flex-wrap gap-6 text-sm">
        <div>
          <dt className="text-room-muted">Target</dt>
          <dd className="text-agent-soft">{challenge.target_agent_id}</dd>
        </div>
        <div>
          <dt className="text-room-muted">Bonus</dt>
          <dd className="text-room-red-soft">+{challenge.bonus_points} XP</dd>
        </div>
      </dl>
      <Link
        href={`/play/${challenge.target_agent_id}`}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-room-red px-5 py-2.5 font-semibold text-room-bg hover:bg-room-red-soft"
      >
        <Swords size={18} aria-hidden="true" />
        Take the challenge
      </Link>
    </article>
  );
}
