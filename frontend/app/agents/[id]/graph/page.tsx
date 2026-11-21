"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { getGraph } from "@/lib/api";
import { getNodeAppearance, nodeLabel } from "@/lib/graph-style";
import type { GraphNodeType, KnowledgeGraph } from "@/lib/types";

// react-force-graph-2d needs the DOM — no SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <p className="text-room-muted">Loading graph…</p>,
});

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const NODE_COLORS: Record<GraphNodeType, string> = {
  version: "#f5eef0",
  attack: "#e5202b",
  root_cause: "#ff5a63",
  learned: "#7ddc8b",
};

export default function GraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-8 text-room-muted">Loading…</p>}>
      <GraphPageInner params={params} />
    </Suspense>
  );
}

function GraphPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // owner-only: redirect when signed out
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    getToken().then((token) => getGraph(id, token).then(setGraph).catch(() => {}));
  }, [id, isLoaded, isSignedIn, getToken]);

  const data = useMemo(() => {
    if (!graph) return null;
    return {
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.edges.map((e) => ({ ...e })),
    };
  }, [graph]);

  if (isLoaded && !isSignedIn) {
    return <p className="p-8 text-room-muted">Redirecting to sign in…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl text-room-text">
        Knowledge graph <span className="text-room-muted">· owner only</span>
      </h1>
      <p className="mt-2 text-sm text-room-muted">
        Versions, attacks, root-cause groups and what the agent learned. Each node
        type has its own shape, icon and text label — never colour alone.
      </p>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-room-muted">
        {(["version", "attack", "root_cause", "learned"] as GraphNodeType[]).map(
          (t) => {
            const a = getNodeAppearance(t);
            return (
              <li key={t} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="font-bold text-room-text">
                  {a.icon}
                </span>
                <span>
                  {a.shape} · {a.labelPrefix}
                </span>
              </li>
            );
          }
        )}
      </ul>

      <div className="mt-4 overflow-hidden rounded-xl border border-room-line bg-room-panel">
        {data && (
          <ForceGraph2D
            graphData={data}
            width={960}
            height={560}
            backgroundColor="#140a0d"
            // respect prefers-reduced-motion: freeze the simulation almost
            // immediately instead of animating continuously
            d3AlphaDecay={reducedMotion ? 1 : 0.0228}
            cooldownTime={reducedMotion ? 1 : 4000}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as (typeof data.nodes)[number] & {
                x?: number;
                y?: number;
              };
              const appearance = getNodeAppearance(n.type);
              const x = n.x ?? 0;
              const y = n.y ?? 0;
              const r = 7;
              ctx.beginPath();
              if (appearance.shape === "circle") ctx.arc(x, y, r, 0, 2 * Math.PI);
              else if (appearance.shape === "square")
                ctx.rect(x - r, y - r, 2 * r, 2 * r);
              else if (appearance.shape === "diamond") {
                ctx.moveTo(x, y - r);
                ctx.lineTo(x + r, y);
                ctx.lineTo(x, y + r);
                ctx.lineTo(x - r, y);
                ctx.closePath();
              } else {
                // triangle
                ctx.moveTo(x, y - r);
                ctx.lineTo(x + r, y + r);
                ctx.lineTo(x - r, y + r);
                ctx.closePath();
              }
              ctx.fillStyle = NODE_COLORS[n.type];
              ctx.fill();
              // icon glyph inside the shape
              ctx.fillStyle = "#0a0507";
              ctx.font = "bold 9px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(appearance.icon, x, y + 0.5);
              // text label so type never relies on colour
              ctx.font = `${11 / Math.min(globalScale, 2)}px sans-serif`;
              ctx.fillStyle = "#f5eef0";
              ctx.fillText(nodeLabel(n.type, n.label), x, y + r + 10);
            }}
            linkColor={() => "#3a1d24"}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
          />
        )}
        {!data && <p className="p-8 text-room-muted">Loading graph…</p>}
      </div>
    </div>
  );
}
