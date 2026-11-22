"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import AgentLab from "@/components/admin/AgentLab";
import ResearchPanel from "@/components/admin/ResearchPanel";
import { HOUSE_AGENTS } from "@/lib/adminApi";
import { getMe } from "@/lib/api";

export default function AdminPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    getToken()
      .then((t) => getMe(t))
      .then((m) => setAdmin(m.is_admin))
      .catch(() => setAdmin(false));
  }, [isLoaded, isSignedIn, getToken]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return <p className="p-8 text-muted-foreground">Redirecting to sign in…</p>;
  }

  if (admin === null) {
    return <p className="p-8 text-muted-foreground">Checking access…</p>;
  }
  if (!admin) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Admin</p>
        <h1 className="mt-1 font-display text-3xl text-foreground">Admins only</h1>
        <p className="mt-3 text-muted-foreground">
          The House agents lab trains Ava, Max, Pip and Rex. Ask an admin for access.
        </p>
      </div>
    );
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
