"use client";

import { useEffect, useState } from "react";

import RankBadge from "@/components/RankBadge";
import { getAgentLeaderboard, getPlayersLeaderboard } from "@/lib/api";
import { getRanks, type Rank } from "@/lib/challengeApi";

import { STREAMS, type AgentLeaderboardEntry, type PlayerLeaderboardEntry, type Stream } from "@/lib/types";

type Tab = "players" | "agents";

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("players");
  const [stream, setStream] = useState<Stream>("banking");
  const [players, setPlayers] = useState<PlayerLeaderboardEntry[] | null>(null);
  const [agents, setAgents] = useState<AgentLeaderboardEntry[] | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);

  useEffect(() => {
    getPlayersLeaderboard().then(setPlayers).catch(() => setPlayers([]));
    // Rank badges are optional: on failure the list simply shows no badges.
    getRanks().then(setRanks).catch(() => setRanks([]));
  }, []);

  useEffect(() => {
    setAgents(null);
    getAgentLeaderboard(stream).then(setAgents).catch(() => setAgents([]));
  }, [stream]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Rankings</p>
      <h1 className="mt-1 font-display text-4xl text-room-text">Leaderboard</h1>

      <div role="tablist" aria-label="Leaderboard type" className="mt-6 flex gap-2">
        {(
          [
            ["players", "Players"],
            ["agents", "Agents"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "bg-room-red text-room-bg"
                : "border border-room-line bg-room-panel text-room-muted hover:text-room-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "agents" && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Stream filter">
          {STREAMS.map((s) => (
            <button
              key={s}
              onClick={() => setStream(s)}
              aria-pressed={stream === s}
              className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                stream === s
                  ? "border-room-red bg-room-red/15 text-room-red-soft"
                  : "border-room-line text-room-muted hover:text-room-text"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {tab === "players" && !players && <p className="mt-6 text-room-muted">Loading…</p>}
      {tab === "agents" && !agents && <p className="mt-6 text-room-muted">Loading…</p>}

      {tab === "players" && players && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-room-line bg-room-panel">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-room-line text-xs uppercase tracking-wider text-room-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Wins</th>
              <th className="px-4 py-3">Points</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.player_id} className="border-b border-room-line/50 last:border-0 hover:bg-room-panel-2">
                <td className="px-4 py-3 font-mono text-room-muted">{i + 1}</td>
                <td className="px-4 py-3 text-room-text">
                  <div className="flex items-center gap-3">
                    <span>{p.name}</span>
                    {typeof p.xp === "number" && ranks.length > 0 && (
                      <RankBadge xp={p.xp} ranks={ranks} />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-room-text">{p.rating}</td>
                <td className="px-4 py-3 font-mono text-room-text">{p.wins}</td>
                <td className="px-4 py-3 font-mono text-room-text">{p.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {tab === "agents" && agents && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-room-line bg-room-panel">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-room-line text-xs uppercase tracking-wider text-room-muted">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Version</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.id} className="border-b border-room-line/50 last:border-0 hover:bg-room-panel-2">
                <td className="px-4 py-3 font-mono text-room-muted">{i + 1}</td>
                <td className="px-4 py-3 text-room-text">{a.name}</td>
                <td className="px-4 py-3 font-mono text-room-text">
                  {Math.round(a.rating)} ±{Math.round(a.rating_deviation)}
                </td>
                <td className="px-4 py-3 font-mono text-room-text">
                  {a.grade ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-room-text">v{a.current_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
