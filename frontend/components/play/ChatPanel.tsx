"use client";

import { useEffect, useRef } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  role: "player" | "agent";
  content: string;
  /** ms epoch */
  at: number;
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function Bubble({ m, agentName }: { m: ChatMessage; agentName: string }) {
  const mine = m.role === "player";
  return (
    <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
      {!mine && (
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="bg-agent-bg text-xs font-semibold text-agent-soft">
            {agentName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("flex max-w-[80%] flex-col gap-1", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
            mine
              ? "rounded-br-sm bg-room-red text-room-bg"
              : "rounded-bl-sm bg-room-panel-2 text-room-text"
          )}
        >
          {m.content}
        </div>
        <span className="px-1 font-mono text-[11px] text-room-muted">
          {mine ? "You" : agentName} · {time(m.at)}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator({ agentName }: { agentName: string }) {
  return (
    <div className="flex items-end gap-2" role="status" aria-label={`${agentName} is typing`}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-agent-bg text-xs font-semibold text-agent-soft">
          {agentName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-room-panel-2 px-4 py-3" aria-hidden="true">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="size-2 animate-bounce rounded-full bg-room-muted"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  agentName: string;
  messages: ChatMessage[];
  /** partial agent reply while streaming ("" when none) */
  streaming: string;
  sending: boolean;
  /** run ended or message budget spent */
  disabled: boolean;
  disabledReason?: string;
  connLost: boolean;
  onRetry: () => void;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
}

export default function ChatPanel({
  agentName,
  messages,
  streaming,
  sending,
  disabled,
  disabledReason,
  connLost,
  onRetry,
  draft,
  onDraft,
  onSend,
}: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");

  // auto-scroll to the newest message / streamed chunk
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, streaming, sending, connLost]);

  const canSubmit = !!draft.trim() && !sending && !disabled;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* announces each completed agent reply (not every streamed chunk) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {lastAgent ? `${agentName} says: ${lastAgent.content}` : ""}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4" role="log" aria-label="Conversation">
          {connLost && (
            <Alert variant="destructive" className="border-danger/60 bg-danger-bg text-danger-soft">
              <AlertDescription className="flex items-center justify-between gap-2 text-danger-soft">
                <span>Connection to the agent lost.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRetry}
                  disabled={sending}
                  className="border-danger/60 bg-transparent text-danger-soft hover:bg-danger/20"
                >
                  <RefreshCw aria-hidden="true" /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {messages.length === 0 && !streaming && !sending && (
            <p className="text-sm text-room-muted">
              Every message sends a troop at the base. Talk {agentName} into it.
            </p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} m={m} agentName={agentName} />
          ))}
          {streaming ? (
            <Bubble m={{ role: "agent", content: streaming, at: Date.now() }} agentName={agentName} />
          ) : (
            sending && <TypingIndicator agentName={agentName} />
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form
        className="flex flex-col gap-2 border-t border-room-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSend();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id="chat-input"
            value={draft}
            rows={2}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSubmit) onSend();
              }
            }}
            disabled={disabled}
            placeholder={disabled ? (disabledReason ?? "Run ended") : "Talk them into it…"}
            className="max-h-32 min-h-12 flex-1 resize-none border-room-line bg-room-bg text-sm text-room-text placeholder:text-room-muted"
          />
          <Button type="submit" size="lg" disabled={!canSubmit} aria-label="Send troop" className="h-12">
            {sending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{sending ? "Sending" : "Send"}</span>
          </Button>
        </div>
        <p className="flex justify-between px-1 font-mono text-[11px] text-room-muted">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span aria-label={`${draft.length} characters`}>{draft.length}</span>
        </p>
      </form>
    </div>
  );
}
