# Red Room: feature brainstorm

Mistral "Le Chonk in London" Vibe Hackathon, Sat 21 Nov 2026. Written about 01:00 on the day.

This builds on `MISTRAL_HANDOVER.md`. The idea is decided (Red Room). Nothing from the handover is cut here. New items are marked NEW; items from the handover are marked H with their handover number.

## v4 ranking (current, overrides everything below)

From `docs/superpowers/specs/2026-11-21-red-room-v4.md` section 6; plan tasks from `docs/superpowers/plans/2026-11-21-red-room-v4.md`.

### MUST (working by 15:30)

| ID | Feature | Why it matters | Plan task |
|---|---|---|---|
| V4-M1 | Live text chat with an agent (streaming), multi-turn, with limits | Core arena channel; works where voice or Wi-Fi fails | V4-2 |
| V4-M2 | Live voice call with Ava (Voxtral in and out), with limits | The theatrical demo moment and the voice-prize angle | V4-10 |
| V4-M3 | Language auto-detect; agent replies in the caller's language | Scammers target non-native speakers; strong demo moment | V4-2 |
| V4-M4 | Three streams' sandbox tools; win detection by code (no AI opinion) | Every agent in a stream faces the same test | V4-4 |
| V4-M5 | Logbook with root-cause grouping (analyst explains, no fixes) | Turns every loss into owner-usable evidence | V4-5 |
| V4-M6 | Owner draft editor (2,000-char instructions + knowledge) | Writing a tight prompt is a skill; the owner's second game | V4-8 |
| V4-M7 | Retest loop (3x replay + paraphrased variants + genuine cases); fixed failures saved | Proves a fix generalises instead of memorising one attack | V4-6 |
| V4-M8 | Publish new version; Elo carry-over; cooldown after a loss | Ratings never reset; cooldown stops the same hole being hit again and again | V4-5, V4-6 |
| V4-M9 | Visual owner-only knowledge graph with learned nodes | Shows what each agent learned and when; private so top agents can't be copied | V4-9 |
| V4-M10 | Arena page and leaderboards (players, agents), guest sign-in | Room play needs zero-friction join | V4-7 |
| V4-M11 | Demo video by 17:30 | Required by the event rules | V4-11 |

### SHOULD

| ID | Feature | Why it matters | Plan task |
|---|---|---|---|
| V4-S1 | Create-agent wizard (stream pick, instructions, knowledge) | Makes "any agent" real for creators | V4-17 |
| V4-S2 | Placement test and A-F grade | Anchors ratings; an agent that blocks everyone can't score an A | V4-12 |
| V4-S3 | Research agent for house agents (Mistral Agent with web search, scheduled) | Keeps house agents hard; benchmark tracks real-world scams | V4-13 |
| V4-S4 | Analyse, owner edits, retest as a Mistral Workflow with the Studio timeline | Bonus track (Agents/Workflows) | V4-15 |
| V4-S5 | Red Room MCP server so Vibe can attack an agent and read its logbook | Track 1 MCP demo from inside Vibe | V4-14 |
| V4-S6 | Badges, ranks, daily scam challenge | Retention and spectacle | V4-16 |

### NICE

| ID | Feature | Why it matters | Plan task |
|---|---|---|---|
| V4-N1 | Agent-vs-agent duels voiced on the projector | Spectacle between pitches | — |
| V4-N2 | Company private arenas | The enterprise story | — |
| V4-N3 | Export package (instructions, knowledge, regression tests, report) | The deliverable an owner takes home | — |
| V4-N4 | Stripe test-mode bounty for First Blood on house agents | Real-money feel without wallets; replaces testnet bounties | NICE (needs Stripe test keys) |
| V4-N5 | Generalisation score on the agent page | Rewards cause-level fixes over banned-word lists | V4-6 |
| V4-N6 | House-agent training cycles with automatic rollback | House agents keep getting harder, with an honest log | V4-13 |

Everything below is the earlier brainstorm, kept for reference; where it conflicts with v4, v4 wins.

Removed or changed in v4:
- Guardian (all L1, M7, CR7 and Guardian mentions)
- analyst fix suggestions (CR2 fix part, CR3 one-click accept)
- blockchain bounties (C1-C8, replaced by Stripe test-mode First Blood)
- public knowledge graphs (V3 public view, K2 public)
- hourly waves

Tiers:
- MUST: core loop, working and demoable by about 15:00.
- SHOULD: build once the core loop works.
- NICE: build if time allows, or in parallel by whoever is free.
- STRETCH: only after everything above is green.
- WON'T (today): out of scope for this event.

Owners follow handover §13: A = voice and Ava, B = Guardian, Teacher and AI Scammer, C = frontend, D = data, exam, contract and pitch. Effort: S = under 45 min, M = 45 min to 2 h, L = over 2 h.

## 0. Status at 11:15 (v3): read this first

The event tracks are known and the direction changed. Where anything below conflicts, these win (full detail in spec §12, `docs/IMPROVEMENT_MODEL.md`, `docs/SYSTEM_FLOW.md`):
- Tracks: Track 1 "anything around Mistral Vibe and Large 4: agents, skills, MCPs, scheduled tasks"; bonus £500 for Mistral Agents and/or Workflows; £250 best use of Voxtral; 5-minute live pitch plus demo video by 18:00.
- Owners improve their own agents (logbook, Large 4 analyst, 3x retest, publish). The automatic Teacher (L2, L3, U5, K9 as written) now applies only to our house agents.
- Large 4 everywhere; Small 4 only as fallback (M2 changes).
- Guardian off by default on creator agents; the logbook estimates what it would save.
- Elo: placement test, then Arena; rating carries over between versions (Glicko-style widening), never reset.
- Waves: three 30-minute waves from 15:30 (spec §10), not hourly from 11:00 (§3.0 below is stale on this).
- Section 3.20 below adds the creator-side features v3 needs.
- Still waiting on Ibad: the critic's proposed cuts (chain bounties, waves, lives, jackpot, city, 4-language UI). Nothing has been cut.

## 1. Tracks and theme

Nothing is published yet. The Luma page lists no tracks, theme, judging criteria, rules on pre-written code, pitch length or submission format; all of that comes at the 9:00 briefing.

What we can infer:
- The event is called a "Mistral Vibe Hackathon" and is named after Le Chonk (Mistral Large 4). Expect judges to look for Large 4 used where it matters, and possibly for Mistral Vibe used to build the project.
- The Mistral Worldwide Hackathon 2026 gave special prizes for best voice use case, best use of Mistral Vibe and best video game project.
- The Paris 2026 winner's write-up reported equal 20% weights for technical depth, creativity, usefulness, demo and track fit. That was a different event, so treat it as a guide only.

If a track or prize is announced, lead with the matching angle:

| Track or prize | Lead with | Features to push |
|---|---|---|
| Best voice use case | Live call to Ava, captions, multilingual scams, AI-vs-AI voiced battle | G1, A2, A7, G10 |
| Best use of Vibe | Built with Vibe CLI/Desktop, session logs in the pitch, Scout built with the workflow builder | I1, M10 |
| Best game | Missions, difficulty ladder, points, badges, spectator arena | G2, G5, G7, U8, U11 |
| Security, agents or safety | Guardian outside the agent, rule gating, exam, OWASP mapping | L1-L4, L7, B3 |
| Enterprise or business | Plug in your agent, Guardian pack export, red-team report | B1, L13, B3 |
| Large 4 / Le Chonk focus | `reasoning_effort` split, Teacher at high effort, 1M-context consolidation | M1, L12 |
| Theme doesn't fit Red Room | Handover §14 fallbacks | |

Decide early which coding tools the team uses. This is a Vibe hackathon, and a team that builds only with Claude Code may miss a "best use of Vibe" prize. Claim Vibe Pro with code `LECHONK`, use Vibe for at least part of each role's work, and keep the session logs for the pitch.

## 2. New Mistral tools since the handover research

Most of these launched on 5 Nov 2026 as public previews (source: Mistral release notes and changelog). Check the docs and console on the day, because preview APIs change and the pages we read may have been cached copies.

| Tool | What it does | Use in Red Room | Tier |
|---|---|---|---|
| Evaluation SDK (`mistralai-evaluations`) + managed datasets | Offline evaluation runs over uploaded CSV/JSONL datasets | Store the frozen exam set as a managed dataset. Run each Guardian version as an evaluation. The exam chart reads the results. | NICE. The docs say offline evaluations are for Enterprise-tier organisations only, so hackathon keys probably can't use it. Ask a mentor; our own exam runner stays MUST. |
| Conversations API tool confirmation (`requires_confirmation`, `DeferredToolCallsException`) | Pauses chosen tool calls until something approves or rejects them | Register `add_payee` and `send_payment` with `requires_confirmation=True`. The Guardian, not a human, approves or rejects each deferred call. This puts the Guardian outside Ava using Mistral's own mechanism, on the text path (text mode, AI Scammer, exam). | SHOULD (MUST if the quickstart works in the first hour) |
| Datasets from production telemetry | Turns trace spans into dataset records | Every traced attack becomes a dataset record: "every attack becomes a test case". Keep it separate from the frozen exam. | SHOULD |
| Online evaluations | Scores live production traces | Score live calls: was Ava helpful to genuine callers, did the Guardian cite a rule? | NICE |
| Managed Agents (`mistralai-agents`) | Agents with durable background runs, approvals, guardrails, connectors/MCP and tracing | Run the Teacher with an approval step, so a human signs off each new rule. A lighter route than Workflows for the human-in-the-loop story. | SHOULD |
| Tracing for managed agents | Agent, model and tool spans, on by default | Debrief shows the trace: Ava's turn, then the tool call, then the Guardian check and decision. Judges are Mistral engineers, so showing their own tooling helps. | NICE |
| Managed search index | Hosted vector index | (a) Before creating a new tactic, find the nearest existing one and merge. (b) The Guardian pulls the top few relevant rules per call instead of the whole rulebook, so the rulebook can keep growing. | SHOULD |
| Webhooks and triggers | Start workflows or agents from events | An "attack succeeded" event starts the Teacher. A schedule runs the Scout. | NICE |
| Workflow builder | Describe a workflow in plain English and Vibe builds, tests and deploys it | Build the Scout pipeline by describing it. Good pitch moment for a Vibe prize. | NICE |
| Mistral Apps CLI (`mistral apps init/dev/deploy`) | Scaffold and deploy Studio apps | Optional deploy route | NICE |
| Vibe Desktop (17 Nov, GA, macOS and Windows) | Local and cloud coding sessions, git worktrees, terminal, code review | Build tool. One session per role. | SHOULD |
| Voxtral TTS 3 voice cloning | Zero-shot cloning from a sample | Voices for fictional characters only. See G19 for a careful stretch idea. | NICE |
| HTTP API connectors | Register plain HTTP APIs as connectors | Private preview, so we probably can't get access | WON'T (today) |
| Secrets Manager | Secrets for managed deployments | Only needed if we use managed deployments | NICE |

Already covered in the handover: Large 4, Small 4, Voxtral 3, Voice Agents SDK, Moderation, OCR 4.1, Workflows, Studio.

The changelog's newest model entry is 29 Oct (Large 4 `reasoning_effort`). Z.ai's GLM 5.3 Flash is also on the platform, but it isn't a Mistral model, so skip it.

## 3. Features by area

### 3.0 How the game is structured (proposal, needs Ibad's OK)

Two ways to attack, same Ava, same Guardian, same tools, same points:
- Voice: the player speaks; Voxtral realtime transcribes; Small 4 decides; Voxtral TTS gives Ava her voice. No ElevenLabs needed.
- Text chat: for players who don't want to speak, deaf or hard-of-hearing players, noisy rooms and bad Wi-Fi. The AI Scammer and the exam use this path too, so it is nearly free to build.

One attempt is a "run":
- Voice run: 2:00 timer. Text run: 3:00 timer or 12 messages, whichever comes first.
- A run ends on a win (the forbidden tool call happens), a Guardian block, timeout or hang-up.
- After every run: debrief, points, and the knowledge graph updates.

#### Structure v2 (after looking at Gandalf, Tensor Trust, Gray Swan Arena and energy-system design)

What those games teach us:
- Gandalf has 7 fixed levels, and each one adds one new defence. Players learn as they climb, and 200,000 people finished all 7. A newcomer never faces the hardest defence first.
- In Tensor Trust, winning tricks spread through the game until most defences block them, so the game moves in "waves" of tactics. Players can see the attacks made against them.
- Gray Swan's arenas run in timed waves (a new set of targets each wave) and split each wave's prize pool across all breaks, plus prizes for the top finishers.
- Lives and energy systems annoy players when they block them early or add friction without choices. One live event gave unlimited health in the first episode so energy never felt like a wall.

The risk in our v1 structure: the Guardian learns, so by mid-afternoon a newcomer faces a hardened Guardian, fails three times, runs out of lives and leaves. Early players also take all the First Blood bonuses.

The structure in three layers:

1. Training ladder (Gandalf-style, solo, no lives, always beatable). Five fixed levels, each adding one defence: L1 no defences; L2 Ava is told to refuse; L3 Ava must verify identity; L4 a frozen Guardian v1; L5 Guardian v1 plus step-ups. Finishing L3 unlocks the Arena. This is the tutorial, and it teaches what each defence does.
2. Arena (the live, learning Guardian), run in hourly waves from 11:00 to 17:00. Each wave unlocks something new so late joiners get a fresh start: a new customer, a new mission, then the business account, then the Agent Hijack PDF level if built. Each wave has its own leaderboard and its own prize pool, split across every break in that wave, plus First Blood for whoever beats each new Guardian version first.
3. Defender side (two-sided, like Tensor Trust). Genuine-customer mode (G11) and rule review (G12) earn points too. They also refill lives, so players who keep losing can still play.

Lives apply only in the Arena: 3 lines, one refills every 5 minutes, and a near miss refunds the line. The training ladder and text chat practice never cost a line.

Fairness and feel:
- After a break, the board shows a short "patch incoming" countdown while the Teacher writes and gates the rule. Others see that a break happened and which tactic family it used, never the script.
- Stop the game becoming impossible: the Guardian's rulebook goes through the gating check on genuine cases, and the Arena shows its catch rate. If it climbs past about 90%, the next wave adds an easier mission.
- Give feedback every run: a suspicion meter, a clear reason when blocked, and a debrief with one tip. A near miss should feel close, not like a flat failure.
- Spectacle for the room: projector board, live ticker, patch animation, money flowing on-chain.

Scoring per run: mission base points × difficulty × novelty (new tactic family ×2, a variant of a known tactic ×1.5, a known unpatched tactic ×1) + time bonus (seconds left) − hints used. A near miss that forces a step-up earns 25%. Genuine-customer mode earns points when the Guardian wrongly blocks a legitimate request.

Jackpot: within a wave, the bounty for beating the current Guardian grows every minute that version stays unbeaten, and resets when it falls. It is paid by the smart contract (see 3.8).

### 3.1 Game loop (G)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| G1 | Voice call to Ava in the browser, with 5 tools against a fictional ledger | MUST | A | L | H#1 |
| G2 | Mission picker: send £5k, add a payee, get the security answer read out | MUST | C | S | H#3 |
| G3 | Win detection from tool calls; 2-minute cap | MUST | A/B | S | H#3 |
| G4 | Points and leaderboard | MUST | C | S | H#7 |
| G5 | Difficulty ladder: Training (no Guardian), Standard (current Guardian), Boss (Guardian, step-ups, hidden suspicion meter) | SHOULD | B/C | S | NEW. Newcomers can win once; experts stay busy. |
| G6 | Customer dossiers and recon board: each fictional customer has a fake social profile or leaked-data snippet that players can mine for details (pet's name, employer) | SHOULD | D | S | NEW. Real social-engineering flavour from static content. |
| G7 | Near-miss scoring: points for forcing a step-up | SHOULD | B | S | NEW. Also feeds near misses to the Teacher (handover §9 step 1). |
| G8 | Debrief after each call: red flags spotted and missed, and why | SHOULD | C | M | H#12 |
| G9 | AI Scammer text rounds in the background, mutating tactics that worked | SHOULD | B | M | H#9 |
| G10 | AI-vs-AI voiced "Scam Battle" on the projector: the AI Scammer's TTS voice against Ava | NICE | A | M | NEW. Keeps spectators watching; fits a voice prize. |
| G11 | Genuine-customer mode: players act as real customers with a real task (pay a new landlord). If the Guardian wrongly blocks them, they earn a false-block bounty. | SHOULD | B/C | M | NEW. The crowd tests false positives too. Answers the judges' first question and feeds the genuine side of the exam. |
| G12 | Defender mode: players review the Teacher's proposed rules (approve, reject, flag over-blocking) and earn Defender points | NICE | B/C | M | NEW. Pairs with Managed Agents approvals. |
| G13 | Scam of the hour: the Scout or AI Scammer picks a theme | NICE | D | S | NEW. Hourly version of handover §7's weekly challenge. |
| G14 | Hints that cost points | NICE | C | S | NEW |
| G15 | Streaks and a novelty bonus (new tactic category = double points) | NICE | C | S | NEW |
| G16 | Agent Hijack level: upload a fake invoice PDF; OCR 4.1 reads a hidden instruction that tries to make Ava pay | STRETCH | D | M | H#15 |
| G17 | Second target: personal assistant with email and files; win = leaking a private file | STRETCH | B | M | H#16 |
| G18 | Third target: coding agent with repo tools; win = leaking a fake `.env` secret through a prompt-injected README | STRETCH | B | L | NEW. Fits Large 4's "agentic coding and defensive cybersecurity" pitch. |
| G19 | Deepfake level: Ava checks a voiceprint for a fictional customer; the attacker uses a Voxtral TTS clone of that fictional voice | STRETCH | A | L | NEW. Fictional voices only, never real people. Check event rules first. |
| G20 | Pair attack: two players on one call (one plays the fraud team, one plays the customer) | STRETCH | A | L | NEW. Voice session plumbing is heavy for one day. |
| G21 | Runs with timers (voice 2:00, text 3:00 or 12 messages) and 3 refilling lines per player | MUST | A/C | S | NEW (§3.0). Replaces the bare 2-minute cap. |
| G22 | Guardian status board: current version, time unbeaten, jackpot size, last patch | MUST | C | S | NEW (§3.0). The main thing on the projector. |
| G23 | Jackpot that grows while a Guardian version stays unbeaten | SHOULD | B/D | S | NEW. Paid on-chain (C1). |
| G24 | XP and ranks: Rookie, Grifter, Con Artist, Mastermind | SHOULD | C | S | NEW |
| G25 | Team leaderboard: hackathon teams compete as teams | SHOULD | C | S | NEW. The room is already in teams of 3-5. |
| G26 | Live ticker: "@sam just beat Guardian v6 with a safe-account story", "Guardian v7 deployed" | SHOULD | C | S | NEW. Shows the tactic name only, never the script. |
| G27 | Leaderboard categories: most money moved, most rules taught, best defender, most false blocks found, fastest win | SHOULD | C | S | NEW. Extends G4. |
| G28 | Hourly waves: each unlocks new content, has its own leaderboard and a prize pool split across its breaks; Hall of Fame at 18:00 | SHOULD | C/D | S | NEW (§3.0 v2) |
| G29 | Training ladder: 5 fixed levels, each adding one defence; no lives; L3 unlocks the Arena | MUST | B/C | S | NEW (§3.0 v2). Static prompts, cheap to build. |
| G30 | Catch-rate guard: if the Arena Guardian's live catch rate passes about 90%, the next wave adds an easier mission | NICE | B | S | NEW |
| G31 | Lives refund on near miss and refill through defender play | SHOULD | C | S | NEW |

### 3.2 Guardian and learning (L)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| L1 | Guardian outside Ava, gating `add_payee` and `send_payment`: allow, step-up or block, with reason and rule IDs | MUST | B | M | H#2 |
| L2 | Teacher: names the tactic, writes a rule, creates a new Guardian version | MUST | B | M | H#4 |
| L3 | Rule gating: a candidate rule must pass the genuine exam cases before it is accepted | MUST | B | S | Handover §9 step 3. Kept in MUST because it proves the Guardian doesn't just block everything. |
| L4 | Exam: frozen 30 scam + 10 genuine cases, run per version, charted | MUST | D | M | H#5 |
| L5 | Realistic UK step-ups: Confirmation of Payee name check, hold on new payees, security question, "we'll call you back on your registered number" | SHOULD | B | S | NEW. Mirrors real UK bank controls. |
| L6 | Live risk score (0-100) from async transcript analysis, feeding the suspicion meter | SHOULD | B | M | NEW. Builds on handover §6's async transcript read. |
| L7 | Tactic taxonomy based on UK Finance scam types (bank or police impersonation, investment, romance, purchase, invoice and mandate, CEO fraud) and OWASP Agentic risks (goal hijack, tool misuse, identity abuse) | SHOULD | D | S | NEW. Map clusters use these categories. |
| L8 | Rule retrieval from the managed search index (top few rules per call) | SHOULD | B | M | NEW |
| L9 | Tactic dedup and merge with embeddings | SHOULD | B | S | Handover §9 step 5, now using the search index |
| L10 | Version diff view ("v7 to v8: one rule added, exam up 3 points") | SHOULD | C | S | NEW |
| L11 | Auto-rollback if a new version lowers the exam score | NICE | B | S | NEW |
| L12 | Rulebook consolidation using Large 4's 1M context (merge 40 rules into 15) | NICE | B | M | NEW. Solves the rulebook size cap. |
| L13 | Guardian pack export: rules and examples as JSON or YAML | SHOULD | D | S | NEW. This is what a bank would buy. |
| L14 | Snapshot replay: same attack against Guardian v1 and the current version, side by side (text + TTS) | SHOULD | D | M | H#10 |
| L15 | Teacher as a Mistral Workflow with a human approval step | STRETCH | B | M | H#17. Managed Agents approvals may be the cheaper route. |

### 3.3 Mistral stack (M)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| M1 | Large 4 `reasoning_effort` split: low for the live Guardian, high for the Teacher. Show it in the UI as a "thinking budget" label. | MUST | B | S | Handover §2; the UI label is NEW |
| M2 | Small 4 as Ava's brain (cheaper voice minutes) | MUST | A | S | Handover §2 |
| M3 | Voxtral 3 realtime transcription and TTS with emotion tags | MUST | A | (in G1) | Handover §2 |
| M4 | Moderation (`mistral-moderation-2603`) plus a PII filter | SHOULD | D | S | H#13. Every scam attempt will score high on `dangerous_and_criminal_content`, because that is the game. Block only on hate, sexual, self-harm and violence categories, and use `pii` plus our regex for real card and account numbers. |
| M5 | Evaluation SDK for the exam | SHOULD | D | M | NEW (§2) |
| M6 | Telemetry-built datasets of attacks | SHOULD | D | S | NEW (§2) |
| M7 | Managed Agents for the Teacher and Guardian, with approvals and tracing | SHOULD | B | M | NEW (§2) |
| M8 | Managed search index | SHOULD | B | M | NEW (same work as L8 and L9) |
| M9 | Voxtral Small Transcribe 3 for diarised replay transcripts | NICE | A | S | NEW |
| M10 | Workflow builder for the Scout | NICE | D | S | NEW |
| M11 | Webhooks and triggers | NICE | B | S | NEW |
| M12 | Online evaluations | NICE | D | S | NEW |
| M13 | Scout crawler feeding real scam tactics | STRETCH | D | M | H#14 |
| M14 | Fine-tune with Forge on the collected attacks | WON'T (today) | | | Handover §9: say it's the next step |

A pitch slide should list every Mistral model and tool we use, with one line on why it's there.

### 3.4 Accessibility (A), all NEW

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| A1 | Text chat mode beside voice (same Ava, same Guardian) | MUST | A/C | S | For deaf and hard-of-hearing players, speech impairments, a noisy venue and bad Wi-Fi. The AI Scammer already uses a text path, so this is nearly free. |
| A2 | Live captions for both sides during the call | MUST | C | S | Voxtral realtime already produces the text |
| A3 | Colour-safe map: never red vs green alone. Add icons (cracked shield = still beating the Guardian, solid shield = covered), patterns and text labels. Check with a colour-blindness simulator. | MUST | C | S | The map's whole meaning depends on red vs green |
| A4 | Keyboard-first: push-to-talk on Space, visible focus rings, every control reachable by Tab | SHOULD | C | S | |
| A5 | Screen reader support: an ARIA live region announces call state, timer warnings and Guardian decisions; the exam chart has a data table fallback | SHOULD | C | S | |
| A6 | Respect `prefers-reduced-motion`: freeze graph physics, no confetti | SHOULD | C | S | |
| A7 | Multilingual play (raised to MUST at Ibad's request): players speak or type in any language Voxtral supports (the docs list 13: English, Chinese, Hindi, Spanish, Arabic, French, Portuguese, Russian, German, Japanese, Korean, Italian, Dutch; check Voxtral 3's list on the day). Agents reply in the caller's language and the Guardian judges in any language. Rules are stored in English so a rule taught in Spanish protects French callers too. Language picker on the play screen; UI strings in English, French, Spanish and German; a few non-English exam cases (already in the exam set). | MUST | A/D | M | Scammers target non-native speakers, and Mistral is strong on European languages. Demo moment: a scam in French gets blocked by a rule taught in English. |
| A8 | Extra-time option (2 min to 3 min) and adjustable speech speed for Ava | NICE | A/C | S | |
| A9 | Debrief with a "simple / expert" toggle | NICE | C | S | |
| A10 | High-contrast theme, text size control, dyslexia-friendly font option | NICE | C | S | |
| A11 | Sound cues for block, allow and win, always paired with visual cues | NICE | C | S | |
| A12 | Mobile-first layout | SHOULD | C | S | Most of the room will play on phones via the QR code |
| A13 | Low-bandwidth mode: text only, no graph animation | NICE | C | S | |
| A14 | Content note and consent screen (scam stories can be upsetting); 18+ | SHOULD | C | S | Also part of the safety story |
| A15 | Guest play with just a handle, no account | MUST | C | S | Sign-up friction kills crowd play |

### 3.5 UI and spectacle (U)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| U1 | Landing page with live counters: attacks today, Guardian version, catch rate, "£ protected" | SHOULD | C | S | NEW |
| U2 | Play screen: mission card, dossier, call button with waveform, timer ring, captions, tool activity panel (`verify_customer` done, `send_payment` waiting on the Guardian) | MUST (basic) / SHOULD (polish) | C | M | NEW layout for H#1 and H#3 |
| U3 | Suspicion meter (hidden in Boss mode) | SHOULD | C | S | NEW, uses L6 |
| U4 | Win moment: money-moving animation, bounty tx link, "your trick gets patched in about a minute" | SHOULD | C | S | NEW |
| U5 | "Patch incoming" sequence: the Teacher's rule streams in, a gating bar fills (10 of 10 genuine calls pass), then a "Guardian v8 deployed" toast appears on every screen | SHOULD | B/C | M | NEW. The money shot of the pitch. |
| U6 | Knowledge map: clusters by taxonomy, node size = wins, new nodes pulse, click a node for its tactic card (taught by, rule, cleaned-up snippet, time) | MUST | C | M | H#6 |
| U7 | Map time-lapse slider that replays the day's growth | NICE | C | S | NEW. Supports the pitch line "the map grew from X to Y". |
| U8 | Arena (projector) mode: rotates through live calls, map, leaderboard and the latest patch | SHOULD | C | M | NEW |
| U9 | Exam chart with two lines (catch rate, false-block rate) and a note per version | MUST | C | S | H#5 |
| U10 | Player profile: wins, rules taught, badges, wallet | NICE | C | S | NEW |
| U11 | Badges: First Blood, Teacher, Streak, tactic badges | SHOULD | C | S | H#11 |
| U12 | Share card image ("I beat Guardian v3, now patched"), never showing the scam script | NICE | C | S | NEW |
| U13 | QR join screen | MUST | C | S | NEW. Needed for room play at 15:30. |
| U14 | Admin console: pause, reset to v1 for the demo, freeze the exam, kill switch, approve rules, moderation queue | SHOULD | D | M | NEW |
| U15 | Demo control panel: one-click replay of v1 vs current | SHOULD | D | S | NEW, triggers L14 |
| U16 | Sound design: ring tone, hold music, alarm on block | NICE | C | S | NEW |
| U17 | Dark "red room" look that still passes WCAG AA contrast | SHOULD | C | S | NEW |
| U18 | 30-second onboarding: rules, safety, how to win | SHOULD | C | S | NEW |

### 3.6 Safety (S)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| S1 | Fictional bank, customers and money; check the bank name isn't real | MUST | D | S | Handover §11 |
| S2 | Moderation plus PII filter: Luhn check for card numbers, UK sort code and account number patterns | SHOULD | D | S | H#13 (same work as M4) |
| S3 | Flag real bank and HMRC names in player input | NICE | D | S | NEW |
| S4 | Publish defences only. The map shows cleaned-up snippets, never winning scripts. | MUST | B/C | S | Handover §11 |
| S5 | Rate limits, queue, 2-minute cap | SHOULD | A | S | Handover §13 risks |
| S6 | Kill switch and an abuse report button | SHOULD | D | S | NEW |
| S7 | Delete raw audio after transcription; note on transcript retention | NICE | D | S | NEW |

### 3.7 Business and pitch (B)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| B1 | "Plug in your agent" screen: edit the target config JSON and launch a new target | NICE | B/C | M | NEW. Proves "any agent" (handover §9 config). |
| B2 | Bounty pool panel per target, funded by the company | NICE | C | S | NEW. Puts the business model on screen. |
| B3 | Red-team report PDF per target: top tactics, rules, exam metrics, OWASP Agentic mapping, written by Large 4 | NICE | D | M | NEW. The deliverable a bank pays for. |
| B4 | Business model slide, with the UK legal note (free to enter) | MUST | D | S | Handover §7 |
| B5 | Evidence slide with sources (Starling, NatWest, Lloyds, UK Finance £576m, OWASP) | MUST | D | S | Handover §4 |
| B6 | Backup demo video at 17:00 | MUST | D | S | Handover §12 |

### 3.8 Rewards and smart contract (C) (removed in v4)

The reward is real money moving on-chain (testnet), mirroring the fake money the player stole. Steal £5,000 from Ava and 5,000 CHONK test tokens move from the vault to your wallet, live on screen. Using our own ERC-20 test token means we can't run out the way we would with faucet ETH; only the owner wallet needs a little test ETH for gas.

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| C1 | `BountyVault` on Base Sepolia (or Sepolia) holding a CHONK ERC-20 test token. `payout(player, amount, callId, guardianVersion, tacticId)`, `onlyOwner`, no double pay per `callId`, `event BountyPaid(...)`. Backend calls it only after a verified win. Tx link on the leaderboard. | SHOULD | D | M | H#8, handover §10. Timebox 1.5 h. ERC-20 token is NEW. |
| C5 | Money-flow animation driven by the real `BountyPaid` event: vault to player wallet, amount, block explorer link | SHOULD | C | S | NEW. The visible "you broke it, you got paid" moment. |
| C6 | Verifiable leaderboard: winnings can be recomputed from `BountyPaid` events on-chain | NICE | D | S | NEW |
| C7 | Vault balance shown as "bounty pool remaining", funded by the company in the real product | NICE | C | S | NEW. Puts the business model on screen. |
| C8 | Players without a wallet get a burner wallet in the browser or a claim code; they can paste an address later | SHOULD | C/D | S | NEW. No MetaMask needed to play. |
| C2 | Each Guardian version's hash recorded on-chain, giving a tamper-evident rulebook history | NICE | D | S | NEW. One extra function, `commitVersion(bytes32)`. |
| C3 | Non-transferable First Blood badge token | NICE | D | M | NEW. Only if C1 is done early. |
| C4 | Fallback "bounty paid" animation if the testnet is slow | SHOULD | C | S | Handover §10 |

### 3.9 Build and infrastructure (I)

| ID | Feature | Tier | Owner | Effort | Source and notes |
|---|---|---|---|---|---|
| I1 | Build with Mistral Vibe (CLI or Desktop) for visible parts; keep session logs; "built with Vibe" slide | SHOULD | All | | NEW. Possible Vibe prize. |
| I2 | Supabase realtime for the map and leaderboard | MUST | D | S | Handover §9 |
| I3 | Deterministic demo mode: seeded data and recorded attack audio | SHOULD | D | S | NEW. Protects against Wi-Fi or voice failure. |
| I4 | Voice session concurrency cap with a queue screen | SHOULD | A | S | Handover §13 risks |
| I5 | Deploy (Vercel plus a backend host or tunnel) with a QR code | MUST | D | S | Handover §9 |
| I6 | `.env.example`; keys never committed | MUST | All | S | Handover §0 |

### 3.10 Knowledge graph and agent history (K)

The "Agent Brain": one graph of everything the system has seen and learned, in the style of graphify (god nodes, communities, bridges, path explanations). It answers "how did the Guardian learn this?" and "what still works?". U6 (the map) becomes one view of it.

Node types: agents (Ava, Guardian, Teacher, AI Scammer, Scout, Examiner); Guardian versions; calls (attacks and genuine runs); tactics; tactic families (from `data/taxonomy.json`); signals (red flags such as urgency or new payee); rules; players and teams; exam cases; edge cases (near misses, false blocks, rules rejected by gating, low-confidence decisions, conflicting rules); Scout sources.

Edge types: player ATTEMPTED call; call USED tactic; call SHOWED signal; call BEAT or BLOCKED_BY a Guardian version (citing a rule); tactic PATCHED_BY rule; rule TAUGHT_BY player; rule DERIVED_FROM call; rule ADDED_IN version; version EVOLVED_TO next version; candidate rule REJECTED_BY_GATE with the genuine case it would have blocked; tactic VARIANT_OF tactic (AI Scammer mutations); tactic MERGED_INTO tactic; source INSPIRED tactic; exam case TESTS family; rule CONFLICTS_WITH rule; version WOULD_NOW_BLOCK past call (from retro-exam K9).

The graph is built from the same tables as the game (calls, tactics, rules, versions, players, exam runs) plus an event log, so it costs little extra storage.

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| K1 | Graph data model and event log (node and edge types above), built from game tables | MUST | D | S | NEW. Everything else in K reads this. |
| K2 | Live graph view: node shape, colour and icon by type, filter chips, clusters by tactic family; calls collapse into their tactic by default so the projector stays readable | MUST | C | M | Extends H#6 / U6 |
| K3 | Learning curve: per Guardian version, exam catch rate and false-block rate, plus live attack success rate (rolling 30 min), rule count, and Guardian latency; a note on each version naming the rule it added | MUST | C/D | M | Extends U9. The core proof that it learns. |
| K4 | Version lineage ("Guardian git log"): v1 to vN as a chain, rules added per version, rejected candidate rules as dead branches, rollbacks shown | SHOULD | C | S | NEW |
| K5 | Tactic lifecycle card: first seen, attempts, wins, who taught it, time to patch, how many wins before it was patched, variants that appeared after the patch | SHOULD | C/D | S | NEW |
| K6 | Edge-case explorer: near misses, false blocks, rejected rules, low-confidence decisions, conflicting rules, each with a cleaned-up snippet and the reason | SHOULD | C | M | NEW |
| K7 | Explain path: pick two nodes (a player and the current Guardian) and get the chain in words, e.g. "Sam's call used a safe-account story; the Teacher wrote Rule 12; added in v5; it has blocked 17 attacks since" | SHOULD | B/D | M | NEW. Shortest path on the graph plus a Large 4 summary. |
| K8 | Graph analytics panel: god nodes (most-connected tactics and rules), communities (scam families found automatically), bridges (tactics that link families), orphan rules that never fire | SHOULD | D | S | NEW. networkx on the backend (degree, betweenness, Louvain). |
| K9 | Retro-exam: every past successful attack becomes a regression test; each new Guardian version replays them and the graph adds WOULD_NOW_BLOCK edges ("v9 now stops 21 of 23 past wins") | SHOULD | B/D | M | NEW. Strong learning proof; keep separate from the frozen exam. |
| K10 | Per-agent history logs: Ava's tool calls, every Guardian decision with cited rules, the Teacher's proposed, accepted and rejected rules, the AI Scammer's attempts | SHOULD | B | S | NEW. Data comes free from logging. |
| K11 | Ask the graph: plain-English questions ("what still works?", "how did it learn to stop invoice scams?") answered by Large 4 over the graph, with the relevant part highlighted | NICE | B/D | M | NEW |
| K12 | Time-lapse slider replaying the graph's growth through the day | SHOULD | C | S | Same as U7, raised to SHOULD |
| K13 | AI Scammer mutation tree: which tactic each new attack was mutated from | NICE | C | S | NEW |
| K14 | Rule effectiveness heatmap: rules against tactic families, cells count blocks | NICE | C | S | NEW |
| K15 | Coverage meter: share of tactic families with at least one rule | NICE | C | S | NEW |
| K16 | Export the graph as JSON or GraphML, and a "Guardian brain" summary for the red-team report (B3) | NICE | D | S | NEW |
| K17 | Guardian diary: after each version, the Teacher writes two plain-English sentences on what it learned; read out with Voxtral TTS in the pitch | NICE | B | S | NEW |

### 3.11 Accounts and login (P)

Guest first, login optional. Proposed tool: Supabase Auth, because we already use Supabase for data and realtime. Anonymous sign-in gives a guest a real user ID straight away, and `linkIdentity` upgrades them to Google or GitHub later without losing points. (Clerk, used for PayeeCheck, is the alternative if someone already knows it.) Anonymous sign-ins and manual identity linking must be switched on in the Supabase dashboard.

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| P1 | Guest play: anonymous sign-in plus a chosen handle, no form | MUST | C | S | NEW. How A15 gets built. |
| P2 | Upgrade to Google or GitHub login, keeping points and badges | SHOULD | C | S | NEW |
| P3 | Profile: handle, generated avatar, hackathon team, rank, wallet | SHOULD | C | S | NEW. Extends U10. |
| P4 | Row-level security: players read everything public but write only their own runs; admin role for the console (U14) | SHOULD | D | S | NEW |
| P5 | Per-user rate limits tied to lines (G21) | SHOULD | A/D | S | NEW |
| P6 | Captcha (for example Cloudflare Turnstile) on guest sign-in to stop bots | NICE | C | S | NEW. Supabase suggests it for anonymous sign-ins. |
| P7 | Wallet link on the profile (burner, pasted address or wallet connect) | SHOULD | C/D | S | NEW, pairs with C8 |

### 3.12 Rewards beyond money (R)

Money alone makes it a slot machine, and bounties drain the pool. People keep playing when they feel skilled, free to try their own ideas, and recognised by others (the three needs in self-determination theory: competence, autonomy, relatedness). So testnet bounties stay, but they are rare and big (First Blood, wave prize pool). Most runs earn the rewards below.

| ID | Reward | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| R1 | Your name on the rule: "Rule 12, taught by Sam", shown in the graph and the exported Guardian pack forever | MUST | B/C | S | Recognition. Already in the handover's credit idea. |
| R2 | Impact counter: "your rule has blocked 17 attacks and protected £84,000 of fictional money" | SHOULD | C/D | S | Meaning. Reads from the graph (K). |
| R3 | Unlocks: new missions, customers, Boss mode and new targets open as you rank up | SHOULD | C | S | Progress |
| R4 | Titles and cosmetics: rank titles, profile frames, a custom Ava hold-music jingle for top players | NICE | C | S | Status |
| R5 | Scam IQ: the debrief teaches one red flag per run; a "red flags spotted" collection fills up like a card set | SHOULD | C | S | Competence; also scam awareness for players |
| R6 | Red-team credential: a non-transferable on-chain badge (or signed certificate) listing wins, rules taught and rank; shareable on a CV or LinkedIn | NICE | D | M | Career value (handover §7). Combines C3. |
| R7 | Defender status: top players become rule reviewers and get early access to new targets | NICE | C | S | Trust and autonomy |
| R8 | Team rewards: team leaderboard, team banner on the projector | SHOULD | C | S | Relatedness. Same as G25. |
| R9 | Surprise rewards: occasional bonus for an unusual tactic, picked by the Teacher ("most creative break of the wave") | NICE | B | S | Variable reward without gambling |

### 3.13 Bring your own agent and open Guardian packs (O)

The bigger vision: anyone can put their own agent in the Red Room, the crowd attacks it, and they leave with a stronger Guardian they own and can open-source. Everyone benefits from the training, not only us.

How it works:
1. A developer registers an agent: role prompt, tools, which tools are sensitive, and win conditions (the target config JSON from handover §9).
2. Safest for keys: the developer hosts the agent and gives us an endpoint. We send attacker turns; their agent replies and reports its tool calls. We never hold their API key. Simpler option for the demo: they paste a key that lives only in their browser session and is never stored.
3. Players attack it in its own arena. Their Guardian learns from those attacks exactly like ours.
4. The owner exports a Guardian pack (rules, examples, exam results) and drops it into their own app with their own Mistral key, either as a small middleware call before sensitive tools or as an approver using Mistral's tool confirmation.
5. The owner can publish the pack to a public registry under an open licence. Others can fork it, combine packs, and see which players taught which rules.

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| O1 | Register an agent from a config form (B1 made real) | STRETCH | B/C | M | One thin slice is enough for the demo |
| O2 | Bring-your-endpoint connector (we never store keys) | STRETCH | B | M | |
| O3 | Guardian pack export with owner and teacher credits | SHOULD | D | S | Same as L13 |
| O4 | Public pack registry: browse, fork, star, licence shown | STRETCH | C/D | M | Pitch slide if not built |
| O5 | Guardian middleware snippet (a few lines the owner pastes into their app) | STRETCH | B | S | |
| O6 | Owner dashboard: their agent's graph, learning curve and exam | STRETCH | C | M | Reuses K views filtered by target |

Ratings, tags and levels for community agents:
- Every run is a match between a player and an agent, scored with Elo (as in chess). A player gains rating by breaking a strong agent; an agent gains rating by surviving strong players. Both sides get a live rating.
- Each agent also gets a Red Room security grade (A to F) from its exam results, its Elo, and its false-block rate, so an agent that blocks everyone can't get an A.
- Tags: domain (banking, support, shopping, coding, personal assistant), tools (payments, email, files), language, and difficulty band from its Elo.
- Levels fill themselves: low-rated agents feed the training ladder, mid-rated ones the Arena, top-rated ones become Boss targets. Matchmaking offers each player agents near their own rating, so nobody faces a wall.
- Owners can show a "Red Room grade" badge in their README; it links to the agent's public graph and exam.
- We review agents before they go public: fictional brands only, no harmful tools, owner confirms the agent is theirs.

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| O7 | Elo ratings for players and agents, updated after each run | SHOULD | D | S | NEW. Works with only our own levels too (each training level and Guardian version is an "agent"). |
| O8 | Security grade A-F per agent (exam + Elo + false-block rate) | SHOULD | D | S | NEW |
| O9 | Agent tags and a browse page filtered by tag and grade | STRETCH | C | S | NEW |
| O10 | Matchmaking: suggest agents near the player's rating; ladder and Boss slots filled by rating | NICE | C/D | S | NEW |
| O11 | Embeddable grade badge linking to the agent's public page | STRETCH | C | S | NEW |
| O12 | Review queue before an agent is listed | STRETCH | D | S | NEW, uses the admin console (U14) |

Visibility and company arenas:
- Every agent is public or private; the creator chooses.
- Company workspaces: a company gets its own private arena and marketplace. Its own employees create agents, attack them, review rules and train them; nothing leaves the workspace unless the company publishes it.
- Invite-only arenas: a company can invite vetted outside players (bug-bounty style) to its private arena without making the agent public.
- Internal leaderboards and rewards per company, so security training for staff doubles as agent hardening.

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| O13 | Public or private visibility per agent | STRETCH | C/D | S | NEW. Supabase row-level security by workspace. |
| O14 | Company workspaces: private arena, private marketplace of the company's own agents, employee accounts | STRETCH | C/D | M | NEW. Show as one seeded demo workspace on the vision slide. |
| O15 | Invite-only arenas for vetted outside players | STRETCH | D | S | NEW |

My take on scope: O is the long-term product story ("the open Hugging Face of agent defences"). For today, build O3 and, if the core is green by 15:30, one O1 demo slice; put O2, O4, O5 and O6 on the vision slide.

### 3.14 Agent domains: Red Room City (D)

Each domain is a building in "Red Room City" that players pick on a map. Every agent runs on the same engine: a target config (role prompt, mock tools, sensitive tools, win conditions), the same Guardian and Teacher, its own rulebook, Elo and grade. If the engine is config-driven from the first hour, each extra domain costs about 45-60 minutes (config, mock tools, 2-3 missions).

| ID | Domain and agent | Win condition | Channel | Tier | Notes |
|---|---|---|---|---|---|
| D1 | Bank: Ava at Chonk & Co Bank | `send_payment` or `add_payee` to an attacker, or the security answer read out | Voice + text | MUST | The hero domain |
| D2 | Personal assistant: "Pip", with email, calendar and files | Leak a private file, or send an email on the owner's behalf | Text (voice optional) | SHOULD | Proves "any agent"; prompt-injection angle |
| D3 | Online shop support: "Max", an over-helpful refund bot | Unauthorised refund or a 100% discount code | Text | SHOULD | Funny, quick to build, very relatable |
| D4 | Letting agent: tenant deposits and landlord details | Redirect a deposit to new bank details | Voice + text | NICE | Real UK scam pattern |
| D5 | IT helpdesk | Reset another employee's password or MFA | Voice | NICE | Classic vishing target |
| D6 | Airline or travel desk | Change the name on a booking, or refund to a new card | Text | NICE | |
| D7 | HR assistant | Leak a colleague's salary or home address | Text | NICE | |
| D8 | Coding agent with repo tools | Leak a fake `.env` secret | Text | STRETCH | Same as G18 |
| D9 | Smart-home assistant | Unlock the front door for a "delivery" | Voice | STRETCH | Great for the stage |
| D10 | Community agents (section 3.13) | Owner-defined | Either | STRETCH | |

My take for today: D1 plus D2 and D3. Three domains is enough to show it's a platform, not a bank toy.

### 3.15 More fun (F)

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| F1 | Red Room City map: buildings for each domain, lit up when a Guardian there was just beaten | SHOULD | C | M | The home screen |
| F2 | Agent personalities and voices: cautious Ava, over-helpful Max, chatty Pip, each with its own Voxtral TTS voice | SHOULD | A | S | Makes runs memorable |
| F3 | Heist chains: multi-agent missions, e.g. get Pip to leak Margaret's details, then use them on Ava | NICE | B | M | Real attackers chain systems; nobody else does this |
| F4 | Defend your agent: players write their own defence prompt for a copy of an agent, others attack it, you score while it survives (Tensor Trust style) | NICE | B/C | M | Gamified version of section 3.13 |
| F5 | Prediction game with points only: "will Guardian v8 survive 10 minutes?" | NICE | C | S | Spectator fun; points, never money |
| F6 | Reactions on the projector (emoji bursts when a Guardian falls or a patch lands) | NICE | C | S | |
| F7 | Judge boss: at the 19:00 pitch, a judge attacks the top-rated agent live | SHOULD | All | S | Demo moment, already in the handover as optional |
| F8 | Domain achievements ("Broke every building in the city") | NICE | C | S | |
| F9 | "How close you got" score 0-100 on every run, from the Guardian's risk score (borrowed from Agent Breaker's per-attempt score) | SHOULD | B/C | S | Partial credit keeps losing players going |
| F10 | Win validation: the Teacher (or a peer reviewer) confirms a break before it becomes a rule (borrowed from Dynabench) | SHOULD | B | S | Stops junk rules |
| F11 | Daily scam puzzle: one short fixed challenge per day for everyone (borrowed from chess sites) | NICE | C | S | Retention after the hackathon |
| F12 | Open Red Room benchmark: publish the anonymised defences and exam results (borrowed from Lakera's crowd benchmark) | NICE | D | S | Pitch slide; never publish winning scripts |
| F13 | Humans drive their own runs; the AI Scammer has its own lane on the leaderboard (borrowed from Gray Swan's rules) | SHOULD | D | S | Fairness |

### 3.16 Agent versions, agent pages and the Auditor (V)

Every agent has versions. A version is a snapshot of its config (prompt, tools) and its Guardian rulebook. Each agent has its own knowledge graph (section 3.10 filtered to that agent).

Who sees what:
- Public view: grade, Elo, version count, learning curve, how many tactic families are covered vs still open, attack stats, and rule credits shown by title and tactic family ("Rule 12, safe-account story, taught by Sam").
- Owner view: the full knowledge graph, full rule text, transcripts, edge cases, rejected rules, the Auditor report.
- Why: full rule text tells attackers exactly what to avoid, and transcripts may hold the owner's business logic. For the hackathon, we own the three city agents, so the projector shows the public view and the admin console shows the owner view.

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| V1 | Agent versions: config + rulebook snapshot per version, diff, rollback | MUST | B | S | For our agents this is the Guardian version chain (L2, K4) |
| V2 | Agent page: grade, Elo, learning curve, version history, attack stats | SHOULD | C | M | NEW |
| V3 | Public vs owner view of each agent's knowledge graph, as above | SHOULD | C/D | S | NEW. Row-level security by owner. |
| V4 | The Auditor: a Large 4 bot that reads an agent's graph and exam and tells the owner where it is weak (open tactic families, high false-block rate, rules that never fire, slow patches), suggests missions to run next, and answers questions in chat | SHOULD | B | M | NEW. Same engine as K11 "ask the graph". Strong demo moment. |
| V5 | Compare: two versions of one agent, or two agents, side by side | NICE | C | S | NEW |

### 3.17 Agent leaderboards and discovery (X)

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| X1 | Agent leaderboard: Elo, grade, longest unbeaten, most attacked, most improved today | SHOULD | C | S | NEW. Sits beside the player leaderboard. |
| X2 | Agent search and filters: domain, tags, grade, language, open bounty | STRETCH | C | S | NEW |
| X3 | Bounty board: agents sorted by current jackpot | NICE | C | S | NEW |
| X4 | Follow or star an agent; get told when a version falls or a patch lands | STRETCH | C | S | NEW |
| X5 | Shareable agent card (grade, Elo, "unbeaten for 2 h") | NICE | C | S | NEW |

### 3.18 Agent vs agent (AA)

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| AA1 | Build your own attacker agent: a player writes an attacker prompt; it runs automatic text attacks; ranked in a separate attacker-agent lane | NICE | B | M | NEW. Fairness rule from Gray Swan: bots never mix with the human leaderboard. |
| AA2 | AI Fight Night: two agents duel, each defending its own tools and attacking the other's, voiced with Voxtral TTS on the projector | NICE | A/B | M | NEW. Extends G10. Great spectacle between pitches. |
| AA3 | Overnight self-play: an owner sets attacker agents loose on their own agent; findings go through the Teacher's gate | STRETCH | B | M | NEW. Product feature, vision slide. |
| AA4 | Tournaments: Swiss-style rounds between agents, updating Elo | STRETCH | D | M | NEW |
| AA5 | Agent-to-agent commerce scams: a buyer agent and a seller agent negotiate, one tries to cheat the other | STRETCH | B | L | NEW. Future-facing as agents start trading with each other. |

### 3.19 More applications (vision slide unless noted)

- CI check: re-run an agent's exam and retro-exam on every deploy, like a test suite (a GitHub Action). Turns Red Room into a developer tool.
- Guardian API: one endpoint an app calls before any sensitive tool, backed by the agent's pack.
- Insurers and risk teams: the A-F grade as an input for pricing or approving agent risk.
- Universities and bootcamps: private arenas as AI security coursework.
- Slack or Discord bot: attack an agent from chat.
- "Red Room Certified" badge for agents that hold a grade over time.

### 3.20 Creator tools and Vibe integration (v3, all NEW)

| ID | Feature | Tier | Owner | Effort | Notes |
|---|---|---|---|---|---|
| CR1 | Owner dashboard: logbook list, failures grouped by root cause with examples, "stopped by" breakdown (agent, limit, Guardian, nobody) | MUST | C | M | The demo's centre screen |
| CR2 | Large 4 analyst: groups losses, writes summaries, suggests fixes (prompt, hard limit, Guardian rule); runs as a Mistral Agent | MUST | B | M | Bonus track |
| CR3 | Draft editor: edit role prompt, knowledge, hard limits, Guardian rules; accept a suggested fix in one click | MUST | C | M | |
| CR4 | Retest panel: replay each logged failure 3 times; fixed / flaky / still failing; genuine-customer check | MUST | B/C | M | Proof of learning |
| CR5 | Publish draft as new version (e.g. 2.3); rating carries over; "provisional" badge while uncertainty is wide | MUST | B/C | S | |
| CR6 | "Learned" nodes in the knowledge graph linking the attack chat, the fix, the version and the time | MUST | D | S | Extends K1/K2 |
| CR7 | Guardian savings estimate: "would have blocked 6 of 10 losses, about +40 Elo" | SHOULD | B | S | Sells turning the Guardian on |
| CR8 | Create-agent wizard: pick stream, write role, paste knowledge, choose limits | SHOULD | C | M | Demo can use pre-made Ava if short on time |
| CR9 | Placement test per stream before first publish | SHOULD | D | S | Uses each stream's exam |
| CR10 | Analyse, owner approves, retest as a Mistral Workflow with a human step and the Studio timeline | SHOULD | B | M | Bonus track; Workflows CLI needs WSL or macOS |
| CR11 | Red Room MCP server (tools: list_agents, attack_agent, get_logbook, retest, publish) so Vibe or any MCP client can red-team an agent | SHOULD | B | M | Track 1 "MCPs"; demo inside Vibe |
| CR12 | Vibe skill "red-team my agent" wrapping the MCP tools | NICE | B | S | Track 1 "skills" |
| CR13 | Scheduled nightly attacker run against an owner's agent | NICE | B | S | Track 1 "scheduled tasks" |
| CR14 | Export package download (instructions, limits, Guardian rules, regression tests, report) | SHOULD | D | S | Same as L13/O3 |
| CR15 | Demo video recorded by 17:30 and submitted with the project | MUST | D | S | Required by the rules |
| CR16 | Test that Voxtral TTS speaks non-English replies with the preset voices (all 10 presets are US English) | SHOULD | A | S | Decides how far multilingual voice goes |

## 4. Proposed MUST set (working by 15:00)

The handover's MUST 1-7 stay as they are. Proposed additions, all cheap:
- A1 text mode and A2 live captions: about 45 min combined, and they double as the fallback when voice or Wi-Fi fails.
- A3 colour-safe map: about 20 min, and the map stops depending on red vs green.
- A15 guest handle (built as P1) and U13 QR join screen: the 15:30 room play needs them anyway.
- G21 runs with timers and lines, and G22 Guardian status board: these make it a game.
- K1 graph data model, K2 live graph and K3 learning curve: these are the existing map and exam chart, specified properly.
- G29 training ladder and R1 "taught by" credit.
- One build rule rather than a feature: the agent engine is config-driven from the first hour (target config JSON per agent), so extra domains (D2, D3) and community agents cost config, not new code paths.
- L3 rule gating is already part of the handover's learning loop; it's listed here so it doesn't get dropped.

## 5. Queues per role after the core works

Order is by demo value.
- A (voice): G10 AI-vs-AI battle, A7 multilingual, I4 queue, A8, M9.
- B (Guardian): G11 genuine-customer mode, L5 UK step-ups, L6 risk score, L8/L9 search index, M7 Managed Agents, U5 patch sequence (backend side).
- C (frontend): U5 patch sequence, U8 arena, U3 suspicion meter, U4 win moment, U11 badges, A4-A6, U17, U18.
- D (data, contract, pitch): C1 contract, M5 Evaluation SDK, M6, L13 pack export, L14 replay, U14 admin console, I3 demo mode, S2, B4-B6.
- Knowledge graph extras, split between C and D: K4 lineage, K5 tactic cards, K9 retro-exam, K12 time-lapse, K6 edge cases, K7 explain path, K8 analytics.
- After that, NICE items by demo value: U7 time-lapse, G12 Defender mode, B3 report, C2, U12, then the rest.

## 6. Questions for the 9:00 briefing

From the handover, plus new ones:
1. Theme and tracks.
2. Judging criteria and weights.
3. Is pre-written code allowed? (Assume no.)
4. Pitch length and submission format.
5. NEW: Is use of Mistral Vibe judged or required?
6. NEW: Do hackathon keys and credits cover the public-preview features (Evaluation SDK, Managed Agents, managed search index)?
7. Are credits enough for about 239 players' voice minutes?

## 7. Hackathon angle

Pitch line: "Red Room is crowd red-teaming for any AI agent that takes actions. The crowd breaks it, it learns, and every agent leaves with a security grade and a defence pack it owns."

What wins here, matching past Mistral winners (handover §15): a live, theatrical demo; Mistral's newest stack used where it matters (Voxtral voice, Large 4 Guardian and Teacher at different reasoning efforts, Small 4 for the agents, tool confirmation for the Guardian); and a real problem with evidence.

Demo shape (about 3 minutes): hook with the bank evidence; a live voice scam on Ava against Guardian v1, money moves on-chain; the same attack blocked by today's Guardian, with the graph showing who taught the rule; zoom out to the city map (three domains), the learning curve and the agent ratings; a judge attacks the top-rated agent; close on the business.

Market proof:
- Check Point bought Lakera, the company behind Gandalf, in September 2025 (reported at about $300 million), and its Gandalf red-teaming community was central to the deal.
- OpenAI agreed to acquire Promptfoo, an automated red-teaming platform, in March 2026.
- Gray Swan runs prize-funded agent red-teaming arenas, including a $300,000 competition sponsored by frontier labs in 2026.
- Other recent deals: F5 bought CalypsoAI, Cato Networks bought Aim Security, and Armadin launched with $190 million for AI red teaming.

## 8. Business model

Who pays: companies shipping agents that take actions (banks, fintechs, retailers, travel, HR and IT software).

How Red Room earns:
1. Arenas: a company lists its agent, publicly or in a private arena with vetted players, and pays per campaign. It funds the bounty pool; we take a fee (the HackerOne model, applied to agents).
2. Managed Guardian: the open packs are free; a hosted Guardian that keeps updating from the crowd is paid per check or per month.
3. Security grade and reports: an independent A-F grade (a credit rating for AI agents) and a pre-launch red-team report mapped to OWASP's agentic risks. Useful evidence for risk and compliance teams.
4. Enterprise: private arenas, single sign-on, EU data residency (fits Mistral's sovereignty story), audit logs.
5. Later: a consented, anonymised attack dataset for training defences; hiring from the leaderboard.

Open-core: the pack registry, grades for public agents and the game stay free. That builds the community, and the community is the moat, as Gandalf's was for Lakera.

Risks and answers:
- Companies won't expose real agents publicly: private arenas, or a staging copy with mock tools.
- Legal: keep entry free (UK prize-competition rules); publish defences, never winning scripts.
- Cold start: seed with our own domain agents and the AI Scammer, so there is always something to attack.
- Competition: Lakera (now Check Point) and Gray Swan run text-first arenas; Promptfoo automates attacks. Our wedge is voice, action-taking agents, a defence that learns and is exported, an open registry, and the grade.

## Sources

- Luma event page: https://luma.com/le-chonk-in-london
- Mistral release notes: https://docs.mistral.ai/resources/release-notes
- Mistral changelog: https://docs.mistral.ai/resources/changelogs
- Paris 2026 winner write-up (judging weights): https://soubiran.dev/posts/from-idea-to-victory-the-2026-mistral-ai-paris-hackathon
- Mistral Worldwide Hackathon 2026 overview (special prizes): https://algo-mania.com/en/blog/hackathons-coding/mistral-hackathon-2026-french-ai-shines-across-7-cities-worldwide/
- Vibe Desktop launch: https://aiweekly.co/alerts/mistral-ships-vibe-desktop-app-with-local-and-cloud-agents
- Mistral docs (tool confirmation, evaluations, moderation, reasoning): https://github.com/mistralai/platform-docs-public
- Gandalf the Red paper: https://arxiv.org/html/2501.07927v3
- Tensor Trust paper: https://arxiv.org/pdf/2311.01011
- UK AISI x Gray Swan results: https://www.grayswan.ai/news/uk-aisi-x-gray-swan-agent-red-teaming-challenge-results-snapshot
- Fortune on Gray Swan 2026: https://fortune.com/2026/10/20/exclusive-ai-security-company-gray-swan-red-team-arena-contest-to-jailbreak-ai-agents/
- Check Point to acquire Lakera: https://blog.checkpoint.com/security/check-point-to-acquire-lakera-redefining-security-for-the-ai-era/
- Lakera deal value (Calcalist): https://www.calcalistech.com/ctechnews/article/rj5bc1vige
- OpenAI acquires Promptfoo: https://www.techcrunch.com/2026/03/09/openai-acquires-promptfoo-to-secure-its-ai-agents/
- AI security acquisitions overview: https://dev.to/luckypipewrench/the-ai-agent-security-acquisition-wave-what-it-means-for-buyers-1e73
