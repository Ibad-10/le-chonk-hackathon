"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { useRouter } from "next/navigation";

import { useAuth } from "@clerk/nextjs";
import { Castle, Network, Play, Swords, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { WhileAwayDialog } from "@/components/defend";

import RetestPanel from "@/components/RetestPanel";
import SiegeReplay from "@/components/SiegeReplay";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  analyseLogbook,
  createDraft,
  getAgent,
  getLogbook,
  exportAgent,
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
          <span className="w-8 font-mono text-muted-foreground">{w.language}</span>
          <div
            role="img"
            aria-label={`${w.language}: fails ${(w.rate * 100).toFixed(0)}% of runs (${w.failures}/${w.runs})`}
            className="h-3 flex-1 rounded bg-secondary"
          >
            <div
              className="h-3 rounded bg-primary"
              style={{ width: `${(w.rate / max) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right font-mono text-muted-foreground sm:w-24">
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
    <section aria-label="Raid reports" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-3xl text-foreground">Raid reports</h2>
        <Button type="button" variant="secondary" onClick={onAnalyse} disabled={analysing}>
          {analysing ? "Analysing…" : "Run analysis"}
        </Button>
      </div>
      {logbook.groups.length === 0 && (
        <p className="text-sm text-muted-foreground">No raids have broken this agent yet.</p>
      )}
      <Accordion type="multiple" className="space-y-4">
        {logbook.groups.map((g) => (
          <AccordionItem
            key={g.root_cause}
            value={g.root_cause}
            className="rounded-xl border border-border bg-card last:border-b"
          >
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <span className="flex flex-1 flex-wrap items-baseline justify-between gap-2 pr-2">
                <span className="max-w-2xl text-base font-semibold text-foreground">
                  {g.root_cause}
                </span>
                <Badge variant="secondary" className="bg-primary/15 text-room-red-soft">
                  {g.count} loss{g.count === 1 ? "" : "es"}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-5">
              {g.reopened && (
                <p className="text-sm font-semibold text-room-red-soft">
                  Reopened: your fix didn&apos;t generalise.
                </p>
              )}
              <blockquote className="mt-3 space-y-1 border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">
                {g.quotes.map((q) => (
                  <p key={q}>“{q}”</p>
                ))}
              </blockquote>
              {g.entries.map((entry) => (
                <div key={entry.id} className="mt-4 rounded-lg bg-secondary p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      run {entry.run_id} · v{entry.agent_version} · language{" "}
                      {entry.language} · persona: {entry.persona ?? "unknown"} · tactic:{" "}
                      {entry.tactic ?? "unknown"} · {entry.risky_action}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setReplayEntryId((cur) => (cur === entry.id ? null : entry.id))
                      }
                      aria-pressed={replayEntryId === entry.id}
                    >
                      {replayEntryId === entry.id ? (
                        <><X aria-hidden="true" /> Close siege replay</>
                      ) : (
                        <><Play aria-hidden="true" /> Replay as siege</>
                      )}
                    </Button>
                  </div>
                  <ol className="mt-3 space-y-1 text-sm">
                    {entry.transcript.map((t, i) => {
                      const isBreaking = entry.breaking_moment?.message_index === i;
                      return (
                        <li
                          key={i}
                          className={
                            isBreaking
                              ? "rounded border border-danger bg-danger-bg px-2 py-1 text-foreground"
                              : "px-2 py-1 text-muted-foreground"
                          }
                        >
                          <span className="font-mono text-xs uppercase">{t.role}</span>
                          : {t.content}
                          {isBreaking && entry.breaking_moment && (
                            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger-soft">
                              <TriangleAlert size={14} aria-hidden="true" /> breaking moment:{" "}
                              {entry.breaking_moment.reason}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {replayEntryId === entry.id && <SiegeReplay entry={entry} />}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-sm">Weakness by language</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          <WeaknessBars logbook={logbook} />
        </CardContent>
      </Card>
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
    <Card aria-label="Draft editor" className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-display text-3xl font-normal">Repair</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 px-5">
        <div className="space-y-2">
          <Label htmlFor="draft-instructions">Instructions</Label>
          <Textarea
            id="draft-instructions"
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
            rows={6}
            aria-describedby="draft-instructions-count"
            aria-invalid={remaining < 0}
            className="font-mono"
          />
          <p
            id="draft-instructions-count"
            aria-live="polite"
            className={`text-right font-mono text-xs ${remaining < 0 ? "text-danger-soft" : "text-muted-foreground"}`}
          >
            {draft.instructions.length} / {MAX_INSTRUCTIONS_CHARS} characters
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="draft-knowledge">Knowledge</Label>
          <Textarea
            id="draft-knowledge"
            value={draft.knowledge}
            onChange={(e) => setDraft({ ...draft, knowledge: e.target.value })}
            rows={4}
            aria-describedby="draft-knowledge-hint"
            className="font-mono"
          />
          <p id="draft-knowledge-hint" className="text-xs text-muted-foreground">
            Facts the agent may rely on. Retest after every change.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VersionDiffSection({ diff }: { diff: VersionDiff }) {
  return (
    <Card aria-label="Version diff" className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-display text-3xl font-normal">Upgrades</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            v{diff.from} (published)
          </h3>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-xs text-foreground">
            {diff.instructions.from}
          </pre>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            v{diff.to} (next)
          </h3>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-xs text-foreground">
            {diff.instructions.to}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-8 sm:px-6"
    >
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-12 w-64 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default function OwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState("reports");
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
      getAgent(id).then(setAgent).catch(() => setError("Could not load this agent."));
      getLogbook(id, token).then(setLogbook).catch(() => {});
      getVersions(id, token)
        .then((vs) => {
          if (cancelled) return;
          setVersions(vs);
          const latest = vs[vs.length - 1];
          if (latest)
            setDraft({ instructions: latest.instructions, knowledge: latest.knowledge });
        })
        .catch((e) => {
          if (!cancelled && /403/.test(e instanceof Error ? e.message : "")) setForbidden(true);
        });
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
    setError(null);
    const token = isSignedIn ? await getToken() : null;
    try {
      setLogbook(await analyseLogbook(id, token));
      toast.success("Analysis finished.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "analysis failed");
    } finally {
      setAnalysing(false);
    }
  }, [getToken, id, isSignedIn]);

  const onRetest = useCallback(async () => {
    setRunning(true);
    setError(null);
    const token = isSignedIn ? await getToken() : null;
    try {
      // 1. save the editor contents as a draft -> draft id
      const saved = await createDraft(id, draft, token);
      setDraftId(saved.id);
      toast.success("Draft saved.");
      // 2. start the retest job -> job id
      const { job_id } = await startRetest(id, saved.id, token);
      toast("Retest started.");
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
      toast.success("Retest finished.");
    } catch (e) {
      if (pollRef.current) clearInterval(pollRef.current);
      setError(e instanceof Error ? e.message : "retest failed");
    } finally {
      setRunning(false);
    }
  }, [draft, getToken, id, isSignedIn]);

  const onExport = useCallback(async () => {
    try {
      const token = isSignedIn ? await getToken() : null;
      const blob = await exportAgent(id, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.redroom.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded: instructions, knowledge, tools, regression suite and grade.");
    } catch {
      toast.error("Couldn't export this agent. Try again.");
    }
  }, [getToken, id, isSignedIn]);

  const onPublish = useCallback(
    async (force: boolean) => {
      setPublishing(true);
      setError(null);
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
        toast.success(`Published v${published.current_version}. Back in the arena.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "publish failed");
      } finally {
        setPublishing(false);
      }
    },
    [draft, draftId, getToken, id, isSignedIn]
  );

  if (isLoaded && !isSignedIn) {
    return <p className="p-8 text-muted-foreground">Redirecting to sign in…</p>;
  }
  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-16 sm:px-6">
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Only the owner can defend this agent</AlertTitle>
          <AlertDescription>
            You can still try to break it.
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/play/${id}`}>Attack it</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/agents/${id}`}>View agent</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!agent) {
    return error ? (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    ) : (
      <PageSkeleton />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-room-red-soft">Defend</p>
          <h1 className="mt-1 font-display text-4xl leading-none text-foreground sm:text-5xl">{agent.name}</h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            v{agent.current_version} · {Math.round(agent.rating)} ±{Math.round(agent.rating_deviation)} Elo
            {agent.grade ? ` · grade ${agent.grade}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void onExport()}>
            Export agent
          </Button>
          <Button asChild>
            <Link href={`/agents/${id}/base`}>
              <Castle aria-hidden="true" /> Your base
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/agents/${id}/graph`}>
              <Network aria-hidden="true" /> Knowledge graph
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/play/${id}?practice=1`}>
              <Swords aria-hidden="true" /> Practice raid
            </Link>
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {logbook && (
        <WhileAwayDialog
          agentId={id}
          agentName={agent.name}
          logbook={logbook}
          onViewReports={() => setTab("reports")}
        />
      )}

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList className="grid h-auto w-full grid-cols-4 sm:inline-flex sm:w-fit">
          <TabsTrigger value="reports">Raid reports</TabsTrigger>
          <TabsTrigger value="repair">Repair</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="upgrade">Upgrade</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          {logbook ? (
            <LogbookSection logbook={logbook} onAnalyse={() => void onAnalyse()} analysing={analysing} />
          ) : (
            <div role="status" aria-label="Loading raid reports" className="space-y-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
        </TabsContent>
        <TabsContent value="repair">
          <DraftEditor draft={draft} setDraft={setDraft} />
        </TabsContent>
        <TabsContent value="test">
          <RetestPanel
            report={report}
            running={running}
            onRetest={() => void onRetest()}
            onPublish={(force) => void onPublish(force)}
            publishing={publishing}
          />
        </TabsContent>
        <TabsContent value="upgrade">
          {diff ? (
            <VersionDiffSection diff={diff} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No pending changes. Edit the draft in Repair, then run a retest.
            </p>
          )}
        </TabsContent>
      </Tabs>
      {versions.length === 0 && null}
    </div>
  );
}
