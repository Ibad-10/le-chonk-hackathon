"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { CheckCircle2, FlaskConical, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTrainingCycles, runTrainingCycle, type TrainingCycle } from "@/lib/adminApi";

function CycleCard({ c }: { c: TrainingCycle }) {
  return (
    <li className="rounded-xl border border-border bg-secondary p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {c.kept ? (
            <CheckCircle2 size={16} aria-hidden="true" className="text-agent" />
          ) : (
            <RotateCcw size={16} aria-hidden="true" className="text-danger-soft" />
          )}
          {c.kept ? `Kept (v${c.published_version})` : "Rolled back"}
        </span>
        <time className="font-mono text-xs text-muted-foreground">{c.created_at.slice(0, 16).replace("T", " ")}</time>
      </div>
      <p className="mt-2 text-muted-foreground">
        {c.attacks_run} attacks run, {c.failures_found} failures found
      </p>
      {!c.kept && <p className="text-muted-foreground">Reason: {c.reason}</p>}
      <p className="mt-1 text-xs text-muted-foreground">Sources: {c.sources.join(", ") || "none"}</p>
    </li>
  );
}

export default function AgentLab({ agentId }: { agentId: string }) {
  const { getToken } = useAuth();
  const [cycles, setCycles] = useState<TrainingCycle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setCycles(await getTrainingCycles(agentId, await getToken()));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [agentId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await runTrainingCycle(agentId, await getToken());
      await load();
      toast.success(`Training cycle finished for ${agentId}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card aria-label={`${agentId} training lab`} className="gap-4 py-5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-5">
        <CardTitle className="font-display text-xl font-normal">{agentId}</CardTitle>
        <Button type="button" onClick={run} disabled={running}>
          {running ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <FlaskConical aria-hidden="true" />
          )}
          Run training cycle
        </Button>
      </CardHeader>
      <CardContent className="px-5">
        <div aria-live="polite">
          {running && <p className="sr-only">Training cycle running.</p>}
        </div>
        {error && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              {agentId}: {error}
            </AlertDescription>
          </Alert>
        )}
        {!cycles && !error && (
          <div role="status" aria-label="Loading cycles" className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {cycles && cycles.length === 0 && <p className="text-sm text-muted-foreground">No cycles yet.</p>}
        <ul className="mt-3 space-y-2">{cycles?.map((c) => <CycleCard key={c.created_at} c={c} />)}</ul>
      </CardContent>
    </Card>
  );
}
