"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { getMyAgents } from "@/lib/api";
import type { AgentSummary } from "@/lib/types";

export default function MyAgentsPage() {
  const router = useRouter();
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
    return <p className="p-8 text-room-muted">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl text-room-text">My agents</h1>
      {!agents && <p className="mt-6 text-room-muted">Loading…</p>}
      <ul className="mt-6 space-y-3">
        {agents?.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-room-line bg-room-panel p-4"
          >
            <div>
              <p className="font-semibold text-room-text">{a.name}</p>
              <p className="text-sm text-room-muted">
                {a.stream} · v{a.current_version} · {Math.round(a.rating)} ±
                {Math.round(a.rating_deviation)}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/agents/${a.id}`}
                className="rounded-md border border-room-line bg-room-panel-2 px-3 py-1.5 text-sm text-room-text"
              >
                Public page
              </Link>
              <Link
                href={`/agents/${a.id}/owner`}
                className="rounded-md bg-room-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-room-red-soft"
              >
                Owner dashboard
              </Link>
            </div>
          </li>
        ))}
        {agents?.length === 0 && (
          <li className="text-sm text-room-muted">
            You have no agents yet. Create one from the arena soon.
          </li>
        )}
      </ul>
    </div>
  );
}
