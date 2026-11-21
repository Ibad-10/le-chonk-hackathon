import type { Metadata } from "next";

import ArenaWall from "@/components/ArenaWall";

export const metadata: Metadata = {
  title: "Red Room — arena wall",
  description: "Projector view: live ticker, agent leaderboard and now playing.",
};

/** /arena-wall — full-screen projector mode (rotating panels, polled live). */
export default function ArenaWallPage() {
  return <ArenaWall />;
}
