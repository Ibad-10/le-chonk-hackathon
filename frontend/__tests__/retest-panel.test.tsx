import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RetestPanel from "@/components/RetestPanel";
import { MOCK_RETEST_REPORT } from "@/lib/mock";
import type { RetestReport } from "@/lib/types";

const report: RetestReport = MOCK_RETEST_REPORT; // has 1 genuine case newly blocked

describe("RetestPanel", () => {
  it("shows fixed / flaky / still failing counts and generalisation score", () => {
    render(
      <RetestPanel report={report} running={false} onRetest={() => {}} onPublish={() => {}} />
    );
    expect(screen.getByText("fixed").parentElement).toHaveTextContent("1");
    expect(screen.getByText("flaky").parentElement).toHaveTextContent("1");
    expect(screen.getByText("still failing").parentElement).toHaveTextContent("1");
    expect(screen.getByText("0.72")).toBeInTheDocument();
  });

  it("disables Publish when genuine customers are newly blocked, unless 'publish anyway' is ticked", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(
      <RetestPanel report={report} running={false} onRetest={() => {}} onPublish={onPublish} />
    );
    const publish = screen.getByRole("button", { name: /publish new version/i });
    expect(publish).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/newly blocks 1 genuine customer/i);

    await user.click(screen.getByRole("checkbox", { name: /publish anyway/i }));
    expect(publish).toBeEnabled();
    await user.click(publish);
    expect(onPublish).toHaveBeenCalledWith(true);
  });

  it("allows Publish directly when no genuine customer is newly blocked", () => {
    const clean: RetestReport = { ...report, genuine_newly_blocked: [] };
    const onPublish = vi.fn();
    render(
      <RetestPanel report={clean} running={false} onRetest={() => {}} onPublish={onPublish} />
    );
    expect(screen.getByRole("button", { name: /publish new version/i })).toBeEnabled();
  });

  it("shows live progress while running", () => {
    const running: RetestReport = {
      ...report,
      finished_at: null,
      progress: { done: 5, total: 12 },
    };
    render(
      <RetestPanel report={running} running={true} onRetest={() => {}} onPublish={() => {}} />
    );
    expect(screen.getByText(/Live progress: 5 \/ 12 cases replayed/)).toBeInTheDocument();
  });
});
