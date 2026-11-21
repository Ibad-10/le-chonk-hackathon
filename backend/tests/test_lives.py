"""Task 6 tests: Lives state machine (arena only, 3 max, +1 per 300 s)."""

from __future__ import annotations

from app.lives import Lives


def test_three_consumed_leaves_zero_available():
    lives = Lives(now=1000.0)
    assert lives.consume(1000.0) is True
    assert lives.consume(1000.0) is True
    assert lives.consume(1000.0) is True
    assert lives.available(1000.0) == 0


def test_consume_fails_when_empty():
    lives = Lives(now=0.0)
    for _ in range(3):
        lives.consume(0.0)
    assert lives.consume(0.0) is False
    assert lives.available(0.0) == 0


def test_one_life_refills_after_300s():
    lives = Lives(now=1000.0)
    for _ in range(3):
        lives.consume(1000.0)
    assert lives.available(1299.0) == 0
    assert lives.available(1300.0) == 1
    assert lives.available(1600.0) == 2
    assert lives.available(1900.0) == 3
    assert lives.available(5000.0) == 3  # capped


def test_refund_caps_at_max():
    lives = Lives(now=0.0)
    lives.consume(0.0)
    lives.refund()
    lives.refund()
    assert lives.available(0.0) == 3


def test_refund_from_zero():
    lives = Lives(now=0.0)
    for _ in range(3):
        lives.consume(0.0)
    lives.refund()
    assert lives.available(0.0) == 1
