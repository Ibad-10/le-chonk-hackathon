import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MessageCounter, { useMessageLimit } from "@/components/MessageCounter";
import { MAX_PLAYER_MESSAGES } from "@/lib/format";

function Harness({ onSend }: { onSend: (n: number) => void }) {
  const limit = useMessageLimit(MAX_PLAYER_MESSAGES);
  return (
    <div>
      <MessageCounter count={limit.count} max={limit.max} />
      <button
        onClick={() => {
          if (limit.trySend()) onSend(limit.count + 1);
        }}
      >
        send
      </button>
    </div>
  );
}

describe("message counter", () => {
  it("shows count / max", () => {
    render(<MessageCounter count={3} max={20} />);
    expect(screen.getByText("Messages 3 / 20")).toBeInTheDocument();
  });

  it("blocks the 21st message", () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const button = screen.getByRole("button", { name: "send" });
    // 20 sends go through
    for (let i = 0; i < MAX_PLAYER_MESSAGES; i++) {
      act(() => button.click());
    }
    expect(onSend).toHaveBeenCalledTimes(20);
    // at the limit the counter switches to the blocked state
    expect(
      screen.getByText(`Message limit reached (${MAX_PLAYER_MESSAGES})`)
    ).toBeInTheDocument();
    // the 21st (and 22nd) message is blocked and never counted
    act(() => button.click());
    act(() => button.click());
    expect(onSend).toHaveBeenCalledTimes(20);
    expect(
      screen.getByText(`Message limit reached (${MAX_PLAYER_MESSAGES})`)
    ).toBeInTheDocument();
  });
});
