"use client";

import { useEffect, useState } from "react";

import { getAgentLeaderboard, getPlayersLeaderboard } from "@/lib/api";

import { STREAMS, type AgentLeaderboardEntry, type PlayerLeaderboardEntry, type Stream } from "@/lib/types";

type Tab = "players" | "agents";

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("players");
  const [stream, setStream] = useState<Stream>("banking");
  const [players, setPlayers] = useState<PlayerLeaderboardEntry[] | null>(null);
  const [agents, setAgents] = useState<AgentLeaderboardEntry[] | null>(null);

  useEffect(() => {
    getPlayersLeaderboard().then(setPlayers).catch(() => setPlayers([]));
  }, []);

  useEffect(() => {
    setAgents(null);
    getAgentLeaderboard(stream).then(setAgents).catch(() => setAgents([]));
  }, [stream]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl text-room-text sm:text-4xl">
        Leaderboard
      </h1>

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
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
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
        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-room-line text-room-muted">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">Rating</th>
              <th className="py-2 pr-4">Wins</th>
              <th className="py-2">Points</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.player_id} className="border-b border-room-line/50">
                <td className="py-2 pr-4 font-mono text-room-muted">{i + 1}</td>
                <td className="py-2 pr-4 text-room-text">{p.name}</td>
                <td className="py-2 pr-4 font-mono text-room-text">{p.rating}</td>
                <td className="py-2 pr-4 font-mono text-room-text">{p.wins}</td>
                <td className="py-2 font-mono text-room-text">{p.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "agents" && agents && (
        <table className="mt-6 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-room-line text-room-muted">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">Rating</th>
              <th className="py-2 pr-4">Grade</th>
              <th className="py-2">Version</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.id} className="border-b border-room-line/50">
                <td className="py-2 pr-4 font-mono text-room-muted">{i + 1}</td>
                <td className="py-2 pr-4 text-room-text">{a.name}</td>
                <td className="py-2 pr-4 font-mono text-room-text">
                  {Math.round(a.rating)} ±{Math.round(a.rating_deviation)}
                </td>
                <td className="py-2 pr-4 font-mono text-room-text">
                  {a.grade ?? "—"}
                </td>
                <td className="py-2 font-mono text-room-text">v{a.current_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
