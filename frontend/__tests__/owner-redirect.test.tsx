import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: vi.fn(async () => null),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import OwnerPage from "@/app/agents/[id]/owner/page";

describe("owner page auth guard", () => {
  beforeEach(() => replaceMock.mockClear());

  it("redirects to /sign-in when not signed in and renders no dashboard", async () => {
    // `use(params)` suspends until the promise resolves — flush it first
    await act(async () => {
      render(<OwnerPage params={Promise.resolve({ id: "max" })} />);
    });
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/sign-in"));
    expect(screen.getByText(/redirecting to sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/owner dashboard/i)).not.toBeInTheDocument();
  });
});
