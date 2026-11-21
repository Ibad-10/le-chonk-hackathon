"use client";

import { useEffect, useRef, useState } from "react";

import { formatCountdown } from "@/lib/format";

interface TimerRingProps {
  /** total seconds for the run */
  seconds: number;
  onExpire: () => void;
  label?: string;
  /** absolute deadline (ms epoch), e.g. the run's ends_at * 1000. Default: mount + seconds. */
  endsAt?: number;
  /** hold at full time (run not started yet) */
  paused?: boolean;
}

const ANNOUNCE_AT = [60, 30, 10];

/**
 * Countdown ring (SVG). Ticks once per second, shows mm:ss in the middle and
 * calls onExpire exactly once when it reaches zero.
 */
export default function TimerRing({
  seconds,
  onExpire,
  label = "time left",
  endsAt,
  paused = false,
}: TimerRingProps) {
  const [left, setLeft] = useState(seconds);
  const expiredRef = useRef(false);
  // keep the latest callback without restarting the interval: re-renders
  // (streamed chunks, typing) must never reset the clock
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    if (paused) {
      setLeft(seconds);
      return;
    }
    const deadline = endsAt ?? Date.now() + seconds * 1000;
    const tick = () => {
      const l = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpireRef.current();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [seconds, endsAt, paused]);

  // announce at 60 / 30 / 10 s (polite live region, not every tick)
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (!paused && ANNOUNCE_AT.includes(left)) setAnnounce(`${left} seconds left`);
  }, [left, paused]);
  // amber at 60 s, tomato at 15 s
  const tone = left <= 15 ? "danger" : left <= 60 ? "amber" : "ok";

  const R = 26;
  const C = 2 * Math.PI * R;
  const frac = seconds > 0 ? left / seconds : 0;

  return (
    <div
      role="timer"
      aria-label={`${label}: ${formatCountdown(left)}`}
      aria-live="off"
      className="relative inline-flex h-16 w-16 items-center justify-center"
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-16 w-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          strokeWidth="5"
          className="stroke-room-line"
        />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          strokeWidth="5"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          className={`transition-[stroke-dashoffset,stroke] duration-1000 ${
            tone === "danger" ? "stroke-danger" : tone === "amber" ? "stroke-room-red" : "stroke-success"
          }`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`font-mono text-sm font-bold tabular-nums ${
          tone === "danger" ? "text-danger-soft" : tone === "amber" ? "text-room-red-soft" : "text-room-text"
        }`}
      >
        {formatCountdown(left)}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
