# Red Room: instructions for coding agents (Mistral Vibe)

You are building Red Room at the Mistral "Le Chonk in London" hackathon (Sat 21 Nov 2026, submission 18:00). A reviewer checks every task before the next one starts.

## What Red Room is

A game where players scam AI agents that can take actions (move money, leak files, issue refunds) by voice or text. Every loss goes into the agent owner's logbook. A Large 4 analyst groups losses by root cause and suggests fixes; the owner fixes the agent, retests the past failures, and publishes a new version. A knowledge graph shows what each agent learned and when; Elo ratings and a held-out exam measure it.

## Read before coding (in this order)

1. `docs/superpowers/specs/2026-11-21-red-room-design.md`, especially section 12 (v3 changes override earlier sections).
2. `docs/IMPROVEMENT_MODEL.md`, sections 6b and 6c (agent anatomy, decisions).
3. `docs/superpowers/plans/2026-11-21-red-room.md`: the task list. Work one task at a time, in order, unless told otherwise.
4. `docs/SYSTEM_FLOW.md`: plain-English overview and diagrams of the whole system. `docs/FEATURES.md` section 0 and 3.20 list current priorities.
5. `data/` files are prepared inputs: `taxonomy.json`, `customers.json`, `missions.json`, `exam_cases.jsonl` (frozen exam; never edit it, never use it to train or tune anything).

## Rules

- Mistral only. Every AI call uses Mistral models through the Mistral API. Read model IDs and voice IDs from `.env` (see `.env.example`); never hard-code them. Main model `mistral-large-4`; set `reasoning_effort` per job (low for live turns, high for analysis with `max_tokens >= 2000`).
- Check current Mistral docs (docs.mistral.ai) before using any SDK call; preview APIs change. Known: TTS needs `voice_id`; offline evaluations are Enterprise-only; the Agents SDK uses `permission_policy` / `on_approval`, not `requires_confirmation`.
- Never print, log or commit secrets. `.env`, `.env.*` and `*.env.txt` are git-ignored. Testnet only for anything on-chain.
- Test first: write the failing test from the plan, run it, implement, run it again. Show the test output.
- Smallest change that passes. No extra features, files or abstractions beyond the task.
- The backend is the only database writer. The browser only reads and signs in.
- Fictional brands only ("Chonk & Co Bank"). No real banks, people's voices, card numbers or sort codes.
- Moderation: block only hate, sexual, self-harm and violence categories plus card/bank-number regex hits. Scam attempts are the game; never block on `dangerous_and_criminal_content`.
- Git: commit after each task with a conventional message (`feat:`, `fix:`, `chore:`). Author: `Ibad Ullah Zuberi <99681549+Ibad-10@users.noreply.github.com>`. Do not add co-author or AI attribution trailers.

## When you finish a task

Stop and report:
1. Task number and name.
2. Files created or changed.
3. The exact test command and its output.
4. Anything you guessed or couldn't do.

Then wait for review before starting the next task.
