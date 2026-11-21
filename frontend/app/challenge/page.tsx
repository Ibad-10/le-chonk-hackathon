"use client";

import { useEffect, useState } from "react";

import ChallengeCard from "@/components/challenge/ChallengeCard";
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
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      {error && (
        <p role="alert" className="rounded-lg border border-danger bg-danger-bg p-4 text-danger-soft">
          Could not load today&apos;s challenge: {error}
        </p>
      )}
      {!error && !challenge && <p className="text-room-muted">Loading today&apos;s challenge…</p>}
      {challenge && <ChallengeCard challenge={challenge} />}
    </div>
  );
}
