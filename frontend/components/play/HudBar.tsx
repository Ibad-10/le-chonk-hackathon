"use client";

import { useState } from "react";
import { Flag } from "lucide-react";

import { BreachMeter } from "@/components/raid";
import MessageCounter from "@/components/MessageCounter";
import TimerRing from "@/components/TimerRing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BaseEvent } from "@/lib/base";

interface HudBarProps {
  practice: boolean;
  agentName: string;
  rating: number | null;
  stream?: string;
  version?: number | string;
  seconds: number;
  endsAt: number | null;
  onExpire: () => void;
  events: BaseEvent[];
  used: number;
  max: number;
  ended: boolean;
  onEnd: () => void;
}

/** Top bar: agent + rating, timer, breach, message budget, end run (confirm). */
export default function HudBar({
  practice,
  agentName,
  rating,
  stream,
  version,
  seconds,
  endsAt,
  onExpire,
  events,
  used,
  max,
  ended,
  onEnd,
}: HudBarProps) {
  const [confirm, setConfirm] = useState(false);
  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-room-line bg-room-panel/95 px-4 py-2">
      <div className="flex items-center gap-4">
        <TimerRing seconds={seconds} endsAt={endsAt ?? undefined} paused={endsAt === null} onExpire={onExpire} />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-room-muted">
            {practice ? "Practice raid" : "Raiding"}
          </p>
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-xl leading-none text-room-text sm:text-3xl">{agentName}</h1>
            <Badge variant="outline" className="border-primary-line bg-primary-bg font-mono text-room-red-soft">
              {rating === null ? "-" : Math.round(rating)} Elo
            </Badge>
          </div>
          {stream && (
            <p className="mt-1 hidden font-mono text-xs text-room-muted sm:block">
              {stream} · v{version ?? "?"}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <BreachMeter events={events} />
        <div className="hidden w-32 sm:block">
          <MessageCounter count={used} max={max} />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirm(true)}
          disabled={ended}
          className="border-danger/60 bg-transparent text-danger-soft hover:bg-danger-bg hover:text-danger-soft"
        >
          <Flag aria-hidden="true" /> End run
        </Button>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="border-room-line bg-room-panel">
          <DialogHeader>
            <DialogTitle>End this run?</DialogTitle>
            <DialogDescription>
              The raid ends now and is scored on what you have achieved so far. You cannot resume it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Keep raiding
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirm(false);
                onEnd();
              }}
            >
              End run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
