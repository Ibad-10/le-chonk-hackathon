"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import BattleView from "@/components/BattleView";
import MessageCounter, { useMessageLimit } from "@/components/MessageCounter";
import TimerRing from "@/components/TimerRing";
import { endRun, getAgent, getRoleBrief, startRun, streamMessage } from "@/lib/api";
import { MAX_PLAYER_MESSAGES, TEXT_RUN_SECONDS } from "@/lib/format";
import type { BattleEvent } from "@/lib/battle";
import type { Agent, RoleBrief, RunResult } from "@/lib/types";

interface ChatMessage {
  role: "player" | "agent";
  content: string;
}

function outcomeLabel(result: RunResult): string {
  switch (result.outcome) {
    case "win":
      return "You broke it. The loss is in the owner's logbook.";
    case "block":
    case "timeout":
      return result.helpfulness
        ? "Agent held, but a genuine customer was blocked — helpfulness loss."
        : "The agent held.";
    case "no_contest":
      return "No contest — fewer than 3 messages, no Elo change.";
    case "error":
      return "Run errored — no Elo change.";
    default:
      return "Run ended.";
  }
}

function PlayPageInner({ agentId }: { agentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const practice = searchParams.get("practice") === "1";
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [brief, setBrief] = useState<RoleBrief | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [battleOn, setBattleOn] = useState(false);
  const [battleEvents, setBattleEvents] = useState<BattleEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const limit = useMessageLimit(MAX_PLAYER_MESSAGES);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;

  // playing requires sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    let cancelled = false;
    getAgent(agentId)
      .then((a) => !cancelled && setAgent(a))
      .catch((e) => !cancelled && setError(e.message));
    (async () => {
      const token = isSignedIn ? await getToken() : null;
      if (cancelled) return;
      try {
        const run = await startRun(agentId, {
          channel: "text",
          mode: practice ? "practice" : "arena",
          token,
        });
        if (cancelled) return;
        setRunId(run.run_id);
        getRoleBrief(run.run_id).then((b) => !cancelled && setBrief(b));
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "could not start run");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, isSignedIn, getToken, practice]);

  const finish = useCallback(async () => {
    const id = runIdRef.current;
    if (!id || result) return;
    const token = isSignedIn ? await getToken() : null;
    try {
      setResult(await endRun(id, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not end run");
    }
  }, [getToken, isSignedIn, result]);

  const send = useCallback(async () => {
    const text = draft.trim();
    const id = runIdRef.current;
    if (!text || !id || sending || result) return;
    if (!limit.trySend()) return; // 21st message is blocked by the counter
    setDraft("");
    setSending(true);
    setMessages((m) => [...m, { role: "player", content: text }]);
    setBattleEvents((e) => [...e, { type: "player_message" }]);
    setStreaming("");
    const token = isSignedIn ? await getToken() : null;
    await streamMessage(
      id,
      text,
      {
        onChunk: (piece) => setStreaming((s) => s + piece),
        onDone: (event) => {
          setBattleEvents((e) => [
            ...e,
            { type: "agent_reply", refused: event.tool_events.length === 0 },
            ...event.tool_events
              .filter((t) => t.ok)
              .map(() => ({ type: "tool_executed", risky: true }) as BattleEvent),
            ...(event.ended && event.outcome === "win" ? [{ type: "win" } as BattleEvent] : []),
          ]);
          setStreaming((s) => {
            setMessages((m) => [
              ...m,
              { role: "agent", content: event.reply ?? s },
            ]);
            return "";
          });
          setSending(false);
          if (event.ended) void finish();
        },
        onError: () => setSending(false),
      },
      token
    );
  }, [draft, sending, result, limit, isSignedIn, getToken, finish]);

  if (isLoaded && !isSignedIn) {
    return (
      <p className="p-8 text-room-muted">Redirecting to sign in…</p>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-xl border border-room-line bg-room-panel p-5">
          <h1 className="font-display text-2xl text-room-text">
            {agent?.name ?? agentId}
          </h1>
          <p className="mt-1 text-sm text-room-muted">
            {agent?.stream} stream · v{agent?.current_version} · rating{" "}
            {agent ? Math.round(agent.rating) : "—"}
            {practice && (
              <span className="ml-2 rounded border border-room-line px-1.5 py-0.5 text-xs text-room-muted">
                practice — no Elo
              </span>
            )}
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <TimerRing seconds={TEXT_RUN_SECONDS} onExpire={() => void finish()} />
            <MessageCounter count={limit.count} max={limit.max} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void finish()}
              disabled={!!result}
              className="rounded-md bg-room-red px-4 py-2 text-sm font-semibold text-white hover:bg-room-red-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              End run
            </button>
            <button
              type="button"
              onClick={() => setBattleOn((b) => !b)}
              aria-pressed={battleOn}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                battleOn
                  ? "border-room-red bg-room-red/15 text-room-red-soft"
                  : "border-room-line bg-room-panel-2 text-room-muted hover:text-room-text"
              }`}
            >
              ⚔️ Battle view {battleOn ? "on" : "off"}
            </button>
            <button
              type="button"
              disabled
              title="Voice is being added by a separate builder"
              className="cursor-not-allowed rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-medium text-room-muted"
            >
              📞 Voice coming
            </button>
          </div>
        </div>

        {brief && (
          <div className="rounded-xl border border-room-line bg-room-panel p-5">
            <h2 className="font-display text-sm uppercase tracking-wide text-room-red-soft">
              {brief.role === "scammer" ? "Your mission" : "Your brief"}
            </h2>
            {brief.role === "scammer" ? (
              <div className="mt-2 space-y-2 text-sm text-room-text">
                <p>{brief.mission}</p>
                <p className="text-xs uppercase tracking-wide text-room-muted">
                  Public dossier
                </p>
                <ul className="list-disc space-y-1 pl-4 text-room-muted">
                  {brief.dossier.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-2 space-y-2 text-sm text-room-text">
                <p>{brief.need}</p>
                <p className="text-xs uppercase tracking-wide text-room-muted">
                  Your details (for verification)
                </p>
                <ul className="list-disc space-y-1 pl-4 text-room-muted">
                  {brief.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>

      {battleOn && (
        <div className="lg:col-span-2">
          <BattleView events={battleEvents} />
        </div>
      )}

      <section
        aria-label="Chat"
        className="flex min-h-[60vh] flex-col rounded-xl border border-room-line bg-room-panel"
      >
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.length === 0 && !streaming && (
            <p className="text-sm text-room-muted">
              Say something to {agent?.name ?? "the agent"}…
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === "player"
                  ? "ml-auto bg-room-red text-white"
                  : "mr-auto bg-room-panel-2 text-room-text"
              }`}
            >
              {m.content}
            </div>
          ))}
          {/* ARIA live region for the streamed agent reply */}
          <div aria-live="polite" className="min-h-6">
            {streaming && (
              <div className="mr-auto max-w-[80%] rounded-lg bg-room-panel-2 px-3 py-2 text-sm text-room-text">
                {streaming}
                <span aria-hidden="true">▌</span>
              </div>
            )}
          </div>
        </div>
        <form
          className="flex gap-2 border-t border-room-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <input
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending || !!result || !limit.canSend}
            placeholder={
              limit.canSend ? "Talk them into it…" : "Message limit reached"
            }
            className="flex-1 rounded-md border border-room-line bg-room-bg px-3 py-2 text-sm text-room-text placeholder:text-room-muted"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || !!result || !limit.canSend}
            className="rounded-md bg-room-red px-4 py-2 text-sm font-semibold text-white hover:bg-room-red-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>

      {result && (
        <section
          aria-label="Result"
          className="rounded-xl border border-room-red/70 bg-room-panel p-5 lg:col-span-2"
        >
          <h2 className="font-display text-2xl text-room-text">
            {result.outcome === "win"
              ? "🔴 You broke it"
              : result.outcome === "no_contest"
                ? "No contest"
                : result.helpfulness
                  ? "Helpfulness loss"
                  : "The agent held"}
          </h2>
          <p className="mt-2 text-room-muted">{outcomeLabel(result)}</p>
          <p className="mt-3 font-mono text-sm text-room-text">
            +{result.points} points · Elo{" "}
            {result.elo_delta >= 0 ? "+" : ""}
            {result.elo_delta}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text"
            >
              Back to arena
            </button>
            <Link
              href="/leaderboard"
              className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text"
            >
              Leaderboard
            </Link>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-room-red-soft lg:col-span-2">
          {error}
        </p>
      )}
    </div>
  );
}

export default function PlayPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-room-muted">Loading…</p>}>
      <PlayPageParams params={params} />
    </Suspense>
  );
}

function PlayPageParams({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  return (
    <Suspense fallback={<p className="p-8 text-room-muted">Loading…</p>}>
      <PlayPageInner agentId={agentId} />
    </Suspense>
  );
}
