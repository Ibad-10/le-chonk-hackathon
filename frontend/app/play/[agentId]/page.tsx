"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ChevronDown, Flag, MessageSquare, Phone, ScrollText, Send } from "lucide-react";

import Siege from "@/components/Siege";
import { BreachMeter, MessagePips, RaidResult, breachPercent } from "@/components/raid";
import CallPanel from "@/components/voice/CallPanel";
import { usePrefersReducedMotion } from "@/components/base/usePrefersReducedMotion";
import { useMessageLimit } from "@/components/MessageCounter";
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

type PlayView = "base" | "siege";

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
  const practice = searchParams.get("practice") === "1" || searchParams.get("mode") === "practice";
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
  const [channel, setChannel] = useState<"chat" | "call">("chat");
  const reducedMotion = usePrefersReducedMotion();
  const [baseEvents, setBaseEvents] = useState<BaseEvent[]>([]);
  const [siegeEvents, setSiegeEvents] = useState<SiegeEvent[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(TEXT_RUN_SECONDS);
  const cooldownSentRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const limit = useMessageLimit(MAX_PLAYER_MESSAGES);
  const runIdRef = useRef<string | null>(null);
  const streamedRef = useRef("");
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
        // the dealt role comes back with the run; the GET route is only a mock fallback
        if (run.brief) setBrief(run.brief);
        else getRoleBrief(run.run_id).then((b) => !cancelled && setBrief(b));
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
    streamedRef.current = "";
    const token = isSignedIn ? await getToken() : null;
    await streamMessage(
      id,
      text,
      {
        onChunk: (piece) => {
          streamedRef.current += piece;
          setStreaming(streamedRef.current);
        },
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
          // append outside the state updater: updaters run twice in dev (StrictMode)
          const reply = event.reply ?? streamedRef.current;
          setMessages((m) => [...m, { role: "agent", content: reply }]);
          setStreaming("");
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

  const breach = breachPercent(baseEvents);
  const missionTitle = brief?.role === "genuine" ? "Your brief" : "Your mission";

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-room-bg">
      {/* the stage: 3D village, or the 2D Siege when WebGL / motion is unavailable */}
      <div className="absolute inset-x-0 bottom-[44%] top-0 lg:bottom-0 lg:right-[410px]">
        {view === "base" ? (
          <LiveBase
            agentId={agentId}
            stream={agent?.stream ?? "banking"}
            events={baseEvents}
            height="100%"
          />
        ) : (
          <div className="h-full overflow-auto px-3 pb-4 pt-28">
            <Siege
              events={siegeEvents}
              messagesRemaining={limit.remaining}
              maxMessages={limit.max}
              secondsLeft={secondsLeft}
            />
          </div>
        )}
      </div>

      {/* HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-room-line bg-room-panel/90 px-3 py-2 shadow-lg backdrop-blur sm:gap-4 sm:px-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-room-muted">
              {practice ? "Practice raid" : "Raiding"}
            </p>
            <h1 className="font-display text-2xl leading-none text-room-text sm:text-3xl">
              {agent?.name ?? agentId}
            </h1>
            <p className="mt-1 font-mono text-xs text-room-muted">
              {agent?.stream ?? "…"} · v{agent?.current_version ?? "?"} · {agent ? Math.round(agent.rating) : "—"} Elo
            </p>
          </div>
          <TimerRing seconds={TEXT_RUN_SECONDS} onExpire={() => void finish()} />
        </div>
        <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-room-line bg-room-panel/90 px-3 py-2 shadow-lg backdrop-blur sm:gap-5 sm:px-4">
          <BreachMeter events={baseEvents} />
          <div className="hidden sm:block">
            <MessagePips used={limit.count} max={limit.max} />
          </div>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={!!result}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/60 px-3 py-2 text-sm font-semibold text-danger-soft hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Flag size={16} aria-hidden="true" /> End raid
          </button>
        </div>
      </header>

      {/* comms: chat or voice call; right column on desktop, bottom sheet on phones */}
      <section
        aria-label="Comms"
        className="absolute inset-x-2 bottom-2 z-20 flex max-h-[46%] flex-col overflow-hidden rounded-xl border border-room-line bg-room-panel/95 shadow-2xl backdrop-blur lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-32 lg:max-h-none lg:w-[390px]"
      >
        {brief && (
          <details open={messages.length === 0} className="group border-b border-room-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-room-red-soft">
                <ScrollText size={14} aria-hidden="true" /> {missionTitle}
              </span>
              <ChevronDown size={16} aria-hidden="true" className="text-room-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="max-h-48 space-y-2 overflow-y-auto px-4 pb-3 text-sm text-room-text">
              <p>{brief.role === "scammer" ? brief.mission : brief.need}</p>
              <p className="text-[11px] uppercase tracking-wider text-room-muted">
                {brief.role === "scammer" ? "Public dossier" : "Your details (for verification)"}
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-room-muted">
                {(brief.role === "scammer" ? brief.dossier : brief.details).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </details>
        )}

        <div className="flex gap-1 border-b border-room-line p-1.5" role="tablist" aria-label="Channel">
          {(["chat", "call"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={channel === c}
              onClick={() => setChannel(c)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${
                channel === c ? "bg-room-panel-2 text-room-text" : "text-room-muted hover:text-room-text"
              }`}
            >
              {c === "chat" ? <MessageSquare size={15} aria-hidden="true" /> : <Phone size={15} aria-hidden="true" />}
              {c === "chat" ? "Chat" : "Call"}
            </button>
          ))}
        </div>

        {channel === "call" ? (
          <div className="overflow-y-auto p-3 [&>div]:max-w-none">
            <CallPanel
              agentId={agentId}
              agentName={agent?.name ?? "the agent"}
              getToken={isSignedIn ? getToken : undefined}
            />
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
              {messages.length === 0 && !streaming && (
                <p className="text-sm text-room-muted">
                  Every message sends a troop at the base. Talk {agent?.name ?? "the agent"} into it.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "player"
                      ? "ml-auto rounded-br-sm bg-room-red text-room-bg"
                      : "mr-auto rounded-bl-sm bg-room-panel-2 text-room-text"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {/* ARIA live region for the streamed agent reply */}
              <div aria-live="polite" className="min-h-6">
                {streaming && (
                  <div className="mr-auto max-w-[85%] rounded-xl rounded-bl-sm bg-room-panel-2 px-3 py-2 text-sm text-room-text">
                    {streaming}
                    <span aria-hidden="true" className="animate-pulse">|</span>
                  </div>
                )}
              </div>
            </div>
            <form
              className="flex gap-2 border-t border-room-line p-2.5"
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
                placeholder={limit.canSend ? "Talk them into it…" : "Message limit reached"}
                className="min-w-0 flex-1 rounded-lg border border-room-line bg-room-bg px-3 py-2.5 text-sm text-room-text placeholder:text-room-muted focus:border-room-red/70"
              />
              <button
                type="submit"
                aria-label="Send troop"
                disabled={sending || !draft.trim() || !!result || !limit.canSend}
                className="inline-flex items-center gap-1.5 rounded-lg bg-room-red px-4 py-2.5 text-sm font-bold text-room-bg hover:bg-room-red-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </section>

      {result && (
        <RaidResult
          banner={baseBanner}
          result={result}
          breach={breach}
          detail={outcomeLabel(result)}
          onPlayAgain={() => window.location.reload()}
        />
      )}
      {error && (
        <p role="alert" className="absolute bottom-3 left-3 z-30 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-soft">
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
