"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Text-run message limit (v4: 20 player messages). The 21st message is blocked.
 */
export function useMessageLimit(max: number) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);

  const trySend = useCallback((): boolean => {
    if (countRef.current >= max) return false; // blocked: 21st message never counts
    countRef.current += 1;
    setCount(countRef.current);
    return true;
  }, [max]);

  return {
    count,
    max,
    remaining: Math.max(0, max - count),
    canSend: count < max,
    trySend,
  };
}

interface MessageCounterProps {
  count: number;
  max: number;
}

export default function MessageCounter({ count, max }: MessageCounterProps) {
  const blocked = count >= max;
  return (
    <p
      aria-live="polite"
      className={`font-mono text-sm ${blocked ? "text-room-red-soft" : "text-room-muted"}`}
    >
      {blocked
        ? `Message limit reached (${max})`
        : `Messages ${count} / ${max}`}
    </p>
  );
}
