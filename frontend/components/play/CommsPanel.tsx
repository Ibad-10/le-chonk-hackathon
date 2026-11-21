"use client";

import { ChevronDown, MessageSquare, Phone, ScrollText } from "lucide-react";

import CallPanel from "@/components/voice/CallPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RoleBrief } from "@/lib/types";

import ChatPanel from "./ChatPanel";

export type Channel = "chat" | "call";

type ChatProps = React.ComponentProps<typeof ChatPanel>;

interface CommsPanelProps extends ChatProps {
  agentId: string;
  brief: RoleBrief | null;
  channel: Channel;
  onChannel: (c: Channel) => void;
  getToken?: () => string | null | Promise<string | null>;
}

/** Role brief (collapsible) + Chat/Call switch + the active channel. */
export default function CommsPanel({
  agentId,
  brief,
  channel,
  onChannel,
  getToken,
  ...chat
}: CommsPanelProps) {
  const title = brief?.role === "genuine" ? "Your brief" : "Your mission";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {brief && (
        <Collapsible defaultOpen={chat.messages.length === 0} className="group border-b border-room-line">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-room-red-soft">
              <ScrollText className="size-4" aria-hidden="true" /> {title}
            </span>
            <ChevronDown
              className="size-4 text-room-muted transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-48 space-y-2 overflow-y-auto px-4 pb-4 text-sm text-room-text">
              <p>{brief.role === "scammer" ? brief.mission : brief.need}</p>
              <p className="text-[11px] uppercase tracking-wider text-room-muted">
                {brief.role === "scammer" ? "Public dossier" : "Your details (for verification)"}
              </p>
              <ul className="list-disc space-y-1 pl-4 text-room-muted">
                {(brief.role === "scammer" ? brief.dossier : brief.details).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="border-b border-room-line p-2">
        <ToggleGroup
          type="single"
          value={channel}
          onValueChange={(v) => v && onChannel(v as Channel)}
          aria-label="Channel"
          className="grid w-full grid-cols-2 gap-1"
        >
          <ToggleGroupItem value="chat" aria-label="Chat channel" className="data-[state=on]:bg-room-panel-2">
            <MessageSquare className="size-4" aria-hidden="true" /> Chat
          </ToggleGroupItem>
          <ToggleGroupItem value="call" aria-label="Call channel" className="data-[state=on]:bg-room-panel-2">
            <Phone className="size-4" aria-hidden="true" /> Call
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {channel === "call" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2 [&>div]:max-w-none">
          <CallPanel agentId={agentId} agentName={chat.agentName} getToken={getToken} />
        </div>
      ) : (
        <ChatPanel {...chat} />
      )}
    </div>
  );
}
