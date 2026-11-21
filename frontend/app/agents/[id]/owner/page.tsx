"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { useRouter } from "next/navigation";

import { useAuth } from "@clerk/nextjs";

import RetestPanel from "@/components/RetestPanel";
import SiegeReplay from "@/components/SiegeReplay";

import {
  analyseLogbook,
  createDraft,
  getAgent,
  getLatestRetestReport,
  getLogbook,
  getRetestJob,
  getVersionDiff,
  getVersions,
  publishDraft,
  startRetest,
} from "@/lib/api";

import { MAX_INSTRUCTIONS_CHARS } from "@/lib/types";

import type {
  Agent,
  Draft,
  Logbook,
  RetestReport,
  Version,
  VersionDiff,
} from "@/lib/types";

function WeaknessBars({ logbook }: { logbook: Logbook }) {
  const max = Math.max(...logbook.weakness_by_language.map((w) => w.rate), 0.0001);
  return (
    <div className="space-y-2">
      {logbook.weakness_by_language.map((w) => (
        <div key={w.language} className="flex items-center gap-3 text-sm">
          <span className="w-8 font-mono text-room-muted">{w.language}</span>
          <div
            role="img"
            aria-label={`${w.language}: fails ${(w.rate * 100).toFixed(0)}% of runs (${w.failures}/${w.runs})`}
            className="h-3 flex-1 rounded bg-room-panel-2"
          >
            <div
              className="h-3 rounded bg-room-red"
              style={{ width: `${(w.rate / max) * 100}%` }}
            />
          </div>
          <span className="w-24 text-right font-mono text-room-muted">
            {(w.rate * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function LogbookSection({
  logbook,
  onAnalyse,
  analysing,
}: {
  logbook: Logbook;
  onAnalyse: () => void;
  analysing: boolean;
}) {
  const [replayEntryId, setReplayEntryId] = useState<string | null>(null);
  return (
    <section aria-label="Logbook" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-room-text">Logbook</h2>
        <button
          type="button"
          onClick={onAnalyse}
          disabled={analysing}
          className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text hover:border-room-red/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analysing ? "Analysing…" : "Run analysis"}
        </button>
      </div>
      {logbook.groups.map((g) => (
        <article
          key={g.root_cause}
          className="rounded-xl border border-room-line bg-room-panel p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="max-w-2xl text-base font-semibold text-room-text">
              {g.root_cause}
            </h3>
            <span className="rounded-full bg-room-red/15 px-2.5 py-1 text-xs font-bold text-room-red-soft">
              {g.count} loss{g.count === 1 ? "" : "es"}
            </span>
          </div>
          {g.reopened && (
            <p className="mt-1 text-sm font-semibold text-room-red-soft">
              Reopened — your fix didn&apos;t generalise.
            </p>
          )}
          <blockquote className="mt-3 space-y-1 border-l-2 border-room-red pl-3 text-sm italic text-room-muted">
            {g.quotes.map((q) => (
              <p key={q}>“{q}”</p>
            ))}
          </blockquote>
          {g.entries.map((entry) => (
            <div key={entry.id} className="mt-4 rounded-lg bg-room-panel-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-room-muted">
                run {entry.run_id} · v{entry.agent_version} · language{" "}
                {entry.language} · persona: {entry.persona ?? "unknown"} · tactic:{" "}
                {entry.tactic ?? "unknown"} · {entry.risky_action}
              </p>
              <button
                type="button"
                onClick={() =>
                  setReplayEntryId((cur) => (cur === entry.id ? null : entry.id))
                }
                aria-pressed={replayEntryId === entry.id}
                className="rounded-md border border-room-line bg-room-panel px-3 py-1 text-xs font-semibold text-room-text hover:border-room-red/70"
              >
                {replayEntryId === entry.id ? "✕ Close siege replay" : "▶ Replay as siege"}
              </button>
              </div>
              <ol className="mt-2 space-y-1 text-sm">
                {entry.transcript.map((t, i) => {
                  const isBreaking =
                    entry.breaking_moment?.message_index === i;
                  return (
                    <li
                      key={i}
                      className={
                        isBreaking
                          ? "rounded border border-room-red bg-room-red/15 px-2 py-1 text-room-text"
                          : "px-2 py-1 text-room-muted"
                      }
                    >
                      <span className="font-mono text-xs uppercase">
                        {t.role}
                      </span>
                      : {t.content}
                      {isBreaking && entry.breaking_moment && (
                        <span className="mt-1 block text-xs font-semibold text-room-red-soft">
                          ⚠ breaking moment — {entry.breaking_moment.reason}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {replayEntryId === entry.id && <SiegeReplay entry={entry} />}
            </div>
          ))}
        </article>
      ))}
      <div className="rounded-xl border border-room-line bg-room-panel p-5">
        <h3 className="font-display text-base text-room-text">
          Weakness by language
        </h3>
        <div className="mt-3">
          <WeaknessBars logbook={logbook} />
        </div>
      </div>
    </section>
  );
}

function DraftEditor({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
}) {
  const remaining = MAX_INSTRUCTIONS_CHARS - draft.instructions.length;
  return (
    <section aria-label="Draft editor" className="rounded-xl border border-room-line bg-room-panel p-5">
      <h2 className="font-display text-xl text-room-text">Draft</h2>
      <label
        htmlFor="draft-instructions"
        className="mt-3 block text-sm font-medium text-room-text"
      >
        Instructions
      </label>
      <textarea
        id="draft-instructions"
        value={draft.instructions}
        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
        rows={6}
        className="mt-1 w-full rounded-md border border-room-line bg-room-bg p-3 font-mono text-sm text-room-text"
      />
      <p
        aria-live="polite"
        className={`mt-1 text-right font-mono text-xs ${remaining < 0 ? "text-room-red-soft" : "text-room-muted"}`}
      >
        {draft.instructions.length} / {MAX_INSTRUCTIONS_CHARS} characters
      </p>
      <label
        htmlFor="draft-knowledge"
        className="mt-4 block text-sm font-medium text-room-text"
      >
        Knowledge
      </label>
      <textarea
        id="draft-knowledge"
        value={draft.knowledge}
        onChange={(e) => setDraft({ ...draft, knowledge: e.target.value })}
        rows={4}
        className="mt-1 w-full rounded-md border border-room-line bg-room-bg p-3 font-mono text-sm text-room-text"
      />
    </section>
  );
}

function VersionDiffSection({ diff }: { diff: VersionDiff }) {
  return (
    <section
      aria-label="Version diff"
      className="rounded-xl border border-room-line bg-room-panel p-5"
    >
      <h2 className="font-display text-xl text-room-text">Version diff</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-room-muted">
            v{diff.from} (published)
          </h3>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-room-bg p-3 font-mono text-xs text-room-text">
            {diff.instructions.from}
          </pre>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-room-muted">
            v{diff.to} (next)
          </h3>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-room-bg p-3 font-mono text-xs text-room-text">
            {diff.instructions.to}
          </pre>
        </div>
      </div>
    </section>
  );
}

export default function OwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-room-muted">Loading…</p>}>
      <OwnerPageInner params={params} />
    </Suspense>
  );
}

function OwnerPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [logbook, setLogbook] = useState<Logbook | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [report, setReport] = useState<RetestReport | null>(null);
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ instructions: "", knowledge: "" });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // owner pages require sign-in: redirect when signed out
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    const token$ = getToken();
    (async () => {
      const token = await token$;
      if (cancelled) return;
      getAgent(id).then(setAgent).catch(() => {});
      getLogbook(id, token).then(setLogbook).catch(() => {});
      getVersions(id, token).then((vs) => {
        if (cancelled) return;
        setVersions(vs);
        const latest = vs[vs.length - 1];
        if (latest)
          setDraft({ instructions: latest.instructions, knowledge: latest.knowledge });
      });
      getLatestRetestReport(id, token).then(setReport).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isLoaded, isSignedIn, getToken]);

  // version diff between the live version and the current draft
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !agent) return;
    getToken().then((token) =>
      getVersionDiff(id, agent.current_version, draftId ?? "draft", token)
        .then(setDiff)
        .catch(() => {})
    );
  }, [id, agent, draftId, isLoaded, isSignedIn, getToken]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const onAnalyse = useCallback(async () => {
    setAnalysing(true);
    const token = isSignedIn ? await getToken() : null;
    try {
      setLogbook(await analyseLogbook(id, token));
    } finally {
      setAnalysing(false);
    }
  }, [getToken, id, isSignedIn]);

  const onRetest = useCallback(async () => {
    setRunning(true);
    setNotice(null);
    const token = isSignedIn ? await getToken() : null;
    try {
      // 1. save the editor contents as a draft -> draft id
      const saved = await createDraft(id, draft, token);
      setDraftId(saved.id);
      // 2. start the retest job -> job id
      const { job_id } = await startRetest(id, saved.id, token);
      // 3. poll the job until it reports done
      const job = await new Promise<RetestReport>((resolve, reject) => {
        pollRef.current = setInterval(() => {
          getRetestJob(id, job_id, token)
            .then((j) => {
              if (j.status === "done" && j.report) {
                if (pollRef.current) clearInterval(pollRef.current);
                resolve(j.report);
              } else if (j.status === "error") {
                if (pollRef.current) clearInterval(pollRef.current);
                reject(new Error("retest job errored"));
              } else if (j.report) {
                setReport({ ...j.report, finished_at: null, progress: j.progress });
              }
            })
            .catch(reject);
        }, 500);
      });
      setReport(job);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "retest failed");
    } finally {
      setRunning(false);
    }
  }, [draft, getToken, id, isSignedIn]);

  const onPublish = useCallback(
    async (force: boolean) => {
      setPublishing(true);
      const token = isSignedIn ? await getToken() : null;
      try {
        // make sure the current editor contents exist as a draft
        let did = draftId;
        if (!did) {
          const saved = await createDraft(id, draft, token);
          did = saved.id;
          setDraftId(did);
        }
        const published = await publishDraft(id, did, { force, token });
        setAgent(published);
        setNotice(`Published v${published.current_version} — back in the arena.`);
      } finally {
        setPublishing(false);
      }
    },
    [draft, draftId, getToken, id, isSignedIn]
  );

  if (isLoaded && !isSignedIn) {
    return <p className="p-8 text-room-muted">Redirecting to sign in…</p>;
  }
  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <p className="text-room-muted">Loading owner dashboard…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-room-text">
            {agent.name} <span className="text-room-muted">— owner</span>
          </h1>
          <p className="mt-1 text-sm text-room-muted">
            v{agent.current_version} · rating {Math.round(agent.rating)} ±
            {Math.round(agent.rating_deviation)}
            {agent.grade ? ` · grade ${agent.grade}` : ""}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/agents/${id}/graph`}
            className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text hover:border-room-red/70"
          >
            Knowledge graph
          </Link>
          <Link
            href={`/play/${id}?practice=1`}
            className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text hover:border-room-red/70"
          >
            Practice chat (no Elo)
          </Link>
        </div>
      </header>

      {notice && (
        <p role="status" className="rounded-lg bg-room-red/10 p-3 text-sm text-room-red-soft">
          {notice}
        </p>
      )}

      {logbook && (
        <LogbookSection logbook={logbook} onAnalyse={() => void onAnalyse()} analysing={analysing} />
      )}

      <DraftEditor draft={draft} setDraft={setDraft} />

      <RetestPanel
        report={report}
        running={running}
        onRetest={() => void onRetest()}
        onPublish={(force) => void onPublish(force)}
        publishing={publishing}
      />

      {diff && <VersionDiffSection diff={diff} />}
      {versions.length === 0 && !diff && null}
    </div>
  );
}
