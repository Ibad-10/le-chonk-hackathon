"use client";

import { useEffect, useState } from "react";
import { ScrollText, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Logbook } from "@/lib/types";

/**
 * "While you were away": on opening the owner page, a dialog lists the raids
 * that broke the agent (open logbook groups). Shown once per browser session.
 */
export function WhileAwayDialog({
  agentId,
  agentName,
  logbook,
  onViewReports,
}: {
  agentId: string;
  agentName: string;
  logbook: Logbook;
  onViewReports?: () => void;
}) {
  const raids = logbook.groups.reduce((n, g) => n + g.count, 0);
  const key = `redroom.away.${agentId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (raids === 0) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
    } catch {
      // storage blocked: show it anyway
    }
    if (!seen) setOpen(true);
  }, [key, raids]);

  const close = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const top = [...logbook.groups].sort((a, b) => b.count - a.count).slice(0, 3);
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="items-center bg-danger-bg px-6 py-6 text-center">
          <ShieldAlert size={40} aria-hidden="true" className="text-danger" />
          <DialogTitle className="font-display text-4xl font-normal">While you were away</DialogTitle>
          <DialogDescription className="text-foreground">
            <span className="font-semibold">{agentName}</span> was broken{" "}
            <span className="font-mono text-xl font-bold text-danger-soft">{raids}</span> time
            {raids === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-6">
          <ul className="space-y-2">
            {top.map((g) => (
              <li
                key={g.root_cause}
                className="flex items-start justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-sm"
              >
                <span className="text-foreground">{g.root_cause}</span>
                <span className="shrink-0 font-mono font-bold text-danger-soft">x{g.count}</span>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:justify-stretch">
            <Button
              type="button"
              className="flex-1"
              onClick={() => {
                close();
                onViewReports?.();
              }}
            >
              <ScrollText aria-hidden="true" /> Raid reports
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={close}>
              Later
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
