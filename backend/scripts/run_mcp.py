"""Run the Red Room MCP server over stdio (plan V4-14).

Usage from `backend/`:

    uv run python scripts/run_mcp.py

Environment (see app/mcp_server.py): RED_ROOM_API_URL, RED_ROOM_CLERK_TOKEN
(or RED_ROOM_API_KEY). stdio is the default transport of the MCP Python SDK.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python scripts/run_mcp.py` from backend/: put backend/ on sys.path so
# the `app` package imports regardless of the caller's working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.mcp_server import main

if __name__ == "__main__":
    main()
