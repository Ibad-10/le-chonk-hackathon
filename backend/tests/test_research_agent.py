"""Bonus track "Mistral Agents": research-agent tests on fakes.

Covers the structured output schema (tactic_name, family from data/taxonomy.json,
summary, source_url, example_opening_line, source), the Agents-SDK-with-web-search
path (source "web_search"), the chat-completions fallback that marks every tactic
`source: "model_knowledge"`, scan persistence and the public /research/latest
projection (names, families, source links only).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import init_db, make_engine
from app.research_agent import (
    SOURCE_MODEL_KNOWLEDGE,
    SOURCE_WEB_SEARCH,
    Tactic,
    TacticReport,
    latest_scan,
    public_tactics,
    research_scam_tactics,
    save_scan,
    taxonomy_families,
)
from app.routes.training import router as training_router


class JsonFakeLLM:
    """LLMClient fake that only answers the TacticReport json call."""

    def __init__(self, report: TacticReport):
        self.report = report
        self.json_calls: list[str] = []

    async def json(self, model, system, messages, schema, reasoning_effort, timeout_s):
        assert schema is TacticReport
        assert reasoning_effort == "high"
        self.json_calls.append(schema.__name__)
        return self.report


def _report() -> TacticReport:
    return TacticReport(
        tactics=[
            Tactic(
                tactic_name="Deepfake kidnap call to a bank agent",
                family="relative_in_trouble",
                summary="Caller plays a distressed relative and uses a voice clone to push an urgent transfer.",
                source_url="https://www.actionfraud.police.uk/example-advisory",
                example_opening_line="It's me, I've been kidnapped, please send money now.",
            ),
            Tactic(
                tactic_name="Refund agent parcel-redelivery fee",
                family="tech_support",
                summary="Fake courier refund flow to harvest card details via a refund link.",
                source_url="https://www.which.co.uk/example",
                example_opening_line="Your parcel is held, pay a small redelivery fee to release it.",
            ),
        ]
    )


async def test_sdk_path_returns_structured_tactics_marked_web_search():
    report = _report()

    async def agent_run(system, payload):
        assert "UK Finance" in system and "web" in system.lower()
        return report

    out = await research_scam_tactics(JsonFakeLLM(_report()), agent_run=agent_run, week_of="2026-11-21")
    assert len(out.tactics) == 2
    for tactic in out.tactics:
        # full structured schema
        assert tactic.tactic_name and tactic.summary
        assert tactic.source_url.startswith("https://")
        assert tactic.example_opening_line
        assert tactic.source == SOURCE_WEB_SEARCH
        # family comes from data/taxonomy.json
        assert tactic.family in taxonomy_families()


async def test_fallback_to_chat_completions_marks_model_knowledge():
    async def failing_agent_run(system, payload):
        raise RuntimeError("agents SDK / web_search unavailable")

    llm = JsonFakeLLM(_report())
    out = await research_scam_tactics(llm, agent_run=failing_agent_run)
    assert llm.json_calls == ["TacticReport"]  # fell back to chat completions
    assert out.tactics
    assert all(t.source == SOURCE_MODEL_KNOWLEDGE for t in out.tactics)


def test_scan_roundtrip_and_public_projection(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/research.db")
    init_db(engine)  # research_scans table is registered at import time
    assert latest_scan(engine) is None
    scan = save_scan(engine, _report())
    latest = latest_scan(engine)
    assert latest is not None and latest.id == scan.id
    assert latest.source == SOURCE_WEB_SEARCH
    pub = public_tactics(latest.tactics)
    assert pub == [
        {
            "tactic_name": "Deepfake kidnap call to a bank agent",
            "family": "relative_in_trouble",
            "source_url": "https://www.actionfraud.police.uk/example-advisory",
        },
        {
            "tactic_name": "Refund agent parcel-redelivery fee",
            "family": "tech_support",
            "source_url": "https://www.which.co.uk/example",
        },
    ]
    # the public projection never carries summaries or example lines
    assert all(set(t.keys()) == {"tactic_name", "family", "source_url"} for t in pub)


def test_research_latest_route_is_public_and_safe(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path}/research_api.db")
    init_db(engine)
    save_scan(engine, _report())
    app = FastAPI()
    app.state.db_engine = engine
    app.include_router(training_router)
    client = TestClient(app)

    empty = TestClient(_empty_app(tmp_path / "empty.db"))
    resp = empty.get("/research/latest")
    assert resp.status_code == 200
    assert resp.json()["tactics"] == []

    resp = client.get("/research/latest")  # no auth header: public
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == SOURCE_WEB_SEARCH
    assert len(data["tactics"]) == 2
    for tactic in data["tactics"]:
        assert set(tactic.keys()) == {"tactic_name", "family", "source_url"}
    assert "summary" not in resp.text
    assert "example_opening_line" not in resp.text
    assert "kidnapped" not in resp.text


def _empty_app(db_path) -> FastAPI:
    engine = make_engine(f"sqlite:///{db_path}")
    init_db(engine)
    app = FastAPI()
    app.state.db_engine = engine
    app.include_router(training_router)
    return app
