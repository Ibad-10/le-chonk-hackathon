"""Per-player usage limits on Mistral-backed routes.

Sliding one-minute window per (player, bucket), in memory.
# ponytail: per-process memory; move to Redis/Postgres when the backend runs on more than one instance.
Limits come from env (RATE_<BUCKET>_PER_MIN) so demos and tests can raise them.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import Depends, HTTPException

from app.auth import current_player
from app.db import Player

DEFAULTS = {"chat": 40, "voice": 40, "start": 12, "analyse": 6, "retest": 6, "create": 6}
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def _limit_for(bucket: str) -> int:
    return int(os.environ.get(f"RATE_{bucket.upper()}_PER_MIN", DEFAULTS[bucket]))


def check(player_id: str, bucket: str, now: float | None = None) -> None:
    now = time.monotonic() if now is None else now
    q = _hits[(player_id, bucket)]
    while q and now - q[0] >= 60:
        q.popleft()
    if len(q) >= _limit_for(bucket):
        wait = int(60 - (now - q[0])) + 1
        raise HTTPException(status_code=429, detail=f"Slow down: try again in {wait} s", headers={"Retry-After": str(wait)})
    q.append(now)


def limit(bucket: str) -> Callable:
    async def dep(player: Player = Depends(current_player)) -> None:
        check(player.id, bucket)

    return Depends(dep)


def reset() -> None:
    _hits.clear()
