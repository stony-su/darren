/**
 * Fragment Ecology: six generative pieces, hosted one at a time. The film cuts
 * between three of them, each given the time it needs to become itself first.
 *
 * Seeds and sliders are the project's own controls. The Piece instance isn't
 * exposed by the host, so it is caught the first time it renders.
 * `ONLY=film` or `ONLY=stills` redoes half the work while iterating.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { freeze } from './_handclock.mjs';

const FRAME = 1000 / 30;
const FADE = 0.7;

async function open(rig, id) {
  const page = await rig.page({ width: 1440, height: 960 });
  await freeze(page);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${rig.site.origin}/play/fragment-ecology/index.html?piece=${id}`);
  await page.waitForFunction(() => window.AA && AA.registry.length === 6);
  await page.addStyleTag({ content: '.caption{display:none!important}' });
  await page.evaluate((pieceId) => {
    const klass = AA.registry.find((d) => d.id === pieceId).klass;
    const render = klass.prototype.render;
    klass.prototype.render = function (t, dt) {
      window.__piece = this;
      return render.call(this, t, dt);
    };
  }, id);
  await page.clock.runFor(50);
  await page.waitForFunction(() => window.__piece);
  return page;
}

function configure(page, { seed, params = {}, cfg = {}, cfgScale = {} }) {
  return page.evaluate(
    ({ seed, params, cfg, cfgScale }) => {
      const p = window.__piece;
      if (seed) p.setSeed(seed);
      for (const k in params) p.setParam(k, params[k]);
      Object.assign(p.cfg || {}, cfg);
      for (const k in cfgScale) p.cfg[k] *= cfgScale[k];
    },
    { seed, params, cfg, cfgScale },
  );
}

async function run(page, seconds) {
  for (let t = 0; t < seconds; t += 0.25) await page.clock.runFor(250);
}

const CLIPS = [
  {
    name: 'physarum',
    id: 'physarum',
    seed: 77,
    params: { reach: 0.6 },
    cfgScale: { exposure: 1.7 },
    warm: 24,
    seconds: 4.4,
  },
  {
    // Caught while the rings are still breaking up into labyrinth.
    name: 'reagent',
    id: 'reagent',
    seed: 6,
    warm: 2.2,
    seconds: 4.4,
  },
  {
    name: 'fold',
    id: 'fold',
    seed: 230,
    params: { speed: 1.7, detail: 8 },
    cfg: { camDist: 4.5 },
    warm: 3,
    seconds: 4.2,
  },
];

const STILLS = [
  { page: 1, id: 'aurora', seed: 140, warm: 6 },
  { page: 2, id: 'curl', seed: 12, params: { particles: 11000, persistence: 0.972 }, warm: 12 },
  { page: 3, id: 'reagent', warm: 14 },
  { page: 4, id: 'attractor', warm: 14 },
  { page: 5, id: 'physarum', seed: 77, params: { reach: 0.6 }, cfgScale: { exposure: 1.7 }, warm: 24 },
  { page: 6, id: 'fold', seed: 230, params: { detail: 8 }, cfg: { camDist: 4.5 }, warm: 5 },
];

export default async function fragmentEcology(rig) {
  const only = process.env.ONLY;
  if (only !== 'stills') {
    const clips = [];
    for (const c of CLIPS) {
      const page = await open(rig, c.id);
      await configure(page, c);
      await run(page, c.warm);
      clips.push(await rig.film(page, c.name, Math.round(c.seconds * 30), () => page.clock.runFor(FRAME)));
      await page.context().close();
    }
    const film = path.join(rig.outDir, 'loop.mp4');
    const result = encodeLoop({ clips, out: film, crossfade: FADE, crf: 21 });
    console.log('  film', result);
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
  }
  if (only !== 'film') {
    for (const s of STILLS) {
      const page = await open(rig, s.id);
      await configure(page, s);
      await run(page, s.warm);
      const file = await rig.photo(page, `still-${s.id}`);
      await still(rig.sharp, file, path.join(rig.outDir, `page-${s.page}.webp`));
      await page.context().close();
      console.log(`  page ${s.page}: ${s.id}`);
    }
  }
}
