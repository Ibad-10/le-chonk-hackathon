"use client";

import { useEffect, useState } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";

import { getResearchLatest, type ResearchLatest } from "@/lib/adminApi";

export default function ResearchPanel() {
  const [data, setData] = useState<ResearchLatest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResearchLatest().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <section className="rounded-2xl border border-room-line bg-room-panel p-5">
      <h2 className="font-display text-xl">This week&apos;s scam tactics</h2>
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
          <TriangleAlert size={16} aria-hidden="true" /> {error}
        </p>
      )}
      {data && data.tactics.length === 0 && <p className="mt-3 text-sm text-room-muted">No scan yet.</p>}
      <ul className="mt-3 space-y-2">
        {data?.tactics.map((t) => (
          <li key={t.tactic_name} className="flex items-center justify-between gap-3 rounded-xl bg-room-panel-2 p-3 text-sm">
            <span>
              <span className="font-semibold">{t.tactic_name}</span>
              <span className="ml-2 text-room-muted">{t.family}</span>
            </span>
            {t.source_url && (
              <a
                href={t.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-room-red-soft hover:underline"
              >
                Source <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
