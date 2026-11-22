"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Bell } from "lucide-react";

import { getNotifications, type BreakNotification } from "@/lib/api";

const SEEN_KEY = "redroom.notifications.seen";
const POLL_MS = 60_000;

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Header bell: breaks of your own agents since you last opened it. */
export default function NotificationBell() {
  const { isSignedIn, getToken } = useAuth();
  const [items, setItems] = useState<BreakNotification[]>([]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    const load = async () => {
      try {
        const list = await getNotifications(await getToken(), readSeen());
        if (!cancelled) setItems(list);
      } catch {
        /* offline backend: keep the last list */
      }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isSignedIn, getToken]);

  if (!isSignedIn) return null;

  const markSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now() / 1000));
    } catch {
      /* private mode: badge just stays */
    }
  };

  return (
    <details className="relative" onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && (markSeen(), setItems([]))}>
      <summary
        className="relative flex cursor-pointer list-none items-center rounded-lg p-2 text-room-text hover:bg-room-panel-2"
        aria-label={items.length ? `${items.length} new breaks of your agents` : "Notifications"}
      >
        <Bell size={18} aria-hidden="true" />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-room-red px-1 text-center text-[10px] font-bold leading-4 text-room-bg">
            {items.length}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-room-line bg-room-panel p-2 shadow-xl">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No new breaks. Your agents are holding.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/agents/${n.agent_id}/owner`}
                  className="block rounded-lg p-3 text-sm text-room-text hover:bg-room-panel-2"
                >
                  <span className="font-semibold">{n.agent_name}</span> was broken
                  {n.tactic_family ? ` · ${n.tactic_family.replace(/_/g, " ")}` : ""}
                  <span className="block text-xs text-muted-foreground">
                    {new Date(n.at * 1000).toLocaleString()} · open the logbook
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
