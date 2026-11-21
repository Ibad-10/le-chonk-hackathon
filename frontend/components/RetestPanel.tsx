"use client";

import { useState } from "react";

import type { RetestReport } from "@/lib/types";

interface RetestPanelProps {
  report: RetestReport | null;
  running: boolean;
  onRetest: () => void;
  onPublish: (force: boolean) => void;
  publishing?: boolean;
}

/**
 * Retest scoreboard: fixed / flaky / still failing counts, generalisation
 * score, live progress, and the genuine-customers-newly-blocked warning.
 * Publish is disabled while genuine customers are newly blocked unless the
 * owner ticks "publish anyway".
 */
export default function RetestPanel({
  report,
  running,
  onRetest,
  onPublish,
  publishing = false,
}: RetestPanelProps) {
  const [publishAnyway, setPublishAnyway] = useState(false);

  const fixed = report?.fixed.length ?? 0;
  const flaky = report?.flaky.length ?? 0;
  const stillFailing = report?.still_failing.length ?? 0;
  const genuineBlocked = report?.genuine_newly_blocked ?? [];
  const blocksPublish = genuineBlocked.length > 0 && !publishAnyway;
  const runningNow = running || (report != null && report.finished_at == null);

  return (
    <section
      aria-label="Retest"
      className="rounded-xl border border-room-line bg-room-panel p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-room-text">Retest</h3>
        <button
          type="button"
          onClick={onRetest}
          disabled={runningNow}
          className="rounded-md border border-room-line bg-room-panel-2 px-4 py-2 text-sm font-semibold text-room-text hover:border-room-red/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {runningNow ? "Retesting…" : "Run retest"}
        </button>
      </div>

      {runningNow && report && (
        <p aria-live="polite" className="mt-3 text-sm text-room-muted">
          Live progress: {report.progress.done} / {report.progress.total} cases
          replayed
        </p>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-room-panel-2 p-3">
              <dt className="text-xs text-room-muted">fixed</dt>
              <dd className="font-mono text-xl font-bold text-room-text">{fixed}</dd>
            </div>
            <div className="rounded-lg bg-room-panel-2 p-3">
              <dt className="text-xs text-room-muted">flaky</dt>
              <dd className="font-mono text-xl font-bold text-room-text">{flaky}</dd>
            </div>
            <div className="rounded-lg bg-room-panel-2 p-3">
              <dt className="text-xs text-room-muted">still failing</dt>
              <dd className="font-mono text-xl font-bold text-room-red-soft">
                {stillFailing}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-room-muted">
            Generalisation score:{" "}
            <span className="font-mono font-semibold text-room-text">
              {report.generalisation_score.toFixed(2)}
            </span>{" "}
            (sibling variants blocked / tried)
          </p>

          {genuineBlocked.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-room-red/70 bg-room-red/10 p-3 text-sm"
            >
              <p className="font-semibold text-room-red-soft">
                Warning: this draft newly blocks {genuineBlocked.length} genuine
                customer{genuineBlocked.length === 1 ? "" : "s"}.
              </p>
              <label className="mt-2 flex items-center gap-2 text-room-text">
                <input
                  type="checkbox"
                  checked={publishAnyway}
                  onChange={(e) => setPublishAnyway(e.target.checked)}
                  className="h-4 w-4 accent-room-red"
                />
                Publish anyway
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={() => onPublish(publishAnyway)}
            disabled={blocksPublish || publishing || runningNow}
            className="rounded-md bg-room-red px-4 py-2 text-sm font-semibold text-room-bg hover:bg-room-red-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? "Publishing…" : "Publish new version"}
          </button>
        </div>
      )}
    </section>
  );
}
