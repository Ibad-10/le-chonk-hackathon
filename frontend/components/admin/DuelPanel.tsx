"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { HOUSE_AGENTS, getDuel, startDuel, type DuelJob } from "@/lib/adminApi";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** House-agent duel: both agents take the same frozen exam; higher grade wins. Admin only. */
export default function DuelPanel() {
  const { getToken } = useAuth();
  const [a, setA] = useState<string>(HOUSE_AGENTS[0]);
  const [b, setB] = useState<string>(HOUSE_AGENTS[3]);
  const [job, setJob] = useState<DuelJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function run() {
    setError(null);
    setJob(null);
    try {
      const token = await getToken();
      const { job_id } = await startDuel(token, a, b);
      setJob({ job_id, status: "running", agents: [a, b], result: null });
      timer.current = setInterval(async () => {
        try {
          const j = await getDuel(await getToken(), job_id);
          setJob(j);
          if (j.status !== "running" && timer.current) clearInterval(timer.current);
        } catch (e) {
          setError((e as Error).message);
          if (timer.current) clearInterval(timer.current);
        }
      }, 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex flex-col gap-1 text-sm text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-room-line bg-room-panel-2 px-3 py-2 text-foreground"
      >
        {HOUSE_AGENTS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="rounded-2xl border border-room-line bg-room-panel p-5" aria-labelledby="duel-title">
      <h2 id="duel-title" className="font-display text-2xl text-foreground">House duel</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Both agents take the same frozen exam: scam callers and genuine customers, scored by code. Company only.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {select(a, setA, "Agent A")}
        {select(b, setB, "Agent B")}
        <Button type="button" onClick={() => void run()} disabled={a === b || job?.status === "running"}>
          {job?.status === "running" ? "Duel running…" : "Start duel"}
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-room-red-soft">{error}</p>}
      {job?.status === "error" && <p role="alert" className="mt-3 text-sm text-room-red-soft">Duel failed: {job.error}</p>}
      {job?.result && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-live="polite">
          {job.result.sides.map((s) => (
            <div
              key={s.agent_id}
              className={`rounded-xl border p-4 ${job.result?.winner === s.agent_id ? "border-room-red" : "border-room-line"}`}
            >
              <p className="font-mono text-sm text-muted-foreground">{s.agent_id}</p>
              <p className="mt-1 font-display text-3xl text-foreground">{s.grade}</p>
              <p className="text-sm text-muted-foreground">
                catches {pct(s.catch_rate)} of scams · blocks {pct(s.false_block_rate)} of genuine customers
              </p>
              {job.result?.winner === s.agent_id && <p className="mt-2 text-sm font-semibold text-room-red-soft">Winner</p>}
            </div>
          ))}
          {job.result.winner === null && <p className="text-sm text-muted-foreground">Draw.</p>}
        </div>
      )}
    </section>
  );
}
