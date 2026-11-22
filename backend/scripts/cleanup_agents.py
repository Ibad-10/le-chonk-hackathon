"""Delete agents and everything that references them (admin cleanup).

Usage: uv run python scripts/cleanup_agents.py qa-nova-6663b2 qa-weak-414c60
Never deletes house agents.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.db import HOUSE_AGENT_IDS, make_engine  # noqa: E402
from app.config import settings  # noqa: E402


def main(ids: list[str]) -> None:
    engine = make_engine(settings.database_url)
    with engine.begin() as conn:
        tables = [r[0] for r in conn.execute(text(
            "select table_name from information_schema.columns "
            "where column_name='agent_id' and table_schema='public'"
        ))] if engine.dialect.name == "postgresql" else []
        for agent_id in ids:
            if agent_id in HOUSE_AGENT_IDS:
                print(f"skip house agent {agent_id}")
                continue
            for _pass in range(3):  # foreign keys: children first, retry until clear
              for t in tables:
                if t.startswith("v_") or t.endswith("_view"):
                    continue
                try:
                    with conn.begin_nested():
                        conn.execute(text(f'delete from "{t}" where agent_id = :a'), {"a": agent_id})
                except Exception:  # FK order, views: retried on the next pass
                    pass
            n = conn.execute(text("delete from agents where id = :a"), {"a": agent_id}).rowcount
            print(f"{agent_id}: {'deleted' if n else 'not found'}")


if __name__ == "__main__":
    main(sys.argv[1:])
