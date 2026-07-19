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
- Slideshow: ArrowLeft/Right/Home/End; hash per slide (#vertex … #contact);
  deep link (e.g. `/#turntable`) must skip the intro entirely.
- Timeline (`nav.progress-rail`): 13 dots = 5 intro steps + Work + 6 projects
  + Contact, evenly spread with a `.rail-progress` fill line. Visible during
  BOTH intro and slideshow. Intro dots (`.rail-btn-intro`) navigate intro
  lines / replay the intro from the slideshow; slide dots jump slides.
- "All projects" grid overlay (Escape/backdrop/✕ close, fade in/out,
  staggered tiles). Playground: gear `.pg-gear` slides in a full-height
  right sidebar (`.pg-panel.open`; Escape or `#pg-close` closes); sliders
  `#pg-speed` etc., `#pg-line-mode` cycles swirl-lines Auto/Always/Off,
  count select `#pg-count` triggers a live rebuild.
- Filament mode: project-card slides gather particles into long thin curl
  lines (lineStrength ramps ~1s); Work/Contact slides dissolve back to chaos.
- Reduced motion: context `reducedMotion: 'reduce'` → straight to slideshow.
- Console must stay clean except: aborted font requests (driver-induced) and
  a `THREE.Clock` deprecation warning (known, cosmetic).
