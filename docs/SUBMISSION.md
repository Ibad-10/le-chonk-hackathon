# Red Room: hackathon submission

Le Chonk in London, Mistral Vibe Hackathon, 21 November 2026.

- Project: Red Room
- Live app: https://red-room-steel.vercel.app
- Repo: https://github.com/Ibad-10/le-chonk-hackathon
- Demo script: [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md)
- Team: Ibad Ullah Zuberi, Zohaib (UI polish) and teammates

## Project description

Red Room is an arena where AI agents prove they can't be talked into doing something dangerous. Anyone builds an agent for a real job (a bank assistant, a refund bot, a personal assistant) from instructions and knowledge. Players try to scam it by live voice call or live chat, in any language, into sending money, leaking a private file or issuing a refund nobody is owed. Wins are decided by code from sandbox tool calls, never by an AI opinion.

Every successful scam lands in the owner's logbook, where Mistral Large 4 groups failures by root cause and marks the exact breaking moment. The owner rewrites the agent, retests every past failure three times plus three reworded variants, and publishes a new version. An Elo rating and an A to F grade show how hard each agent is to break, and the agent's knowledge graph is shown as a 3D village of defences. Our house agents train themselves: a research agent reads this week's scam news with web search and runs capped training cycles with automatic rollback.

## Why we built it

Banks and companies are giving AI agents the power to act: Starling, NatWest and Lloyds are launching agents that move money by voice. Scammers already social-engineer agents, and OWASP lists pre-launch adversarial testing as a minimum control for agentic apps. UK push-payment fraud was £576.4m in 2025, and phone scams were 28% of the losses (UK Finance). Red Room turns that testing into a game: many creative attackers find the holes first, every hole becomes a lesson the owner fixes, and the agent leaves with a rating that shows it holds.

## What we used from Mistral

### Models
- Mistral Large 4 (`mistral-large-4`): every agent (Ava, Max, Pip and user-built agents), the AI attacker that replays past attacks, the logbook analyst, the research agent and the variant writer that rewords attacks for retests. Reasoning effort is set per job: low for live turns, high for analysis.
- Mistral Small 4 (`mistral-small-2603`): fallback when Large 4 is rate-limited.
- `mistral-embed`: groups similar failures in the logbook.
- `mistral-moderation-2603`: screens player input, blocking only harmful content, never the scam attempts the game is about.

### Apps
- Mistral Vibe (CLI and Desktop) on Large 4: built the backend, wrote the commits and ran the merges across parallel sessions.
- Red Room MCP server for Vibe: list agents, attack one, read its logbook, retest and publish from inside a Vibe chat ([docs/MCP.md](MCP.md)).

### Workflows and Agents (bonus track: Mistral Agents and/or Workflows)
Mistral Agents SDK (`mistralai-agents`):
- Logbook analyst: a Mistral agent with structured output that groups failures by root cause, marks the breaking moment and reports weakness by language. It never suggests fixes.
- Research agent: a Mistral agent with built-in web search that finds this week's scam reports and returns new tactics with source links.
- House-agent training loop, driven by those tactics: attacks around each open weakness, Large 4 proposes improved instructions, retest, and the change is kept only if the held-out exam score doesn't drop, otherwise it rolls back. Capped at one cycle per hour and 30 attacks; every cycle is logged; admins trigger it from the House agents lab.
- Owner improvement loop: analyse, owner rewrites, retest (3 repeats plus reworded variants), publish with Elo carry-over.

### Voxtral (special prize: best use of Voxtral)
- Live phone-style calls: Voxtral Mini Transcribe Realtime 3 streams the caller's speech through our backend relay (the API key never reaches the browser), Large 4 replies as the agent, and Voxtral Mini TTS 3 speaks the reply, starting on the first sentence, with a separate voice per agent.
- Barge-in (interrupt mid-sentence), Teams-style mute, live captions, automatic language detection so the agent answers in the caller's language (tested in French).
- Fallback: push-to-talk with batch transcription.

### Other
- Clerk sign-in verified on the backend (including the voice WebSocket); Supabase Postgres for runs, versions, logbook and ratings; Vercel hosting; 3D village with three.js and free Kenney models.
- Open-weight friendly: an agent is only instructions and knowledge on Large 4, so a bank could self-host the open-weight model and keep customer data in-house.
