"""Export package: owner-only bundle of instructions, knowledge, tools,
regression suite and grade, ready to run on self-hosted open-weight Mistral."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_api import _app, _auth
from app.routes.owner import router as owner_router


def _client(tmp_path):
    app = _app(tmp_path)
    app.include_router(owner_router)
    return TestClient(app)


def test_export_package_shape(tmp_path):
    client = _client(tmp_path)
    resp = client.get("/agents/my-agent/export", headers=_auth("user_123"))
    assert resp.status_code == 200
    pkg = resp.json()
    assert pkg["format"] == "red-room-agent/1"
    assert pkg["agent"]["id"] == "my-agent"
    assert "role_prompt" in pkg["agent"] and "tools" in pkg["agent"]
    assert isinstance(pkg["regression_suite"], list)
    assert "grade" in pkg and "self_host" in pkg
    assert "attachment" in resp.headers.get("content-disposition", "")


def test_export_owner_only(tmp_path):
    client = _client(tmp_path)
    assert client.get("/agents/my-agent/export", headers=_auth("user_999")).status_code == 403


def test_export_unknown_agent(tmp_path):
    client = _client(tmp_path)
    assert client.get("/agents/nope/export", headers=_auth("user_123")).status_code == 404
