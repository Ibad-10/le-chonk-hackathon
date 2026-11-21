"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import Siege from "@/components/Siege";
import CallPanel from "@/components/voice/CallPanel";
import { usePrefersReducedMotion } from "@/components/base/usePrefersReducedMotion";
import MessageCounter, { useMessageLimit } from "@/components/MessageCounter";
import TimerRing from "@/components/TimerRing";
import { endRun, getAgent, getRoleBrief, startRun, streamMessage } from "@/lib/api";

import {
  causeFamilyOf,
  endBanner,
  isPoliteDecline,
  toolEventToBaseEvent,
  type BaseEvent,
} from "@/lib/base";
import { MAX_PLAYER_MESSAGES, TEXT_RUN_SECONDS, secondsUntil } from "@/lib/format";
import { isReadTool, isRiskyTool, type SiegeEvent } from "@/lib/siege";
import type { Agent, RoleBrief, RunResult } from "@/lib/types";

// three.js needs the DOM — no SSR.
const LiveBase = dynamic(() => import("@/components/base/LiveBase"), {
  ssr: false,
  loading: () => <p className="p-8 text-room-muted">Raising the base…</p>,
});

type PlayView = "base" | "siege" | "chat";

/** WebGL available? (the 3D base needs it; Siege is the lightweight fallback) */
function webglAvailable(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

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
  // Base (3D) is the default view; Siege is the lightweight view and the
  // automatic fallback when WebGL is unavailable or reduced motion is set.
  const [view, setView] = useState<PlayView>("base");
  const reducedMotion = usePrefersReducedMotion();
  const [baseEvents, setBaseEvents] = useState<BaseEvent[]>([]);
  const [siegeEvents, setSiegeEvents] = useState<SiegeEvent[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(TEXT_RUN_SECONDS);
  const cooldownSentRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const limit = useMessageLimit(MAX_PLAYER_MESSAGES);
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;

  // end-of-run banner for the base (stars / conquest / defended / treaty / helped)
  const baseBanner = useMemo(
    () => (result ? endBanner(baseEvents, { role: brief?.role, outcome: result.outcome }) : null),
    [result, baseEvents, brief]
  );

  // playing requires sign-in
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  // automatic fallback: no WebGL or prefers-reduced-motion -> lightweight Siege
  useEffect(() => {
    if (reducedMotion || !webglAvailable()) {
      setView((v) => (v === "base" ? "siege" : v));
    }
  }, [reducedMotion]);

  // HUD clock (the TimerRing keeps its own ring; this feeds the siege HUD)
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // agent in cooldown -> the fortress shows scaffolding in the siege
  useEffect(() => {
    if (!agent?.cooldown_until || cooldownSentRef.current) return;
    const left = secondsUntil(agent.cooldown_until);
    if (left <= 0) return;
    cooldownSentRef.current = true;
    setSiegeEvents((e) => [...e, { type: "cooldown", secondsLeft: Math.round(left) }]);
  }, [agent]);

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
      const res = await endRun(id, token);
      setResult(res);
      // runEnded drives the base (stars / conquest / "Base defended" screen)
      setBaseEvents((e) => [
        ...e,
        { type: "runEnded", outcome: res.outcome, role: brief?.role, helpfulness: res.helpfulness },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not end run");
    }
  }, [getToken, isSignedIn, result, brief]);

  const send = useCallback(async () => {
    const text = draft.trim();
    const id = runIdRef.current;
    if (!text || !id || sending || result) return;
    if (!limit.trySend()) return; // 21st message is blocked by the counter
    setDraft("");
    setSending(true);
    setMessages((m) => [...m, { role: "player", content: text }]);
    // live base: a troop squad spawns immediately and marches at its target
    setBaseEvents((e) => [
      ...e,
      { type: "playerMessage", text, tactic: causeFamilyOf(text) },
    ]);
    // tactic comes from the run's tactic/persona field when the backend
    // provides it; until then the siege falls back to a keyword heuristic
    setSiegeEvents((e) => [...e, { type: "playerMessage", text, tactic: null }]);
    setStreaming("");
    const token = isSignedIn ? await getToken() : null;
    await streamMessage(
      id,
      text,
      {
        onChunk: (piece) => setStreaming((s) => s + piece),
        onDone: (event) => {
          // live base beats: envoy / sent back / defeated, read tools, risky tools
          setBaseEvents((e) => [
            ...e,
            {
              type: "agentReply",
              text: event.reply ?? "",
              refused: event.tool_events.length === 0,
              polite: isPoliteDecline(event.reply),
            },
            ...event.tool_events
              .map(toolEventToBaseEvent)
              .filter((b): b is BaseEvent => b !== null),
          ]);
          const okTools = event.tool_events.filter((t) => t.ok);
          const toolEvents: SiegeEvent[] = okTools.map((t): SiegeEvent | null =>
            isRiskyTool(t.call.name, t.call.args)
              ? { type: "riskyToolExecuted", tool: t.call.name }
              : isReadTool(t.call.name)
                ? { type: "readToolRan", tool: t.call.name }
                : null
          ).filter((x): x is SiegeEvent => x !== null);
          setSiegeEvents((e) => [
            ...e,
            {
              type: "agentReply",
              text: event.reply ?? "",
              refused: okTools.length === 0,
            },
            ...toolEvents,
            ...(event.ended
              ? [{ type: "runEnded", outcome: event.outcome ?? "block" } as SiegeEvent]
              : []),
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

  const viewButton = (v: PlayView, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
        view === v
          ? "border-room-red bg-room-red/15 text-room-red-soft"
          : "border-room-line bg-room-panel-2 text-room-muted hover:text-room-text"
      }`}
    >
      {label} {view === v ? "on" : "off"}
    </button>
  );

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
            <div className="flex gap-2" role="group" aria-label="View">
              {viewButton("base", "🏰 Base")}
              {viewButton("siege", "⚔️ Siege")}
              {viewButton("chat", "💬 Chat")}
            </div>
          </div>
        </div>

        <CallPanel
          agentId={agentId}
          agentName={agent?.name ?? "the agent"}
          getToken={isSignedIn ? getToken : undefined}
        />

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

      {view === "siege" && (
        <div className="lg:col-span-2">
          <Siege
            events={siegeEvents}
            messagesRemaining={limit.remaining}
            maxMessages={limit.max}
            secondsLeft={secondsLeft}
          />
        </div>
      )}

      <div className={view === "base" ? "relative lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-4" : ""}>
        {view === "base" && (
          <LiveBase
            agentId={agentId}
            stream={agent?.stream ?? "banking"}
            events={baseEvents}
            height="58vh"
          />
        )}

      <section
        aria-label="Chat"
        className={`flex flex-col rounded-xl border border-room-line bg-room-panel ${
          view === "base"
            ? "min-h-[38vh] max-lg:absolute max-lg:inset-x-2 max-lg:bottom-2 max-lg:max-h-[52%] max-lg:bg-room-panel/95 max-lg:shadow-xl"
            : "min-h-[60vh]"
        }`}
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
      </div>

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
          {baseBanner && (
            <div className="mt-3 flex items-center gap-3">
              {baseBanner.stars !== null && (
                <span
                  className="font-display text-3xl tracking-widest text-room-red-soft"
                  aria-label={`${baseBanner.stars} stars`}
                >
                  {"★".repeat(baseBanner.stars)}
                  <span className="text-room-line">{"★".repeat(3 - baseBanner.stars)}</span>
                </span>
              )}
              <span className="text-sm font-semibold text-room-text">{baseBanner.label}</span>
            </div>
          )}
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
