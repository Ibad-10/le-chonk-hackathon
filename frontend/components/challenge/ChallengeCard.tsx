import Link from "next/link";
import { Swords, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Challenge } from "@/lib/challengeApi";

export default function ChallengeCard({ challenge }: { challenge: Challenge }) {
  return (
    <Card className="py-0">
      <CardContent className="p-6 sm:p-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">
          <Target size={14} aria-hidden="true" />
          Daily challenge · {challenge.date}
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-foreground">{challenge.title}</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">{challenge.brief}</p>
        <dl className="mt-6 flex flex-wrap gap-8 text-sm">
          <div>
            <dt className="text-muted-foreground">Target</dt>
            <dd className="text-agent-soft">{challenge.target_agent_id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bonus</dt>
            <dd className="font-mono text-room-red-soft">+{challenge.bonus_points} XP</dd>
          </div>
        </dl>
        <Button asChild size="lg" className="mt-8">
          <Link href={`/play/${challenge.target_agent_id}`}>
            <Swords aria-hidden="true" />
            Take the challenge
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
