"""Lives state machine (Task 6). Arena mode only: 3 max, +1 every 300 s."""

from __future__ import annotations


class Lives:
    MAX_LIVES = 3
    REFILL_S = 300.0

    def __init__(self, now: float, count: int | None = None) -> None:
        self._count = self.MAX_LIVES if count is None else count
        self._next_refill_at = now + self.REFILL_S if self._count < self.MAX_LIVES else None

    def _accrue(self, now: float) -> None:
        if self._next_refill_at is not None:
            while self._count < self.MAX_LIVES and now >= self._next_refill_at:
                self._count += 1
                self._next_refill_at += self.REFILL_S
            if self._count >= self.MAX_LIVES:
                self._next_refill_at = None

    def available(self, now: float) -> int:
        self._accrue(now)
        return self._count

    def consume(self, now: float) -> bool:
        """Take one life. Returns False when none is available."""
        self._accrue(now)
        if self._count <= 0:
            return False
        self._count -= 1
        if self._count == self.MAX_LIVES - 1 and self._next_refill_at is None:
            self._next_refill_at = now + self.REFILL_S
        return True

    def refund(self) -> None:
        """Give one life back (near miss / error / short abandon), capped at max."""
        if self._count < self.MAX_LIVES:
            self._count += 1
            if self._count >= self.MAX_LIVES:
                self._next_refill_at = None
