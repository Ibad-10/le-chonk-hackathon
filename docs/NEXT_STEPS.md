# Next steps (for teammates), 21 Nov 2026 evening

Claude's agents stopped on a usage limit. Their unfinished work is saved as branches; pick these up.

## Live links
- Frontend: https://red-room-steel.vercel.app (auto-deploys on every push to `main`; Vercel root directory = `frontend`)
- Backend: runs on Ibad's laptop behind a Cloudflare quick tunnel: https://computing-murray-florida-devon.trycloudflare.com (`/health`). The URL changes if the tunnel restarts; then update Vercel env `NEXT_PUBLIC_BACKEND_URL` (Production and Preview) and push. Free Hugging Face Docker Spaces need PRO; `backend/scripts/deploy_hf.py` is ready once the account has it. Render's free tier works but sleeps after 15 minutes.
- Open access: `OPEN_ACCESS=1` (default) lets every signed-in player use every agent's owner tools and the admin lab, for the hackathon. Set `OPEN_ACCESS=0` to restore strict ownership.

## Unfinished branches (on GitHub)
| Branch | What it was doing |
|---|---|
| `wip/afef77894b6893cda` | Creator agent attack/defend fixes (Clerk azp for preview origins, CORS regex, retest/placement for creator agents, versions diff `to=draft`) and security fixes from the review (voice mode/ownership checks, language whitelist, no arena on own/private agents, job limits, placement once, input limits). Partly done; run the tests before merging. |
| `wip/ac5dcbaa736340f79` | 3D village rendering: Kenney textures, lighting, camera, troops. Was re-shooting screenshots. |
| `wip/aeed5ceba45d7649c` | QA UI bugs: owner/base page crash (`logbook.groups` undefined), raw 401/409 banners, access-denied states, arena wall title and ticker dedupe, admin gate, raw player ids, "not graded". |
| (not saved: agent stopped before committing) | TODO, demo breakability: allow sandbox bank details in moderation (sort codes starting 99/00), training-dummy agent `bank-rex`, `scripts/demo_break.py`, fix genuine placement cases so careful agents don't grade D. |

## Highest-priority bugs still open (from QA and the security review)
1. Owner and base pages crash because `GET /agents/{id}/logbook` returns `entries` without `groups`: normalise to `groups ?? []` in `frontend/lib/api.ts` (fix on `wip/aeed5ceba45d7649c`).
2. Play page fires API calls before the Clerk token is ready (raw "401 missing bearer token" banner).
3. Nothing can break Ava or a weak agent today: moderation blocks any UK bank details; still to do. For the demo, use a scripted break or `bank-rex`.
4. Retest fails for creator agents (`retest.py` calls `load_target` for agents without a target JSON).
5. Security: voice sessions accept any `mode`; voice routes don't check run ownership; `language` is injected into the system prompt; arena runs on your own agent farm Elo; no cap on retest/placement jobs.
6. QA test agents `qa-nova-6663b2` and `qa-weak-414c60` are in the database; delete them before judging.

## How to continue
Branch from `main`, merge one `wip/*` branch at a time, run `cd backend && uv run pytest -q` and `cd frontend && npx vitest run && npm run build`, then open a PR.
