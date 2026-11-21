"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { motion, useReducedMotion } from "motion/react";
import { Castle, Plus, Shield, Swords } from "lucide-react";

import CooldownBadge from "@/components/CooldownBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyAgents } from "@/lib/api";
import type { AgentSummary } from "@/lib/types";

export default function MyAgentsPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
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
    return <p className="p-8 text-muted-foreground">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Defend</p>
          <h1 className="mt-1 font-display text-4xl text-foreground">My agents</h1>
        </div>
        <Button asChild size="lg">
          <Link href="/create">
            <Plus aria-hidden="true" /> Create agent
          </Link>
        </Button>
      </div>
      {!agents && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading your agents"
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      )}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents?.map((a, i) => (
          <motion.div
            key={a.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : i * 0.05 }}
          >
            <Card className="h-full gap-0 overflow-hidden py-0">
              <CardHeader className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-display text-3xl font-normal leading-none">{a.name}</CardTitle>
                  {a.grade && (
                    <Badge variant="outline" className="font-mono text-sm font-bold">
                      {a.grade}
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {a.stream} · v{a.current_version}
                </p>
              </CardHeader>
              <Separator />
              <CardContent className="grid grid-cols-2 gap-4 p-5">
                <dl>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Rating</dt>
                  <dd className="font-mono text-xl font-bold tabular-nums text-foreground">
                    {Math.round(a.rating)}
                    <span className="text-sm font-normal text-muted-foreground"> ±{Math.round(a.rating_deviation)}</span>
                  </dd>
                </dl>
                <dl>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {a.cooldown_until ? (
                      <CooldownBadge cooldownUntil={a.cooldown_until} />
                    ) : (
                      "Open to raids"
                    )}
                  </dd>
                </dl>
              </CardContent>
              <CardFooter className="mt-auto flex-wrap gap-2 px-5 pb-5">
                <Button asChild size="sm">
                  <Link href={`/agents/${a.id}/owner`}>
                    <Shield aria-hidden="true" /> Defend
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/agents/${a.id}/base`}>
                    <Castle aria-hidden="true" /> Base
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/play/${a.id}?mode=practice`}>
                    <Swords aria-hidden="true" /> Practice
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>
      {agents?.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          You have no agents yet. Create one to start defending.
        </p>
      )}
    </div>
  );
}
