"use client";

import { MessageSquare } from "lucide-react";
import { motion, useDragControls } from "motion/react";

import { usePrefersReducedMotion } from "@/components/base/usePrefersReducedMotion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

interface CommsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unread: number;
  children: React.ReactNode;
}

/** Phone comms: floating button with unread badge + bottom Sheet (swipe down to close). */
export default function CommsSheet({ open, onOpenChange, unread, children }: CommsSheetProps) {
  const reduced = usePrefersReducedMotion();
  const controls = useDragControls();

  return (
    <>
      <Button
        type="button"
        size="lg"
        onClick={() => onOpenChange(true)}
        aria-label={unread > 0 ? `Open comms, ${unread} unread agent replies` : "Open comms"}
        className="absolute bottom-4 right-4 z-20 h-12 rounded-full px-4 shadow-lg"
      >
        <MessageSquare aria-hidden="true" /> Comms
        {unread > 0 && (
          <Badge className="ml-1 bg-room-bg px-2 font-mono text-room-text" aria-hidden="true">
            {unread}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="h-[80dvh] gap-0 rounded-t-2xl border-room-line bg-room-panel p-0"
        >
          <motion.div
            drag={reduced ? false : "y"}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 96 || info.velocity.y > 500) onOpenChange(false);
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div
              onPointerDown={(e) => controls.start(e)}
              className="flex shrink-0 touch-none flex-col items-center gap-2 px-4 pb-2 pt-2"
            >
              <span aria-hidden="true" className="h-1 w-8 rounded-full bg-room-line" />
              <SheetTitle className="text-sm font-semibold text-room-text">Comms</SheetTitle>
              <SheetDescription className="sr-only">
                Chat or call the agent. Swipe down or press Escape to close.
              </SheetDescription>
            </div>
            {children}
          </motion.div>
        </SheetContent>
      </Sheet>
    </>
  );
}
