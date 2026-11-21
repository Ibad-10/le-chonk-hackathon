"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import {
  getAgentLeaderboard,
  getArenaEvents,
  getNowPlaying,
} from "@/lib/api";

import {
  WALL_POLL_MS,
  WALL_ROTATION_MS,
  WALL_VIEW_LABELS,
  WALL_VIEWS,
  formatArenaEvent,
  nextWallView,
  type WallView,
} from "@/lib/arena-wall";

import { STREAMS } from "@/lib/types";

import type { AgentLeaderboardEntry, ArenaEvent, NowPlayingCard } from "@/lib/types";

// three.js needs the DOM — no SSR.
const SpectatorBase = dynamic(() => import("@/components/base/SpectatorBase"), {
  ssr: false,
});

/**
 * Arena wall — full-screen projector view. Rotates every WALL_ROTATION_MS
 * between the live event ticker, the agent leaderboard and "now playing"
 * cards (opted-in calls, captions only — each card also shows the same live
 * base the player sees). Polls the public endpoints every WALL_POLL_MS.
 */
export default function ArenaWall() {
  const [view, setView] = useState<WallView>(WALL_VIEWS[0]);
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [agents, setAgents] = useState<AgentLeaderboardEntry[]>([]);
  const [playing, setPlaying] = useState<NowPlayingCard[]>([]);

  // now-playing cards carry the agent name; the leaderboard gives name -> id
  const agentIds = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.name, a.id])),
    [agents]
  );

  // poll public endpoints every 5 s
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getArenaEvents().then((e) => !cancelled && setEvents(e)).catch(() => {});
      getNowPlaying().then((p) => !cancelled && setPlaying(p)).catch(() => {});
      Promise.all(STREAMS.map((s) => getAgentLeaderboard(s)))
        .then((lists) => {
          if (cancelled) return;
          setAgents(
            lists.flat().sort((a, b) => b.rating - a.rating)
          );
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, WALL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // rotate panels every 15 s
  useEffect(() => {
    const id = setInterval(() => setView((v) => nextWallView(v)), WALL_ROTATION_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      aria-label="Arena wall"
      className="fixed inset-0 z-[5] flex flex-col overflow-hidden bg-room-bg px-8 py-6 text-room-text sm:px-16 sm:py-10"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl tracking-wide sm:text-4xl">
          RED<span className="text-room-red"> ROOM</span>{" "}
          <span className="text-room-muted">— arena wall</span>
        </h1>
        <div role="tablist" aria-label="Wall view" className="flex gap-2">
          {WALL_VIEWS.map((v) => (
            <span
              key={v}
              role="tab"
              aria-selected={view === v}
              className={`h-2.5 w-2.5 rounded-full ${
                view === v ? "bg-room-red" : "bg-room-line"
              }`}
            />
          ))}
        </div>
      </header>

      <p className="mt-1 text-sm uppercase tracking-widest text-room-muted">
        {WALL_VIEW_LABELS[view]}
      </p>

      <div className="mt-6 flex-1 overflow-hidden">
        {view === "ticker" && (
          <ul aria-label="Live ticker" className="space-y-4 overflow-y-auto">
            {events.length === 0 && (
              <li className="text-xl text-room-muted">Waiting for events…</li>
            )}
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-baseline gap-4 border-b border-room-line/60 pb-4"
              >
                <span aria-hidden="true" className="text-2xl">
                  {ev.kind === "agent_broken" ? "🔴" : "📦"}
                </span>
                <span className="font-display text-2xl sm:text-4xl">
                  {formatArenaEvent(ev)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {view === "leaderboard" && (
          <table aria-label="Agent leaderboard" className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-room-line text-room-muted">
                <th className="py-3 pr-6 text-sm uppercase tracking-wide">#</th>
                <th className="py-3 pr-6 text-sm uppercase tracking-wide">Agent</th>
                <th className="py-3 pr-6 text-sm uppercase tracking-wide">Stream</th>
                <th className="py-3 pr-6 text-sm uppercase tracking-wide">Rating</th>
                <th className="py-3 pr-6 text-sm uppercase tracking-wide">Grade</th>
                <th className="py-3 text-sm uppercase tracking-wide">Version</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr key={a.id} className="border-b border-room-line/50">
                  <td className="py-3 pr-6 font-mono text-room-muted">{i + 1}</td>
                  <td className="py-3 pr-6 font-display text-xl sm:text-2xl">{a.name}</td>
                  <td className="py-3 pr-6 text-room-muted">{a.stream}</td>
                  <td className="py-3 pr-6 font-mono text-lg">
                    {Math.round(a.rating)}
                    <span className="text-room-muted"> ±{Math.round(a.rating_deviation)}</span>
                  </td>
                  <td className="py-3 pr-6 font-mono text-lg">{a.grade ?? "—"}</td>
                  <td className="py-3 font-mono text-lg">v{a.current_version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === "now_playing" && (
          <div aria-label="Now playing" className="grid h-full grid-cols-1 gap-6 overflow-y-auto sm:grid-cols-2">
            {playing.length === 0 && (
              <p className="text-xl text-room-muted">No live calls right now.</p>
            )}
            {playing.map((c) => (
              <article
                key={c.run_id}
                className="flex flex-col rounded-2xl border border-room-line bg-room-panel p-6"
              >
                <h2 className="font-display text-2xl">
                  vs {c.agent_name}{" "}
                  <span className="text-sm font-sans text-room-muted">{c.stream} stream</span>
                </h2>
                <ul className="mt-4 space-y-2">
                  {c.captions.map((cap, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-room-panel-2 px-3 py-2 text-lg text-room-text"
                    >
                      {cap}
                    </li>
                  ))}
                </ul>
                {agentIds[c.agent_name] && (
                  <div className="mt-4">
                    <SpectatorBase
                      agentId={agentIds[c.agent_name]}
                      stream={c.stream}
                      captions={c.captions}
                      height="34vh"
                    />
                  </div>
                )}
                <p className="mt-auto pt-4 text-xs uppercase tracking-wide text-room-muted">
                  captions only — player opted in
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
