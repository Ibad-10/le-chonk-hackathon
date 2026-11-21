# Red Room: instructions for coding agents (Mistral Vibe)

You are building Red Room at the Mistral "Le Chonk in London" hackathon (Sat 21 Nov 2026, submission 18:00). A reviewer checks every task before the next one starts.

## What Red Room is

A game where players scam AI agents that can take actions (move money, leak files, issue refunds) by voice or text. Every loss goes into the agent owner's logbook. A Large 4 analyst groups losses by root cause and explains them (it does not suggest fixes); the owner fixes the agent by rewriting its instructions, retests the past failures, and publishes a new version. A knowledge graph shows what each agent learned and when; Elo ratings and a held-out exam measure it.

## Read before coding (in this order)

Current source of truth (v4, overrides everything else):
1. `docs/superpowers/specs/2026-11-21-red-room-v4.md` (v4 design; overrides earlier specs wherever they conflict).
2. `docs/superpowers/specs/2026-11-21-red-room-v41.md` (v4.1 additions; v4.1 wins where it conflicts).
3. `docs/superpowers/plans/2026-11-21-red-room-v4.md` (v4 task list; work one task at a time, in order, unless told otherwise).

Background (earlier versions, kept for reference):
4. `docs/superpowers/specs/2026-11-21-red-room-design.md`, especially section 12 (v3 changes override earlier sections).
5. `docs/IMPROVEMENT_MODEL.md`, sections 6b and 6c (agent anatomy, decisions).
6. `docs/superpowers/plans/2026-11-21-red-room.md`: the old task list.
7. `docs/SYSTEM_FLOW.md`: plain-English overview and diagrams of the whole system. `docs/FEATURES.md` section 0 and 3.20 list old priorities; the v4 ranking at the top of `docs/FEATURES.md` wins.
8. `data/` files are prepared inputs: `taxonomy.json`, `customers.json`, `missions.json`, `exam_cases.jsonl` (frozen exam; never edit it, never use it to train or tune anything).

## Rules

- Mistral only. Every AI call uses Mistral models through the Mistral API. Read model IDs and voice IDs from `.env` (see `.env.example`); never hard-code them. Main model `mistral-large-4`; set `reasoning_effort` per job (low for live turns, high for analysis with `max_tokens >= 2000`).
- Check current Mistral docs (docs.mistral.ai) before using any SDK call; preview APIs change. Known: TTS needs `voice_id`; offline evaluations are Enterprise-only; the Agents SDK uses `permission_policy` / `on_approval`, not `requires_confirmation`.
- Never print, log or commit secrets. `.env`, `.env.*` and `*.env.txt` are git-ignored. Testnet only for anything on-chain.
- Test first: write the failing test from the plan, run it, implement, run it again. Show the test output.
- Smallest change that passes. No extra features, files or abstractions beyond the task.
- The backend is the only database writer. The browser only reads and signs in.
- Fictional brands only ("Chonk & Co Bank"). No real banks, people's voices, card numbers or sort codes.
- Moderation: block only hate, sexual, self-harm and violence categories plus card/bank-number regex hits. Scam attempts are the game; never block on `dangerous_and_criminal_content`.
- No Guardian: an agent is only its stream base prompt, owner instructions and knowledge.
- Git: commit after each task with a conventional message (`feat:`, `fix:`, `chore:`). Author: `Ibad Ullah Zuberi <99681549+Ibad-10@users.noreply.github.com>`. Do not add co-author or AI attribution trailers.

## Governance

Mistral Vibe writes every file, commit and push in this repository. Claude (the reviewer) never edits the repository; it reviews, runs tests and sends instructions. Follow the plan task by task: test first, smallest change, commit, then stop and report tersely (files, test command and output, guesses).

## When you finish a task

Stop and report:
1. Task number and name.
2. Files created or changed.
3. The exact test command and its output.
4. Anything you guessed or couldn't do.

Then wait for review before starting the next task.
