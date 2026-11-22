"""FastAPI app (Task 6 + V4-3): CORS for the local frontend, /health, run routes.

On startup the SQLite database (config `DATABASE_URL`, default
sqlite:///./redroom.db) is created if missing and the house agents are seeded;
runs are persisted through SQLiteRunsRepo.
"""

from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.auth import ClerkAuth
from app.config import settings
from app.creator import PlacementService
from app.db import init_db, make_engine, seed_house_agents
from app.improvement import RetestService
from app.llm import MistralLLM
from app.repo import SQLiteLogbookRepo, SQLiteRunsRepo
from app.routes.agents import router as agents_router
from app.routes.challenge import router as challenge_router
from app.routes.owner import router as owner_router
from app.routes.runs import router as runs_router
from app.routes.training import router as training_router
from app.routes.voice import router as voice_router
from app.routes.voice_live import router as voice_live_router
from app.routes.wall import router as wall_router
from app.runs import RunService


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = make_engine()
    init_db(engine)
    seed_house_agents(engine)
    app.state.db_engine = engine
    app.state.clerk_auth = ClerkAuth()
    llm = MistralLLM()
    app.state.run_service = RunService(
        llm, repo=SQLiteRunsRepo(engine), logbook=SQLiteLogbookRepo(engine), engine=engine
    )
    app.state.retest_service = RetestService(llm, engine, app.state.run_service)
    app.state.placement_service = PlacementService(llm, engine)
    yield


app = FastAPI(title="Red Room", lifespan=lifespan)


def cors_origin_regex() -> str | None:
    """One regex (Starlette full-matches it) from CLERK_AUTHORIZED_PARTY_PATTERNS."""
    patterns = settings.clerk_authorized_party_patterns
    return "|".join(f"(?:{p})" for p in patterns) if patterns else None

app.add_middleware(
    CORSMiddleware,
    # CORS_ORIGINS plus the Clerk authorized parties (both are the frontend's
    # origins), and the same preview-deployment patterns as the azp check
    allow_origins=sorted(set(settings.cors_origins) | set(settings.clerk_authorized_parties)),
    allow_origin_regex=cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs_router)
app.include_router(agents_router)
app.include_router(owner_router)
app.include_router(training_router)
app.include_router(wall_router)
app.include_router(challenge_router)
app.include_router(voice_router)
app.include_router(voice_live_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness: the process is up."""
    return {"status": "ok"}


@app.get("/ready")
def ready(request: Request) -> JSONResponse:
    """Readiness: database reachable and Mistral configured. 503 if not."""
    from sqlalchemy import text

    checks: dict[str, bool] = {"mistral_key": bool(settings.mistral_api_key)}
    try:
        with request.app.state.db_engine.connect() as conn:
            conn.execute(text("select 1"))
        checks["database"] = True
    except Exception:
        checks["database"] = False
    ok = all(checks.values())
    return JSONResponse({"status": "ok" if ok else "degraded", "checks": checks}, status_code=200 if ok else 503)


_access_log = logging.getLogger("redroom.access")


@app.middleware("http")
async def access_log(request: Request, call_next):
    """One JSON line per request: method, path (never the query string: it can
    carry tokens), status and duration."""
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        _access_log.info(json.dumps({
            "method": request.method,
            "path": request.url.path,
            "status": status,
            "ms": round((time.perf_counter() - start) * 1000, 1),
        }))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
