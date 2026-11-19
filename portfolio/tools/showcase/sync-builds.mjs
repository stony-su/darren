#!/usr/bin/env node
/**
 * Copies each project's playable build into public/play/<slug>/ and wires it
 * to the stage bridge. Everything is copied from an explicit list, so a file
 * that was never meant to be public (cGEM's team and people data, say) cannot
 * ship by accident. Source folders are only ever read.
 *
 *   node tools/showcase/sync-builds.mjs --work <folder> [slug ...]
 *
 * <folder> holds what isn't already on disk as a project checkout:
 *   src/ink                   clone of stony-su/ink
 *   build/lost-bottle         `VITE_DEMO=1 vite build --base=./` of a lostbottlev2
 *                             copy whose src/lib/api.ts exports `local` directly,
 *                             which leaves all backend code out of the bundle
 *   build/keep                Godot web export (no threads) of a keepplatformer
 *                             copy with scale_mode set to "fractional"
 *   build/resound             `npm run itch` output (itch/out/web) of rougelike
 *
 * Set SHOWCASE_PROJECTS to change where the local checkouts live (default
 * ~/Downloads).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PLAY = path.resolve(here, '../../public/play');
const projects = process.env.SHOWCASE_PROJECTS || path.join(homedir(), 'Downloads');

const args = process.argv.slice(2);
const workFlag = args.indexOf('--work');
if (workFlag < 0 || !args[workFlag + 1]) {
  console.error('usage: sync-builds.mjs --work <folder> [slug ...]');
  process.exit(1);
}
const work = path.resolve(args[workFlag + 1]);
const only = args.filter((_, i) => i !== workFlag && i !== workFlag + 1);

const BRIDGE = '<script src="/play/_stage/bridge.js"></script>';

/** Put the bridge at the top of <head>, so it is in place before any game code. */
function withBridge(html) {
  const anchor = /<meta\s+charset[^>]*>/i.test(html) ? /<meta\s+charset[^>]*>/i : /<head[^>]*>/i;
  if (!anchor.test(html)) throw new Error('no <head> to inject into');
  return html.replace(anchor, (m) => `${m}\n    ${BRIDGE}`);
}

function withAdapter(html, file = 'stage-adapter.js') {
  if (!/<\/body>/i.test(html)) throw new Error('no </body> to inject before');
  return html.replace(/<\/body>/i, `  <script src="${file}"></script>\n  </body>`);
}

function must(text, find, replacement) {
  if (!text.includes(find)) throw new Error(`expected source text not found: ${find.slice(0, 60)}`);
  return text.replace(find, replacement);
}

const BUILDS = {
  ink: {
    from: path.join(work, 'src/ink'),
    files: ['app.js', 'style.css', 'index.html'],
    adapter: path.join(here, 'adapters/ink.js'),
  },

  apeiron: {
    from: path.join(projects, 'plat/dist'),
    files: [['apeiron.html', 'index.html']],
  },

  resound: {
    from: path.join(work, 'build/resound'),
    files: ['index.html', 'assets'],
  },

  cosu: {
    from: path.join(projects, 'cosu'),
    files: ['index.html', 'js'],
    adapter: path.join(here, 'adapters/cosu.js'),
  },

  keep: {
    from: path.join(work, 'build/keep'),
    files: [
      'index.html',
      'index.js',
      'index.wasm',
      'index.pck',
      'index.png',
      'index.audio.worklet.js',
      'index.audio.position.worklet.js',
    ],
  },

  'lost-bottle': {
    from: path.join(work, 'build/lost-bottle'),
    files: ['index.html', 'assets', 'fonts'],
    // The demo has no backend. This makes that a guarantee: even a stray call
    // could not leave the page, so it can neither read nor write the real sea.
    html: (html) =>
      html.replace(
        /<meta charset="UTF-8" \/>/i,
        `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'self'" />`,
      ),
  },

  'fragment-ecology': {
    from: path.join(projects, 'glsl'),
    files: [
      'js/core/prng.js',
      'js/core/gl.js',
      'js/core/piece.js',
      'js/pieces/aurora.js',
      'js/pieces/curl.js',
      'js/pieces/reagent.js',
      'js/pieces/attractor.js',
      'js/pieces/physarum.js',
      'js/pieces/fold.js',
    ],
    extra: [
      [path.join(here, 'hosts/fragment-ecology.html'), 'index.html'],
      [path.join(here, 'hosts/fragment-ecology.js'), 'host.js'],
    ],
    bridged: true,
  },

  // Only the hero animation. The site's teams and people pages stay out.
  cgem: {
    from: path.join(projects, 'CGEM/CGEM'),
    files: [['js/hero.js', 'hero.js']],
    extra: [
      [path.join(here, 'hosts/cgem.html'), 'index.html'],
      [path.join(here, 'hosts/cgem.js'), 'host.js'],
    ],
    bridged: true,
    patch: {
      'hero.js': (src) => {
        let out = must(
          src.replace(/\r\n/g, '\n'),
          `    const mobile = W < 820;
    cx = mobile ? W * 0.5 : W * 0.64;
    cy = mobile ? H * 0.40 : H * 0.47;
    scale = mobile ? Math.min(W * 0.42, H * 0.26) : Math.min(W * 0.24, H * 0.34);`,
          `    cx = W * 0.5;
    cy = H * 0.47;
    scale = Math.min(W * 0.3, H * 0.36);`,
        );
        out = must(
          out,
          `    /* phase machine */
    if (phase === "assemble" && now - startTime > ASSEMBLE_MS) {`,
          `    /* phase machine */
    if (scrub !== null) {
      scrub += (scrubTarget - scrub) * 0.12;
      if (Math.abs(scrubTarget - scrub) < 0.001) scrub = scrubTarget;
      cur = Math.min(2, Math.floor(scrub));
      nxt = Math.min(2, cur + 1);
      const f = scrub - cur;
      if (f <= 0 || nxt === cur) { nxt = cur; phase = "hold"; phaseStart = now; }
      else { phase = "morph"; phaseStart = now - f * MORPH_MS; }
    } else if (phase === "assemble" && now - startTime > ASSEMBLE_MS) {`,
        );
        out = must(
          out,
          `  /* ---- wiring ---- */
`,
          `  /* ---- scrubbing, for the portfolio's stage ---- */
  let scrub = null, scrubTarget = 0;
  window.cgemHero = {
    scrubTo(value) {
      scrubTarget = Math.max(0, Math.min(2, value));
      if (scrub === null) scrub = cur;
      if (REDUCE) { scrub = scrubTarget; tick(1200); }
    }
  };

  /* ---- wiring ---- */
`,
        );
        return out;
      },
    },
  },
};

function copy(fromRoot, toRoot, entry) {
  const [src, dest] = Array.isArray(entry) ? entry : [entry, entry];
  const from = path.join(fromRoot, src);
  if (!existsSync(from)) throw new Error(`missing: ${from}`);
  const to = path.join(toRoot, dest);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

function sizeOf(p) {
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((sum, name) => sum + sizeOf(path.join(p, name)), 0);
}

for (const [slug, build] of Object.entries(BUILDS)) {
  if (only.length && !only.includes(slug)) continue;
  const out = path.join(PLAY, slug);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const entry of build.files) copy(build.from, out, entry);
  for (const [src, dest] of build.extra ?? []) cpSync(src, path.join(out, dest));
  for (const [file, patch] of Object.entries(build.patch ?? {})) {
    const p = path.join(out, file);
    writeFileSync(p, patch(readFileSync(p, 'utf8')));
  }

  const indexPath = path.join(out, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  if (build.html) html = build.html(html);
  if (!build.bridged) html = withBridge(html);
  if (build.adapter) {
    cpSync(build.adapter, path.join(out, 'stage-adapter.js'));
    html = withAdapter(html);
  }
  writeFileSync(indexPath, html);

  console.log(`${slug.padEnd(18)} ${(sizeOf(out) / 1048576).toFixed(2)} MB`);
}
