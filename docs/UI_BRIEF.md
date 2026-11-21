# Red Room UI overhaul brief v2 (premium quality bar)

Reference for quality (not look): the owner's app `github.com/Ibad-10/trail` (web/): shadcn/ui on @base-ui/react, Magic UI style animated components (shiny text, marquee), `motion` for animation, lucide-react icons, Inter body + Instrument Serif headings + Geist Mono numbers, semantic colour tokens, generous whitespace, calm motion. Read its web/src/app/globals.css and components via `gh api repos/Ibad-10/trail/contents/...` for patterns. Match that craft; Red Room keeps its own game identity.

## Hard rules
- No emoji anywhere in the UI or copy. Icons: lucide-react for app UI; react-icons `gi` (game-icons.net, CC BY 3.0, credited) only for game objects (towers, troops, coins, stars).
- Colour: Radix Colors scales (open source, accessible by design), dark theme. Base `slateDark` (backgrounds 1-3, borders 6-7, text 11-12); primary `amberDark` (9 for primary buttons, 11 for accents); danger `tomatoDark`; success `grassDark`; agent/defender `skyDark`. Use the step numbers' intended roles (1-2 app background, 3-5 component backgrounds, 6-8 borders, 9-10 solid, 11-12 text). Remove every hard-coded red/ember hex. Expose as CSS variables mapped into the shadcn tokens.
- Fonts via next/font: "Instrument Serif" for display headlines, "Inter" for UI text, "Geist Mono" for numbers (ratings, timers, scores). Game HUD numbers may use Geist Mono bold.
- Components: shadcn/ui (Card, Button, Badge, Tabs, Table, Dialog, Sheet, Tooltip, Progress, Skeleton, Sonner toasts) plus Magic UI components copied in (MIT): NumberTicker for ratings and points, ShinyText for the hero, Marquee for the live events ticker, BorderBeam on the active run card, AnimatedList for the logbook, Confetti for 3 stars. Motion for page and panel transitions (short, 150-300 ms, ease-out), always honouring prefers-reduced-motion.
- Layout: 12-column container max 1200 px on desktop, 16 px gutters on phones; every page designed at 390 px and 1440 px.

## Flow (ease of use)
1. Home: hero (serif headline "Talk them into it. If you can.", one sentence, two buttons: "Attack an agent" and "Build your own"), live events marquee, three agent cards (village thumbnail image rendered once from the 3D scene, rating NumberTicker, grade badge, status badge, Call and Chat buttons).
2. Choose mode on the agent page: Call (voice) or Chat (text), with one line on what happens; then the run.
3. Run screen: the 3D village stage + a clean HUD (top bar: agent, timer, energy pips; right/bottom: chat or call controls; role card collapsible).
4. Result: stars dialog, points and Elo NumberTicker, "Play again" and "See leaderboard".
5. Owner: tabs Logbook / Base / Graph / Versions / Practice, each a clean shadcn layout.

## 3D village fixes (current version renders all white and empty)
- Kenney GLBs reference an external texture (`Textures/colormap.png`): copy each pack's texture files next to the GLBs (or embed them) so models are coloured. Verify by loading one GLB and checking its material has a map.
- Lighting: hemisphere light (sky/ground tint) + one warm directional light with soft shadows; tone mapping ACES; sRGB output. Background: soft sky gradient, never pure white.
- Ground: stylised grass from Kenney ground tiles or a simple coloured plane with subtle noise (Radix grass 3/4), stone path tiles in between.
- Camera: fixed isometric framing fitted to the village bounding box on load (no auto-zoom into empty space); limited pan/zoom; reset button.
- Troops: visible character models, scaled to building size, instanced; each walks along the path to its target building over 1.5-2.5 s with a drei `Html` speech bubble (one line, 42 chars + ellipsis); envoys come back with the agent reply. A troop MUST be visible on screen within 300 ms of sending a message.
- Effects: defeat puff, white-flag return, building damage (darken + smoke), treasury collapse with coins; 3-star dialog.
- WebGL unavailable or reduced motion: show the Siege 2D view instead.

## Self-check before reporting (mandatory)
- Use Playwright (headless Chromium with `--use-gl=swiftshader` / `--enable-unsafe-swiftshader`) to screenshot at 1440x900 and 390x844: home, agent page, run screen (after sending one mock message, wait 1.5 s), result dialog, owner logbook, owner base. Save under docs/screenshots/. Look at each screenshot: no white scene, coloured buildings, at least one troop visible on the run screen, no emoji, no overflow at 390 px. Fix and re-shoot until all pass. Include the screenshot paths in the report.
- Signed-in pages: sign in inside Playwright with Clerk's official testing helpers (`@clerk/testing` with Playwright, using CLERK_SECRET_KEY and the redroom-smoke test user from backend/scripts/e2e_smoke.py); check the current Clerk testing docs.
- `npx vitest run` and `npm run build` must pass.
