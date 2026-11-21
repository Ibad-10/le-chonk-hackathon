"""FastAPI app (Task 6 + V4-3): CORS for the local frontend, /health, run routes.

On startup the SQLite database (config `DATABASE_URL`, default
sqlite:///./redroom.db) is created if missing and the house agents are seeded;
runs are persisted through SQLiteRunsRepo.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import ClerkAuth
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

# Allowed browser origins, comma-separated (deployed frontend + local dev).
_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
