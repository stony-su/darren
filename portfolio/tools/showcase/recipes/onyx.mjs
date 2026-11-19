/**
 * Onyx is a Unity WebGL game that itch.io serves only inside its own page, so it
 * is played there, in real time, with the keyboard. Its hero is tiny, so the
 * game's frame is enlarged on that page and slid so the action fills the window;
 * Chromium then draws the game at twice the density, and a screencast records it
 * with true timestamps.
 *
 * Real-time play does not repeat exactly, and itch.io rate-limits page loads. So
 * each take is kept once it has been judged good (in <work>/cap/onyx/takes): a take
 * that exists is reused, and only missing ones are filmed, all from one page load.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';

const GAME_PAGE = 'https://stony-su.itch.io/onyx';
const VIEW = { width: 960, height: 640 };
const FPS = 30;
const CROSSFADE = 0.4;

/** Parts of the game's 960x600 canvas: a close-up that follows the hero, and the whole room. */
const CLOSE = [282, 125, 480, 320];
const WIDE = [30, 0, 900, 600];

/**
 * R L U = arrows, S = space (jump), X = dash, C = attack, Z = glide form.
 * `t:K+` press, `t:K-` release, `t:Kn` tap for n ms, all in ms from the start.
 */
const CLIMB = '500:R+ 820:S500 1780:S500 2300:R- 2570:S500 2880:R+ 3240:R- 3800:S500 3830:R+ 4480:R-';
const TAKES = {
  // Over the spikes, up the platforms to the gargoyle, across the wall, down the gap,
  // a dash under the far wall, then glide form rides the updraft up its shaft.
  route: { region: CLOSE, seconds: 20, keys: `${CLIMB} 5300:R+ 5320:X50 5900:R- 6350:L150 6900:Z60 7350:R160` },
  moves: {
    region: CLOSE,
    seconds: 6.5,
    keys: '600:L+ 620:X50 720:L- 1300:R+ 1320:X50 1420:R- 1900:C60 2500:U+ 2520:X50 2620:U- 3200:C60 3700:S450 3950:R+ 3970:X50 4100:R- 4700:L+ 4720:X50 4820:L- 5300:C60',
  },
  wide: { region: WIDE, seconds: 6, keys: CLIMB },
};

/**
 * Stretches of the takes, in seconds. The film opens CROSSFADE into the first one,
 * and the last ends on the same frames the first begins with, so the long run
 * flows straight back into the updraft.
 */
const CLIPS = [
  { take: 'route', from: 7.15, to: 8.55 },
  { take: 'wide', from: 0.6, to: 2.9 },
  { take: 'moves', from: 3.35, to: 5.05 },
  { take: 'route', from: 0.75, to: 7.55 },
];

/** Glass pages, in order: The Dungeon, Spikes, The Gargoyle, The Leap, Dash, The Updraft. */
const PAGES = [
  ['wide', 0.4],
  ['route', 1.25],
  ['route', 3.6],
  ['route', 4.3],
  ['route', 5.75],
  ['route', 7.55],
];

const KEYS = { R: 'ArrowRight', L: 'ArrowLeft', U: 'ArrowUp', D: 'ArrowDown', S: 'Space', X: 'x', C: 'c', Z: 'z' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function timeline(spec) {
  const events = [];
  for (const token of spec.trim().split(/\s+/)) {
    const [, at, name, what] = token.match(/^(\d+):([A-Z])(\+|-|\d+)$/);
    const key = KEYS[name];
    if (what === '+') events.push([+at, 'down', key]);
    else if (what === '-') events.push([+at, 'up', key]);
    else events.push([+at, 'down', key], [+at + +what, 'up', key]);
  }
  return events.sort((a, b) => a[0] - b[0]);
}

function cpuTimes() {
  return os.cpus().reduce(
    (sum, { times: t }) => ({ idle: sum.idle + t.idle, all: sum.all + t.user + t.nice + t.sys + t.idle + t.irq }),
    { idle: 0, all: 0 },
  );
}

/** Played in real time, so a take is only worth filming on a quiet machine. */
async function waitForQuiet(limit = 60, patience = 300000) {
  const start = Date.now();
  let calm = 0;
  while (calm < 3 && Date.now() - start < patience) {
    const a = cpuTimes();
    await sleep(1000);
    const b = cpuTimes();
    const busy = 100 * (1 - (b.idle - a.idle) / (b.all - a.all));
    calm = busy < limit ? calm + 1 : 0;
  }
}

async function openGame(page) {
  let ready = false;
  for (let attempt = 0; attempt < 5 && !ready; attempt++) {
    await page.goto(GAME_PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    ready = await page.locator('.load_iframe_btn').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    if (!ready) await sleep(90000); // itch.io answers 429 when asked too often
  }
  if (!ready) throw new Error('the itch.io page did not offer the game');
  const run = page.locator('.load_iframe_btn').first();
  await run.scrollIntoViewIfNeeded();
  await run.click();
  const element = page.locator('iframe').first();
  await element.waitFor({ timeout: 30000 });
  return { element, frame: await (await element.elementHandle()).contentFrame() };
}

async function gameLoaded(page, frame) {
  await frame.waitForSelector('#unity-canvas', { timeout: 60000 });
  await frame.waitForFunction(
    () => {
      const bar = document.querySelector('#unity-loading-bar');
      return bar && getComputedStyle(bar).display === 'none';
    },
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(2500);
}

/** Enlarge the game's frame on the page so that `region` of its canvas fills the window. */
function frameShot(page, [x, y, width]) {
  return page.evaluate(
    ({ zoom, x, y }) => {
      const f = document.querySelector('iframe');
      f.dataset.w ??= f.offsetWidth;
      f.dataset.h ??= f.offsetHeight;
      Object.assign(f.style, {
        position: 'fixed', left: `${-x}px`, top: `${-y}px`, width: `${f.dataset.w}px`, height: `${f.dataset.h}px`,
        maxWidth: 'none', maxHeight: 'none', margin: '0', border: '0', zIndex: '2147483647', zoom: String(zoom),
      });
      document.documentElement.style.overflow = 'hidden';
    },
    { zoom: VIEW.width / width, x, y },
  );
}

/** Keyboard focus inside the frame does not always take. An attack swing proves that it has. */
async function takeFocus(rig, page, element, frame) {
  const look = async () => rig.sharp(await page.screenshot({ type: 'jpeg', quality: 80 })).resize(240, 160).greyscale().raw().toBuffer();
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.bringToFront();
    await page.mouse.click(VIEW.width / 2 + attempt * 7, VIEW.height / 2, { delay: 60 });
    await element.focus();
    await frame.evaluate(() => {
      const canvas = document.querySelector('#unity-canvas');
      canvas.setAttribute('tabindex', '1');
      canvas.focus();
      window.focus();
    });
    await page.waitForTimeout(300);
    const before = await look();
    await page.keyboard.press('c', { delay: 70 });
    await page.waitForTimeout(260);
    const after = await look();
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 40) changed++;
    if (changed > 12) return;
  }
  throw new Error('the game never took keyboard focus');
}

async function filmTake(rig, page, cdp, take, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const shots = [];
  const onFrame = (e) => {
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
    const name = `s${String(shots.length).padStart(5, '0')}.jpg`;
    writeFileSync(path.join(dir, name), Buffer.from(e.data, 'base64'));
    shots.push({ name, t: e.metadata.timestamp });
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: VIEW.width, maxHeight: VIEW.height });
  const start = Date.now();
  for (const [at, kind, key] of timeline(take.keys)) {
    const wait = at - (Date.now() - start);
    if (wait > 0) await page.waitForTimeout(wait);
    await (kind === 'down' ? page.keyboard.down(key) : page.keyboard.up(key));
  }
  const rest = take.seconds * 1000 - (Date.now() - start);
  if (rest > 0) await page.waitForTimeout(rest);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  writeFileSync(path.join(dir, 'shots.json'), JSON.stringify({ shots, t0: start / 1000 }));
}

async function filmMissingTakes(rig, root) {
  const missing = Object.keys(TAKES).filter((name) => !existsSync(path.join(root, name, 'shots.json')));
  if (missing.length === 0) return;
  console.log(`  filming ${missing.join(', ')}: check these takes by eye before trusting the film`);
  const page = await rig.page({ ...VIEW, frozen: false });
  const { element, frame } = await openGame(page);
  const cdp = await page.context().newCDPSession(page);
  for (const [i, name] of missing.entries()) {
    if (i > 0) await frame.evaluate(() => location.reload()).catch(() => {});
    await page.waitForTimeout(500);
    await gameLoaded(page, frame);
    await frameShot(page, TAKES[name].region);
    await page.waitForTimeout(1200);
    await waitForQuiet();
    await takeFocus(rig, page, element, frame);
    await page.waitForTimeout(700);
    await filmTake(rig, page, cdp, TAKES[name], path.join(root, name));
  }
  await page.context().close();
}

/** The take's frames nearest to an even 30 a second, numbered for the encoder. */
function resample(root, cap, { take, from, to }, index) {
  const { shots: unordered, t0 } = JSON.parse(readFileSync(path.join(root, take, 'shots.json'), 'utf8'));
  // Frames can arrive slightly out of order; their timestamps are what counts.
  const shots = [...unordered].sort((a, b) => a.t - b.t);
  const dir = path.join(cap, `clip-${index}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const count = Math.round((to - from) * FPS);
  let at = 0;
  for (let i = 0; i < count; i++) {
    const wanted = t0 + from + i / FPS;
    while (at + 1 < shots.length && Math.abs(shots[at + 1].t - wanted) <= Math.abs(shots[at].t - wanted)) at++;
    copyFileSync(path.join(root, take, shots[at].name), path.join(dir, `frame_${String(i).padStart(5, '0')}.jpg`));
  }
  return { frames: dir, count };
}

function frameAt(root, take, seconds) {
  const { shots, t0 } = JSON.parse(readFileSync(path.join(root, take, 'shots.json'), 'utf8'));
  const best = shots.reduce((a, b) => (Math.abs(b.t - t0 - seconds) < Math.abs(a.t - t0 - seconds) ? b : a));
  return path.join(root, take, best.name);
}

export default async function onyx(rig) {
  const root = path.join(rig.cap, 'takes');
  mkdirSync(root, { recursive: true });
  await filmMissingTakes(rig, root);

  const film = path.join(rig.outDir, 'loop.mp4');
  const clips = CLIPS.map((clip, i) => resample(root, rig.cap, clip, i));
  console.log('  film', encodeLoop({ clips, out: film, crossfade: CROSSFADE, crf: 20 }));
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  for (const [i, [take, seconds]] of PAGES.entries()) {
    await still(rig.sharp, frameAt(root, take, seconds), path.join(rig.outDir, `page-${i + 1}.webp`));
  }
}
