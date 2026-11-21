"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";

import { formatCountdown, secondsUntil } from "@/lib/format";

/** Cooldown badge with a live countdown; renders nothing when not cooling down. */
export default function CooldownBadge({
  cooldownUntil,
}: {
  cooldownUntil: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  if (!cooldownUntil) return null;
  const left = secondsUntil(cooldownUntil, now);
  if (left <= 0) return null;

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-room-red/60 bg-room-red/15 px-2.5 py-1 text-xs font-semibold text-room-red-soft"
    >
      <Shield size={14} aria-hidden="true" />
      shield {formatCountdown(left)}
    </span>
  );
}
