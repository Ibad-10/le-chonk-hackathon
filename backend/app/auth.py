"""Clerk session verification (V4-18): `current_player` dependency on write routes.

The frontend signs in with Clerk (`@clerk/nextjs`) and sends the Clerk session
token as `Authorization: Bearer <token>`. The token is a short-lived RS256 JWT;
its claims include `sub` (the Clerk user id), `exp`, `iat`, `sid`, `azp`. The
signing keys come from Clerk's JWKS endpoint,
`https://<frontend-api>/.well-known/jwks.json`, where the Frontend API host is
base64-decoded from the publishable key (`pk_test_<base64(host)$>`).

Verification: signature against the JWKS key matching `kid`, `exp` required and
checked (PyJWT), and the `azp` (authorized party) claim must be in
`CLERK_AUTHORIZED_PARTIES` (comma-separated, default `http://localhost:3000`).\r
On success the Clerk user id is upserted into `players` and the Player is\r
returned. Read routes stay public; owner-only routes compare `agents.owner_id`\r
with the player id via `require_agent_owner` (house agents are owned by\r
ADMIN_PLAYER_IDS).
"""

from __future__ import annotations

import base64
import re
from typing import Any, Awaitable, Callable

import httpx
import jwt
from fastapi import Header, HTTPException, Request, WebSocket
from sqlmodel import Session

from app.config import settings
from app.db import Agent, Player

JWKS_PATH = "/.well-known/jwks.json"
SIGN_IN_AGAIN = "please sign in again"
CLOCK_LEEWAY_S = 60  # backend laptop clock vs Clerk: nbf/iat/exp skew tolerance


def _rejected(reason: str) -> HTTPException:
    """401 with a detail the UI can show as-is ("...: please sign in again")."""
    return HTTPException(status_code=401, detail=f"{reason}: {SIGN_IN_AGAIN}")


def _norm_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def frontend_api_host(publishable_key: str) -> str:
    """`pk_test_<base64(host)$>` (or `pk_live_...`) -> the Frontend API host."""
    parts = publishable_key.split("_", 2)
    if len(parts) != 3 or parts[0] != "pk":
        raise HTTPException(status_code=500, detail="invalid Clerk publishable key")
    encoded = parts[2].removesuffix("$")
    padded = encoded + "=" * (-len(encoded) % 4)
    # the trailing "$" delimiter may be missing from the stored key, in which
    # case it ends up inside the base64 payload — strip it from the decoded host
    return base64.urlsafe_b64decode(padded).decode("utf-8").removesuffix("$")


class ClerkAuth:
    """Verifies Clerk session tokens against the instance JWKS (cached).

    `fetcher` is injectable so tests can serve a locally generated JWKS.
    """

    def __init__(
        self,
        publishable_key: str | None = None,
        fetcher: Callable[[], Awaitable[dict[str, Any]]] | None = None,
        authorized_parties: list[str] | None = None,
        authorized_party_patterns: list[str] | None = None,
    ) -> None:
        self.publishable_key = publishable_key or settings.next_public_clerk_publishable_key
        self._host = frontend_api_host(self.publishable_key) if self.publishable_key else ""
        self._fetcher = fetcher or self._fetch_jwks
        parties = authorized_parties if authorized_parties is not None else settings.clerk_authorized_parties
        self._authorized_parties = {_norm_origin(p) for p in parties}
        patterns = (
            authorized_party_patterns
            if authorized_party_patterns is not None
            else settings.clerk_authorized_party_patterns
        )
        self._party_patterns = [re.compile(p) for p in patterns]
        self._jwks: dict[str, Any] | None = None

    @property
    def jwks_url(self) -> str:
        return f"https://{self._host}{JWKS_PATH}"

    async def _fetch_jwks(self) -> dict[str, Any]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(self.jwks_url, timeout=10.0)
            resp.raise_for_status()
            return resp.json()

    async def jwks(self, refresh: bool = False) -> dict[str, Any]:
        if self._jwks is None or refresh:
            self._jwks = await self._fetcher()
        return self._jwks

    def party_allowed(self, azp: str) -> bool:
        """Exact match (trailing slash / whitespace ignored) against
        CLERK_AUTHORIZED_PARTIES, or a full match of a pattern (previews)."""
        origin = _norm_origin(azp)
        return origin in self._authorized_parties or any(
            p.fullmatch(origin) for p in self._party_patterns
        )

    async def verify(self, token: str) -> dict[str, Any]:
        """Verify signature + exp; returns the claims. Raises 401 otherwise."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise _rejected("malformed session token")

        def _find(jwks: dict[str, Any]) -> dict[str, Any] | None:
            return next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)

        jwk = _find(await self.jwks())
        if jwk is None:  # Clerk rotated its keys since the JWKS was cached
            jwk = _find(await self.jwks(refresh=True))
        if jwk is None:
            raise _rejected("session token signed by an unknown key")
        key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={"require": ["exp", "sub"]},  # exp checked by default
                leeway=CLOCK_LEEWAY_S,
            )
        except jwt.ExpiredSignatureError:
            raise _rejected("session token expired")
        except jwt.PyJWTError:
            raise _rejected("invalid session token")
        # v4.1 review: a present `azp` (authorized party) must be one we allow.
        # Clerk docs: azp is the Origin of the original Frontend API request and
        # "could be omitted if Origin is empty or null" — server-minted session
        # tokens (Backend API) carry no azp. Those are accepted only when the
        # token is a session token of THIS instance (sid + iss), never as a
        # blanket no-azp pass.
        azp = claims.get("azp")
        if azp is not None:
            if not isinstance(azp, str) or not self.party_allowed(azp):
                raise _rejected("session token origin (azp) not in CLERK_AUTHORIZED_PARTIES")
        elif not claims.get("sid") or claims.get("iss") != f"https://{self._host}":
            raise _rejected("token has no azp and is not a session token of this instance")
        return claims


def get_clerk_auth(request: Request | WebSocket) -> ClerkAuth:
    """The shared ClerkAuth verifier for a request OR a WebSocket (both expose
    `.app.state`); voice WS routes verify the `?token=` query param / first
    `auth` message through this same verifier before relaying anything."""
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
        raise _rejected("missing bearer token")
    return await player_for_token(request, authorization[len("Bearer ") :].strip())


async def optional_player(
    request: Request, authorization: str | None = Header(default=None)
) -> Player | None:
    """Public reads that show more to the owner (private agents): the verified
    player, or None when there is no valid token."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await player_for_token(request, authorization[len("Bearer ") :].strip())
    except HTTPException:
        return None


async def stream_player(
    request: Request,
    authorization: str | None = Header(default=None),
    token: str | None = None,
) -> Player:
    """SSE routes: EventSource can't set headers, so accept the Clerk token via
    `Authorization: Bearer` or the `token` query param (same verifier)."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer ") :].strip()
    if not token:
        raise _rejected("missing bearer token")
    return await player_for_token(request, token)


def is_admin(player: Player) -> bool:
    return player.is_admin or player.id in settings.admin_player_ids


async def player_for_token(request: Request, token: str) -> Player:
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


def is_agent_owner(agent: Agent, player: Player) -> bool:
    """Owner check: `agents.owner_id` equals the player's Clerk id; house agents
    (no owner_id) are owned by the admins in `ADMIN_PLAYER_IDS`."""
    if agent.owner_id is not None:
        return agent.owner_id == player.id
    return player.id in settings.admin_player_ids


def require_agent_owner(agent: Agent, player: Player) -> None:
    """Owner-only routes: the player must own the agent (see `is_agent_owner`)."""
    if not is_agent_owner(agent, player):
        raise HTTPException(status_code=403, detail="not the agent owner")
