/**
 * cosu: a seed composes a song and its beatmap, and a perfect run plots it.
 * The film watches the machine play the peak of one song in two of the game's
 * grounds, then lands on the finished plot developing on the results screen.
 *
 * The game keeps time from the AudioContext, which a stepped clock can't move, so
 * the conductor's clock is replaced with one driven by the rig's. Skipping ahead
 * to the peak runs the real game logic quickly without drawing, which is also
 * what fills the plot. `ONLY=film` or `ONLY=stills` redoes half the work.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { freeze } from './_handclock.mjs';

const FRAME = 1000 / 30;
const FADE = 0.7;
const SEED = 7;
const VIEW = { width: 1440, height: 960, scale: 1.5 };

async function open(rig, mode) {
  const page = await rig.page(VIEW);
  await freeze(page);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${rig.site.origin}/play/cosu/index.html`);
  await page.waitForFunction(() => typeof App !== 'undefined' && App.song);
  await page.evaluate(
    ({ mode, seed }) => {
      App.diffKey = 'hard';
      App.setStyle(mode);
      App.loadSeed(seed);
    },
    { mode, seed: SEED },
  );
  return page;
}

/** Starts the perfect run with the song on the rig's clock, and reports its shape. */
function watch(page) {
  return page.evaluate(() => {
    App.startPlay(true);
    window.__base = performance.now();
    window.__offset = -1000;
    window.__song = -1000;
    App.conductor.timeMs = () => window.__offset + (performance.now() - window.__base);
    const s = App.song;
    const ms = (beat) => beat * s.spb * 1000;
    const peak = s.sections.find((x) => x.kiai);
    const before = s.sections[s.sections.indexOf(peak) - 1];
    return {
      peak: ms(peak.startBeat),
      peakEnd: ms(peak.endBeat),
      verse: ms(before.startBeat),
      end: App.maps[App.diffKey].endTime,
    };
  });
}

/** Plays the game's logic forward to `target` without drawing it. */
function skipTo(page, target) {
  return page.evaluate((target) => {
    const g = App.game;
    let t = window.__song;
    while (t < target && g.state === 'playing') {
      t += 8;
      g.update(t, 0.008);
    }
    window.__song = t;
    window.__offset = t - (performance.now() - window.__base);
    return { state: g.state, mode: App.mode };
  }, target);
}

async function run(page, ms) {
  for (let t = 0; t < ms; t += FRAME) await page.clock.runFor(FRAME);
  await page.evaluate(() => {
    if (App.conductor) window.__song = App.conductor.timeMs();
  });
}

/** Runs on to just after the next beat, when the peak's rings are strongest. */
async function toBeat(page) {
  const wait = await page.evaluate(() => {
    const beat = App.song.spb * 1000;
    const t = App.conductor.timeMs();
    return beat - (((t % beat) + beat) % beat) + 50;
  });
  await run(page, wait);
}

export default async function cosu(rig) {
  const only = process.env.ONLY;
  const clips = {};
  const shots = {};

  // The peak, over a Julia set.
  let page = await open(rig, 'julia');
  await page.clock.runFor(200);
  let song = await watch(page);
  console.log('  song', JSON.stringify(song));
  await skipTo(page, song.peak - 1500);
  await run(page, 3200);
  if (only !== 'stills') clips.julia = await rig.film(page, 'julia', 138, () => page.clock.runFor(FRAME));
  shots.peak = await rig.photo(page, 'still-peak');
  await page.context().close();

  // The same run on drafting film, through to the finished plot.
  page = await open(rig, 'plotter');
  await page.clock.runFor(200);
  song = await watch(page);
  await skipTo(page, song.verse + 2500);
  await run(page, 2400);
  shots.plotter = await rig.photo(page, 'still-plotter');
  await skipTo(page, song.peak - 1500);
  await run(page, 3600);
  if (only !== 'stills') clips.plotter = await rig.film(page, 'plotter', 105, () => page.clock.runFor(FRAME));
  else await run(page, 3500);
  await toBeat(page);
  shots.moire = await rig.photo(page, 'still-moire');
  const done = await skipTo(page, song.end + 4000);
  console.log('  after skip', JSON.stringify(done));
  if (only !== 'stills') clips.results = await rig.film(page, 'results', 114, () => page.clock.runFor(FRAME));
  else await run(page, 3800);
  await run(page, 4000);
  shots.finished = await rig.photo(page, 'still-finished');
  await page.context().close();

  // The menu, then its gallery: every seed is a song with a cover of its own.
  page = await open(rig, 'plotter');
  await run(page, 5000);
  shots.menu = await rig.photo(page, 'still-menu');
  await page.evaluate(() => App.openGallery());
  await run(page, 8000);
  await page.addStyleTag({ content: '.card:nth-child(6n+5),.card:nth-child(6n){visibility:hidden}' });
  const gallery = await rig.photo(page, 'still-gallery');
  shots.seed = path.join(rig.cap, 'still-seed.png');
  // Four columns of covers, at a size where they read as pictures.
  await rig.sharp(gallery).extract({ left: 612, top: 112, width: 1056, height: 704 }).toFile(shots.seed);
  await page.context().close();

  if (only !== 'stills') {
    const film = path.join(rig.outDir, 'loop.mp4');
    const result = encodeLoop({ clips: [clips.julia, clips.plotter, clips.results], out: film, crossfade: FADE });
    console.log('  film', result);
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
  }
  if (only !== 'film') {
    const put = (file, n) => still(rig.sharp, file, path.join(rig.outDir, `page-${n}.webp`));
    await put(shots.seed, 1);
    await put(shots.plotter, 2);
    await put(shots.peak, 3);
    // A close look at the finished sheet: the figures themselves.
    const figures = path.join(rig.cap, 'still-figures.png');
    await rig.sharp(shots.finished).extract({ left: 1000, top: 300, width: 1024, height: 683 }).toFile(figures);
    await put(figures, 4);
    await put(shots.moire, 5);
    await put(shots.finished, 6);
  }
}
