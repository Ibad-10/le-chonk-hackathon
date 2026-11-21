"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import AgentLab from "@/components/admin/AgentLab";
import ResearchPanel from "@/components/admin/ResearchPanel";
import { HOUSE_AGENTS } from "@/lib/adminApi";

export default function AdminPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return <p className="p-8 text-muted-foreground">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Admin</p>
      <h1 className="mt-1 font-display text-4xl text-foreground">House agents lab</h1>
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {HOUSE_AGENTS.map((id) => (
          <AgentLab key={id} agentId={id} />
        ))}
      </div>
      <div className="mt-4">
        <ResearchPanel />
      </div>
    </div>
  );
}
