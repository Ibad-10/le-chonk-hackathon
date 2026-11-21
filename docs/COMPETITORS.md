# Red Room: competitor analysis

Researched on Sat 21 Nov 2026 (about 03:00). Most competitor facts come from press coverage, vendor pages and papers; vendor claims are self-reported. "Not seen" means we found no evidence, not that the feature definitely doesn't exist. Check the closest ones (Agent Breaker, Gray Swan) by hand before the pitch.

## Summary

Nobody we found combines these five things:
1. Humans attacking action-taking agents by voice as well as text.
2. A defence that learns from every break, with measured proof (frozen exam, retro-exam, learning curve).
3. A defence pack the agent owner keeps, exports and can open-source.
4. Bring-your-own agent, public or private, with a security grade and Elo rating.
5. Company workspaces where staff train their own agents, which doubles as security training.

The closest competitor is Lakera's Gandalf Agent Breaker: a free game with ten fictional AI apps and a huge community. It is text-only as far as we can see, the apps are fixed targets, and it feeds Lakera's (now Check Point's) runtime product rather than giving owners their own defence.

## Direct competitors

| Who | What it is | Overlap with Red Room | Where we differ |
|---|---|---|---|
| Lakera Gandalf / Agent Breaker (Check Point) | Free prompt-injection game. Agent Breaker has ten fictional apps (cycling coach, finance advisor, legal assistant, email bot), scores each attempt 0-100, and needs 75+ to unlock the next level. Lakera released an open benchmark built on 19,433 crowd attacks. Check Point bought Lakera in Sept 2025, reported at about $300M. | Gamified crowd attacks on multiple fictional agents; levels; data turned into a security product | Text-first; fixed targets that don't visibly learn; no voice; no exported defence for the owner; no bring-your-own agent; no grade for your own agent |
| Gray Swan Arena | The largest crowdsourced AI red-teaming network. Timed waves, prize pools split across breaks plus top-finisher prizes. The UK AISI challenge had a $171,800 pool; the 2026 agent competition has $300,000 from frontier-lab sponsors. Rules require a human to drive attacks. | Prize-funded crowd attacks on agents, waves | Targets are Gray Swan's hosted models and agents, not user-submitted ones; no defence that learns live; no voice; no owner-held defence pack |
| HackAPrompt 2.0 (Learn Prompting, OpenAI-sponsored) | Two-month competition in 2025 with tracks (CBRNE, Agents) and about $100,000 in prizes | Crowd jailbreaks, tracks, sponsor-funded pools | One-off event; text; no learning defence; no product for agent owners |
| HackerOne AI Red Teaming, Bugcrowd, YesWeHack | Bug-bounty platforms with AI red-teaming offers and large researcher communities (YesWeHack: 150,000+ hackers) | Private, invite-only programmes for companies; paid researchers | Services and bounties, not a game; findings go into reports, not a defence that updates itself |
| Tensor Trust (research game) | Players build defences and attack each other's "bank accounts"; winning tricks spread in waves | Attacker and defender roles, bank theme | Research project; text; no tools that move money; no product |

## Automated red-teaming and guardrail tools

| Who | What it is | Where we differ |
|---|---|---|
| Promptfoo (OpenAI agreed to acquire it, Mar 2026) | Automated red-teaming and evals for LLM apps | Machine-generated attacks; no crowd, no game, no voice social engineering |
| Giskard, Mindgard, HiddenLayer, Haize Labs | Automated, continuous, multi-turn red teaming of LLM apps and agents | Their "adaptive" means the attacker adapts over turns. We found nothing explicit about the defence learning from each break. Red Room's Teacher closes that loop and proves it. |
| Invariant Guardrails (Snyk) | Open-source rule layer over messages and tool calls | A runtime rule engine; Red Room produces the rules from crowd attacks. These could be complementary: our packs could export to rule layers like this. |

## Voice agent testing

| Who | What it is | Where we differ |
|---|---|---|
| Hamming, Cekura, RedCaller, Future AGI (and Roark, Coval) | B2B tools that test voice agents with simulated callers, including social engineering and authentication bypass | Automated personas and scripts, sold as QA. No human crowd creativity, no game, no learning defence, no grade. |

## Bring-your-own-agent benchmarks

| Who | What it is | Where we differ |
|---|---|---|
| flaw0 | Public benchmark that ranks agent harness and model combinations; users can bring their own and submit to a leaderboard | Static benchmark set; no crowd, no voice, no learning defence |
| Bonded, Agent Gauntlet, arena-redteam (GitHub) | Open-source projects; bring-your-own-agent arenas are proposed in issues, not shipped | Early, no community |

## Lessons from other fields (what to borrow)

| Field and example | What they do | What Red Room borrows |
|---|---|---|
| Model arenas: LMArena | Free public arena collects crowd votes; labs pay for private pre-release testing and custom evaluations. Raised $150M at a $1.7B valuation in Jan 2026; one report put annualised revenue at about $30M in Dec 2025. Criticised because labs could test many private variants and publish only the best. | Free public arena feeds data and community; paid private arenas for companies are the core revenue. Publish how grades are computed and include every version, so nobody can cherry-pick. |
| Adversarial data: Dynabench (Meta / MLCommons) | Humans try to fool the current best model; successful examples are validated by other people and feed the next round | Rounds = Guardian versions. Add peer or Teacher validation of wins before they become rules, and mix in genuine calls so the Guardian doesn't overfit. |
| Bug bounties: HackerOne, Bugcrowd | Public and private programmes, invite-only for vetted researchers, reputation scores, triage | Private and invite-only arenas, player reputation, a triage queue for disputed wins |
| Cyber training: Hack The Box | Free community and ranks; enterprise labs, company competitions and hiring on top; 800+ enterprise customers by some reports | Company workspaces with internal competitions; recruiting from the leaderboard |
| Phishing training: Hoxhunt | Stars, badges and leaderboards for staff; Frost & Sullivan (via Hoxhunt) credits it with a 225% rise in threat reporting | Company mode where employees attack their own agents: security training and agent hardening in one |
| Security ratings: SecurityScorecard | A-F ratings across risk factors, sold by subscription | The Red Room grade: an A-F rating for AI agents |
| Prompt-injection games: Gandalf, Agent Breaker | Levels that add one defence each; 0-100 score per attempt with a pass mark | Training ladder (already planned). Add a 0-100 "how close you got" score from the Guardian's risk score, so every run gives partial credit. |
| Competitions: Gray Swan, HackAPrompt | Waves, tracks by difficulty, sponsor-funded pools, humans must drive | Hourly waves (planned), sponsor-funded arenas, a rule that humans drive their own runs (the AI Scammer has its own lane) |
| Chess sites | Elo ratings, matchmaking, daily puzzles | Elo for players and agents (planned); a daily "scam puzzle" |
| Citizen science: Foldit, reCAPTCHA | Play or small human tasks produce useful data | Every run produces defence data; say so in the pitch |

## Feature comparison

Legend: Yes = seen; Part = partly; - = not seen.

| | Red Room | Agent Breaker | Gray Swan | HackAPrompt | HackerOne AI | Promptfoo / Giskard | Voice testers | flaw0 |
|---|---|---|---|---|---|---|---|---|
| Human crowd attacks | Yes | Yes | Yes | Yes | Yes | - | - | - |
| Voice attacks | Yes | - | - | - | - | - | Yes (automated) | - |
| Tools that move money or take actions | Yes | Part | Yes | Part | Part | Part | Part | Part |
| Defence learns from each break | Yes | - | - | - | - | - | - | - |
| Measured learning (exam, retro-exam) | Yes | - | - | - | - | Part (evals) | Part | Part (benchmark) |
| Owner keeps and exports the defence | Yes | - | - | - | - | - | - | - |
| Bring your own agent | Yes | - | - | - | Part (programmes) | Yes (own app) | Yes (own agent) | Yes |
| Private company arenas | Yes | - | - | - | Yes | n/a | n/a | - |
| Public grade or rating | Yes | - | Part (leaderboards) | - | - | - | - | Yes |
| Multi-domain agents | Yes | Yes | Yes | Part | n/a | n/a | n/a | Part |
| Game structure (levels, ranks, rewards) | Yes | Yes | Part | Part | - | - | - | - |

## Gaps Red Room fills

1. The defence side learns, visibly and measurably. Others adapt the attacker or report findings; Red Room turns each break into a gated rule and proves it with a frozen exam and replays of past wins.
2. Voice social engineering by real people against agents that act. Voice testing today is automated scripts sold as QA.
3. Ownership. The agent owner leaves with a defence pack they keep, export and can open-source, credited to the players who taught it.
4. A rating for any agent. An A-F grade plus Elo, from crowd play and the exam, for agents anyone brings, public or private.
5. Company workspaces. Staff attack and train their own agents; it doubles as security training (the Hoxhunt effect) and stays private.

## Honest threats

- Lakera (Check Point) has the biggest community and already runs multi-app agent levels. If they add learning defences or bring-your-own agent, they are the strongest rival. Our answer: voice, owner-held packs, open registry, EU and Mistral stack.
- Gray Swan has the prize network and lab sponsors. Our answer: we serve agent owners directly, not only labs, and the defence improves during the game.
- Automated tools are cheaper per test than humans. Our answer: humans find the creative social-engineering tricks scripts miss, and the AI Scammer covers volume; we do both.
- Companies may not trust public play. Our answer: private and invite-only arenas, and staging copies with mock tools.

## Judge Q&A answers

- "Isn't this Gandalf?" Gandalf and Agent Breaker are text games with fixed targets. Red Room is voice and text against agents that move money, and the defence learns during the game with a measured exam. Owners take the defence home.
- "Isn't this Gray Swan?" Gray Swan pays people to break labs' models. Red Room lets anyone, including a company's own staff, harden their own agent, and gives it a grade.
- "Why not Promptfoo or Giskard?" They automate attacks. We add human creativity, voice, and a defence that learns from each break. We also run an automated attacker.
- "Is there a business?" Yes. LMArena's model (free public arena, paid private testing) reached a reported $1.7B valuation; Check Point paid a reported $300M for Lakera, whose Gandalf community was central to the deal.

## Sources

- Agent Breaker overview: https://i10x.ai/tools/gandalf-agent-breaker
- Agent Breaker field notes: https://medium.com/@muhammadmurtuzahussain/breaking-the-agent-field-notes-from-ten-prompt-injection-challenges-f924b10e8135
- Lakera open-source benchmark: https://www.theglobeandmail.com/investing/markets/markets-news/Business%20Wire/35732888/lakera-launches-open-source-security-benchmark-for-llm-backends-in-ai-agents/
- Check Point to acquire Lakera: https://blog.checkpoint.com/security/check-point-to-acquire-lakera-redefining-security-for-the-ai-era/
- Lakera deal value (Calcalist): https://www.calcalistech.com/ctechnews/article/rj5bc1vige
- Gray Swan Arena guide: https://casrai.org/guides/gray-swan-arena-crowdsourced-red-teaming
- UK AISI x Gray Swan results: https://www.grayswan.ai/news/uk-aisi-x-gray-swan-agent-red-teaming-challenge-results-snapshot
- Fortune on Gray Swan 2026: https://fortune.com/2026/10/20/exclusive-ai-security-company-gray-swan-red-team-arena-contest-to-jailbreak-ai-agents/
- HackAPrompt 2.0: https://learnprompting.org/blog/announce-hackaprompt-2
- HackerOne AI Red Teaming: https://www.hackerone.com/product/ai-red-teaming
- YesWeHack: https://en.wikipedia.org/wiki/YesWeHack
- Tensor Trust paper: https://arxiv.org/pdf/2311.01011
- OpenAI acquires Promptfoo: https://www.techcrunch.com/2026/03/09/openai-acquires-promptfoo-to-secure-its-ai-agents/
- Giskard continuous red teaming: https://www.giskard.ai/products/continuous-red-teaming
- Mindgard: https://mindgard.ai/
- Red-teaming vendor comparison: https://www.pillar.security/blog/best-ai-red-teaming-providers-for-enterprise-ai-agents-and-genai-apps-2026-a-buyers-comparison
- Hamming: https://hamming.ai/
- Cekura red teaming: https://www.cekura.ai/blogs/red-teaming-chat-voice-ai-agents
- RedCaller: https://www.redcaller.com/
- flaw0: https://flaw0.com/
- Bonded issue #84: https://github.com/ddboy19912/bonded/issues/84
- LMArena Series A (TechCrunch): https://techcrunch.com/2026/01/06/lmarena-lands-1-7b-valuation-four-months-after-launching-its-product/
- LMArena business breakdown: https://research.contrary.com/company/lmarena
- Dynabench paper: https://arxiv.org/pdf/2104.14337
- Hack The Box enterprise platform: https://www.hackthebox.com/business/enterprise-platform
- Hoxhunt Frost & Sullivan report: https://www.hoxhunt.com/blog/managing-human-risk-in-cybersecurity-frost-sullivan-report
- How SecurityScorecard ratings work: https://securityscorecard.com/resources/how-do-securityscorecard-ratings-work
- AI security acquisitions overview: https://dev.to/luckypipewrench/the-ai-agent-security-acquisition-wave-what-it-means-for-buyers-1e73
