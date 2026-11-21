"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import {
  battleReducer,
  initialBattleState,
  wallIntegrity,
  type BattleEvent,
} from "@/lib/battle";

const MARCH_MS = 4000; // soldier crosses the field in 4 s
const BURST_MS = 600; // refusal burst visible for 0.6 s
const DEFENDER_MS = 1200; // defender sallies out for 1.2 s

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Battle view: each player message spawns a soldier sprite marching from the
 * left toward the agent's castle wall on the right. Each agent reply sends a
 * defender out; a refusal destroys the soldier in a burst; an executed risky
 * tool call cracks the wall; a win collapses it. Pure SVG + rAF. With
 * prefers-reduced-motion, a simple progress bar is shown instead.
 */
export default function BattleView({ events }: { events: BattleEvent[] }) {
  const [state, dispatch] = useReducer(battleReducer, undefined, initialBattleState);
  const seenRef = useRef(0);
  const [now, setNow] = useState(0);
  const spawnRef = useRef<Map<number, number>>(new Map()); // soldier id -> spawn ts
  const destroyedRef = useRef<Map<number, number>>(new Map()); // soldier id -> burst ts
  const defendersRef = useRef<{ id: number; at: number }[]>([]);
  const defenderSeq = useRef(0);
  const defendersSeen = useRef(0);
  const reduced = usePrefersReducedMotion();

  // fold new events into the state machine
  useEffect(() => {
    for (; seenRef.current < events.length; seenRef.current++) {
      dispatch(events[seenRef.current]);
    }
  }, [events]);

  // rAF animation clock
  useEffect(() => {
    if (reduced) return;
    setNow(performance.now());
    let raf = 0;
    const loop = (t: number) => {
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // track spawn / burst / defender timestamps from state changes
  useEffect(() => {
    if (reduced) return;
    const t = now || performance.now();
    for (const s of state.soldiers) {
      if (!spawnRef.current.has(s.id)) spawnRef.current.set(s.id, t);
      if (s.state === "destroyed" && !destroyedRef.current.has(s.id)) {
        destroyedRef.current.set(s.id, t);
      }
    }
    while (defendersSeen.current < state.defendersOut) {
      defendersSeen.current += 1;
      defendersRef.current.push({ id: ++defenderSeq.current, at: t });
    }
    // prune old defenders
    defendersRef.current = defendersRef.current.filter(
      (d) => t - d.at < DEFENDER_MS + 400
    );
  }, [state, now, reduced]);

  if (reduced) {
    const integrity = wallIntegrity(state);
    return (
      <section
        aria-label="Battle view"
        className="rounded-xl border border-room-line bg-room-panel p-4"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-room-text">Battle</span>
          <span className="font-mono text-room-muted">
            {state.soldiers.filter((s) => s.state === "marching").length} soldiers ·{" "}
            {state.bursts} refusals · wall {state.wall}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={integrity}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Wall integrity"
          className="mt-2 h-3 w-full rounded bg-room-panel-2"
        >
          <div
            className={`h-3 rounded ${integrity === 0 ? "bg-room-red" : integrity < 100 ? "bg-room-red-soft" : "bg-room-text"}`}
            style={{ width: `${integrity}%` }}
          />
        </div>
      </section>
    );
  }

  const wallX = 86; // wall position in viewBox units (0-100)
  const marching = state.soldiers.filter(
    (s) => s.state === "marching" || (destroyedRef.current.has(s.id) && now - (destroyedRef.current.get(s.id) ?? now) < BURST_MS)
  );

  return (
    <section
      aria-label="Battle view"
      className="overflow-hidden rounded-xl border border-room-line bg-room-panel p-4"
    >
      <svg viewBox="0 0 100 40" className="h-40 w-full" role="img" aria-label={`Battle: wall ${state.wall}`}>
        {/* ground */}
        <rect x={0} y={34} width={100} height={6} className="fill-room-panel-2" />

        {/* castle wall on the right */}
        {state.wall === "collapsed" ? (
          <g aria-label="collapsed wall">
            <rect x={wallX} y={26} width={12} height={6} className="fill-room-line" transform="rotate(8 92 34)" />
            <rect x={wallX + 1} y={30} width={10} height={4} className="fill-room-line" transform="rotate(-12 92 34)" />
            <text x={wallX + 6} y={14} textAnchor="middle" className="fill-room-red font-bold" fontSize={5}>
              WALL DOWN
            </text>
          </g>
        ) : (
          <g aria-label={state.wall === "cracked" ? "cracked wall" : "intact wall"}>
            <rect x={wallX} y={10} width={12} height={24} className="fill-room-panel-2 stroke-room-line" strokeWidth={0.6} />
            <rect x={wallX + 2} y={6} width={3} height={4} className="fill-room-panel-2 stroke-room-line" strokeWidth={0.5} />
            <rect x={wallX + 7} y={6} width={3} height={4} className="fill-room-panel-2 stroke-room-line" strokeWidth={0.5} />
            {state.wall === "cracked" && (
              <polyline
                points={`${wallX + 2},12 ${wallX + 6},18 ${wallX + 4},24 ${wallX + 8},30`}
                fill="none"
                className="stroke-room-red"
                strokeWidth={0.8}
              />
            )}
          </g>
        )}

        {/* defenders sallying out from the wall */}
        {defendersRef.current.map((d) => {
          const p = Math.min(1, (now - d.at) / DEFENDER_MS);
          const x = wallX - 4 - p * 18;
          const opacity = p > 0.8 ? (1 - p) / 0.2 : 1;
          return (
            <circle key={d.id} cx={x} cy={30} r={1.6} className="fill-room-text" opacity={opacity} />
          );
        })}

        {/* soldiers marching from the left */}
        {marching.map((s) => {
          const spawn = spawnRef.current.get(s.id) ?? now;
          if (s.state === "destroyed") {
            const bt = destroyedRef.current.get(s.id) ?? now;
            const p = Math.min(1, (now - bt) / BURST_MS);
            const x = Math.min(wallX - 6, ((now - spawn) / MARCH_MS) * (wallX - 8));
            return (
              <g key={s.id}>
                <circle cx={x} cy={30} r={1.2 + p * 2.4} className="fill-room-red" opacity={1 - p} />
                <text x={x} y={24} textAnchor="middle" fontSize={4} opacity={1 - p}>✹</text>
              </g>
            );
          }
          const x = Math.min(wallX - 6, ((now - spawn) / MARCH_MS) * (wallX - 8));
          return (
            <g key={s.id}>
              {/* little soldier sprite: body + head */}
              <circle cx={x} cy={27.5} r={1.1} className="fill-room-red-soft" />
              <rect x={x - 0.9} y={28.6} width={1.8} height={3.4} rx={0.6} className="fill-room-red" />
              <line x1={x + 1} y1={29} x2={x + 3} y2={27.5} className="stroke-room-red-soft" strokeWidth={0.6} />
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-center text-xs text-room-muted">
        {state.wall === "collapsed"
          ? "The wall is down — the agent broke."
          : state.wall === "cracked"
            ? "The wall is cracked — a risky tool call executed."
            : "Soldiers = your messages · refusals burst · risky tool calls crack the wall"}
      </p>
    </section>
  );
}
