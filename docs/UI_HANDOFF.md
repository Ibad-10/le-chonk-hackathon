# UI handoff: what's wrong today and how to fix it

Owner of this work: teammate, using their own coding agent. Written 21 Nov 2026, 15:20. Read with `docs/UI_BRIEF.md` (the target) and `docs/TEAM_HANDOVER.md` (context).

The backend, game logic, voice and data are done and tested on `main`. The UI is the weakest part of the project and is now yours. Everything below is a finding from reviewing the current screens.

## 1. Findings (fix in this order)

### A. 3D village renders white and empty (biggest visible problem)
- Cause: the Kenney GLB files in `frontend/public/base/` reference an external texture (`Textures/colormap.png` in each Kenney pack zip). Only the GLBs were copied, so every material has no colour map and renders white.
- Fix: download the same packs (Fantasy Town Kit, Castle Kit, Mini Characters from kenney.nl, CC0) and copy each pack's `Textures/` folder next to the GLBs with the exact relative path the GLB expects (open a GLB in https://gltf.report to see the path). Confirm in code that the loaded mesh material has `map` set.
- Lighting is flat: add a hemisphere light (sky/ground tint) and one warm directional light with soft shadows, ACES tone mapping, sRGB output, and a sky-gradient background (never pure white).
- Ground: replace the current grass with Kenney ground tiles, or a green plane (Radix grass 3/4) with subtle variation, plus stone path tiles.
- Camera: currently zooms into empty space after a message. Use a fixed isometric camera fitted to the village bounding box on load; limit pan/zoom; add a reset button.
- Troops are not visible: spawn character models (scaled to the buildings) within 300 ms of a player message; walk 1.5-2.5 s along the path to the target building with a drei `Html` one-line bubble (42 chars + ellipsis); an envoy walks back with the agent's reply; defeat puff, white-flag "sent back", building damage, treasury collapse with coins, 3-star dialog.
- Logic is fine and tested (`frontend/lib/base.ts`, 30 tests): cause family → building, seeded placement, levels, star rules. Change rendering, not rules.
- Code: `frontend/components/base/*` (BaseScene, Building, Troop, GlbModel, LiveBase, useBaseDirector).

### B. Emoji in the UI
- The play page mode switcher uses emoji (sword, speech bubble) and there may be more. Remove all emoji; use lucide-react icons (and react-icons `gi` only for game objects). `grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" frontend/app frontend/components`.

### C. Colour theme is weak
- Hard-coded reds/embers everywhere. Replace with Radix Colors dark scales as CSS variables mapped to the shadcn tokens: slate (base), amber (primary), tomato (danger), grass (success), sky (agent side). Use the scale steps for their intended roles.

### D. Typography and components look generic
- Fonts via next/font: Instrument Serif (headlines), Inter (UI), Geist Mono (numbers). Quality reference: the owner's `github.com/Ibad-10/trail` (web/): shadcn on Base UI, Magic UI components (shiny text, marquee), motion, lucide icons.
- Add Magic UI components (MIT, copy source): NumberTicker (ratings, points), ShinyText (hero), Marquee (live events), BorderBeam (active run card), AnimatedList (logbook), Confetti (3 stars).

### E. Flow
- Home: two clear actions ("Attack an agent", "Build your own"), live events marquee, three agent cards with a village thumbnail.
- Agent page: choose Call or Chat with one line explaining each.
- Run: village stage plus a clean HUD (agent, timer, energy pips; chat panel right on desktop, bottom sheet on phone; collapsible secret-role card; voice Mute and End call).
- Result: stars dialog with points/Elo NumberTicker, "Play again", "See leaderboard".
- Owner: tabs Logbook / Base / Graph / Versions / Practice.

## 2. How to check your work
- `cd frontend && npx vitest run && npm run build` must pass (90 tests today).
- Screens at 1440x900 and 390x844. Signed-in pages: sign in with `@clerk/testing` in Playwright (CLERK_SECRET_KEY from `.env`, test user `redroom-smoke` created by `backend/scripts/e2e_smoke.py`), or use a dev-only route that renders the BaseScene with mock data.
- Headless WebGL for screenshots: Chromium with `--use-gl=swiftshader` or `--enable-unsafe-swiftshader`.
- Check: coloured buildings, green ground, at least one troop visible after a message, no emoji, no overflow at 390 px, AA contrast.

## 3. Rules
- Branch from `main` (e.g. `ui-polish`), small commits, open a pull request; Ibad's reviewer checks before merge.
- Don't change backend routes or `frontend/lib/*.ts` game logic without telling Ibad; the frontend calls the API through `frontend/lib/api.ts` with mock fallbacks in `frontend/lib/mock.ts`.
- Art must be free to use (Kenney CC0 etc.) and credited in the CREDITS.md files; no Supercell/Clash assets.
- Never commit `.env` or `frontend/.env.local`.
