"""Player identity from a Clerk session token (v4.1 §1).

`current_player` maps a Clerk session token to the `players.id` (the JWT `sub`
claim). Until the Clerk JWKS verification is wired on the backend, the claim
is read without signature verification — the same trust level as the guest
`anon` handle the HTTP routes use today — and any missing/invalid token falls
back to `"anon"`. The token itself is never logged or returned by the API.
"""

from __future__ import annotations

import base64
import json


def current_player(token: str | None) -> str:
    """Player id for a Clerk session token; `"anon"` when absent or unreadable."""

    if not token:
        return "anon"
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        sub = str(claims.get("sub") or "").strip()
        return sub or "anon"
    except Exception:
        return "anon"
