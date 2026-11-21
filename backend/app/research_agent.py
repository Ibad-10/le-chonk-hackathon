"""Bonus track "Mistral Agents": the research agent (v4 §3.5, plan V4-13).

A Mistral Agents SDK agent (`mistralai-agents`, model `mistral-large-4` from
.env, reasoning high) with Mistral's built-in `web_search` connector scans
this week's public scam reports (UK Finance, Action Fraud, Which?, FCA, NCSC,
FTC and any reputable news), extracts NEW social-engineering tactics relevant
to banking assistants, refund/customer-support bots and personal assistants,
and returns structured output:

    [{tactic_name, family, summary, source_url, example_opening_line, source}]

`family` is an id from data/taxonomy.json. Real people's personal data is never
included. If the Agents SDK or the web-search tool fails, the same request
falls back to a strict `json_schema` chat-completions call through `LLMClient`
and every tactic is then marked `source: "model_knowledge"`.

Scans are persisted in the `research_scans` table (registered on
`SQLModel.metadata` at import time, so `init_db` creates it at startup).
`GET /research/latest` serves only tactic names, families and source links —
never summaries or example lines.
"""


from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, Field
from sqlalchemy import Column, Engine, JSON
from sqlmodel import Field as SQLField
from sqlmodel import Session, SQLModel, select

from app.config import settings
from app.llm import LLMClient

REPO_ROOT = Path(__file__).resolve().parents[2]
TAXONOMY_PATH = REPO_ROOT / "data" / "taxonomy.json"

RESEARCH_TIMEOUT_S = 120.0
MAX_TACTICS = 20
SOURCE_WEB_SEARCH = "web_search"
SOURCE_MODEL_KNOWLEDGE = "model_knowledge"


# --- structured output --------------------------------------------------------


class Tactic(BaseModel):
    tactic_name: str
    family: str  # id from data/taxonomy.json
    summary: str
    source_url: str = ""
    example_opening_line: str = ""
    source: str = SOURCE_WEB_SEARCH  # web_search | model_knowledge


class TacticReport(BaseModel):
    source: str = SOURCE_WEB_SEARCH  # web_search | model_knowledge (per tactic too)
    tactics: list[Tactic] = Field(default_factory=list, max_length=MAX_TACTICS)


# --- persistence ----------------------------------------------------------------


class ResearchScan(SQLModel, table=True):
    """One research-agent scan (full structured output, backend-only)."""

    __tablename__ = "research_scans"

    id: str = SQLField(primary_key=True)
    source: str  # web_search | model_knowledge
    tactics: list[Any] = SQLField(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


def load_taxonomy() -> dict[str, Any]:
    return json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))


def taxonomy_families() -> list[str]:
    return [f["id"] for f in load_taxonomy().get("families", [])]


def save_scan(engine: Engine, report: TacticReport) -> ResearchScan:
    scan = ResearchScan(
        id=uuid.uuid4().hex,
        source=report.source,
        tactics=[t.model_dump() for t in report.tactics],
    )
    with Session(engine) as session:
        session.add(scan)
        session.commit()
        session.refresh(scan)
    return scan


def latest_scan(engine: Engine) -> ResearchScan | None:
    with Session(engine) as session:
        return session.exec(
            select(ResearchScan).order_by(ResearchScan.created_at.desc())
        ).first()


def public_tactics(tactics: list[Any]) -> list[dict[str, str]]:
    """The public projection: tactic names, families and source links only."""
    out: list[dict[str, str]] = []
    for t in tactics:
        if isinstance(t, Tactic):
            out.append(
                {"tactic_name": t.tactic_name, "family": t.family, "source_url": t.source_url}
            )
        elif isinstance(t, dict):
            out.append(
                {
                    "tactic_name": str(t.get("tactic_name", "")),
                    "family": str(t.get("family", "")),
                    "source_url": str(t.get("source_url", "")),
                }
            )
    return out


# --- the research agent -----------------------------------------------------------


_SYSTEM = (
    "You are the Red Room research agent. Use web search to find THIS WEEK's public "
    "scam reports and news from UK Finance, Action Fraud, Which?, the FCA, the NCSC, "
    "the FTC and any reputable news outlet. Extract NEW social-engineering tactics "
    "relevant to banking assistants, refund / customer-support bots and personal "
    "assistants: the pretext, what the caller claims, the pressure technique and the "
    "ask. Classify each tactic into exactly one family from this taxonomy (use the "
    "exact family id): {families}. For each tactic return tactic_name, family, summary "
    "(1-2 sentences), source_url (the report or article URL) and example_opening_line "
    "(the attacker's first line, fictionalised). NEVER include real people's personal "
    "data (no real names of private individuals, card numbers, account or sort-code "
    "details). Fictional brands only. Return at most {max_tactics} tactics, newest "
    "first. If nothing new is found, return an empty list."
)


def _payload(week_of: str) -> str:
    families = ", ".join(
        f"{f['id']} ({f['label']})" for f in load_taxonomy().get("families", [])
    )
    return (
        f"Week of {week_of}. Search for this week's public scam reports and advisories "
        f"(UK Finance, Action Fraud, Which?, FCA, NCSC, FTC, reputable news), focused on "
        f"attacks that target bank assistants, refund bots and personal assistants. "
        f"Taxonomy families: {families}. Return the structured tactic list."
    )


async def _agents_sdk_web_search(system: str, payload: str) -> TacticReport:
    """Run the research agent on the Mistral Agents SDK (bonus track) with
    Mistral's built-in `web_search` connector (checked against the installed
    `mistralai-agents` 1.1.3: `Agent(connectors=[agents.connector("web_search")])`,
    built-in connectors include "web_search" per docs.mistral.ai/agents/tools).
    """
    from mistralai import agents as mistral_agents

    agent = mistral_agents.Agent(
        model=settings.mistral_model_main,
        name="redroom-research",
        instructions=system,
        reasoning_effort="high",
        output_type=TacticReport,
        connectors=[mistral_agents.connector("web_search")],
    )
    result = await agent.run(payload, timeout=RESEARCH_TIMEOUT_S)
    output = getattr(result, "output", None)
    if isinstance(output, TacticReport):
        return output
    if output is not None:
        return TacticReport.model_validate(output)
    return TacticReport.model_validate_json(result.text)


ResearchRunFn = Callable[[str, str], Awaitable[TacticReport]]


async def research_scam_tactics(
    llm: LLMClient,
    agent_run: ResearchRunFn | None = None,
    week_of: str | None = None,
) -> TacticReport:
    """Scan this week's scam news and return the structured tactic list.

    Tries the Mistral Agents SDK agent with web search first; on ANY failure
    falls back to a strict `json_schema` chat-completions call through `llm`
    and marks every tactic `source: "model_knowledge"`.
    """
    week = week_of or datetime.now(timezone.utc).date().isoformat()
    families = ", ".join(taxonomy_families())
    system = _SYSTEM.format(families=families, max_tactics=MAX_TACTICS)
    payload = _payload(week)
    run_agent = agent_run or _agents_sdk_web_search
    try:
        report = await run_agent(system, payload)
        if not isinstance(report, TacticReport):
            report = TacticReport.model_validate(report)
        report.source = SOURCE_WEB_SEARCH
        for tactic in report.tactics:
            tactic.source = SOURCE_WEB_SEARCH
        return report
    except Exception:
        report: TacticReport = await llm.json(
            model=settings.mistral_model_main,
            system=system,
            messages=[{"role": "user", "content": payload}],
            schema=TacticReport,
            reasoning_effort="high",
            timeout_s=RESEARCH_TIMEOUT_S,
        )
        report.source = SOURCE_MODEL_KNOWLEDGE
        for tactic in report.tactics:
            tactic.source = SOURCE_MODEL_KNOWLEDGE
        return report
