# Red Room — deploy runbook (hackathon day)

Two halves: the **frontend on Vercel** (Vercel CLI) and the **backend on the
laptop, exposed with cloudflared**. A Dockerfile is included for later
hosting. Everything secret stays in env vars — never committed, never printed.

## 0. Prereqs (one-time, on the demo laptop)

```powershell
winget install astral-sh.uv                 # Python env for the backend
winget install Cloudflare.cloudflared       # quick tunnel
npm i -g vercel                              # or already installed
vercel login                                 # already logged in on the demo machine
```

Repo-root `.env` is filled in (see `.env.example`) and git-ignored. The
backend reads it from the repo root; the frontend gets its `NEXT_PUBLIC_*`
values from Vercel env vars.

## 1. Frontend on Vercel (Vercel CLI)

No `vercel.json` is needed — Vercel auto-detects the Next.js app in `frontend/`.

```powershell
cd frontend

# dry-run the production build locally (does NOT deploy):
vercel build

# env vars the app needs (names only; set values via CLI or the dashboard):
#   NEXT_PUBLIC_BACKEND_URL            -> public backend URL (cloudflared, see §2)
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  -> Clerk publishable key
#   NEXT_PUBLIC_SUPABASE_URL           -> Supabase project URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY      -> Supabase anon key (public by design)
#   CLERK_SECRET_KEY                   -> Clerk secret key (server-side only)
#
# Example (value comes from your Clerk/Supabase dashboards, never from git):
vercel env add NEXT_PUBLIC_BACKEND_URL production   # paste the tunnel URL from §2
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add CLERK_SECRET_KEY production

# link + deploy:
vercel link          # first time only: pick the project, root = frontend/
vercel --prod        # production deploy (or `vercel` for a preview)
```

Notes:

- Set env vars **before** `vercel --prod` so the first production build bakes
  them in. Changing `NEXT_PUBLIC_BACKEND_URL` later requires a redeploy
  (`vercel --prod` again) because `NEXT_PUBLIC_*` is inlined at build time.
- `vercel build` is the safe dry-run: it runs the production build locally and
  writes `.vercel/output` without deploying. On this machine the CLI's builder
  cache (`%LOCALAPPDATA%\com.vercel.cli\Cache\builders-vlt`) fails with
  `EPERM ... symlink` unless Windows Developer Mode is on (or the CLI runs
  elevated); the identical build command `npm run build` (`next build`) was
  run instead and passes (exit 0, all routes prerender).

## 2. Backend run plan for the hackathon (laptop + cloudflared)

The backend is the only database writer and holds the secrets, so it stays on
the laptop; a cloudflared **quick tunnel** gives it a public URL.

```powershell
# one command does both (starts uvicorn, then the tunnel, prints the URL):
powershell -ExecutionPolicy Bypass -File backend\scripts\start_tunnel.ps1

# or manually:
cd backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000   # in one terminal
cloudflared tunnel --url http://localhost:8000              # in another
```

cloudflared prints a line like `https://<id>.trycloudflare.com` — that is the
public backend URL. Then wire it up:

1. **Frontend**: set `NEXT_PUBLIC_BACKEND_URL=https://<id>.trycloudflare.com`
   (Vercel env, then redeploy) or in `frontend/.env.local` for `vercel dev`.
2. **Clerk `azp`**: in the repo-root `.env` set
   `CLERK_AUTHORIZED_PARTIES=https://<vercel-app>.vercel.app,https://<id>.trycloudflare.com`
   (comma-separated allowed `azp` claim values; keep the Vercel origin, add the
   tunnel URL), then restart uvicorn so it is picked up.
3. **CORS**: add the Vercel origin (e.g. `https://<vercel-app>.vercel.app`) to
   `allow_origins` in `backend/app/main.py` — one line; without it the browser
   blocks calls from the deployed frontend. (During the live demo you can also
   open the frontend locally at `http://localhost:3000`, which is already
   allowed.)
4. Seed the demo data once (idempotent; `--wipe` removes it):

   ```powershell
   cd backend
   uv run python scripts/seed_demo.py          # idempotent
   uv run python scripts/seed_demo.py --wipe   # remove seeded rows only
   ```

5. Print the frontend URL as a QR code for the audience (any QR generator;
   the URL is not a secret).

Quick tunnels rotate the URL on every restart — if the tunnel restarts, repeat
steps 1–2 with the new URL.

## 3. Docker (later hosting, not needed on hackathon day)

Build from the **repo root** (the app reads `../targets` and `../data`):

```powershell
docker build -f backend/Dockerfile -t redroom-backend .
docker run --rm -p 8000:8000 --env-file .env redroom-backend
# then put it behind any HTTPS reverse proxy / tunnel, same as §2.
```

Secrets are never baked in: `backend/.dockerignore` excludes `.env`,
`*.db`, `.venv/`; pass values with `--env-file .env` at runtime. The image
runs `uvicorn app.main:app --host 0.0.0.0 --port 8000` (see the Dockerfile
`CMD`).

## 4. Demo-day checklist (t-30 min)

- [ ] `vercel build` dry-run green locally
- [ ] frontend deployed (`vercel --prod`), env vars set, `NEXT_PUBLIC_BACKEND_URL` = tunnel URL
- [ ] `start_tunnel.ps1` running; public URL printed and wired into env vars + CORS
- [ ] `GET <tunnel>/health` answers `{"status":"ok"}` from the laptop
- [ ] `uv run python scripts/seed_demo.py` run once; owner dashboard, arena and leaderboard show seeded data
- [ ] Clerk sign-in works against the deployed frontend (azp includes both origins)
- [ ] fallback ready: text mode instead of voice; seeded data instead of live runs (docs/DEMO.md §3)
