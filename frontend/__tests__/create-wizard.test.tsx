import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => "t") }),
}));

const createAgent = vi.fn();
const startPlacement = vi.fn();
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      body: string
    ) {
      super(`API ${status}: ${body}`);
    }
  }
  return {
    ApiError,
    createAgent: (...a: unknown[]) => createAgent(...a),
    startPlacement: (...a: unknown[]) => startPlacement(...a),
    getPlacementJob: vi.fn(),
  };
});

import CreateWizard from "@/components/CreateWizard";
import { ApiError } from "@/lib/api";

const next = () => fireEvent.click(screen.getByRole("button", { name: /next/i }));
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CreateWizard", () => {
  beforeEach(() => {
    createAgent.mockReset();
    startPlacement.mockReset();
  });

  it("requires a stream before continuing", () => {
    render(<CreateWizard />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /banking/i }));
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("blocks next at 2001 characters of instructions", () => {
    render(<CreateWizard />);
    fireEvent.click(screen.getByRole("button", { name: /banking/i }));
    next();
    type(/^name/i, "Vault");
    type(/instructions/i, "a".repeat(2000));
    expect(screen.getByText("2000 / 2000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
    type(/instructions/i, "a".repeat(2001));
    expect(screen.getByText("2001 / 2000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("shows the limit message on 409", async () => {
    createAgent.mockRejectedValue(new ApiError(409, "limit"));
    render(<CreateWizard />);
    fireEvent.click(screen.getByRole("button", { name: /banking/i }));
    next();
    type(/^name/i, "Vault");
    type(/instructions/i, "Never move money.");
    next();
    fireEvent.click(screen.getByRole("button", { name: /create agent/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/3 agents/i));
    expect(startPlacement).not.toHaveBeenCalled();
  });
});
