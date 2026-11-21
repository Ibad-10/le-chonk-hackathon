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
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-room-line bg-room-panel p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-3 w-3 rounded-full ${
              status === "live" || status === "muted"
                ? "bg-success"
                : status === "agentSpeaking"
                  ? "bg-agent"
                  : status === "connecting"
                    ? "bg-room-red"
                    : "bg-room-line"
            }`}
          />
          <h2 className="text-lg font-semibold text-room-text">
            {call.agentName}
            {status === "agentSpeaking" ? " is speaking…" : ""}
          </h2>
        </div>
        <span
          data-testid="call-timer"
          className="font-mono text-sm tabular-nums text-room-muted"
        >
          {formatClock(secondsLeft)}
        </span>
      </div>

      <p className="text-sm text-room-muted" role="status">
        {STATUS_LABEL[status] ?? status}
        {mode === "ptt" ? " (push-to-talk fallback: hold Space)" : ""}
        {error ? ` — ${error}` : ""}
      </p>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg bg-room-panel-2 p-3">
        {captions.length === 0 && (
          <p className="text-sm text-room-muted">Captions appear here (you and {call.agentName}).</p>
        )}
        {captions.map((c, i) => (
          <p key={i} className="text-sm" data-role={c.role}>
            <span className="font-semibold">{c.role === "player" ? "You" : call.agentName}: </span>
            <span className="text-room-text">{c.text}</span>
          </p>
        ))}
      </div>

      <div className="flex gap-2">
        {status === "idle" || status === "ended" ? (
          <button
            onClick={call.start}
            className="rounded-lg bg-room-red px-4 py-2 text-sm font-semibold text-room-bg hover:bg-room-red-soft"
          >
            {status === "ended" ? "Call again" : "Start call"}
          </button>
        ) : live ? (
          <button
            onClick={call.toggleMute}
            aria-pressed={call.muted}
            aria-label={call.muted ? "Unmute" : "Mute"}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold ${
              call.muted ? "bg-room-panel-2 text-room-text hover:bg-room-line" : "bg-room-red text-room-bg hover:bg-room-red-soft"
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
            className="flex-1 rounded-lg bg-room-red px-4 py-3 text-sm font-semibold text-room-bg"
          >
            Hold to talk (Space)
          </button>
        )}
        {inCall && (
          <button
            onClick={call.end}
            className="rounded-lg border border-danger/60 px-4 py-2 text-sm text-danger-soft hover:bg-danger-bg"
          >
            End call
          </button>
        )}
      </div>
    </div>
  );
}
