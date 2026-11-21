# Red Room: prep checklist

Status as of about 02:00 on Sat 21 Nov 2026. No product code has been written; assume pre-written code is not allowed until the 9:00 briefing says otherwise. Only accounts, tools, data and plans are prepared.

## Done
- Feature brainstorm: `docs/FEATURES.md`.
- Data prepared (allowed as data preparation): `data/taxonomy.json` (tactic families), `data/customers.json` (4 fictional customers with dossiers), `data/missions.json` (6 missions), `data/exam_cases.jsonl` (30 scam + 10 genuine exam cases; 4 non-English; no real brands found by a keyword check). Read it over before freezing at 11:00. Its category names `prompt_injection` and `authority_insider` correspond to `goal_hijack` and `identity_privilege_abuse` in `taxonomy.json`; align them on the day.
- Bank name: "Chonk & Co Bank" doesn't show up as a real UK bank in a web search. Check the FCA Register on the day to be sure.
- Tools on Ibad's laptop: Node 24, npm, Python 3.12, uv, git, gh (signed in as Ibad-10), Vercel CLI, Mistral Vibe CLI 3.1.4 (newly installed), cloudflared (newly installed, for a demo tunnel).

## Ibad does these (accounts and keys; Claude must not)
- [ ] Mistral console account and API key; the credits link arrives on the day.
- [ ] Run `vibe --setup` and sign in (Vibe Pro code `LECHONK`).
- [ ] Supabase project; turn on anonymous sign-ins and manual identity linking (Auth settings).
- [ ] Vercel account linked to GitHub.
- [ ] Backend host account (Railway, Render or Fly) for the FastAPI backend; the laptop plus cloudflared is the fallback.
- [ ] Testnet wallet for the owner (MetaMask), with a little Base Sepolia ETH from a faucet. Some faucets need a mainnet balance or an Alchemy account, so do this the night before.
- [ ] Empty private GitHub repo for the team, with teammates invited (Claude can create it with `gh` if Ibad says so).
- [ ] Teammates' GitHub usernames and their strengths, to confirm roles A-D.

## Bring
- [ ] Headsets or earbuds with a mic for each teammate and one spare. Voice demos fail in a loud room.
- [ ] Phone hotspot as Wi-Fi backup.
- [ ] Extension lead, laptop charger, HDMI or USB-C adapter for the projector.
- [ ] Luma QR code and photo ID. Arrive by 8:30.

## Still to install (optional)
- pnpm (`corepack enable`), only if the team prefers it.
- Foundry for the contract, or use Remix in the browser on the day (no install).
- Supabase CLI isn't needed; the dashboard and the Supabase MCP are enough.

## Findings from the Mistral docs (check on the day)
- Offline evaluations (Evaluation SDK) are listed as Enterprise-tier only. Plan on our own exam runner.
- The Conversations API can pause chosen tool calls until they are approved (`requires_confirmation`). The Guardian can be the approver for `add_payee` and `send_payment` on the text path.
- Browser audio uses short-lived client session tokens (`rt_...`) created by our server, so the API key never reaches the browser.
- The moderation model will flag scam attempts as criminal content by design. Only block on hate, sexual, self-harm and violence, plus real card or account numbers.
- `reasoning_effort` on Large 4 accepts low, medium and high; `none` returns an error per the changelog.
- Context7's docs still show older Voxtral model IDs (2602/2603); the handover lists Voxtral 3 IDs. Use whatever the console shows.
- The managed Voice Agents SDK pages weren't in the indexed docs. If it is hard to use on the day, the fallback is our own pipeline: realtime transcription, Small 4 with tools, then TTS.
