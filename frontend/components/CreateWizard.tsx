"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Eye,
  EyeOff,
  Landmark,
  LoaderCircle,
  ReceiptText,
  Shield,
  Swords,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createAgent, getPlacementJob, startPlacement } from "@/lib/api";
import { MAX_INSTRUCTIONS_CHARS } from "@/lib/types";
import type { Agent, PlacementJob, Stream, Visibility } from "@/lib/types";

const STREAM_OPTIONS: { key: Stream; label: string; icon: LucideIcon; blurb: string; attacks: string }[] = [
  {
    key: "banking",
    label: "Banking",
    icon: Landmark,
    blurb: "Moves money for customers",
    attacks: "Attackers pose as the account holder or the bank, invent an emergency, and push for a payment to a scammer.",
  },
  {
    key: "support",
    label: "Refunds support",
    icon: ReceiptText,
    blurb: "Handles orders and refunds",
    attacks: "Attackers claim lost parcels, fake receipts and a manager's approval to get a refund nobody is owed.",
  },
  {
    key: "assistant",
    label: "Personal assistant",
    icon: CalendarCheck,
    blurb: "Guards a calendar and files",
    attacks: "Attackers impersonate the boss or a colleague and talk the assistant into leaking a private file.",
  },
];

const STEPS = ["Stream", "Brief", "Review"];

/** Map an API failure to a message the owner can act on. */
export function createErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return "You already have 3 agents, the limit. Retire one before building another.";
    if (err.status === 422) return "The backend rejected those details. Check the name, instructions and knowledge, then try again.";
  }
  return "Could not create the agent. Try again in a moment.";
}

export default function CreateWizard() {
  const { getToken } = useAuth();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [stream, setStream] = useState<Stream | null>(null);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [placement, setPlacement] = useState<PlacementJob | null>(null);

  const over = instructions.length > MAX_INSTRUCTIONS_CHARS;
  const briefOk = name.trim().length > 0 && instructions.trim().length > 0 && !over;
  const streamInfo = STREAM_OPTIONS.find((s) => s.key === stream);

  // poll the placement job until it finishes
  const jobId = placement?.job_id;
  const jobDone = placement?.status === "done" || placement?.status === "error";
  useEffect(() => {
    if (!agent || !jobId || jobDone) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const token = await getToken();
        const j = await getPlacementJob(agent.id, jobId, token);
        if (!cancelled) setPlacement(j);
      } catch {
        if (!cancelled) setError("Lost contact with the placement test.");
      }
    };
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [agent, jobId, jobDone, getToken]);

  // announce the placement result once
  useEffect(() => {
    if (placement?.status === "done") toast.success("Placement test finished.");
  }, [placement?.status]);

  async function submit() {
    if (!stream || !briefOk || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const created = await createAgent(
        { name: name.trim(), stream, instructions, knowledge, visibility },
        token
      );
      setAgent(created);
      toast.success(`${created.name} created.`);
      const { job_id } = await startPlacement(created.id, token);
      setPlacement({
        job_id,
        agent_id: created.id,
        status: "queued",
        progress: { done: 0, total: 0 },
        grade: null,
        rating: null,
      });
    } catch (e) {
      setError(createErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  // --- after creation: placement test, then result -----------------------------
  if (agent && placement) {
    const pct =
      placement.progress.total > 0
        ? Math.round((placement.progress.done / placement.progress.total) * 100)
        : 0;
    return (
      <Card aria-label="Placement test" className="gap-4 py-6">
        <CardHeader className="px-6">
          <CardTitle className="font-display text-3xl font-normal">{agent.name}</CardTitle>
        </CardHeader>
        <CardContent className="px-6">
          {placement.status !== "done" ? (
            <>
              <p aria-live="polite" className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                Placement test running: sparring bots are raiding your agent to set its starting rating.
              </p>
              <Progress value={pct} aria-label="Placement progress" className="mt-4" />
              <p className="mt-2 font-mono text-sm text-muted-foreground">
                {placement.progress.done} / {placement.progress.total || "…"} raids
              </p>
              {error && (
                <Alert variant="destructive" className="mt-4">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <div className="raid-pop">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
                <div className="bg-card px-5 py-4">
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Grade</dt>
                  <dd className="font-mono text-3xl font-bold text-foreground">{placement.grade ?? "—"}</dd>
                </div>
                <div className="bg-card px-5 py-4">
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Starting rating</dt>
                  <dd className="font-mono text-3xl font-bold tabular-nums text-foreground">
                    {placement.rating != null ? Math.round(placement.rating) : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href={`/agents/${agent.id}/owner`}>
                    <Shield aria-hidden="true" /> Open defend page
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href={`/play/${agent.id}?mode=practice`}>
                    <Swords aria-hidden="true" /> Practice against it
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <ol aria-label="Steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <Badge
              variant={i === step ? "default" : "outline"}
              className="px-3 py-1 text-xs uppercase tracking-wider"
            >
              {i + 1}. {label}
            </Badge>
          </li>
        ))}
      </ol>

      <motion.div
        key={step}
        className="mt-6"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {step === 0 && (
          <fieldset>
            <legend className="font-display text-3xl text-foreground">Pick a stream</legend>
            <p id="stream-hint" className="mt-1 text-sm text-muted-foreground">
              The stream sets the job your agent does and what attackers will try against it.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {STREAM_OPTIONS.map(({ key, label, icon: Icon, blurb, attacks }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={stream === key}
                  aria-describedby="stream-hint"
                  onClick={() => setStream(key)}
                  className={`flex flex-col rounded-xl border bg-card p-5 text-left transition hover:border-primary/70 motion-safe:hover:-translate-y-0.5 ${
                    stream === key ? "border-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-primary-bg text-primary">
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <span className="mt-3 font-display text-3xl leading-none text-foreground">{label}</span>
                  <span className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{blurb}</span>
                  <span className="mt-3 text-sm text-muted-foreground">{attacks}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="font-display text-3xl text-foreground">Brief your agent</h2>
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                aria-describedby="agent-name-hint"
              />
              <p id="agent-name-hint" className="text-xs text-muted-foreground">
                Shown on the leaderboard. Up to 60 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={7}
                aria-describedby="instructions-count"
                aria-invalid={over}
              />
              <p
                id="instructions-count"
                aria-live="polite"
                className={`text-right font-mono text-xs ${over ? "text-danger-soft" : "text-muted-foreground"}`}
              >
                {instructions.length} / {MAX_INSTRUCTIONS_CHARS}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge">Knowledge</Label>
              <Textarea
                id="knowledge"
                value={knowledge}
                onChange={(e) => setKnowledge(e.target.value)}
                rows={5}
                aria-describedby="knowledge-hint"
              />
              <p id="knowledge-hint" className="text-xs text-muted-foreground">
                Optional facts the agent may rely on, such as policies or product details.
              </p>
            </div>
            <div role="group" aria-label="Visibility" className="flex gap-2">
              {(
                [
                  ["private", "Private", EyeOff],
                  ["public", "Public", Eye],
                ] as [Visibility, string, LucideIcon][]
              ).map(([v, label, Icon]) => (
                <Button
                  key={v}
                  type="button"
                  variant={visibility === v ? "default" : "outline"}
                  aria-pressed={visibility === v}
                  onClick={() => setVisibility(v)}
                >
                  <Icon aria-hidden="true" /> {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-display text-3xl text-foreground">Review</h2>
            <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {(
                [
                  ["Stream", streamInfo?.label ?? ""],
                  ["Name", name.trim()],
                  ["Visibility", visibility],
                  ["Instructions", instructions || "none"],
                  ["Knowledge", knowledge || "none"],
                ] as [string, string][]
              ).map(([t, v]) => (
                <div key={t} className="px-5 py-3">
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{t}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </motion.div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0 || submitting}
        >
          <ArrowLeft aria-hidden="true" /> Back
        </Button>
        {step < 2 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 ? !stream : !briefOk}
          >
            Next <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={!stream || !briefOk || submitting}>
            {submitting ? "Creating…" : "Create agent"}
          </Button>
        )}
      </div>
    </div>
  );
}
