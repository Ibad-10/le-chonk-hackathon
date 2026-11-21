import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TimerRing from "@/components/TimerRing";
import { ConnectionError, sendMessage } from "@/lib/api";
import { breachPercent } from "@/components/raid";
import { damageCounts, toolEventToBaseEvent, type BaseEvent } from "@/lib/base";

describe("sendMessage (backend configured)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws on network failure and never returns mock data", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://backend.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    await expect(sendMessage("run1", "hi")).rejects.toBeInstanceOf(ConnectionError);
  });

  it("throws on 404 instead of mocking", async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://backend.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    await expect(sendMessage("run1", "hi")).rejects.toThrow();
  });
});

describe("run clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps ticking while a reply is pending, even across re-renders", () => {
    const endsAt = Date.now() + 600_000;
    const { rerender } = render(<TimerRing seconds={600} endsAt={endsAt} onExpire={() => {}} />);
    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
    for (let i = 0; i < 5; i++) {
      act(() => vi.advanceTimersByTime(500));
      // streamed chunk -> parent re-renders with a fresh onExpire each time
      rerender(<TimerRing seconds={600} endsAt={endsAt} onExpire={() => {}} />);
    }
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("timer")).toHaveTextContent("9:57");
  });
});

describe("breach counter vs map damage", () => {
  it("agree for one read tool and one risky tool", () => {
    const evs = [
      toolEventToBaseEvent({ call: { name: "lookup_order", args: {} }, ok: true }),
      toolEventToBaseEvent({ call: { name: "send_payment", args: {} }, ok: true }),
    ].filter((e): e is BaseEvent => e !== null);
    expect(damageCounts(evs)).toEqual({ reads: 1, risky: 1 });
    expect(breachPercent(evs)).toBe(100);
    expect(breachPercent(evs.slice(0, 1))).toBe(35);
  });
});
