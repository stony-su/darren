# Showcase tools

These make the media and playable builds behind the project slides. Nothing here ships with the site. They write into `public/showcase/<slug>/` and `public/play/<slug>/`, and `src/data/projects.ts` says what each slide uses.

## Setup

Keep a work folder outside the repo. Its `pw` folder holds the filming dependencies, which stay out of the site's `package.json`:

```bash
mkdir -p <work>/pw && cd <work>/pw
npm init -y && npm i playwright sharp
npx playwright install chromium
```

`ffmpeg` and `ffprobe` must be on your PATH.

## Commands

Run these from `portfolio/`:

```bash
node tools/showcase/sync-builds.mjs --work <work> [slug ...]   # copy playable builds into public/play
node tools/showcase/capture.mjs --work <work> <slug> [...]     # film a project
node tools/showcase/check.mjs                                  # validate everything the site references
```

`sync-builds.mjs` lists at its top what it expects in `<work>`, and reads your project folders from `~/Downloads` unless you set `SHOWCASE_PROJECTS`. It never writes to them.

`capture.mjs` leaves a contact sheet at `<work>/cap/<slug>/sheet.jpg`, so you can judge a film at a glance.

## Adding a project

1. Add an entry to `PROJECTS` in `src/data/projects.ts`. The slide, deep link, timeline dot and grid tile all come from it.
2. Write `recipes/<slug>.mjs`. The slug is the lowercased title with dashes. `recipes/apeiron.mjs` is a good one to start from.
3. To make it playable, add it to `BUILDS` in `sync-builds.mjs` and give the entry a `play` block. Web pages that allow framing can use `kind: 'remote'` instead.
4. Run `capture.mjs`, then `check.mjs`.

## Conventions

- Films are 960×640 H.264 with no audio, under 3.5 MB, and loop seamlessly. `lib/encode.mjs` handles all of this.
- The poster is always the film's first frame, so nothing jumps when playback starts.
- `lib/rig.mjs` gives pages a fake clock. Recipes pause it with `freeze` from `recipes/_handclock.mjs` and step it frame by frame, which keeps footage smooth however slow the machine is. Files in `recipes/` that start with `_` are shared helpers.
- `sync-builds.mjs` copies from explicit lists. Add files to a list by hand, so private files can't be published by accident.
- The barcode recipe reads its original recording from `<work>/src/barcode/`. That file shows an account email and a receipt, so it must stay out of `public/`, and `check.mjs` fails if it returns. The published `demo.mp4` has those parts blurred.
- Every build has to load `/play/_stage/bridge.js`, because that is how the stage talks to it. The stage opens builds at `/play/<slug>/index.html`, and the file name is required: without it the dev server returns the portfolio itself.
