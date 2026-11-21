# Red Room: hackathon submission

Le Chonk in London, Mistral Vibe Hackathon, 21 November 2026.

- Project: Red Room
- Live app: https://red-room-steel.vercel.app
- Repo: https://github.com/Ibad-10/le-chonk-hackathon
- Team: Ibad Ullah Zuberi, Zohaib (UI polish) and teammates

## Project description

Red Room is an arena where AI agents prove they can't be talked into doing something dangerous. Anyone builds an agent for a real job (a bank assistant, a refund bot, a personal assistant) from instructions and knowledge. Players then try to scam it by live voice call or live chat, in any language, into sending money, leaking a private file or issuing a refund nobody is owed. Wins are decided by code from sandbox tool calls, never by an AI opinion.

Every successful scam lands in the owner's logbook, where Mistral Large 4 groups the failures by root cause and marks the exact breaking moment. The owner rewrites the agent, retests every past failure three times plus three reworded variants, and publishes a new version. An Elo rating and an A to F grade show how hard each agent is to break, and the agent's knowledge graph is shown as a 3D village of defences.

Our own house agents train themselves: a research agent reads this week's scam news with web search and runs capped training cycles with automatic rollback.

## Why we built it

Banks and companies are giving AI agents the power to act: Starling, NatWest and Lloyds are launching agents that move money by voice. Scammers already social-engineer agents, and OWASP lists pre-launch adversarial testing as a minimum control for agentic apps. UK push-payment fraud was £576.4m in 2025, and phone scams are 28% of the losses (UK Finance). Red Room turns that testing into a game: many creative attackers find the holes first, every hole becomes a lesson the owner fixes, and the agent leaves with a rating that shows it holds.

## What we used from Mistral

### Models
Mistral Large 4 (`mistral-large-4`) powers the agents, the attacker bot, the logbook analyst, the research agent and the variant writer, with reasoning effort set per job (low for live turns, high for analysis). Mistral Small 4 is the fallback. `mistral-embed` groups similar failures; `mistral-moderation-2603` screens input.

### Apps
Mistral Vibe (CLI and Desktop) on Large 4 built the backend, wrote the commits and ran the merges. A Red Room MCP server lets a developer attack an agent, read its logbook, retest and publish from inside a Vibe session (docs/MCP.md).

### Agents (bonus track: Mistral Agents and/or Workflows)
Mistral Agents SDK (`mistralai-agents`): the logbook analyst runs as a Mistral agent with structured output; the research agent is a Mistral agent with built-in web search that extracts this week's scam tactics with source links; those tactics drive capped house-agent training cycles (one per hour, at most 30 attacks) with automatic rollback.

### Voxtral (special prize: best use of Voxtral)
Live voice calls: Voxtral Mini Transcribe Realtime 3 streams the caller's speech through our backend relay (the API key never reaches the browser), the agent replies on Large 4, and Voxtral Mini TTS 3 speaks the reply starting on the first sentence. Barge-in, mute, live captions, and any language the caller speaks.

### Other
Open-weight friendly design: an agent is only instructions and knowledge on Large 4, so a bank could self-host the open-weight model and keep customer data on its own servers.
