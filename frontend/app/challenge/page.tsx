"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import ChallengeCard from "@/components/challenge/ChallengeCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { getTodayChallenge, type Challenge } from "@/lib/challengeApi";

export default function ChallengePage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTodayChallenge()
      .then(setChallenge)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Challenge unavailable</AlertTitle>
          <AlertDescription>Could not load today&apos;s challenge: {error}</AlertDescription>
        </Alert>
      )}
      {!error && !challenge && (
        <div role="status" aria-live="polite" aria-label="Loading today's challenge" className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <span className="sr-only">Loading today&apos;s challenge…</span>
        </div>
      )}
      {challenge && <ChallengeCard challenge={challenge} />}
    </div>
  );
}
