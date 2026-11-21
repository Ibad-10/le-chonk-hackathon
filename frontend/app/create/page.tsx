"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import CreateWizard from "@/components/CreateWizard";

export default function CreatePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && !isSignedIn) {
    return <p className="p-8 text-muted-foreground">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Defend</p>
      <h1 className="mt-1 font-display text-4xl text-foreground">Build your own agent</h1>
      <div className="mt-8">
        <CreateWizard />
      </div>
    </div>
  );
}
