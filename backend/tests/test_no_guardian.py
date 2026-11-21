"""V4-2: no Guardian anywhere in the backend package (grep-style test)."""

from __future__ import annotations

import pathlib
import sys

import app


def test_no_guardian_module_imported():
    assert "app.guardian" not in sys.modules
    assert not any(name.startswith("app.guardian") for name in sys.modules)


def test_no_guardian_text_in_app_package():
    pkg = pathlib.Path(app.__file__).resolve().parent
    offenders = [
        str(p)
        for p in pkg.rglob("*.py")
        if "guardian" in p.read_text(encoding="utf-8").lower()
    ]
    assert offenders == []
