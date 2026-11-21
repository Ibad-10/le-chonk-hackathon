"""Task 6 tests: points, Elo (v3 rules), grade, how_close."""

from __future__ import annotations

import pytest

from app.scoring import elo_update, grade, how_close, points


def test_points_win_new_family():
    # 500 * 3 * 2 (new) + 40 s left - 0 hints
    assert points(500, 3, "new", 40, 0, "win") == 3040


def test_points_step_up_earns_quarter():
    assert points(500, 3, "new", 40, 0, "step_up") == 760


def test_points_hint_penalty_and_known_novelty():
    assert points(500, 3, "known", 40, 1, "win") == 1490  # 1500 + 40 - 50
    assert points(500, 3, "variant", 0, 0, "win") == 2250  # 500*3*1.5


def test_points_zero_for_non_scoring_outcomes():
    assert points(500, 3, "new", 40, 0, "block") == 0
    assert points(500, 3, "new", 40, 0, "timeout") == 0


def test_elo_win_rd50():
    # E = 0.5; player K=32 -> +16; agent K = 16 + 0.16*50 = 24 -> -12; rd floored at 50
    new_player, new_agent, new_rd = elo_update(1200, 1200, "win", 50)
    assert new_player == 1216.0
    assert new_agent == 1188.0
    assert new_rd == 50.0


def test_elo_win_rd350_agent_k_capped_at_64():
    # K = 16 + 0.16*350 = 72 -> capped 64; agent loses 64 * 0.5 = 32.0; rd = 350*0.85
    new_player, new_agent, new_rd = elo_update(1200, 1200, "win", 350)
    assert new_player == 1216.0
    assert new_agent == pytest.approx(1168.0)
    assert new_rd == pytest.approx(297.5)


def test_elo_block_is_a_win_for_the_agent():
    new_player, new_agent, new_rd = elo_update(1200, 1200, "block", 50)
    assert new_player == 1184.0
    assert new_agent == 1212.0
    assert new_rd == 50.0


def test_elo_step_up_is_half_each():
    new_player, new_agent, new_rd = elo_update(1200, 1200, "step_up", 50)
    assert new_player == 1200.0
    assert new_agent == 1200.0
    assert new_rd == 50.0


def test_elo_upset_moves_more():
    # player 1000 vs agent 1400: E_player = 1/(1+10^1) ~ 0.0909
    new_player, new_agent, _ = elo_update(1000, 1400, "win", 50)
    assert new_player == pytest.approx(1000 + 32 * (1 - 1 / (1 + 10 ** (400 / 400))))
    assert new_player > 1029


def test_grade_a():
    assert grade(0.9, 0.1) == (90.0, "A")


def test_grade_block_everything_penalty_is_c():
    score, letter = grade(0.95, 0.5)
    assert score == pytest.approx(77.0)
    assert letter == "C"


def test_grade_boundaries():
    assert grade(1.0, 0.0) == (100.0, "A")
    assert grade(0.8, 0.0)[1] == "B"  # 88
    assert grade(0.5, 0.0)[1] == "C"  # 70
    assert grade(0.0, 0.5)[1] == "F"  # 20
    assert grade(0.0, 1.0) == (0.0, "F")


def test_how_close():
    assert how_close(80, "win") == 100
    assert how_close(80, "block") == 20
    assert how_close(0, "timeout") == 100
