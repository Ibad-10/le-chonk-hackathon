"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
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
  type LucideIcon,
} from "lucide-react";

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

const field =
  "mt-1 w-full rounded-lg border border-room-line bg-room-panel-2 px-3 py-2 text-room-text placeholder:text-room-muted focus:border-room-red/70";

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
      <section aria-label="Placement test" className="rounded-2xl border border-room-line bg-room-panel p-6">
        <h2 className="font-display text-3xl text-room-text">{agent.name}</h2>
        {placement.status !== "done" ? (
          <>
            <p aria-live="polite" className="mt-2 flex items-center gap-2 text-room-muted">
              <LoaderCircle size={18} aria-hidden="true" className="animate-spin" />
              Placement test running: sparring bots are raiding your agent to set its starting rating.
            </p>
            <div
              role="progressbar"
              aria-label="Placement progress"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-4 h-3 overflow-hidden rounded-full bg-room-panel-2"
            >
              <div className="h-full bg-room-red transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 font-mono text-sm text-room-muted">
              {placement.progress.done} / {placement.progress.total || "…"} raids
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-danger-soft">
                {error}
              </p>
            )}
          </>
        ) : (
          <div className="raid-pop">
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-room-line bg-room-line">
              <div className="bg-room-panel px-5 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-room-muted">Grade</dt>
                <dd className="font-mono text-3xl font-bold text-room-text">{placement.grade ?? "—"}</dd>
              </div>
              <div className="bg-room-panel px-5 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-room-muted">Starting rating</dt>
                <dd className="font-mono text-3xl font-bold tabular-nums text-room-text">
                  {placement.rating != null ? Math.round(placement.rating) : "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/agents/${agent.id}/owner`}
                className="inline-flex items-center gap-2 rounded-xl bg-room-red px-5 py-3 font-bold text-room-bg hover:bg-room-red-soft"
              >
                <Shield size={18} aria-hidden="true" /> Open defend page
              </Link>
              <Link
                href={`/play/${agent.id}?mode=practice`}
                className="inline-flex items-center gap-2 rounded-xl border border-room-line bg-room-panel-2 px-5 py-3 font-semibold text-room-text hover:border-room-red/70"
              >
                <Swords size={18} aria-hidden="true" /> Practice against it
              </Link>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div>
      <ol aria-label="Steps" className="flex gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              i === step
                ? "border-room-red bg-primary-bg text-room-red-soft"
                : "border-room-line text-room-muted"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mt-6">
        {step === 0 && (
          <fieldset>
            <legend className="font-display text-3xl text-room-text">Pick a stream</legend>
            <p className="mt-1 text-sm text-room-muted">
              The stream sets the job your agent does and what attackers will try against it.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {STREAM_OPTIONS.map(({ key, label, icon: Icon, blurb, attacks }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={stream === key}
                  onClick={() => setStream(key)}
                  className={`flex flex-col rounded-2xl border bg-room-panel p-5 text-left transition hover:-translate-y-0.5 hover:border-room-red/70 ${
                    stream === key ? "border-room-red" : "border-room-line"
                  }`}
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-primary-bg text-room-red">
                    <Icon size={24} aria-hidden="true" />
                  </span>
                  <span className="mt-3 font-display text-3xl leading-none text-room-text">{label}</span>
                  <span className="mt-1 text-xs font-medium uppercase tracking-wider text-room-muted">{blurb}</span>
                  <span className="mt-3 text-sm text-room-muted">{attacks}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-display text-3xl text-room-text">Brief your agent</h2>
            <div>
              <label htmlFor="agent-name" className="block text-sm font-semibold text-room-text">
                Name
              </label>
              <input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="instructions" className="block text-sm font-semibold text-room-text">
                Instructions
              </label>
              <textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={7}
                aria-describedby="instructions-count"
                className={field}
              />
              <p
                id="instructions-count"
                aria-live="polite"
                className={`mt-1 text-right font-mono text-xs ${over ? "text-danger-soft" : "text-room-muted"}`}
              >
                {instructions.length} / {MAX_INSTRUCTIONS_CHARS}
              </p>
            </div>
            <div>
              <label htmlFor="knowledge" className="block text-sm font-semibold text-room-text">
                Knowledge
              </label>
              <textarea
                id="knowledge"
                value={knowledge}
                onChange={(e) => setKnowledge(e.target.value)}
                rows={5}
                className={field}
              />
            </div>
            <div role="group" aria-label="Visibility" className="flex gap-2">
              {(
                [
                  ["private", "Private", EyeOff],
                  ["public", "Public", Eye],
                ] as [Visibility, string, LucideIcon][]
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visibility === v}
                  onClick={() => setVisibility(v)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                    visibility === v
                      ? "bg-room-red text-room-bg"
                      : "border border-room-line bg-room-panel text-room-muted hover:text-room-text"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-display text-3xl text-room-text">Review</h2>
            <dl className="mt-4 divide-y divide-room-line rounded-2xl border border-room-line bg-room-panel">
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
                  <dt className="text-[11px] uppercase tracking-wider text-room-muted">{t}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-room-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/60 bg-danger-bg px-4 py-3 text-sm text-danger-soft">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0 || submitting}
          className="inline-flex items-center gap-2 rounded-lg border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text disabled:opacity-40"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        {step < 2 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 ? !stream : !briefOk}
            className="inline-flex items-center gap-2 rounded-xl bg-room-red px-5 py-2.5 font-bold text-room-bg hover:bg-room-red-soft disabled:opacity-50"
          >
            Next <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!stream || !briefOk || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-room-red px-5 py-2.5 font-bold text-room-bg hover:bg-room-red-soft disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create agent"}
          </button>
        )}
      </div>
    </div>
  );
}
