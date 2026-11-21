"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { CheckCircle2, FlaskConical, Loader2, RotateCcw, TriangleAlert } from "lucide-react";

import { getTrainingCycles, runTrainingCycle, type TrainingCycle } from "@/lib/adminApi";

function CycleCard({ c }: { c: TrainingCycle }) {
  return (
    <li className="rounded-xl border border-room-line bg-room-panel-2 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {c.kept ? (
            <CheckCircle2 size={16} aria-hidden="true" className="text-agent" />
          ) : (
            <RotateCcw size={16} aria-hidden="true" className="text-danger" />
          )}
          {c.kept ? `Kept (v${c.published_version})` : "Rolled back"}
        </span>
        <time className="font-mono text-xs text-room-muted">{c.created_at.slice(0, 16).replace("T", " ")}</time>
      </div>
      <p className="mt-2 text-room-muted">
        {c.attacks_run} attacks run, {c.failures_found} failures found
      </p>
      {!c.kept && <p className="text-room-muted">Reason: {c.reason}</p>}
      <p className="mt-1 text-xs text-room-muted">Sources: {c.sources.join(", ") || "none"}</p>
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-room-line bg-room-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">{agentId}</h2>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-xl bg-room-red px-4 py-2 font-bold text-room-bg hover:bg-room-red-soft disabled:opacity-60"
        >
          {running ? (
            <Loader2 size={16} aria-hidden="true" className="animate-spin" />
          ) : (
            <FlaskConical size={16} aria-hidden="true" />
          )}
          Run training cycle
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
          <TriangleAlert size={16} aria-hidden="true" /> {agentId}: {error}
        </p>
      )}
      {cycles && cycles.length === 0 && <p className="mt-3 text-sm text-room-muted">No cycles yet.</p>}
      <ul className="mt-3 space-y-2">{cycles?.map((c) => <CycleCard key={c.created_at} c={c} />)}</ul>
    </section>
  );
}
