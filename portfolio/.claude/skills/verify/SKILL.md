---
name: verify
description: Build, run, and drive the portfolio app (Vite + Three.js WebGL) for runtime verification with Playwright screenshots.
---

# Verifying the portfolio app

## Build / launch

```bash
cd portfolio
npm install            # if node_modules missing
npm run build          # tsc strict + vite build — must pass
npm run dev            # http://localhost:5173 (run in background)
```

## Driving it (Playwright)

- Playwright is NOT a repo dep. Set up a temp dir: `npm i playwright`, then
  `npx playwright install chromium`. The default headless-shell download can
  fail here — launch the full browser instead:
  `chromium.launch({ channel: 'chromium', args: ['--use-gl=angle'] })`.
- WebGL2 works headless with `--use-gl=angle`.
- **Gotcha:** Google Fonts hangs in this environment. `page.goto` must use
  `waitUntil: 'domcontentloaded'` (never `'load'`), and every page needs
  `page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())` or
  screenshots block forever on "waiting for fonts to load".

## Flows worth driving

- Intro: wait ~4s after load → particles form "DARREN"; scroll by
  `window.innerHeight` steps through 5 lines; past the end → slideshow.
- Skip button ("Skip intro") top-right; sessionStorage `introSeen` auto-skips.
- Slideshow: ArrowLeft/Right/Home/End; hash per slide (#rico-rite … #contact);
  deep link (e.g. `/#ink`) must skip the intro entirely.
- Rail dots (`.rail-btn`), "All projects" grid overlay (Escape closes),
  case-study expand (`.case-study-toggle`), playground gear (`.pg-gear`,
  sliders `#pg-speed` etc., count select `#pg-count` triggers a live rebuild).
- Play stage: `.card-play` opens `.play-stage`; `.ps-close` always closes it.
  Builds load in `.ps-frame` from `/play/<slug>/index.html`. The parent's rAF
  stops while it is open. In games, a tap of Esc is the game's and a 600 ms hold
  leaves the stage.
- Showcase media: `node tools/showcase/check.mjs` validates every film, still and
  stage against `src/data/projects.ts`. See `tools/showcase/README.md`.
- Reduced motion: context `reducedMotion: 'reduce'` → straight to slideshow.
- Console must stay clean except: aborted font requests (driver-induced) and
  a `THREE.Clock` deprecation warning (known, cosmetic).
