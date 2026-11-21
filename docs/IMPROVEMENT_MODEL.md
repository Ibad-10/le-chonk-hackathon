# Red Room: how agents improve (proposal v3)

Superseded in part by docs/superpowers/specs/2026-11-21-red-room-v4.md (no Guardian, analyst explains but doesn't fix, cooldown, Stripe instead of blockchain).

Written 21 Nov 2026, about 10:40, after Ibad's change of direction. Docs only.

## 1. The change

Before: Red Room's Teacher rewrote every agent's defences automatically after each break.

Now: Red Room never changes an agent it doesn't own. Every loss goes into the owner's logbook. A Large 4 analyst groups the logbook by root cause, summarises it with examples and suggests fixes. The owner decides what to change, edits their agent by prompting or talking to it, and re-tests. Improving the agent is the owner's job and part of the game.

Our own house agents (the ones Red Room ships, like Ava) may still learn automatically, because we own them.

This also fixes a scoring problem Ibad raised: an agent shouldn't look "best" because it lost the most and collected the most rules. Each version is judged on its own: the held-out exam, its Elo and its grade. Losses are evidence for the owner, not points for the agent.

## 2. The loop

```
players attack agent vN
        |
        v
   loss? --no--> agent keeps Elo, nothing to fix
        |
       yes
        v
 logbook entry: transcript, tool attempted, outcome,
 tactic family, red flags, how close
        |
        v
 Large 4 analyst (Mistral Agent), every few entries:
   - groups entries by root cause
     ("trusts anyone who says they are bank staff",
      "skips verification when the caller is rushed",
      "obeys instructions inside quoted text")
   - one summary per group, with 2-3 real examples
   - suggested fixes: prompt edit, tool permission,
     hard policy, Guardian rule
        |
        v
 owner reviews (human approval step) and edits the agent
 by prompt or chat  ->  agent vN+1
        |
        v
 retest: replay every past loss against vN+1 (regression
 suite) + held-out exam  ->  "fixed 9 of 11, broke 0
 genuine cases"
        |
        v
 vN+1 goes live, players attack again
```

## 3. Is a rulebook good enough, or should it be a model?

Short answer: text rules on their own are the weakest defence. They are still worth keeping, as the specification and the training data for stronger layers.

What the research says:
- Rules in a prompt can be talked around, and they get weaker as the list grows. Prompt-only defences against prompt injection showed very limited security in the SecAlign paper's comparison.
- Fine-tuned defences (StruQ, SecAlign) cut simple attacks to near 0%, but independent re-evaluations found adaptive attacks still succeed (up to 72-95% in some tests) and utility drops. Training is not a silver bullet either.
- The strongest published approach turns written rules into trained classifiers. Anthropic's Constitutional Classifiers generate synthetic training data from natural-language rules and train input and output classifiers. Jailbreak success fell from 86% to 4.4%, with a 0.38% rise in refusals of harmless traffic. The next generation reported 0.05% refusals on harmless queries.

So the right design is layers, and each layer catches what the one before misses:

| Layer | What it is | Can a scammer talk it round? | Who owns it |
|---|---|---|---|
| 1. Agent prompt | The owner's instructions to their agent | Yes, easily | Owner |
| 2. Hard policies | Code-level limits: max amount, hold on new payees, tool permissions | No | Owner, suggested by the analyst |
| 3. Guardian | A separate Large 4 judge outside the agent, approving each risky tool call with the agent's rules as context | Harder, it never talks to the attacker | Red Room product, owner turns it on |
| 4. Trained Guardian (later) | An adapter or classifier trained on the owner's logbook plus synthetic data generated from their rules, as in Constitutional Classifiers | Hardest | Enterprise tier |

The rules and the logbook are the asset: they specify layer 3 today and become the training data for layer 4 later. The logbook is the moat: real attacks against real agents, labelled by outcome.

## 4. Model choice: Large 4 as the main model

Following Ibad's direction, Large 4 (`mistral-large-4`) is the main model:
- Agents (Ava and the others): Large 4 with `reasoning_effort="low"`.
- Guardian: Large 4, `reasoning_effort="low"`.
- Analyst (logbook clustering, summaries, fix suggestions) and house-agent Teacher: Large 4, `reasoning_effort="high"`.
- Small 4 only as a fallback if voice latency or rate limits force it.

This replaces review decision 3A (Small 4 as Guardian). The headroom problem it solved now goes away a different way: owner agents start naive (just the owner's prompt), so early versions lose and the learning curve has room to climb as the owner fixes them. The v0 baseline stays.

## 5. LoRA adapters: feasible, but later and selectively

- Many adapters can share one base model on one server (vLLM multi-LoRA now supports MoE models), so "one adapter per agent" is technically possible.
- Training and serving adapters on a 1-trillion-parameter MoE is expensive, and adapter memory grows on MoE models. It only pays off with enough data: hundreds of labelled attacks per agent.
- Proposal: no adapters in the hackathon. In the product, adapters are an enterprise option for layer 4, trained from the logbook once there is enough data, via Mistral's fine-tuning or self-hosted.
- Check on the day whether Mistral offers fine-tuning for Large 4.

## 6. Export and selling

An exported agent is: config and prompt, hard policies, Guardian rules, the logbook (or its summary), the regression suite, exam report and grade, plus an optional adapter and a pointer to the exact base model version. Never the base model weights.

Licence: Large 4 is under the Mistral Ecosystem Open-Weight License (modified MIT) with a Model-as-a-Service restriction. Hosting Large 4 as a service for others may need an agreement with Mistral, so the business story should be a partnership. Check the LICENSE file on Hugging Face before the pitch.

## 6b. Agent anatomy: what an agent is and how a turn works

### Creating an agent: streams

The creator picks a stream (a domain template), then describes the agent they want.

| Stream | Mock tools (sandbox only) | What counts as a break |
|---|---|---|
| Banking | verify customer, balance, payees, add payee, send payment | Money to an attacker, attacker added as payee |
| Customer support / refunds | look up order, issue refund, discount code | Refund or discount without entitlement |
| Personal assistant | files, email, calendar | Private file leaked, email sent as the owner |
| HR | employee records, payroll | Salary or home address leaked |
| IT helpdesk | reset password, reset MFA | Reset for someone who isn't the account holder |

Each stream fixes the tools, mock data, sensitive tools and win conditions, so every agent in a stream faces the same test and Elo is fair across agents. Creators can't plug in real tools in the game (safety, and fair comparison); real tool connections are a later enterprise feature.

What an agent is, in layers:
1. Stream base prompt (ours): the role, the tool contract, safety basics. Not editable.
2. Creator's role prompt: who the agent is, tone, what it should and shouldn't do.
3. Creator's knowledge: FAQs, policies, product facts (text pasted or uploaded; retrieved with `mistral-embed` when long).
4. Hard policies: limits the creator sets from a menu (max payment, hold on new payees, which tools need a check).
5. Guardian rules: the creator's own rules for the Guardian, often accepted from analyst suggestions.
6. Version: a snapshot of 2-5. Every edit makes a new version with its own exam, Elo and grade.

No model weights per agent. An agent is rows in the database, so an idle agent costs nothing.

### One agent per user, or many?

Cost doesn't depend on how many agents exist. It depends on how many attacks and analyst runs happen, because every model call is pay-per-use through the API. So the limit should be on usage, not agent count:
- Free: up to 3 agents (at most one per stream), with a daily attack quota per agent (for example 200 runs) and analyst summaries every 10 new losses.
- Paid / company: more agents, bigger quotas, private arenas, real tool connections.
- Hackathon: our 3 house agents plus one agent per signed-in creator.

### One turn, step by step (all Mistral)

```
player speaks or types
   |  voice: Voxtral Transcribe Realtime 3 -> text
   v
input screen: mistral-moderation-2603 + card/bank-number regex
   v
agent brain: Large 4 (reasoning_effort low)
   system = stream base + creator role + knowledge + hard policies
   tools  = stream's mock tools
   |
   | wants a sensitive tool?
   v
hard policies (code): amount caps, new-payee hold, permissions
   v
Guardian: Large 4 (low), outside the agent, with the creator's
Guardian rules -> allow / step-up / block
   v
mock tool runs (or not) -> win check (deterministic)
   v
reply  |  voice: Voxtral TTS 3 speaks it
   v
run ends -> logbook entry -> mistral-embed vector
   v
every 10 losses: Analyst, Large 4 (high), groups by root cause,
summarises, suggests fixes -> creator approves -> new version
   -> retest (past losses + held-out exam)
```

### Mistral everywhere

| Job | Mistral product |
|---|---|
| Agent brain, Guardian, attacker bot | Large 4 (`mistral-large-4`), reasoning effort set per job |
| Analyst, house-agent Teacher | Large 4, high reasoning effort |
| Voice in | Voxtral Mini Transcribe Realtime 3 |
| Voice out | Voxtral Mini TTS 3 |
| Input screening | `mistral-moderation-2603` |
| Grouping similar losses, knowledge search | `mistral-embed` |
| Agents and orchestration | Mistral Agents SDK (`mistralai-agents`), approvals for the Guardian; Mistral Workflows for analyse, approve, retest |
| Building the app | Mistral Vibe (CLI and desktop) on Large 4 |
| Fallback under latency or rate limits | Small 4 |

No other AI provider in the product. Supabase and Vercel are hosting and database, not AI.

Reasoning effort by job: low for live turns (agent, Guardian, attacker bot) to keep latency down; high for the analyst and anything that writes fixes or exam cases; medium as the default for everything else.

## 6c. Decisions agreed with Ibad (21 Nov, about 10:55)

1. Guardian is off by default for creator agents. The logbook shows what it would have saved: "turning on the Guardian would have blocked 6 of your 10 losses, worth about +40 Elo" (estimated by replaying the losses with the Guardian on).
2. Retest before publishing a new version:
   - The creator edits the agent (draft version, e.g. 2.3).
   - Every logged failure is replayed against the draft 3 times.
   - Each failure is labelled: fixed (blocked 3 of 3), flaky (blocked 1-2 of 3), still failing (0 of 3).
   - Fixed failures leave the open list; flaky and still-failing ones stay, and the analyst focuses its next suggestions on them.
   - The creator can retest as many times as they like before publishing.
   - Each fixed failure becomes a "learned" node in the knowledge graph, linked to the original attack chat, the fix that solved it, the version and the time. So the graph shows when and how the agent learned.
   - Genuine-customer cases are replayed too; a draft that newly blocks genuine customers is flagged before publishing.
3. Publishing: the creator pushes the draft live as the new version.
4. Elo carries over between versions. No reset. A new version keeps the agent's rating, so earned rating is never lost. To let a better (or worse) version find its level quickly, the rating's uncertainty widens after each new version, so its first few Arena matches move it more (Glicko-style rating deviation). It rises on its own if the new version performs better.
5. Placement test: an agent's first version takes the fixed track exam to get its starting rating. Later versions re-take it as a check (shown on the agent page) but it doesn't reset the rating.

## 7. What this changes in the hackathon build

- Replace the automatic Teacher for player-facing agents with: logbook, Large 4 analyst, owner fix, retest. Keep auto-learning only for house agents if time allows.
- Demo: we play the owner of Ava. Show the logbook summary ("3 groups of failures"), accept a suggested fix through a human approval step, retest, and show the regression suite going from red to green, live.
- Bonus track fit: the analyst is a Mistral Agent; "analyse, owner approves, retest" is a Mistral Workflow with a human-in-the-loop step and the Studio timeline.
- Rule gate (decision 4A) becomes the retest: a fix is accepted only if it fixes past losses without breaking genuine cases.

## Sources

- SecAlign paper: https://arxiv.org/pdf/2410.05451
- Critical evaluation of prompt-injection defences: https://arxiv.org/pdf/2505.18333
- Attention-based attacks on fine-tuned defences: https://arxiv.org/pdf/2507.07417
- Constitutional Classifiers: https://www.anthropic.com/research/constitutional-classifiers and https://arxiv.org/abs/2501.18837
- Next-generation Constitutional Classifiers: https://www.anthropic.com/research/next-generation-constitutional-classifiers
- TraceSIR, trace analysis reports: https://arxiv.org/html/2603.00623v1
- Insights Generator, corpus-level trace diagnostics: https://arxiv.org/abs/2605.21347
- vLLM multi-LoRA: https://vllm.ai/blog/2026-02-26-multi-lora
- InfiniLoRA (MoE LoRA memory cost): https://arxiv.org/html/2604.07173
- Large 4 licence coverage: https://letsdatascience.com/blog/mistral-large-4-weights-out-resellers-need-license
