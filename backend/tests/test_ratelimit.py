import pytest
from fastapi import HTTPException

from app import ratelimit


def test_limit_blocks_then_recovers(monkeypatch):
    ratelimit.reset()
    monkeypatch.setenv("RATE_CHAT_PER_MIN", "3")
    for i in range(3):
        ratelimit.check("p1", "chat", now=100.0 + i)
    with pytest.raises(HTTPException) as e:
        ratelimit.check("p1", "chat", now=103.0)
    assert e.value.status_code == 429
    ratelimit.check("p2", "chat", now=103.0)  # other players unaffected
    ratelimit.check("p1", "chat", now=161.0)  # window slid
