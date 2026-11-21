"use client";

import { useState } from "react";
import { FlaskConical, Rocket, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
 * owner ticks "publish anyway", and always asks for confirmation first.
 */
export default function RetestPanel({
  report,
  running,
  onRetest,
  onPublish,
  publishing = false,
}: RetestPanelProps) {
  const [publishAnyway, setPublishAnyway] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fixed = report?.fixed.length ?? 0;
  const flaky = report?.flaky.length ?? 0;
  const stillFailing = report?.still_failing.length ?? 0;
  const genuineBlocked = report?.genuine_newly_blocked ?? [];
  const blocksPublish = genuineBlocked.length > 0 && !publishAnyway;
  const runningNow = running || (report != null && report.finished_at == null);
  const pct =
    report && report.progress.total > 0
      ? Math.round((report.progress.done / report.progress.total) * 100)
      : 0;

  return (
    <Card aria-label="Retest" className="gap-4 border-border bg-card py-5">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-5">
        <CardTitle className="font-display text-2xl font-normal">Retest</CardTitle>
        <Button type="button" variant="secondary" onClick={onRetest} disabled={runningNow}>
          <FlaskConical aria-hidden="true" />
          {runningNow ? "Retesting…" : "Run retest"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 px-5">
        {runningNow && report && (
          <div className="space-y-2">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Live progress: {report.progress.done} / {report.progress.total} cases
              replayed
            </p>
            <Progress value={pct} aria-label="Retest progress" />
          </div>
        )}

        {report && (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">fixed</dt>
                <dd className="font-mono text-xl font-bold text-foreground">{fixed}</dd>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">flaky</dt>
                <dd className="font-mono text-xl font-bold text-foreground">{flaky}</dd>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <dt className="text-xs text-muted-foreground">still failing</dt>
                <dd className="font-mono text-xl font-bold text-danger-soft">{stillFailing}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              Generalisation score:{" "}
              <span className="font-mono font-semibold text-foreground">
                {report.generalisation_score.toFixed(2)}
              </span>{" "}
              (sibling variants blocked / tried)
            </p>

            {genuineBlocked.length > 0 && (
              <Alert className="border-danger/60 bg-danger-bg text-danger-soft">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle className="text-danger-soft">
                  Warning: this draft newly blocks {genuineBlocked.length} genuine
                  customer{genuineBlocked.length === 1 ? "" : "s"}.
                </AlertTitle>
                <AlertDescription className="text-foreground">
                  <div className="mt-2 flex items-center gap-2">
                    <Checkbox
                      id="publish-anyway"
                      checked={publishAnyway}
                      onCheckedChange={(v) => setPublishAnyway(v === true)}
                    />
                    <Label htmlFor="publish-anyway">Publish anyway</Label>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={blocksPublish || publishing || runningNow}
            >
              <Rocket aria-hidden="true" />
              {publishing ? "Publishing…" : "Publish new version"}
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this version?</DialogTitle>
            <DialogDescription>
              The agent goes back into the arena with these instructions and
              knowledge.
              {publishAnyway && genuineBlocked.length > 0
                ? " Genuine customers it newly blocks will stay blocked."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                onPublish(publishAnyway);
              }}
            >
              Confirm publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
