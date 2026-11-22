"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  INNER_WALL_RADIUS,
  buildingById,
  planBeats,
  type BaseEvent,
  type Beat,
  type EndBanner,
  type Village,
} from "@/lib/base";

import type { Squad } from "./Troop";

export const STEP_MS = 700; // each beat <= 900 ms

export interface Banner {
  id: number;
  text: string;
  tone: "red" | "green" | "muted";
}

export interface DirectorState {
  squads: Squad[];
  envoys: { id: number; from: { x: number; z: number }; to: { x: number; z: number }; text: string }[];
  banners: Banner[];
  damage: Record<string, number>;
  firing: Record<string, number>;
  treasuryDestroyed: boolean;
  endBanner: EndBanner | null;
  pending: number; // beats still queued
  speedUp: boolean; // troops hurry when we're behind
  skip: () => void;
}

/**
 * Drives the base from the run event list (same events as the Siege state
 * machine). Beats are applied one at a time, STEP_MS apart (<= 900 ms); a queue
 * forms when events arrive faster, and troops speed up when behind. "Skip"
 * flushes the queue. Under prefers-reduced-motion every beat applies at once
 * with no animation timing.
 */
export function useBaseDirector(
  village: Village,
  events: BaseEvent[] | null,
  reduced: boolean
): DirectorState {
  const beats = useMemo(() => (events ? planBeats(village, events) : []), [village, events]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [envoys, setEnvoys] = useState<DirectorState["envoys"]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [damage, setDamage] = useState<Record<string, number>>({});
  const [firing, setFiring] = useState<Record<string, number>>({});
  const [treasuryDestroyed, setTreasuryDestroyed] = useState(false);
  const [endBanner, setEndBanner] = useState<EndBanner | null>(null);
  const [pending, setPending] = useState(0);

  const seenRef = useRef(0);
  const bannerSeq = useRef(0);
  const envoySeq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pushBanner = useCallback((text: string, tone: Banner["tone"]) => {
    const id = ++bannerSeq.current;
    setBanners((b) => [...b.slice(-2), { id, text, tone }]);
    timers.current.push(
      setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), 2400)
    );
  }, []);

  const applyBeat = useCallback(
    (beat: Beat) => {
      switch (beat.kind) {
        case "spawn":
          setSquads((s) => [
            ...s,
            {
              id: beat.squadId,
              text: beat.text,
              tactic: beat.tactic,
              targetId: beat.targetId,
              path: beat.path,
              status: "marching",
            },
          ]);
          break;
        case "envoy": {
          const b = buildingById(village, beat.fromId);
          const from = b ? b.position : village.treasury.position;
          const spawn = village.spawnPoints[0];
          const id = ++envoySeq.current;
          setEnvoys((e) => [
            ...e,
            {
              id,
              from,
              to: { x: (from.x + spawn.x) / 2, z: (from.z + spawn.z) / 2 },
              text: beat.text,
            },
          ]);
          timers.current.push(
            setTimeout(() => setEnvoys((e) => e.filter((x) => x.id !== id)), 2600)
          );
          break;
        }
        case "defeated":
          setSquads((s) =>
            s.map((q) => (q.id === beat.squadId ? { ...q, status: "defeated" } : q))
          );
          setFiring((f) => ({ ...f, [beat.targetId]: (f[beat.targetId] ?? 0) + 1 }));
          timers.current.push(
            setTimeout(
              () =>
                setFiring((f) => {
                  const n = { ...f };
                  delete n[beat.targetId];
                  return n;
                }),
              700
            )
          );
          pushBanner("Defeated", "red");
          break;
        case "sentBack":
          setSquads((s) =>
            s.map((q) => (q.id === beat.squadId ? { ...q, status: "sentBack" } : q))
          );
          pushBanner("Sent back", "muted");
          timers.current.push(
            setTimeout(
              () => setSquads((s) => s.filter((q) => q.id !== beat.squadId || q.status !== "sentBack")),
              3200
            )
          );
          break;
        case "reached":
          setSquads((s) =>
            s.map((q) => (q.id === beat.squadId ? { ...q, status: "reached" } : q))
          );
          break;
        case "damage": {
          setDamage((d) => ({ ...d, [beat.targetId]: (d[beat.targetId] ?? 0) + 1 }));
          // the squad advances one ring closer (toward the inner wall)
          setSquads((s) =>
            s.map((q) => {
              if (q.targetId !== beat.targetId || q.status === "defeated") return q;
              const last = q.path[q.path.length - 1];
              const angle = Math.atan2(last.z, last.x);
              return {
                ...q,
                status: "marching",
                path: [
                  ...q.path,
                  {
                    x: +(INNER_WALL_RADIUS * Math.cos(angle)).toFixed(3),
                    z: +(INNER_WALL_RADIUS * Math.sin(angle)).toFixed(3),
                  },
                ],
              };
            })
          );
          pushBanner("Defence damaged", "red");
          break;
        }
        case "conquest":
          setTreasuryDestroyed(true);
          pushBanner("Treasury taken!", "red");
          break;
        case "end":
          setEndBanner(beat.banner);
          break;
      }
    },
    [village, pushBanner]
  );

  // Live play appends events one by one: keep the scene and continue from where
  // we are. Only a different list (new village, another replay) starts over.
  const prevBeats = useRef<Beat[]>([]);
  useEffect(() => {
    const prev = prevBeats.current;
    prevBeats.current = beats;
    const appended =
      prev.length <= beats.length && prev.every((b, i) => JSON.stringify(b) === JSON.stringify(beats[i]));
    if (appended) {
      // a fresh player message must show its troop now (< 300 ms), not after
      // the queue: apply everything up to the newest spawn at once. A whole
      // replay list arriving at once still plays beat by beat.
      // ponytail: "live" = at most 2 new beats per update; a burst of more replays normally
      const added = beats.length - prev.length;
      if (added > 0 && (prev.length > 0 || added <= 2)) {
        let last = -1;
        for (let i = seenRef.current; i < beats.length; i++) if (beats[i].kind === "spawn") last = i;
        while (seenRef.current <= last) {
          applyBeat(beats[seenRef.current]);
          seenRef.current += 1;
        }
      }
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    seenRef.current = 0;
    setSquads([]);
    setEnvoys([]);
    setBanners([]);
    setDamage({});
    setFiring({});
    setTreasuryDestroyed(false);
    setEndBanner(null);
  }, [beats, applyBeat]);

  // process queued beats, one every STEP_MS (instantly when reduced motion)
  useEffect(() => {
    let stepTimer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      if (seenRef.current < beats.length) {
        applyBeat(beats[seenRef.current]);
        seenRef.current += 1;
        setPending(beats.length - seenRef.current);
        stepTimer = setTimeout(step, reduced ? 0 : STEP_MS);
      } else {
        setPending(0);
      }
    };
    step();
    return () => clearTimeout(stepTimer);
  }, [beats, applyBeat, reduced]);

  // banner / envoy clean-up timers only die with the component
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const skip = useCallback(() => {
    while (seenRef.current < beats.length) {
      applyBeat(beats[seenRef.current]);
      seenRef.current += 1;
    }
    setPending(0);
  }, [beats, applyBeat]);

  return {
    squads,
    envoys,
    banners,
    damage,
    firing,
    treasuryDestroyed,
    endBanner,
    pending,
    speedUp: pending > 2,
    skip,
  };
}
