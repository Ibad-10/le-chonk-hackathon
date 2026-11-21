"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import RetestPanel from "@/components/RetestPanel";
import {
  getAgent,
  getLogbook,
  getRetestReport,
  getVersions,
  publishVersion,
  startRetest,
} from "@/lib/api";
import { MAX_INSTRUCTIONS_CHARS } from "@/lib/types";
import type {
  Agent,
  Draft,
  Logbook,
  RetestReport,
  Version,
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

function LogbookSection({ logbook }: { logbook: Logbook }) {
  return (
    <section aria-label="Logbook" className="space-y-4">
      <h2 className="font-display text-xl text-room-text">Logbook</h2>
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
              <p className="text-xs text-room-muted">
                run {entry.run_id} · v{entry.agent_version} · language{" "}
                {entry.language} · persona: {entry.persona ?? "unknown"} · tactic:{" "}
                {entry.tactic ?? "unknown"} · {entry.risky_action}
              </p>
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

function VersionDiff({ versions }: { versions: Version[] }) {
  const oldV = versions[0];
  const newV = versions[versions.length - 1];
  if (!oldV || !newV || oldV === newV) return null;
  return (
    <section
      aria-label="Version diff"
      className="rounded-xl border border-room-line bg-room-panel p-5"
    >
      <h2 className="font-display text-xl text-room-text">Version diff</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-room-muted">
            v{oldV.version} (published {oldV.published_at.slice(0, 10)})
          </h3>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-room-bg p-3 font-mono text-xs text-room-text">
            {oldV.instructions}
          </pre>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-room-muted">
            draft (would become next version)
          </h3>
          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-room-bg p-3 font-mono text-xs text-room-text">
            {newV.instructions}
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
  const [report, setReport] = useState<RetestReport | null>(null);
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ instructions: "", knowledge: "" });
  const [notice, setNotice] = useState<string | null>(null);

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
      getRetestReport(id, token).then(setReport).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isLoaded, isSignedIn, getToken]);

  const onRetest = useCallback(async () => {
    setRunning(true);
    setNotice(null);
    const token = isSignedIn ? await getToken() : null;
    // live progress: poll while the (mock) retest runs
    const started = await startRetest(id, draft, token);
    let done = 0;
    const total = started.progress.total || 12;
    setReport({ ...started, finished_at: null, progress: { done: 0, total } });
    const tick = setInterval(() => {
      done += 1;
      setReport((r) =>
        r ? { ...r, progress: { done: Math.min(done, total), total } } : r
      );
      if (done >= total) clearInterval(tick);
    }, 400);
    const final = await getRetestReport(id, token);
    clearInterval(tick);
    setReport(final);
    setRunning(false);
  }, [draft, getToken, id, isSignedIn]);

  const onPublish = useCallback(
    async (force: boolean) => {
      setPublishing(true);
      const token = isSignedIn ? await getToken() : null;
      try {
        const published = await publishVersion(id, draft, { force, token });
        setAgent(published);
        setNotice(`Published v${published.version} — back in the arena.`);
      } finally {
        setPublishing(false);
      }
    },
    [draft, getToken, id, isSignedIn]
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
            v{agent.version} · rating {Math.round(agent.rating)} ±
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

      {logbook && <LogbookSection logbook={logbook} />}

      <DraftEditor draft={draft} setDraft={setDraft} />

      <RetestPanel
        report={report}
        running={running}
        onRetest={() => void onRetest()}
        onPublish={(force) => void onPublish(force)}
        publishing={publishing}
      />

      <VersionDiff versions={versions} />
    </div>
  );
}
