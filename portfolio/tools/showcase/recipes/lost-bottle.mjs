/**
 * Lost Bottle, the offline demo build. One take: a bottle already up, its letter
 * opened and read, put back, then the line cast again and another bottle rising.
 * The film opens and closes on a bottle at the surface, so the loop closes itself.
 *
 * Which bottle a cast brings up is decided by two Math.random calls at the moment
 * the line is released, so those two are set by hand: that picks a light letter
 * and keeps the take repeatable. `ONLY=film` or `ONLY=stills` redoes half the work.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { advance, freeze, FRAME_MS, takeCssAnimations } from './_handclock.mjs';

const VIEW = { width: 1200, height: 800, scale: 1.5 };
const SPOT = { x: VIEW.width / 2, y: VIEW.height * 0.56 };
/** Reaches the deepest band; the second number is the place in that band. */
const ABYSSAL = 0.99995;
const LETTERS = { radar: 0, recipe: 0.4, april: 0.6, cat: 0.8 };
const FADE = 1;

async function open(rig, seed = 3, scale = VIEW.scale) {
  const page = await rig.page({ ...VIEW, scale, seed });
  await freeze(page);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${rig.site.origin}/play/lost-bottle/index.html`);
  await page.waitForSelector('.cast__water', { state: 'attached' });
  await takeCssAnimations(page);
  return page;
}

function find(page, selector, text) {
  return page.evaluate(
    ({ selector, text }) => {
      const el = [...document.querySelectorAll(selector)].find((e) => !text || e.textContent.trim() === text);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    { selector, text },
  );
}

async function click(page, selector, text) {
  const at = await find(page, selector, text);
  if (!at) throw new Error(`nothing to click: ${selector} ${text ?? ''}`);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.up();
}

function press(page) {
  return page.mouse.move(SPOT.x, SPOT.y).then(() => page.mouse.down());
}

/** Lets go of the line, with the catch decided. */
async function release(page, pick) {
  await page.evaluate(
    (values) => {
      const queue = [...values];
      const original = Math.random;
      Math.random = () => {
        const v = queue.shift();
        if (!queue.length) Math.random = original;
        return v;
      };
    },
    [ABYSSAL, pick],
  );
  await page.mouse.up();
}

async function waitFor(page, selector, text, limitMs = 8000) {
  for (let t = 0; t < limitMs; t += FRAME_MS) {
    if (await find(page, selector, text)) return;
    await advance(page, FRAME_MS);
  }
  throw new Error(`never appeared: ${selector} ${text ?? ''}`);
}

/** From a calm sea to a bottle at the surface with its card fully in. */
async function catchBottle(page, pick) {
  await press(page);
  await advance(page, 1500);
  await release(page, pick);
  await waitFor(page, '.catch__marks .mark', 'Open it');
  await advance(page, 2800);
}

async function filmTake(rig) {
  const page = await open(rig);
  await advance(page, 7000, { chunk: 50 });
  await catchBottle(page, LETTERS.radar);

  // Seconds into the take.
  const cues = [
    [1.5, () => click(page, '.catch__marks .mark', 'Open it')],
    [5.2, () => click(page, '.paper__marks .mark', 'Put it back')],
    [6.3, () => press(page)],
    [7.8, () => release(page, 0.5)],
  ];
  const clip = await rig.film(page, 'take', Math.round(12.7 * 30), async (i) => {
    while (cues.length && cues[0][0] <= i / 30) await cues.shift()[1]();
    await advance(page, FRAME_MS);
  });
  await page.context().close();
  return clip;
}

const go = (place) => async (page) => {
  await click(page, '.legend__label', place);
  await advance(page, 2600);
};

const STILLS = [
  {
    // The water with the line going out: the ring tightens as it deepens.
    name: 'sea',
    page: 1,
    async make(page) {
      await advance(page, 1500);
      await press(page);
      await advance(page, 1250);
    },
  },
  {
    name: 'letter',
    page: 2,
    async make(page) {
      await catchBottle(page, LETTERS.recipe);
      await click(page, '.catch__marks .mark', 'Open it');
      await advance(page, 3600);
    },
  },
  { name: 'currents', page: 3, make: go('Currents') },
  { name: 'table', page: 4, make: go('Table') },
  { name: 'sealed', page: 5, make: go('Sealed') },
  {
    // Close on the route, cropped to the chart and its stamps.
    name: 'passport',
    page: 6,
    scale: 2.4,
    async make(page) {
      await catchBottle(page, LETTERS.cat);
      await click(page, '.catch__marks .mark', 'Open it');
      await advance(page, 5200);
      await page.evaluate(() => {
        const paper = document.querySelector('.paper');
        const map = document.querySelector('.passport');
        paper.scrollTop = map.offsetTop - 24;
      });
      await advance(page, 300);
      const box = await page.evaluate(() => {
        const r = document.querySelector('.passport').getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      const width = box.width + 56;
      const height = width / 1.5;
      return {
        x: box.x - 28,
        y: Math.max(0, box.y + box.height / 2 - height / 2),
        width,
        height,
      };
    },
  },
];

export default async function lostBottle(rig) {
  const only = process.env.ONLY;
  if (only !== 'stills') {
    const clip = await filmTake(rig);
    const film = path.join(rig.outDir, 'loop.mp4');
    const result = encodeLoop({ clips: [clip], out: film, crossfade: FADE, crf: 20 });
    console.log('  film', result);
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
  }
  if (only !== 'film') {
    for (const s of STILLS) {
      const page = await open(rig, 4, s.scale);
      await advance(page, 6000, { chunk: 50 });
      const clip = await s.make(page);
      let file;
      if (clip) {
        file = path.join(rig.cap, `still-${s.name}.png`);
        await page.screenshot({ path: file, clip, animations: 'allow' });
      } else {
        file = await rig.photo(page, `still-${s.name}`);
      }
      await still(rig.sharp, file, path.join(rig.outDir, `page-${s.page}.webp`));
      await page.context().close();
      console.log(`  page ${s.page}: ${s.name}`);
    }
  }
}
