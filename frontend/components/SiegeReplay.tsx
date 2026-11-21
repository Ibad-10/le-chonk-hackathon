"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Siege from "@/components/Siege";
import {
  advanceReplay,
  initialReplayCursor,
  planReplay,
  resumeReplay,
  type ReplayCursor,
  type SiegeEvent,
} from "@/lib/siege";
import type { LogbookEntry } from "@/lib/types";

const REPLAY_STEP_MS = 800; // one event per march-and-clash

/**
 * Replays a stored logbook entry through the same siege state machine,
 * pausing on the breaking moment (the vault fall stays on screen) until the
 * owner resumes.
 */
export default function SiegeReplay({ entry }: { entry: LogbookEntry }) {
  const plan = useMemo(() => planReplay(entry), [entry]);
  const cursorRef = useRef<ReplayCursor>(initialReplayCursor());
  const [applied, setApplied] = useState<SiegeEvent[]>([]);
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const { cursor, event } = advanceReplay(cursorRef.current, plan);
      cursorRef.current = cursor;
      if (event) setApplied((a) => [...a, event]);
      if (cursor.pausedAtBreaking) {
        setPaused(true);
        setRunning(false);
      } else if (cursor.finished) {
        setFinished(true);
        setRunning(false);
      }
    }, REPLAY_STEP_MS);
    return () => clearInterval(id);
  }, [running, plan]);

  return (
    <div className="mt-3 rounded-lg border border-room-line bg-room-bg p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-room-text">
          Siege replay — run {entry.run_id}
          {entry.breaking_moment && (
            <span className="ml-2 font-normal text-room-muted">
              breaking moment: {entry.breaking_moment.reason}
            </span>
          )}
        </p>
        {paused && (
          <button
            type="button"
            onClick={() => {
              cursorRef.current = resumeReplay(cursorRef.current);
              setPaused(false);
              setRunning(true);
            }}
            className="rounded-md bg-room-red px-3 py-1 text-xs font-semibold text-white hover:bg-room-red-soft"
          >
            ▶ Paused at the breaking moment — resume
          </button>
        )}
        {finished && (
          <span className="text-xs text-room-muted">replay finished</span>
        )}
      </div>
      <Siege events={applied} />
    </div>
  );
}
