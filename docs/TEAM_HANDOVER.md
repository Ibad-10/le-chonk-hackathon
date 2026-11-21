# Red Room: team handover

## Status at 17:40

- Live frontend: https://red-room-steel.vercel.app (Vercel).
- Backend runs on Ibad's laptop behind a Cloudflare quick tunnel. The tunnel URL changes on every restart, so the frontend's backend URL must be updated after a restart. Hugging Face free Docker Spaces need PRO, and the Render free tier sleeps, so neither is used.
- Merged: create-agent wizard with placement test, my agents, Zohaib's UI polish (PR #1), design pass on the leaderboard, agent and graph pages.
- In flight: run ownership auth, published versions used in play, genuine payee, tool errors continue the run, Elo and XP persistence, timer ticking, breach counter, no mock fallback mid-run.

Last updated: Sat 21 Nov 2026, about 14:50, Le Chonk in London (Mistral Vibe Hackathon). Submission due 18:00 with a demo video; 5-minute live pitch to the jury.

If you are a coding agent (Claude Code, Vibe, Cursor): read this file, then `AGENTS.md`, then the v4 and v4.1 specs below, before changing anything.

## 1. What Red Room is

A game where people try to talk AI agents into doing something they shouldn't (send money to a scammer, leak a private file, give a refund nobody is owed), by live voice call or live chat, in any language. Anyone can build an agent from instructions and knowledge in a "stream" (banking, refunds, personal assistant). Every successful scam goes into the owner's logbook; a Mistral Large 4 analyst groups failures by root cause and marks the breaking moment, but never suggests fixes. The owner rewrites the agent, retests every past failure (plus 3 reworded variants, 3 times each), and publishes a new version. Elo ratings carry over between versions. The agent's knowledge graph is shown as a 3D village: each defence it learned is a building; attackers' troops march at the buildings during a live run; a break storms the treasury for 3 stars.

Tagline: "Talk them into it. If you can."

The UI is the teammate's area now.

## 2. Hackathon tracks we are targeting

- Track 1 (anything around Mistral Vibe and Large 4: agents, skills, MCPs, scheduled tasks): every commit in this repo is written by Mistral Vibe on Large 4; Red Room MCP server lets Vibe red-team agents; research agent runs on a schedule.
- Bonus £500 (Mistral Agents and/or Workflows): the analyst and the research agent run on the Mistral Agents SDK (`mistralai-agents`); say where in the pitch.
- Special £250 (best use of Voxtral): live voice calls with Voxtral realtime transcription and Voxtral TTS, multilingual.

## 3. Documents (read in this order)

| File | What it is |
|---|---|
| `AGENTS.md` | Rules for coding agents (Mistral only, test first, no secrets, commit identity, governance) |
| `docs/superpowers/specs/2026-11-21-red-room-v4.md` | Current design (source of truth) |
| `docs/superpowers/specs/2026-11-21-red-room-v41.md` | v4.1 additions (Supabase + Clerk, dealt hidden roles, breaking moment, version diff, arena wall, sharing); wins over v4 where they conflict |
| `docs/superpowers/plans/2026-11-21-red-room-v4.md` | Task plan V4-1 to V4-22 |
| `docs/FEATURES.md` | Feature ranking at the top (MUST / SHOULD / NICE); older brainstorm below |
| `docs/COMPETITORS.md` | Competitor analysis and judge Q&A answers |
| `docs/IMPROVEMENT_MODEL.md`, `docs/SYSTEM_FLOW.md` | Earlier design notes and diagrams (partly superseded by v4) |
| `docs/MCP.md` | Red Room MCP server and how to register it in Vibe |
| `docs/DEPLOY.md`, `docs/DEMO.md` | Deploy runbook; 5-minute pitch script and demo video shot list |
| `docs/UI_BRIEF.md` | UI overhaul brief (quality bar, colours, fonts, components, 3D fixes, self-check) |
| `docs/UI_HANDOFF.md` | UI task list for the teammate: current problems, causes and fixes |
| `README.md` | Public overview with diagrams |

## 4. Architecture

- Backend: Python FastAPI (`backend/app`), SQLModel on Supabase Postgres, Clerk session verification (JWKS), Mistral SDK. Key modules: `engine/` (agent turn, sandbox tools per stream, executor, win checks), `runs.py` (run lifecycle, limits, dealt roles, Elo), `analyst.py` (Agents SDK), `retest.py` (sibling variants, adaptive replay, labels), `voice*.py` (push-to-talk and live WebSocket voice), `research_agent.py` + `training.py` (house agents only), `mcp_server.py`, `routes/`.
- Frontend: Next.js (App Router) in `frontend/`, Clerk, Tailwind, shadcn/ui; 3D village with three.js (@react-three/fiber, drei) and Kenney CC0 models in `frontend/public/base/`; 2D Siege view with Kenney CC0 sprites in `frontend/public/siege/`.
- Models (all Mistral): `mistral-large-4` (agents, attacker, analyst, research; reasoning effort per job), Voxtral 3 realtime transcription and TTS, `mistral-moderation-2603`, `mistral-embed`. IDs come from `.env`.
- No Guardian: an agent is only its stream base prompt + owner instructions + knowledge. Wins are decided by code from sandbox tool calls, never by an AI opinion.

## 5. Running it locally

1. Ask Ibad for the `.env` values (never commit them). Variable names are in `.env.example`.
2. Backend: `cd backend && uv sync && uv run uvicorn app.main:app --reload` (reads `../.env`).
3. Frontend: `cd frontend && npm install --legacy-peer-deps && npm run dev` (needs `frontend/.env.local`; generate it with `uv run python backend/scripts/make_frontend_env.py` from the repo root, or ask Ibad).
4. Tests: `cd backend && uv run pytest -q`; `cd frontend && npx vitest run && npm run build`.
5. End-to-end check: `cd backend && uv run python scripts/e2e_smoke.py`.
6. Demo data: `uv run python backend/scripts/seed_demo.py` (and `--wipe`).

## 6. Branches and status

| Branch | Status |
|---|---|
| `main` | Everything merged and reviewed: backend, frontend pages, Siege, 3D village (rendering broken, see docs/UI_HANDOFF.md), live voice with verified Clerk auth, MCP server, research agent + training, deploy/demo docs, handover |
| `frontend-v4`, `base-view`, `mcp-server`, `research-agent`, `deploy-prep`, `voice-v4`, `team-handover` | All merged into main; kept only for history |
| UI work | Teammate branches `ui-polish` from main and opens a PR |

Workflow: one feature branch per task, tests first, small commits, reviewer (Claude) checks before merge, then push. Commit author on this repo is Ibad's identity (see AGENTS.md); do not add AI co-author trailers.

## 7. Timeline to submission

| Time | Step |
|---|---|
| now to 15:15 | Merge #2 (voice, Siege, village, MCP) and merge #3 (research agent, deploy) into main |
| 15:15 to 16:30 | UI overhaul (see docs/UI_BRIEF.md) |
| 16:30 | Deploy: frontend on Vercel, backend from Ibad's laptop via cloudflared tunnel; phone smoke test |
| 17:00 | Feature freeze, bug fixes only |
| 17:00 to 17:30 | Record the demo video (docs/DEMO.md shot list) |
| 17:30 to 18:00 | Submit; rehearse the 5-minute pitch |

## 8. What teammates can pick up now

1. UI: follow docs/UI_HANDOFF.md in order (3D village textures, lighting, camera and troops first; then emoji, colours, fonts, components, flow).
2. 3D village art direction: textures, lighting, grass, troop animation, building variety (Kenney Fantasy Town Kit, Castle Kit, Mini Characters, all CC0).
3. Pitch deck (5 minutes) and the demo video, from docs/DEMO.md; business slide from docs/COMPETITORS.md and the README.
4. Test play: play Ava, Max and Pip by text and voice, try to break them, report bugs as GitHub issues with the transcript.
5. Content: more genuine-customer briefs and missions per stream in `data/missions.json` and the stream targets.

## 9. Known issues and decisions

- 3D village currently renders white and empty; fix is in docs/UI_BRIEF.md section "3D village fixes".
- Voice latency: about 5 s end of speech to first audio, up to 10 s on slow turns; agent turn on Large 4 low reasoning is the main cost. Pipeline overhead 1.3-4 s; Large 4 time-to-first-token occasionally spikes to about 25 s; set VOICE_AGENT_MODEL to the fallback model in .env if it happens during the demo.
- Clerk tokens minted server-side carry no `azp`; accepted only when signed by our Clerk instance with a session id (see backend/app/auth.py).
- Mistral offline evaluations are Enterprise-only, so we run our own exam and retest.
- Blockchain bounties were dropped; rewards are points, ranks, credits; Stripe test mode bounty is a NICE item.
- Licences: all art is Kenney CC0 (credited in CREDITS.md files); Large 4's licence restricts Model-as-a-Service resale (see README).
- Cleanup after the event: delete MISTRAL_HANDOVER.md and docs/PREP.md (personal planning notes).
