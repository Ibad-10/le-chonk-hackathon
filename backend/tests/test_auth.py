"""V4-18 tests: Clerk session-token verification on write routes.

A locally generated RSA key signs fake session tokens; a fake JWKS fetcher
stands in for https://<frontend-api>/.well-known/jwks.json. Valid token
accepted, expired rejected, wrong signature rejected, owner check enforced.
"""

from __future__ import annotations

import base64
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth import ClerkAuth, current_player, frontend_api_host, require_agent_owner
from app.db import Agent, Player, init_db, make_engine

KID = "test-key-1"
PK = "pk_test_" + base64.urlsafe_b64encode(b"clerk.redroom.example").decode().rstrip("=") + "$"


def _keypair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
    jwk["kid"] = KID
    jwk["alg"] = "RS256"
    jwk["use"] = "sig"
    return private, jwk


PRIVATE, JWK = _keypair()
OTHER_PRIVATE, _ = _keypair()


def _fake_fetcher(jwk: dict):
    async def fetch():
        return {"keys": [jwk]}

    return fetch


def _token(private, kid=KID, **claims) -> str:
    payload = {"sub": "user_123", "sid": "sess_1", "azp": "http://localhost:3000",
               "iat": int(time.time()), "exp": int(time.time()) + 600}
    payload.update(claims)
    return jwt.encode(payload, private, algorithm="RS256", headers={"kid": kid})


# --- publishable key -> Frontend API host -----------------------------------


def test_frontend_api_host_from_publishable_key():
    assert frontend_api_host(PK) == "clerk.redroom.example"
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    assert auth.jwks_url == "https://clerk.redroom.example/.well-known/jwks.json"


# --- token verification ------------------------------------------------------


async def test_valid_token_accepted():
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    claims = await auth.verify(_token(PRIVATE))
    assert claims["sub"] == "user_123"


async def test_expired_token_rejected():
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    with pytest.raises(HTTPException) as exc:
        await auth.verify(_token(PRIVATE, exp=int(time.time()) - 10))
    assert exc.value.status_code == 401


async def test_wrong_signature_rejected():
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    with pytest.raises(HTTPException) as exc:
        await auth.verify(_token(OTHER_PRIVATE))  # signed by another key
    assert exc.value.status_code == 401


async def test_wrong_azp_rejected():
    """v4.1 review: a present `azp` claim must be in CLERK_AUTHORIZED_PARTIES."""
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    with pytest.raises(HTTPException) as exc:
        await auth.verify(_token(PRIVATE, azp="https://evil.example"))
    assert exc.value.status_code == 401


async def test_missing_azp_only_for_instance_session_tokens():
    """Clerk docs: azp "could be omitted if Origin is empty or null" — server-minted
    session tokens (Backend API) carry no azp. Accepted only when the token is a
    session token of THIS instance (sid + iss = instance Frontend API); a no-azp
    token without those is rejected. General rule, not a smoke-script backdoor."""
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    iss = f"https://clerk.redroom.example"
    # server-minted session token of this instance: no azp, sid + iss -> accepted
    claims = await auth.verify(_token(PRIVATE, azp=None, iss=iss))
    assert claims["sub"] == "user_123"
    # no azp and no sid -> rejected
    with pytest.raises(HTTPException) as exc:
        await auth.verify(_token(PRIVATE, azp=None, sid=None, iss=iss))
    assert exc.value.status_code == 401
    # no azp and a foreign issuer -> rejected
    with pytest.raises(HTTPException) as exc:
        await auth.verify(_token(PRIVATE, azp=None, iss="https://evil.example"))
    assert exc.value.status_code == 401


async def test_unknown_kid_rejected():
    auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))
    with pytest.raises(HTTPException) as exc:
        await auth.verify(_token(PRIVATE, kid="nope"))
    assert exc.value.status_code == 401


# --- current_player dependency on write routes -------------------------------


def _app(tmp_path) -> FastAPI:
    app = FastAPI()
    engine = make_engine(f"sqlite:///{tmp_path}/auth.db")
    init_db(engine)
    app.state.db_engine = engine
    app.state.clerk_auth = ClerkAuth(PK, fetcher=_fake_fetcher(JWK))

    @app.post("/write")
    async def write(player: Player = Depends(current_player)):
        return {"player_id": player.id}

    @app.get("/read")
    async def read():
        return {"ok": True}

    return app


def test_write_route_requires_bearer_token(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/write").status_code == 401
    assert client.post("/write", headers={"Authorization": "Token abc"}).status_code == 401
    assert client.get("/read").status_code == 200  # read routes stay public


def test_write_route_upserts_player_by_clerk_sub(tmp_path):
    app = _app(tmp_path)
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {_token(PRIVATE)}"}
    resp = client.post("/write", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["player_id"] == "user_123"
    # upsert: a second call must not fail on the unique handle and must reuse the row
    assert client.post("/write", headers=headers).status_code == 200
    with Session(app.state.db_engine) as session:
        rows = session.exec(select(Player)).all()
        assert len(rows) == 1
        assert rows[0].id == "user_123"


def test_write_route_rejects_expired_token(tmp_path):
    client = TestClient(_app(tmp_path))
    headers = {"Authorization": f"Bearer {_token(PRIVATE, exp=int(time.time()) - 5)}"}
    assert client.post("/write", headers=headers).status_code == 401


# --- owner-only check ---------------------------------------------------------


def test_require_agent_owner():
    owner = Player(id="user_123", handle="h1")
    agent = Agent(id="bank-ava", name="Ava", domain="banking", owner_id="user_123")
    require_agent_owner(agent, owner)  # no raise
    with pytest.raises(HTTPException) as exc:
        require_agent_owner(agent, Player(id="user_999", handle="h2"))
    assert exc.value.status_code == 403
