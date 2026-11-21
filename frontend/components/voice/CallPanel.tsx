"use client";

// V4-10 call panel: hold Space (or the button) to talk to the agent.
// Shows both sides' captions, the call timer (voice limit 300 s) and
// "Ava is thinking…" while the agent turn runs (nothing plays then).

import { useVoiceCall } from "@/lib/useVoiceCall";

function formatClock(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Start the call",
  connecting: "Connecting…",
  ready: "Hold Space to talk",
  recording: "Recording… release Space to send",
  thinking: "is thinking…",
  speaking: "Speaking…",
  ended: "Call ended",
};

export default function CallPanel({ agentId = "bank-ava" }: { agentId?: string }) {
  const call = useVoiceCall(agentId, "Ava");
  const { status, captions, secondsLeft, error } = call;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-3 w-3 rounded-full ${
              status === "recording"
                ? "bg-red-500"
                : status === "thinking" || status === "speaking"
                  ? "bg-amber-500"
                  : status === "ready"
                    ? "bg-green-500"
                    : "bg-zinc-400"
            }`}
          />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {call.agentName}
            {status === "thinking" ? " is thinking…" : ""}
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
        {STATUS_LABEL[status]}
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
        ) : (
          <button
            onMouseDown={call.startRecording}
            onMouseUp={call.stopRecording}
            onMouseLeave={call.stopRecording}
            disabled={status !== "ready" && status !== "recording"}
            className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {status === "recording" ? "Release to send" : "Hold to talk (Space)"}
          </button>
        )}
        {status !== "idle" && status !== "ended" && (
          <button
            onClick={call.end}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Hang up
          </button>
        )}
      </div>
    </div>
  );
}
