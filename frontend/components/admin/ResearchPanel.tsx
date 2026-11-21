"use client";

import { useEffect, useState } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getResearchLatest, type ResearchLatest } from "@/lib/adminApi";

export default function ResearchPanel() {
  const [data, setData] = useState<ResearchLatest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResearchLatest().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <Card aria-label="Scam tactics" className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-display text-xl font-normal">This week&apos;s scam tactics</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        {error && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!data && !error && (
          <div role="status" aria-label="Loading tactics" className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {data && data.tactics.length === 0 && <p className="text-sm text-muted-foreground">No scan yet.</p>}
        {data && data.tactics.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tactic</TableHead>
                <TableHead>Family</TableHead>
                <TableHead className="text-right">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tactics.map((t) => (
                <TableRow key={t.tactic_name}>
                  <TableCell className="font-semibold">{t.tactic_name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.family}</TableCell>
                  <TableCell className="text-right">
                    {t.source_url && (
                      <a
                        href={t.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-room-red-soft hover:underline"
                      >
                        Source<span className="sr-only"> for {t.tactic_name} (opens in new tab)</span>{" "}
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
