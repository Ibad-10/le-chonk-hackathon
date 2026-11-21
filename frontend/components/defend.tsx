"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Hammer, ScrollText, ShieldAlert, Sparkles } from "lucide-react";

import type { Logbook } from "@/lib/types";

/**
 * "While you were away": on opening the owner page, a dialog lists the raids
 * that broke the agent (open logbook groups). Shown once per browser session.
 */
export function WhileAwayDialog({ agentId, agentName, logbook }: { agentId: string; agentName: string; logbook: Logbook }) {
  const raids = logbook.groups.reduce((n, g) => n + g.count, 0);
  const key = `redroom.away.${agentId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (raids === 0) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
    } catch {
      // storage blocked: show it anyway
    }
    if (!seen) setOpen(true);
  }, [key, raids]);

  const close = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;
  const top = [...logbook.groups].sort((a, b) => b.count - a.count).slice(0, 3);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="away-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-room-bg/75 p-4 backdrop-blur-sm"
    >
      <div className="raid-pop w-full max-w-md overflow-hidden rounded-2xl border border-room-line bg-room-panel shadow-2xl">
        <div className="bg-danger-bg px-6 py-5 text-center">
          <ShieldAlert size={40} aria-hidden="true" className="mx-auto text-danger" />
          <h2 id="away-title" className="mt-2 font-display text-4xl text-room-text">
            While you were away
          </h2>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-center text-room-text">
            <span className="font-semibold">{agentName}</span> was broken{" "}
            <span className="font-mono text-2xl font-bold text-danger-soft">{raids}</span> time{raids === 1 ? "" : "s"}.
          </p>
          <ul className="space-y-2">
            {top.map((g) => (
              <li key={g.root_cause} className="flex items-start justify-between gap-3 rounded-lg bg-room-panel-2 px-3 py-2 text-sm">
                <span className="text-room-text">{g.root_cause}</span>
                <span className="shrink-0 font-mono font-bold text-danger-soft">x{g.count}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <a
              href="#reports"
              onClick={close}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-room-red px-4 py-3 text-sm font-bold text-room-bg hover:bg-room-red-soft"
            >
              <ScrollText size={16} aria-hidden="true" /> Raid reports
            </a>
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-lg border border-room-line bg-room-panel-2 px-4 py-3 text-sm font-semibold text-room-text hover:border-room-red/70"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { href: "#reports", label: "Raid reports", icon: ScrollText },
  { href: "#repair", label: "Repair", icon: Hammer },
  { href: "#test", label: "Test", icon: FlaskConical },
  { href: "#upgrade", label: "Upgrade", icon: Sparkles },
];

/** The defend loop as a step bar: read the raid reports, repair, test, upgrade. */
export function DefendSteps() {
  return (
    <nav
      aria-label="Defend steps"
      className="sticky top-2 z-10 grid grid-cols-4 gap-1 rounded-xl border border-room-line bg-room-panel/90 p-1 backdrop-blur"
    >
      {STEPS.map(({ href, label, icon: Icon }, i) => (
        <a
          key={href}
          href={href}
          className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-center text-xs font-semibold text-room-muted hover:bg-room-panel-2 hover:text-room-text sm:flex-row sm:justify-center sm:gap-2 sm:text-sm"
        >
          <span className="grid size-5 place-items-center rounded-full bg-room-panel-2 font-mono text-[11px] text-room-red">{i + 1}</span>
          <Icon size={15} aria-hidden="true" className="hidden sm:block" />
          {label}
        </a>
      ))}
    </nav>
  );
}
