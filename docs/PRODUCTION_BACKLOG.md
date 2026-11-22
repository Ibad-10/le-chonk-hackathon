# Production-quality backlog

Still in development (not public). Goal: every feature, page and API at production quality before launch. Shipped one at a time; each item lands with tests, a green build and a push to `main`.

## Quality and safety
- [x] CI: GitHub Action runs backend pytest, frontend vitest and `next build` on every push and PR.
- [x] Per-player usage limits on Mistral-backed routes (messages, voice turns, analyse, retest, placement) so no one can run up the API bill.
- [x] Opaque ids on the public `/events` feed (no run ids).
- [x] Race fixes: publish vs draft, the 3-agent limit, retest summary filtered by agent.
- [ ] Access-denied and error states on every page (owner, base, admin, challenge), ready for `OPEN_ACCESS=0`.
- [ ] Structured logging and a `/health` that also checks the database and Mistral key.

## Game and product
- [x] Rex, a deliberately weak training-dummy agent for new players and demos.
- [ ] Remove QA test agents (`qa-nova-6663b2`, `qa-weak-414c60`) with an admin cleanup script.
- [ ] Fair placement grades: genuine callers give the right verification details so careful agents aren't graded D.
- [x] Arena wall and home ticker: dedupe repeated events (count shown).
- [ ] Try-my-agent share link: a public page that opens a raid on your agent.
- [ ] Agent duels.
- [ ] Notifications when your agent is broken.

## Shipped
- [x] Export agent package and self-host runner (`selfhost/`), with `--check` regression replay.
- [x] Security review fixes: JWKS refresh, azp patterns, run authorization, voice ownership, language whitelist.
- [x] 3D village rendering.
- [x] Readable player names, "Unrated" label.
- [x] Demo fixes: logbook crash, early 401, sandbox bank details, creator-agent retest, configurable lives.

## Needs Ibad (accounts and money)
- Hosted backend (Render, Fly.io or Railway), Clerk production instance, custom domain, Supabase Pro when there is traffic, rotating the database password and API keys.
