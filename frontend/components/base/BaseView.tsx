"use client";

import { useState } from "react";

import {
  buildingById,
  type BaseBuilding,
  type BaseEvent,
  type BuildingKind,
  type Village,
} from "@/lib/base";

import BaseScene from "./BaseScene";
import { useBaseDirector } from "./useBaseDirector";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export const KIND_LABELS: Record<BuildingKind, string> = {
  treasury: "Treasury",
  watchtower: "Watchtower — identity checks",
  gatehouse: "Gatehouse — authority claims",
  shrine: "Shrine — emotional emergencies",
  mage_tower: "Mage tower — prompt injection",
  bell_tower: "Bell tower — urgency",
  toll_house: "Toll house — invoices & payees",
  barracks: "Barracks — everything else",
};

function Stars({ stars }: { stars: number | null }) {
  if (stars === null) return null;
  return (
    <div className="font-display text-4xl tracking-widest text-room-red-soft" aria-label={`${stars} stars`}>
      {"★".repeat(stars)}
      <span className="text-room-line">{"★".repeat(3 - stars)}</span>
    </div>
  );
}

export interface BaseViewProps {
  village: Village;
  /** run events (replay on the owner page, live stream on /play) */
  events?: BaseEvent[] | null;
  /** owner view: labels + side panel on select */
  owner?: boolean;
  /** owner: replay this logbook entry from the side panel */
  onReplay?: (building: BaseBuilding) => void;
  height?: string;
}

/**
 * Base view: the 3D village plus (owner only) building labels, a side panel on
 * select, transient banners ("Defeated" / "Sent back"), the end-of-run stars
 * screen and a skip control for replays. Public/attacker view: unlabeled
 * generic buildings, no panel.
 */
export default function BaseView({ village, events = null, owner = false, onReplay, height }: BaseViewProps) {
  const reduced = usePrefersReducedMotion();
  const director = useBaseDirector(village, events, reduced);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? buildingById(village, selectedId) : null;

  const showLabels = owner && !village.public;

  return (
    <div className="relative overflow-hidden rounded-xl border border-room-line bg-room-bg" style={{ height: height ?? "70vh" }}>
      <BaseScene
        village={village}
        director={events ? director : null}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        showLabels={showLabels}
        height="100%"
      />

      {/* transient banners */}
      {director.banners.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 space-y-1 text-center">
          {director.banners.map((b) => (
            <div
              key={b.id}
              className={`rounded-full px-4 py-1 text-sm font-semibold shadow ${
                b.tone === "red"
                  ? "bg-room-red text-white"
                  : b.tone === "green"
                    ? "bg-green-600/90 text-room-bg"
                    : "bg-room-panel-2 text-room-text"
              }`}
            >
              {b.text}
            </div>
          ))}
        </div>
      )}

      {/* skip replay */}
      {events && director.pending > 0 && (
        <button
          type="button"
          onClick={director.skip}
          className="absolute right-3 top-3 z-10 rounded-md border border-room-line bg-room-panel/90 px-3 py-1 text-xs font-semibold text-room-text hover:bg-room-panel-2"
        >
          Skip ▸▸
        </button>
      )}

      {/* end of run */}
      {director.endBanner && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1 border-t border-room-line bg-room-panel/95 px-4 py-3 text-center">
          <Stars stars={director.endBanner.stars} />
          <p className="text-sm font-semibold text-room-text">{director.endBanner.label}</p>
        </div>
      )}

      {/* owner side panel on select */}
      {owner && selected && !village.public && (
        <aside
          aria-label="Building details"
          className="absolute right-3 top-3 z-10 w-64 rounded-xl border border-room-line bg-room-panel/95 p-4 shadow-lg"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSelectedId(null)}
            className="absolute right-2 top-2 text-room-muted hover:text-room-text"
          >
            ✕
          </button>
          <h3 className="pr-6 font-display text-sm text-room-text">{KIND_LABELS[selected.kind]}</h3>
          <p className="mt-1 text-xs text-room-muted">{selected.label}</p>
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-room-muted">fixed</dt>
              <dd className="text-green-400">{selected.counts.fixed}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-room-muted">flaky</dt>
              <dd className="text-room-red-soft">{selected.counts.flaky}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-room-muted">still failing</dt>
              <dd className="text-room-red-soft">{selected.counts.failing}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-room-muted">level</dt>
              <dd className="text-room-text">{selected.level === 0 ? "scaffolding" : selected.level}</dd>
            </div>
            {selected.learnedAt && (
              <div className="flex justify-between">
                <dt className="text-room-muted">learned</dt>
                <dd className="text-room-text">{new Date(selected.learnedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
          {selected.runId && (
            <a
              href={`/agents/${village.agentId}/owner?run=${encodeURIComponent(selected.runId)}`}
              className="mt-3 block rounded-md border border-room-line bg-room-panel-2 px-2 py-1 text-center text-xs font-semibold text-room-text hover:border-room-red"
            >
              Open attack chat
            </a>
          )}
          {onReplay && (
            <button
              type="button"
              onClick={() => onReplay(selected)}
              className="mt-2 w-full rounded-md bg-room-red px-2 py-1 text-xs font-semibold text-white hover:bg-room-red-soft"
            >
              Replay attack
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
