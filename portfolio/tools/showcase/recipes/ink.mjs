/**
 * Ink: rain on paper, in the Sumi palette, with the odd drop of vermilion.
 *
 * The simulation runs on rAF and its drops land from setTimeout, so all of it
 * follows the rig's clock. The falling drops themselves are CSS animations,
 * which are stepped by hand alongside it. `ONLY=film` or `ONLY=stills` redoes
 * half the work while iterating.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { advance, freeze, FRAME_MS, takeCssAnimations } from './_handclock.mjs';

const PALETTE = { deepSea: 0, ember: 1, sumi: 2, aurora: 3, blush: 4 };
const WATER = 0;
const PAPER = 1;
const FILM_SECONDS = 11;
const FADE = 1;

async function open(rig, seed = 7) {
  const page = await rig.page({ width: 1440, height: 960, seed });
  await freeze(page);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${rig.site.origin}/play/ink/index.html`);
  await page.waitForFunction(() => window.INK);
  await page.addStyleTag({ content: '.ui,.cursor{display:none!important}' });
  await takeCssAnimations(page);
  return page;
}

/** Palette, mode and sliders, all of them the project's own settings. */
function setup(page, { palette, mode, config = {} }) {
  return page.evaluate(
    ({ palette, mode, config }) => {
      INK.palette(palette);
      INK.mode(mode);
      Object.assign(INK.config, { autoDrops: false, rain: false }, config);
    },
    { palette, mode, config },
  );
}

/** A shower with chosen inks, and a helper for bigger drops within it. */
function startRain(page, { ink, accent, peak }) {
  return page.evaluate(
    ({ ink, accent, peak }) => {
      INK.rain(600);
      const r = INK.state.rain;
      const inks = INK.palettes[INK.state.paletteIndex].inks;
      const key = INK.state.mode.target > 0.5 ? 'paper' : 'water';
      r.color = inks[ink][key];
      r.color2 = inks[accent][key];
      r.peak = peak;
      let n = 0;
      window.__accent = () => {
        const x = 0.06 + Math.random() * 0.88;
        const y = 0.3 + Math.random() * 0.42;
        INK.drip(x, y, n++ % 3 === 0 ? accent : ink, {
          size: 0.5 + Math.random() * 0.4,
          amount: 1.15,
          fall: 0.75,
        });
      };
    },
    { ink, accent, peak },
  );
}

/** Runs the rain on, adding a bigger drop every couple of seconds. */
async function rainFor(page, seconds) {
  for (let s = 0; s < seconds; s++) {
    await advance(page, 1000, { chunk: 100 });
    if (s % 2 === 0) await page.evaluate(() => window.__accent());
  }
}

async function filmRain(rig) {
  const page = await open(rig, 7);
  await setup(page, {
    palette: PALETTE.sumi,
    mode: PAPER,
    config: { dropSize: 0.62, gravity: 42, curl: 24 },
  });
  await startRain(page, { ink: 0, accent: 2, peak: 9 });
  await rainFor(page, 26);

  const clip = await rig.film(page, 'rain', FILM_SECONDS * 30, async (i) => {
    if (i % 60 === 15) await page.evaluate(() => window.__accent());
    await advance(page, FRAME_MS);
  });
  await page.context().close();
  return clip;
}

/** Scattered drops, staggered so the frame holds several ages of ink at once. */
async function dropsOverTime(page, drops, settle) {
  let t = 0;
  for (const [at, x, y, ink, size] of drops) {
    await advance(page, (at - t) * 1000, { chunk: 100 });
    t = at;
    await page.evaluate((d) => INK.drop(d.x, d.y, d.ink, { size: d.size }), { x, y, ink, size });
  }
  await advance(page, settle * 1000, { chunk: 100 });
}

/** A real mouse drag along `path`, with the clock moving underneath it. */
async function drag(page, points, { shift = false, stepsPerLeg = 14 } = {}) {
  const px = ([x, y]) => [x * 1440, (1 - y) * 960];
  const [sx, sy] = px(points[0]);
  await page.mouse.move(sx, sy);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  for (let leg = 1; leg < points.length; leg++) {
    const [ax, ay] = px(points[leg - 1]);
    const [bx, by] = px(points[leg]);
    for (let k = 1; k <= stepsPerLeg; k++) {
      await page.mouse.move(ax + ((bx - ax) * k) / stepsPerLeg, ay + ((by - ay) * k) / stepsPerLeg);
      await advance(page, FRAME_MS, { chunk: FRAME_MS });
    }
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

const STILLS = [
  {
    name: 'paper',
    page: 1,
    seed: 11,
    async make(page) {
      await setup(page, { palette: PALETTE.deepSea, mode: PAPER, config: { dropSize: 0.72, gravity: 24, curl: 20 } });
      await dropsOverTime(
        page,
        [
          [0.5, 0.28, 0.78, 0, 1.2],
          [1.6, 0.68, 0.84, 2, 1.1],
          [3.2, 0.46, 0.66, 1, 1.0],
          [4.4, 0.82, 0.62, 0, 0.9],
          [5.6, 0.16, 0.58, 2, 0.9],
          [6.8, 0.58, 0.46, 0, 0.8],
        ],
        4,
      );
    },
  },
  {
    name: 'sumi',
    page: 2,
    seed: 5,
    async make(page) {
      await setup(page, { palette: PALETTE.sumi, mode: PAPER, config: { dropSize: 0.86, gravity: 30, curl: 26 } });
      await dropsOverTime(
        page,
        [
          [0.5, 0.34, 0.8, 0, 1.3],
          [2.4, 0.66, 0.74, 0, 1.2],
          [4.0, 0.5, 0.6, 2, 0.7],
          [5.2, 0.22, 0.5, 0, 0.8],
          [6.4, 0.8, 0.46, 1, 0.9],
        ],
        3.6,
      );
    },
  },
  {
    name: 'water',
    page: 3,
    seed: 3,
    async make(page) {
      await setup(page, { palette: PALETTE.deepSea, mode: WATER, config: { dropSize: 0.74, gravity: 18, curl: 22 } });
      await dropsOverTime(
        page,
        [
          [0.4, 0.3, 0.8, 0, 1.2],
          [1.8, 0.64, 0.86, 1, 1.2],
          [3.0, 0.48, 0.62, 2, 1.0],
          [4.2, 0.8, 0.6, 3, 0.9],
          [5.2, 0.16, 0.52, 2, 1.0],
          [6.0, 0.6, 0.36, 1, 1.0],
          [7.0, 0.34, 0.3, 0, 0.9],
          [7.8, 0.86, 0.3, 2, 0.8],
        ],
        3.4,
      );
    },
  },
  {
    name: 'rain',
    page: 4,
    seed: 9,
    async make(page) {
      await setup(page, { palette: PALETTE.aurora, mode: WATER, config: { dropSize: 0.6, gravity: 34, curl: 24 } });
      await startRain(page, { ink: 2, accent: 1, peak: 9 });
      await rainFor(page, 20);
    },
  },
  {
    name: 'stirred',
    page: 5,
    seed: 13,
    async make(page) {
      await setup(page, { palette: PALETTE.ember, mode: PAPER, config: { dropSize: 0.8, gravity: 4, curl: 30, dyeFade: 0.01, clarity: 0.04 } });
      await dropsOverTime(
        page,
        [
          [0.3, 0.3, 0.68, 0, 1.3],
          [0.6, 0.55, 0.42, 1, 1.3],
          [0.9, 0.72, 0.66, 4, 1.3],
          [1.2, 0.4, 0.3, 2, 1.2],
          [1.5, 0.2, 0.42, 3, 1.1],
          [1.8, 0.84, 0.36, 0, 1.1],
        ],
        1.2,
      );
      await drag(page, [[0.1, 0.5], [0.3, 0.76], [0.5, 0.3], [0.7, 0.74], [0.92, 0.4]], { shift: true });
      await advance(page, 700, { chunk: 100 });
      await drag(page, [[0.88, 0.72], [0.62, 0.26], [0.42, 0.72], [0.2, 0.3], [0.06, 0.62]], { shift: true });
      await advance(page, 700, { chunk: 100 });
      await drag(page, [[0.2, 0.86], [0.5, 0.56], [0.8, 0.88]], { shift: true, stepsPerLeg: 12 });
      await advance(page, 1500, { chunk: 100 });
    },
  },
  {
    name: 'bloom',
    page: 6,
    seed: 21,
    async make(page) {
      await setup(page, { palette: PALETTE.ember, mode: WATER, config: { dropSize: 0.86, gravity: 14, curl: 26 } });
      await dropsOverTime(
        page,
        [
          [0.4, 0.36, 0.8, 0, 1.4],
          [1.2, 0.64, 0.84, 1, 1.4],
          [2.6, 0.5, 0.6, 2, 1.2],
          [3.6, 0.2, 0.58, 3, 1.2],
          [4.4, 0.82, 0.56, 1, 1.2],
          [5.2, 0.36, 0.34, 1, 1.2],
          [6.0, 0.62, 0.3, 0, 1.1],
        ],
        2.8,
      );
    },
  },
];

export default async function ink(rig) {
  const only = process.env.ONLY;
  if (only !== 'stills') {
    const clip = await filmRain(rig);
    const film = path.join(rig.outDir, 'loop.mp4');
    const result = encodeLoop({ clips: [clip], out: film, crossfade: FADE });
    console.log('  film', result);
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
  }
  if (only !== 'film') {
    for (const s of STILLS) {
      const page = await open(rig, s.seed);
      await s.make(page);
      const file = await rig.photo(page, `still-${s.name}`);
      await still(rig.sharp, file, path.join(rig.outDir, `page-${s.page}.webp`));
      await page.context().close();
      console.log(`  page ${s.page}: ${s.name}`);
    }
  }
}
