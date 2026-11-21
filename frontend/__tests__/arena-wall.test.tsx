import { act, render, screen } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ArenaWall from "@/components/ArenaWall";

import { WALL_POLL_MS, WALL_ROTATION_MS, nextWallView } from "@/lib/arena-wall";

import {
  MOCK_AGENT_LEADERBOARD,
  MOCK_ARENA_EVENTS,
  MOCK_NOW_PLAYING,
} from "@/lib/mock";

const { getArenaEvents, getNowPlaying, getAgentLeaderboard } = vi.hoisted(() => ({
  getArenaEvents: vi.fn(),
  getNowPlaying: vi.fn(),
  getAgentLeaderboard: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getArenaEvents,
  getNowPlaying,
  getAgentLeaderboard,
}));

getArenaEvents.mockImplementation(async () => MOCK_ARENA_EVENTS);
getNowPlaying.mockImplementation(async () => MOCK_NOW_PLAYING);
getAgentLeaderboard.mockImplementation(
  async (s: keyof typeof MOCK_AGENT_LEADERBOARD) => MOCK_AGENT_LEADERBOARD[s] ?? []
);

describe("arena wall rotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getArenaEvents.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("rotates ticker -> leaderboard -> now playing every 15 s and wraps around", async () => {
    render(<ArenaWall />);
    await act(async () => {});
    expect(screen.getByText("Live ticker")).toBeInTheDocument();
    expect(screen.getByText(/Max broken · emotional emergency/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(WALL_ROTATION_MS);
    });
    expect(screen.getByText("Agent leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Ava")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(WALL_ROTATION_MS);
    });
    expect(screen.getByText("Now playing")).toBeInTheDocument();
    expect(screen.getByText(/vs Ava/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(WALL_ROTATION_MS);
    });
    expect(screen.getByText("Live ticker")).toBeInTheDocument();
  });

  it("polls the public endpoints every 5 s", async () => {
    render(<ArenaWall />);
    await act(async () => {});
    expect(getArenaEvents).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(WALL_POLL_MS);
    });
    expect(getArenaEvents).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(2 * WALL_POLL_MS);
    });
    expect(getArenaEvents).toHaveBeenCalledTimes(4);
  });

  it("nextWallView cycles through all views in order", () => {
    expect(nextWallView("ticker")).toBe("leaderboard");
    expect(nextWallView("leaderboard")).toBe("now_playing");
    expect(nextWallView("now_playing")).toBe("ticker");
  });
});
