import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TimerRing from "@/components/TimerRing";

describe("TimerRing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down every second and displays mm:ss", () => {
    render(<TimerRing seconds={600} onExpire={() => {}} />);
    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("9:59");
    act(() => vi.advanceTimersByTime(59 * 1000));
    expect(screen.getByRole("timer")).toHaveTextContent("9:00");
  });

  it("calls onExpire exactly once when it reaches zero", () => {
    const onExpire = vi.fn();
    render(<TimerRing seconds={3} onExpire={onExpire} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    act(() => vi.advanceTimersByTime(5000));
    expect(onExpire).toHaveBeenCalledTimes(1); // not called again
  });
});
