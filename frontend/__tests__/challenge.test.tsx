import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RankBadge from "@/components/RankBadge";
import ChallengeCard from "@/components/challenge/ChallengeCard";

const ranks = [
  { name: "Rookie", min_xp: 0, next_xp: 500 },
  { name: "Grifter", min_xp: 500, next_xp: 2000 },
];

describe("challenge", () => {
  it("links the card to the target agent", () => {
    render(
      <ChallengeCard
        challenge={{
          date: "2026-11-21",
          title: "Safe account story",
          tactic_family: "safe_account",
          brief: "b",
          target_agent_id: "bank-ava",
          bonus_points: 250,
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /take the challenge/i })).toHaveAttribute(
      "href",
      "/play/bank-ava",
    );
  });

  it("shows rank and progress", () => {
    render(<RankBadge xp={1250} ranks={ranks} />);
    expect(screen.getByText("Grifter")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });
});
