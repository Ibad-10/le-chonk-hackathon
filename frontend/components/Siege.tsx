"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { formatCountdown } from "@/lib/format";
import {
  BANNER_TEXT,
  BUBBLE_MAX_WIDTH_PX,
  TOWER_LABELS,
  TOWERS,
  TROOP_LABELS,
  initialSiegeState,
  siegeReducer,
  type Effect,
  type SiegeEvent,
  type SiegeState,
  type TowerId,
  type Troop,
  type TroopType,
} from "@/lib/siege";

// March-and-clash takes 600-900 ms total; older troops speed up when messages
// arrive faster (shorter duration per spawn index).
const MARCH_MAX_MS = 900;
const MARCH_MIN_MS = 600;
const SPEED_STEP_MS = 150;
const TROOP_DEST_P = 0.5; // troops meet defenders mid-lane
const DEFENDER_MS = 700; // defender sallies out to mid-lane
const EFFECT_MS = 800; // puff / shield / crack / crumble / coins on screen

const TROOP_SPRITES: Record<TroopType, string> = {
  scout: "/siege/troop-scout.png",
  knight: "/siege/troop-knight.png",
  bard: "/siege/troop-bard.png",
  sapper: "/siege/troop-sapper.png",
  footman: "/siege/troop-footman.png",
};

const TOWER_SPRITES: Record<TowerId, string> = {
  gate: "/siege/tower-gate.png",
  wall: "/siege/tower-wall.png",
  vault: "/siege/tower-vault.png",
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export interface SiegeProps {
  /** Live run events, appended over time; folding never blocks input. */
  events: SiegeEvent[];
  /** Energy bar: remaining player messages (one pip per message). */
  messagesRemaining?: number;
  maxMessages?: number;
  /** Clock: run time left in seconds (10:00 text, 5:00 voice). */
  secondsLeft?: number | null;
  /** Test hook: force the reduced-motion rendering. */
  reducedMotion?: boolean;
}

/**
 * Siege — the game view of a run. Player messages spawn troops at the camp
 * that march toward the agent's fortress carrying speech bubbles; agent
 * replies send defenders out of the Gate. Refusals parry at the Gate,
 * read-only tools crack the Gate/Wall, a risky tool brings the Vault down.
 * The chat log next to this stays the accessible source of truth.
 */
export default function Siege({
  events,
  messagesRemaining,
  maxMessages = 20,
  secondsLeft = null,
  reducedMotion,
}: SiegeProps) {
  const [state, dispatch] = useReducer(siegeReducer, undefined, initialSiegeState);
  const seenRef = useRef(0);
  const [now, setNow] = useState(0);
  const mqReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? mqReduced;

  // spawn / parry timestamps per troop, out timestamps per defender/effect
  const spawnRef = useRef<Map<number, number>>(new Map());
  const parryRef = useRef<Map<number, number>>(new Map());
  const defenderRef = useRef<Map<number, number>>(new Map());
  const effectRef = useRef<Map<number, number>>(new Map());

  // fold new events into the state machine (queued, never blocking)
  useEffect(() => {
    for (; seenRef.current < events.length; seenRef.current++) {
      dispatch(events[seenRef.current]);
    }
  }, [events]);

  // rAF animation clock (setTimeout fallback where rAF is missing, e.g. jsdom)
  useEffect(() => {
    if (reduced) return;
    const raf: (cb: (t: number) => void) => number =
      window.requestAnimationFrame?.bind(window) ??
      ((cb: (t: number) => void) =>
        window.setTimeout(() => cb(performance.now()), 16) as unknown as number);
    const cancel: (h: number) => void =
      window.cancelAnimationFrame?.bind(window) ??
      ((h: number) => window.clearTimeout(h));
    setNow(performance.now());
    let handle = 0;
    const loop = (t: number) => {
      setNow(t);
      handle = raf(loop);
    };
    handle = raf(loop);
    return () => cancel(handle);
  }, [reduced]);

  // record first-seen timestamps for troops / defenders / effects
  useEffect(() => {
    if (reduced) return;
    const t = now || performance.now();
    for (const tr of state.troops) {
      if (!spawnRef.current.has(tr.id)) spawnRef.current.set(tr.id, t);
      if (tr.state === "parried" && !parryRef.current.has(tr.id)) {
        parryRef.current.set(tr.id, t);
      }
    }
    for (const d of state.defenders) {
      if (!defenderRef.current.has(d.id)) defenderRef.current.set(d.id, t);
    }
    for (const e of state.effects) {
      if (!effectRef.current.has(e.id)) effectRef.current.set(e.id, t);
    }
  }, [state, now, reduced]);

  // cooldown countdown (display only; the event already set the state)
  const [cdLeft, setCdLeft] = useState<number | null>(null);
  useEffect(() => {
    setCdLeft(state.cooldownSecondsLeft);
  }, [state.cooldownSecondsLeft]);
  const cdActive = cdLeft !== null && cdLeft > 0;
  useEffect(() => {
    if (!cdActive) return;
    const id = setInterval(
      () => setCdLeft((s) => (s !== null && s > 0 ? s - 1 : s)),
      1000
    );
    return () => clearInterval(id);
  }, [cdActive]);

  const t = now || 0;

  const troopP = (tr: Troop, index: number): number => {
    const spawn = spawnRef.current.get(tr.id) ?? t;
    // older troops speed up when messages arrive faster
    const duration = Math.max(
      MARCH_MIN_MS,
      Math.min(MARCH_MAX_MS, MARCH_MAX_MS - SPEED_STEP_MS * index)
    );
    const parry = parryRef.current.get(tr.id);
    const end = parry ?? t;
    return clamp01((end - spawn) / duration) * TROOP_DEST_P;
  };

  const defenderP = (id: number, back: boolean): number => {
    const out = defenderRef.current.get(id) ?? t;
    const k = clamp01((t - out) / DEFENDER_MS);
    if (!back) return 1 - k * (1 - TROOP_DEST_P); // gate -> mid-lane, holds there
    return TROOP_DEST_P + k * (1 - TROOP_DEST_P); // walks back to the gate
  };

  const activeEffects = state.effects.filter((e) => {
    const seen = effectRef.current.get(e.id);
    return seen === undefined || t - seen < EFFECT_MS;
  });
  const hasActive = (kind: Effect["kind"], tower?: TowerId) =>
    activeEffects.some(
      (e) => e.kind === kind && (tower === undefined || e.tower === tower)
    );

  const energyPips = Array.from({ length: maxMessages }, (_, i) => i);
  const remaining = messagesRemaining ?? maxMessages;

  const towers = (
    <div className="siege-towers" role="group" aria-label="Agent fortress towers">
      {TOWERS.map((id) => {
        const tower = state.towers[id];
        return (
          <div
            key={id}
            className="siege-tower"
            role="img"
            aria-label={`${TOWER_LABELS[id]}: ${tower.health} of 100 health, ${tower.status}`}
          >
            <span className="siege-tower-name">{TOWER_LABELS[id].split(" ")[0]}</span>
            <span className="siege-tower-imgwrap">
              <img
                src={TOWER_SPRITES[id]}
                alt=""
                className={`siege-tower-img${
                  tower.status === "fallen"
                    ? " siege-fallen"
                    : hasActive("crack", id) || tower.status === "damaged"
                      ? " siege-hit"
                      : ""
                }${id === "gate" && hasActive("shield", "gate") ? " siege-slam" : ""}`}
              />
              {tower.status !== "intact" && (
                <img src="/siege/fx-crack.png" alt="" className="siege-crack" />
              )}
              {id === "gate" && hasActive("shield", "gate") && (
                <img src="/siege/fx-shield.png" alt="" className="siege-fx siege-shield" />
              )}
              {id === "vault" && tower.status === "fallen" && (
                <>
                  <img src="/siege/fx-flame.png" alt="" className="siege-fx siege-flame" />
                  <img src="/siege/fx-smoke.png" alt="" className="siege-fx siege-smoke" />
                </>
              )}
            </span>
            <span
              className="siege-hp"
              role="progressbar"
              aria-label={`${TOWER_LABELS[id]} health`}
              aria-valuenow={tower.health}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                className={`siege-hp-fill${
                  tower.status === "fallen" ? " siege-hp-empty" : ""
                }`}
                style={{ width: `${tower.health}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );

  const hud = (
    <div className="siege-hud">
      <span
        className="siege-energy"
        role="img"
        aria-label={`Energy: ${remaining} of ${maxMessages} messages left`}
      >
        {energyPips.map((i) => (
          <span
            key={i}
            className={`siege-pip${i < remaining ? " siege-pip-on" : ""}`}
          />
        ))}
      </span>
      {secondsLeft !== null && (
        <span
          className="siege-clock font-mono"
          aria-label={`time left ${formatCountdown(secondsLeft)}`}
        >
          {formatCountdown(secondsLeft)}
        </span>
      )}
      {cdActive && (
        <span className="siege-cooldown" role="status">
          Rebuilding {formatCountdown(cdLeft ?? 0)}
        </span>
      )}
      {state.banner && (
        <span
          role="status"
          className={`siege-banner siege-banner-${state.banner.kind}`}
        >
          {state.banner.text}
        </span>
      )}
    </div>
  );

  // screen-reader / reduced-motion step list (the chat log stays the source
  // of truth; this is the siege's own accessible summary)
  const stepList = (
    <ol className={reduced ? "siege-steps" : "sr-only"} aria-label="Siege events">
      {state.log.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ol>
  );

  if (reduced) {
    return (
      <section
        aria-label="Siege"
        className="rounded-xl border border-room-line bg-room-panel p-4"
      >
        {hud}
        {towers}
        {stepList}
      </section>
    );
  }

  return (
    <section
      aria-label="Siege"
      className="rounded-xl border border-room-line bg-room-panel p-4"
    >
      {hud}
      <div className="siege-field">
        {/* fortress first in DOM: top on mobile (lane runs bottom-to-top),
            right on wide screens (row-reverse) */}
        <div className="siege-fortress">
          {cdActive && (
            <span className="siege-scaffold-wrap">
              <img src="/siege/scaffolding.png" alt="" className="siege-scaffold" />
              <span className="siege-cooldown" role="status">
                Rebuilding {formatCountdown(cdLeft ?? 0)}
              </span>
            </span>
          )}
          {towers}
        </div>

        <div className="siege-lane" aria-hidden="true">
          <img src="/siege/tree.png" alt="" className="siege-tree siege-tree-1" />
          <img src="/siege/tree.png" alt="" className="siege-tree siege-tree-2" />
          {/* troops marching from the camp toward the Gate */}
          {state.troops.slice(-8).map((tr, i) => {
            const p = troopP(tr, state.troops.indexOf(tr));
            return (
              <span
                key={tr.id}
                className={`siege-mover${tr.state === "parried" ? " siege-parried" : ""}`}
                style={{ ["--p" as string]: p }}
              >
                <span
                  className="siege-bubble"
                  tabIndex={0}
                  data-full={tr.bubble.full}
                  style={{ maxWidth: BUBBLE_MAX_WIDTH_PX }}
                >
                  {tr.bubble.short}
                </span>
                <img src={TROOP_SPRITES[tr.type]} alt="" className="siege-sprite" />
                <span className="siege-troop-label">{TROOP_LABELS[tr.type].split(" ")[0]}</span>
              </span>
            );
          })}
          {/* defenders sallying out of the Gate */}
          {state.defenders.slice(-6).map((d) => (
            <span
              key={d.id}
              className="siege-mover siege-defender"
              style={{ ["--p" as string]: defenderP(d.id, d.state === "back") }}
            >
              <span
                className="siege-bubble siege-bubble-agent"
                tabIndex={0}
                data-full={d.bubble.full}
                style={{ maxWidth: BUBBLE_MAX_WIDTH_PX }}
              >
                {d.bubble.short}
              </span>
              <img src="/siege/defender.png" alt="" className="siege-sprite" />
            </span>
          ))}
          {/* effects: puff at the parried troop, coins burst out of the vault */}
          {activeEffects
            .filter((e) => e.kind === "puff" && e.troopId !== undefined)
            .map((e) => {
              const tr = state.troops.find((x) => x.id === e.troopId);
              const p = tr ? troopP(tr, state.troops.indexOf(tr)) : TROOP_DEST_P;
              return (
                <img
                  key={e.id}
                  src="/siege/fx-puff.png"
                  alt=""
                  className="siege-fx siege-puff"
                  style={{ ["--p" as string]: p }}
                />
              );
            })}
          {hasActive("coins", "vault") &&
            [0, 1, 2, 3, 4].map((i) => (
              <img
                key={`coin-${i}`}
                src="/siege/fx-coin.png"
                alt=""
                className={`siege-fx siege-coin siege-coin-${i}`}
              />
            ))}
          {hasActive("crumble", "vault") && (
            <img src="/siege/fx-debris.png" alt="" className="siege-fx siege-debris" />
          )}
        </div>

        <div className="siege-camp">
          <img src="/siege/camp-tent.png" alt="" className="siege-camp-img" />
          <span className="siege-camp-label">Your camp</span>
        </div>
      </div>
      {stepList}
    </section>
  );
}

export type { SiegeState };
