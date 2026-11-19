#!/usr/bin/env node
/**
 * Checks the showcase against what the site promises: every referenced file
 * exists, films meet their spec, and nothing private made it into public/.
 *
 *   node tools/showcase/check.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../../src/data/projects.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pub = path.join(root, 'public');
const MAX_LOOP_BYTES = 3.5 * 1024 * 1024;
const MAX_PAGES = 6;
const PRIVATE_REPOS = ['stony-su/CGEM', 'stony-su/lostbottlev2', 'stony-su/keepplatformer'];

const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

const local = (url) => path.join(pub, url.split(/[?#]/)[0]);
const has = (where, url) => {
  if (!url) return fail(where, 'empty media path');
  if (!url.startsWith('/')) return fail(where, `not a site path: ${url}`);
  if (!existsSync(local(url))) fail(where, `missing ${url}`);
};

function probe(file) {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(raw);
}

/** The index must come before the media, or playback waits for the whole file. */
function isFastStart(file) {
  const head = readFileSync(file).subarray(0, 64 * 1024).toString('latin1');
  const moov = head.indexOf('moov');
  const mdat = head.indexOf('mdat');
  return moov >= 0 && (mdat < 0 || moov < mdat);
}

function checkLoop(where, url) {
  has(where, url);
  const file = local(url);
  if (!existsSync(file)) return;
  const size = statSync(file).size;
  const info = probe(file);
  const video = info.streams.find((s) => s.codec_type === 'video');
  if (info.streams.some((s) => s.codec_type === 'audio')) fail(where, 'film has an audio track');
  if (video.codec_name !== 'h264') fail(where, `film codec is ${video.codec_name}`);
  if (video.pix_fmt !== 'yuv420p') fail(where, `film pixel format is ${video.pix_fmt}`);
  if (video.width !== 960 || video.height !== 640) fail(where, `film is ${video.width}x${video.height}`);
  if (size > MAX_LOOP_BYTES) fail(where, `film is ${(size / 1048576).toFixed(1)} MB`);
  if (!isFastStart(file)) fail(where, 'film is not faststart');
}

function checkStage(where, play) {
  switch (play.kind) {
    case 'build': {
      has(where, play.src);
      const page = local(play.src);
      if (existsSync(page) && !readFileSync(page, 'utf8').includes('/play/_stage/bridge.js')) {
        fail(where, 'build does not load the stage bridge');
      }
      if (!/\/index\.html([?#]|$)/.test(play.src)) fail(where, 'stage URL must name index.html');
      for (const c of play.controls ?? []) if ('load' in c.action) has(where, c.action.load);
      break;
    }
    case 'phone':
      if (!play.screens.length) fail(where, 'phone stage has no screens');
      play.screens.forEach((s) => has(where, s.src));
      break;
    case 'film':
      has(where, play.src);
      if (play.poster) has(where, play.poster);
      for (const v of play.variants ?? []) v.frames.forEach((f) => has(where, f));
      break;
  }
}

for (const p of PROJECTS) {
  const where = p.title;
  if (p.film) {
    checkLoop(where, p.film.src);
    has(where, p.film.poster);
  } else if (p.image) {
    has(where, p.image);
  } else {
    fail(where, 'no film and no image');
  }
  if (p.pages) {
    if (p.pages.length > MAX_PAGES) fail(where, `${p.pages.length} glass screens`);
    p.pages.forEach((page) => has(where, page.src));
  }
  if (p.repoUrl && PRIVATE_REPOS.some((r) => p.repoUrl.toLowerCase().includes(r.toLowerCase()))) {
    fail(where, 'links to a private repo');
  }
  if (p.play) checkStage(where, p.play);
}

/* ── What must never be published ── */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const textFiles = (dir) =>
  existsSync(dir) ? walk(dir).filter((f) => /\.(html|js|css|json)$/.test(f)) : [];

for (const f of textFiles(path.join(pub, 'play/lost-bottle'))) {
  const text = readFileSync(f, 'utf8');
  for (const needle of ['firebaseio.com', 'identitytoolkit', 'securetoken.googleapis', 'recaptcha']) {
    if (text.includes(needle)) fail('Lost Bottle demo', `${path.basename(f)} mentions ${needle}`);
  }
}
// The unblurred original of the barcode demo shows an account email and a receipt.
if (existsSync(path.join(pub, 'pictures/websites/Screen_Recording_Jun_6_2025.mp4'))) {
  fail('Barcode Food Expiry App', 'the unblurred recording is back in public/');
}
if (existsSync(path.join(pub, 'showcase/gospel/14-plan.png'))) fail('Gospel', '14-plan must not ship');
const cgemFiles = existsSync(path.join(pub, 'play/cgem')) ? walk(path.join(pub, 'play/cgem')) : [];
for (const f of cgemFiles) {
  if (/teams|people/i.test(path.basename(f))) fail('cGEM', `${path.basename(f)} must not ship`);
}

if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join('\n'));
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log(`${PROJECTS.length} projects checked, all good`);
