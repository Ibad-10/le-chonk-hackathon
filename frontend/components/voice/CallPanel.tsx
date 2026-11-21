"use client";

// Live call panel (product decision: the call is LIVE like a phone call —
// no hold-to-talk). The player just talks; the agent hears live, replies by
// voice, and can be interrupted. One round mic button toggles Mute/Unmute
// (aria-pressed, Space toggles, touch works); "End call" ends the run. If the
// WebSocket or mic streaming fails, the hook falls back to push-to-talk
// automatically and the panel shows the hold-to-talk button instead.

import { useLiveCall } from "@/lib/useLiveCall";

function formatClock(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Start the call",
  connecting: "Connecting…",
  live: "Live — just talk",
  muted: "Muted — Space to unmute",
  agentSpeaking: "Speaking… (talk to interrupt)",
  ended: "Call ended",
};

export default function CallPanel({
  agentId = "bank-ava",
  agentName = "Ava",
  getToken,
}: {
  agentId?: string;
  agentName?: string;
  /** Clerk session-token minter; the WS + HTTP voice routes verify it. */
  getToken?: () => string | null | Promise<string | null>;
}) {
  const call = useLiveCall(agentId, agentName, getToken);
  const { status, captions, secondsLeft, error, mode } = call;
  const live = mode === "live";
  const inCall = status !== "idle" && status !== "ended";

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-3 w-3 rounded-full ${
              status === "live" || status === "muted"
                ? "bg-green-500"
                : status === "agentSpeaking"
                  ? "bg-amber-500"
                  : status === "connecting"
                    ? "bg-amber-400"
                    : "bg-zinc-400"
            }`}
          />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {call.agentName}
            {status === "agentSpeaking" ? " is speaking…" : ""}
          </h2>
        </div>
        <span
          data-testid="call-timer"
          className="font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-400"
        >
          {formatClock(secondsLeft)}
        </span>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
        {STATUS_LABEL[status] ?? status}
        {mode === "ptt" ? " (push-to-talk fallback: hold Space)" : ""}
        {error ? ` — ${error}` : ""}
      </p>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
        {captions.length === 0 && (
          <p className="text-sm text-zinc-400">Captions appear here (you and {call.agentName}).</p>
        )}
        {captions.map((c, i) => (
          <p key={i} className="text-sm" data-role={c.role}>
            <span className="font-semibold">{c.role === "player" ? "You" : call.agentName}: </span>
            <span className="text-zinc-700 dark:text-zinc-300">{c.text}</span>
          </p>
        ))}
      </div>

      <div className="flex gap-2">
        {status === "idle" || status === "ended" ? (
          <button
            onClick={call.start}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {status === "ended" ? "Call again" : "Start call"}
          </button>
        ) : live ? (
          <button
            onClick={call.toggleMute}
            aria-pressed={call.muted}
            aria-label={call.muted ? "Unmute" : "Mute"}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white ${
              call.muted ? "bg-zinc-500 hover:bg-zinc-600" : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {call.muted ? "Unmute (Space)" : "Mute (Space)"}
          </button>
        ) : (
          <button
            onMouseDown={call.startRecording}
            onMouseUp={call.stopRecording}
            onMouseLeave={call.stopRecording}
            onTouchStart={call.startRecording}
            onTouchEnd={call.stopRecording}
            className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Hold to talk (Space)
          </button>
        )}
        {inCall && (
          <button
            onClick={call.end}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            End call
          </button>
        )}
      </div>
    </div>
  );
}
