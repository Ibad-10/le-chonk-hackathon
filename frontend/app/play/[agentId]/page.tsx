"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { motion } from "motion/react";
import { toast } from "sonner";

import Siege from "@/components/Siege";
import { RaidResult, breachPercent } from "@/components/raid";
import { usePrefersReducedMotion } from "@/components/base/usePrefersReducedMotion";
import { useMessageLimit } from "@/components/MessageCounter";
import CommsPanel, { type Channel } from "@/components/play/CommsPanel";
import CommsSheet from "@/components/play/CommsSheet";
import HudBar from "@/components/play/HudBar";
import type { ChatMessage } from "@/components/play/ChatPanel";
import { Toaster } from "@/components/ui/sonner";
import { endRun, getAgent, getRoleBrief, startRun, streamMessage } from "@/lib/api";

import {
  causeFamilyOf,
  endBanner,
  isPoliteDecline,
  toolEventToBaseEvent,
  type BaseEvent,
} from "@/lib/base";
import { MAX_PLAYER_MESSAGES, TEXT_RUN_SECONDS, secondsUntil } from "@/lib/format";
import type { SiegeEvent } from "@/lib/siege";
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

/** true at the lg breakpoint (desktop side panel); false on phones (Sheet). */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
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
  const [channel, setChannel] = useState<Channel>("chat");
  const reducedMotion = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const sheetOpenRef = useRef(false);
  sheetOpenRef.current = sheetOpen;
  const [baseEvents, setBaseEvents] = useState<BaseEvent[]>([]);
  const [siegeEvents, setSiegeEvents] = useState<SiegeEvent[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(TEXT_RUN_SECONDS);
  const [runEndsAt, setRunEndsAt] = useState<number | null>(null); // ms epoch
  const [connLost, setConnLost] = useState(false);
  const lastTextRef = useRef("");
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

  // run errors surface as a toast (sonner announces it politely)
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

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
    if (runEndsAt === null) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((runEndsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runEndsAt]);

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
      // Wait for Clerk: starting a run without a token gives a raw 401.
      if (!isLoaded) return;
      if (!isSignedIn) {
        setError("Sign in to start a raid.");
        return;
      }
      const token = await getToken();
      if (cancelled) return;
      if (!token) {
        setError("Sign in again to start a raid.");
        return;
      }
      try {
        const run = await startRun(agentId, {
          channel: "text",
          mode: practice ? "practice" : "arena",
          token,
        });
        if (cancelled) return;
        setRunId(run.run_id);
        // clock starts now: ends_at from POST /runs, else start + limit
        setRunEndsAt(run.ends_at ? run.ends_at * 1000 : Date.now() + TEXT_RUN_SECONDS * 1000);
        // the dealt role comes back with the run; the GET route is only a mock fallback
        if (run.brief) setBrief(run.brief);
        else getRoleBrief(run.run_id).then((b) => !cancelled && setBrief(b)).catch(() => {});
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "";
          setError(
            /\b409\b/.test(msg) && /lives/i.test(msg)
              ? "You're out of lives for now. A life refills every 5 minutes."
              : /\b401\b/.test(msg)
                ? "Please sign in again."
                : /\b403\b/.test(msg)
                  ? "You don't have access to this agent."
                  : /\b409\b/.test(msg)
                    ? "This agent is rebuilding after a raid. Try again shortly."
                    : "Couldn't start the raid. Try again."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, isLoaded, isSignedIn, getToken, practice]);

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

  /** Stream the agent's reply for `text` (already shown in the transcript). */
  const deliver = useCallback(async (text: string) => {
    const id = runIdRef.current;
    if (!id) return;
    setConnLost(false);
    setSending(true);
    setStreaming("");
    streamedRef.current = "";
    try {
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
          // same classification as the base map + breach counter (single source)
          const toolEvents = event.tool_events
            .map(toolEventToBaseEvent)
            .filter((b): b is Extract<BaseEvent, { type: "readToolRan" | "riskyToolExecuted" }> =>
              b !== null && (b.type === "readToolRan" || b.type === "riskyToolExecuted"));
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
          setMessages((m) => [...m, { role: "agent", content: reply, at: Date.now() }]);
          if (!sheetOpenRef.current) setUnread((n) => n + 1);
          setStreaming("");
          setSending(false);
          if (event.ended) void finish();
        },
        onError: () => {
          setConnLost(true);
          setSending(false);
        },
      },
      token
    );
    } catch {
      // keep the transcript; offer Retry. Never fall back to mock mid-run.
      setStreaming("");
      setConnLost(true);
      setSending(false);
    }
  }, [isSignedIn, getToken, finish]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !runIdRef.current || sending || result) return;
    if (!limit.trySend()) return; // 21st message is blocked by the counter
    setDraft("");
    lastTextRef.current = text;
    setMessages((m) => [...m, { role: "player", content: text, at: Date.now() }]);
    // live base: a troop squad spawns immediately and marches at its target
    setBaseEvents((e) => [
      ...e,
      { type: "playerMessage", text, tactic: causeFamilyOf(text) },
    ]);
    setSiegeEvents((e) => [...e, { type: "playerMessage", text, tactic: null }]);
    await deliver(text);
  }, [draft, sending, result, limit, deliver]);

  /** Resend the last message (already in the transcript and counted). */
  const retry = useCallback(async () => {
    if (lastTextRef.current && !sending && !result) await deliver(lastTextRef.current);
  }, [deliver, sending, result]);

  if (isLoaded && !isSignedIn) {
    return (
      <p className="p-8 text-room-muted">Redirecting to sign in…</p>
    );
  }

  const breach = breachPercent(baseEvents);
  const agentName = agent?.name ?? agentId;
  const ended = !!result;

  const comms = (
    <CommsPanel
      agentId={agentId}
      agentName={agent?.name ?? "the agent"}
      brief={brief}
      channel={channel}
      onChannel={setChannel}
      getToken={isSignedIn ? getToken : undefined}
      messages={messages}
      streaming={streaming}
      sending={sending}
      disabled={ended || !limit.canSend}
      disabledReason={ended ? "Run ended" : "Message limit reached"}
      connLost={connLost}
      onRetry={() => void retry()}
      draft={draft}
      onDraft={setDraft}
      onSend={() => void send()}
    />
  );

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-room-bg">
      <HudBar
        practice={practice}
        agentName={agentName}
        rating={agent ? agent.rating : null}
        stream={agent?.stream}
        version={agent?.current_version}
        seconds={TEXT_RUN_SECONDS}
        endsAt={runEndsAt}
        onExpire={() => void finish()}
        events={baseEvents}
        used={limit.count}
        max={limit.max}
        ended={ended}
        onEnd={() => void finish()}
      />
      <div className="relative min-h-0 flex-1">
        {/* the stage: 3D village, or the 2D Siege when WebGL / motion is unavailable */}
        <div className="absolute inset-0 lg:right-[424px]">
          {view === "base" ? (
            <LiveBase
              agentId={agentId}
              stream={agent?.stream ?? "banking"}
              events={baseEvents}
              height="100%"
            />
          ) : (
            <div className="h-full overflow-auto px-2 pb-16 pt-2 lg:pb-4">
              <Siege
                events={siegeEvents}
                messagesRemaining={limit.remaining}
                maxMessages={limit.max}
                secondsLeft={secondsLeft}
              />
            </div>
          )}
        </div>

        {/* comms: right-hand panel on desktop, bottom Sheet on phones */}
        {isDesktop ? (
          <motion.section
            aria-label="Comms"
            initial={reducedMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.25, ease: "easeOut" }}
            className="absolute bottom-4 right-4 top-4 z-20 flex w-[392px] flex-col overflow-hidden rounded-xl border border-room-line bg-room-panel/95 shadow-2xl backdrop-blur"
          >
            {comms}
          </motion.section>
        ) : (
          <CommsSheet
            open={sheetOpen}
            onOpenChange={(o) => {
              setSheetOpen(o);
              if (o) setUnread(0);
            }}
            unread={unread}
          >
            {comms}
          </CommsSheet>
        )}

        {result && (
          <RaidResult
            banner={baseBanner}
            result={result}
            breach={breach}
            detail={outcomeLabel(result)}
            onPlayAgain={() => window.location.reload()}
          />
        )}
      </div>
      <Toaster />
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
