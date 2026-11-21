"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      className="fixed inset-0 z-[5] flex flex-col overflow-hidden bg-room-bg px-4 py-6 text-foreground sm:px-16 sm:py-10"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl tracking-wide sm:text-4xl">
          RED<span className="text-primary"> ROOM</span>{" "}
          <span className="text-muted-foreground">: arena wall</span>
        </h1>
        <div
          role="img"
          aria-label={`Panel ${WALL_VIEWS.indexOf(view) + 1} of ${WALL_VIEWS.length}`}
          className="flex gap-2"
        >
          {WALL_VIEWS.map((v) => (
            <span
              key={v}
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${
                view === v ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      </header>

      <p aria-live="off" className="mt-2 text-sm uppercase tracking-widest text-muted-foreground">
        {WALL_VIEW_LABELS[view]}
      </p>

      <div className="mt-6 flex-1 overflow-hidden">
        {view === "ticker" && (
          <ul aria-label="Live ticker" className="space-y-4 overflow-y-auto">
            {events.length === 0 && (
              <li role="status" aria-live="polite">
                <Skeleton className="h-10 w-full" />
                <span className="sr-only">Waiting for events…</span>
              </li>
            )}
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-baseline gap-4 border-b border-room-line/60 pb-4"
              >
                {ev.kind === "agent_broken" ? (
                  <ShieldAlert size={28} aria-hidden="true" className="shrink-0 self-center text-danger" />
                ) : (
                  <ShieldCheck size={28} aria-hidden="true" className="shrink-0 self-center text-agent" />
                )}
                <span className="font-display text-2xl sm:text-4xl">
                  {formatArenaEvent(ev)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {view === "leaderboard" && (
          <Table aria-label="Agent leaderboard" className="text-left">
            <TableHeader>
              <TableRow className="border-border text-muted-foreground">
                <TableHead className="text-sm uppercase tracking-wide">#</TableHead>
                <TableHead className="text-sm uppercase tracking-wide">Agent</TableHead>
                <TableHead className="text-sm uppercase tracking-wide">Stream</TableHead>
                <TableHead className="text-sm uppercase tracking-wide">Rating</TableHead>
                <TableHead className="text-sm uppercase tracking-wide">Grade</TableHead>
                <TableHead className="text-sm uppercase tracking-wide">Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a, i) => (
                <TableRow key={a.id} className="border-border/60">
                  <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-display text-xl sm:text-2xl">{a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.stream}</TableCell>
                  <TableCell className="font-mono text-lg">
                    {Math.round(a.rating)}
                    <span className="text-muted-foreground"> ±{Math.round(a.rating_deviation)}</span>
                  </TableCell>
                  <TableCell className="font-mono text-lg">{a.grade ?? "—"}</TableCell>
                  <TableCell className="font-mono text-lg">v{a.current_version}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {view === "now_playing" && (
          <div aria-label="Now playing" className="grid h-full grid-cols-1 gap-6 overflow-y-auto sm:grid-cols-2">
            {playing.length === 0 && (
              <p className="text-xl text-muted-foreground">No live calls right now.</p>
            )}
            {playing.map((c) => (
              <Card
                key={c.run_id}
                className="flex flex-col gap-0 p-6"
              >
                <h2 className="font-display text-2xl">
                  vs {c.agent_name}{" "}
                  <span className="text-sm font-sans text-muted-foreground">{c.stream} stream</span>
                </h2>
                <ul className="mt-4 space-y-2">
                  {c.captions.map((cap, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-secondary px-3 py-2 text-lg text-foreground"
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
                <p className="mt-auto pt-4 text-xs uppercase tracking-wide text-muted-foreground">
                  captions only — player opted in
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
