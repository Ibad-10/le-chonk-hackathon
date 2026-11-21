"""Load and validate target agent configs from targets/*.json."""

from __future__ import annotations

import json
from pathlib import Path

from app.models import TargetConfig

# repo root = backend/app/engine/targets.py -> parents[3]
REPO_ROOT = Path(__file__).resolve().parents[3]
TARGETS_DIR = REPO_ROOT / "targets"


def load_target(target_id: str) -> TargetConfig:
    """Load targets/<target_id>.json and validate it as a TargetConfig."""
    path = TARGETS_DIR / f"{target_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"no target config at {path}")
    return TargetConfig.model_validate(json.loads(path.read_text(encoding="utf-8")))
