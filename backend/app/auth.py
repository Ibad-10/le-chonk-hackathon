"""Clerk session verification (V4-18): `current_player` dependency on write routes.

The frontend signs in with Clerk (`@clerk/nextjs`) and sends the Clerk session
token as `Authorization: Bearer <token>`. The token is a short-lived RS256 JWT;
its claims include `sub` (the Clerk user id), `exp`, `iat`, `sid`, `azp`. The
signing keys come from Clerk's JWKS endpoint,
`https://<frontend-api>/.well-known/jwks.json`, where the Frontend API host is
base64-decoded from the publishable key (`pk_test_<base64(host)$>`).

Verification: signature against the JWKS key matching `kid`, `exp` required and
checked (PyJWT). On success the Clerk user id is upserted into `players` and the
Player is returned. Read routes stay public; owner-only routes compare
`agents.owner_id` with the player id via `require_agent_owner`.
"""

from __future__ import annotations

import base64
from typing import Any, Awaitable, Callable

import httpx
import jwt
from fastapi import Header, HTTPException, Request
from sqlmodel import Session

from app.config import settings
from app.db import Agent, Player

JWKS_PATH = "/.well-known/jwks.json"


def frontend_api_host(publishable_key: str) -> str:
    """`pk_test_<base64(host)$>` (or `pk_live_...`) -> the Frontend API host."""
    parts = publishable_key.split("_", 2)
    if len(parts) != 3 or parts[0] != "pk":
        raise HTTPException(status_code=500, detail="invalid Clerk publishable key")
    encoded = parts[2].removesuffix("$")
    padded = encoded + "=" * (-len(encoded) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8")


class ClerkAuth:
    """Verifies Clerk session tokens against the instance JWKS (cached).

    `fetcher` is injectable so tests can serve a locally generated JWKS.
    """

    def __init__(
        self,
        publishable_key: str | None = None,
        fetcher: Callable[[], Awaitable[dict[str, Any]]] | None = None,
    ) -> None:
        self.publishable_key = publishable_key or settings.next_public_clerk_publishable_key
        self._host = frontend_api_host(self.publishable_key) if self.publishable_key else ""
        self._fetcher = fetcher or self._fetch_jwks
        self._jwks: dict[str, Any] | None = None

    @property
    def jwks_url(self) -> str:
        return f"https://{self._host}{JWKS_PATH}"

    async def _fetch_jwks(self) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(self.jwks_url, timeout=10.0)
            resp.raise_for_status()
            return resp.json()

    async def jwks(self) -> dict[str, Any]:
        if self._jwks is None:
            self._jwks = await self._fetcher()
        return self._jwks

    async def verify(self, token: str) -> dict[str, Any]:
        """Verify signature + exp; returns the claims. Raises 401 otherwise."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail=f"malformed token: {exc}")
        keys = (await self.jwks()).get("keys", [])
        jwk = next((k for k in keys if k.get("kid") == header.get("kid")), None)
        if jwk is None:
            raise HTTPException(status_code=401, detail="unknown signing key")
        key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
        try:
            return jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={"require": ["exp", "sub"]},  # exp checked by default
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail=f"invalid session token: {exc}")


def get_clerk_auth(request: Request) -> ClerkAuth:
    auth = getattr(request.app.state, "clerk_auth", None)
    if auth is None:
        auth = ClerkAuth()
        request.app.state.clerk_auth = auth
    return auth


async def current_player(
    request: Request, authorization: str | None = Header(default=None)
) -> Player:
    """Write-route dependency: verify the Clerk session token and upsert the
    player keyed by the Clerk user id (`sub`)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization[len("Bearer ") :].strip()
    claims = await get_clerk_auth(request).verify(token)
    clerk_user_id = str(claims["sub"])
    engine = request.app.state.db_engine
    with Session(engine) as session:
        player = session.get(Player, clerk_user_id)
        if player is None:
            player = Player(id=clerk_user_id, handle=f"player-{clerk_user_id[:12]}")
            session.add(player)
            session.commit()
            session.refresh(player)
        return player


def require_agent_owner(agent: Agent, player: Player) -> None:
    """Owner-only routes: `agents.owner_id` must equal the player's Clerk id."""
    if agent.owner_id != player.id:
        raise HTTPException(status_code=403, detail="not the agent owner")
