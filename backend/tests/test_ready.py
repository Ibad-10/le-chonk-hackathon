from fastapi.testclient import TestClient

from app.db import init_db, make_engine
from app.main import app


def test_ready_reports_checks(tmp_path, monkeypatch):
    engine = make_engine(f"sqlite:///{tmp_path}/r.db")
    init_db(engine)
    app.state.db_engine = engine
    client = TestClient(app)
    r = client.get("/ready")
    assert r.json()["checks"]["database"] is True
    assert r.status_code in (200, 503)
    assert client.get("/health").json() == {"status": "ok"}
