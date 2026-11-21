import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => "tok") }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import AdminPage from "@/app/admin/page";

const cycle = {
  created_at: "2026-11-20T10:00:00",
  agent_id: "bank-ava",
  attacks_run: 6,
  failures_found: 2,
  sources: ["logbook", "research:x"],
  tactics_used: [],
  kept: false,
  published_version: null,
  reason: "retest failed",
};

describe("admin page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders cycles and tactics from the backend, with the auth header", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const body = url.includes("/research/latest")
        ? { source: "s", created_at: null, tactics: [{ tactic_name: "Fake invoice", family: "BEC", source_url: "https://e.x" }] }
        : { agent_id: "a", cycles: [cycle] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminPage />);
    expect(screen.getByText("House agents lab")).toBeInTheDocument();
    expect(await screen.findByText("Fake invoice")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/6 attacks run, 2 failures found/)).toHaveLength(3));
    expect(screen.getAllByRole("button", { name: /run training cycle/i })).toHaveLength(3);
    const cyclesCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/cycles"))!;
    expect((cyclesCall[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("shows an inline error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "admin only" }), { status: 403 })));
    render(<AdminPage />);
    expect((await screen.findAllByText(/403 admin only/)).length).toBeGreaterThan(0);
  });
});
