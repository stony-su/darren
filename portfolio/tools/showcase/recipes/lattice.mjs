/**
 * Lattice: the landing page in one take, from the self-hosted demo build. The
 * hero's curtain is a looping video, then the page pages down to "How it works",
 * whose three cards build the request, the match and the claim, and on to the
 * category tiles bursting out of the logo.
 *
 * The landing page normally sits in a frame inside the app; it is filmed on its
 * own so the clock, its CSS and its video can all be stepped together. The
 * video does not follow the page clock, so it is paused and moved by hand.
 *
 * The app stills come from the demo build too. Its seeded customer has no
 * request yet, so one is added to the demo's own storage, the way the form
 * would after its human check.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { adoptCss, allowFonts, FPS, freeze, seconds, tick } from './_webfilm.mjs';

const CROSSFADE = 0.6;
/** Seconds into the take when each section is asked for, and when it ends. */
const HOW_AT = 3.2;
const CATEGORIES_AT = 8.6;
const LENGTH = 13.2;

async function stepVideo(page) {
  await page.evaluate(async (dt) => {
    const videos = [...document.querySelectorAll('video')];
    await Promise.all(
      videos.map((v) => {
        if (!v.__held) {
          v.__held = true;
          v.pause();
        }
        const d = v.duration || 1;
        v.currentTime = (v.currentTime + dt) % d;
        return new Promise((done) => {
          v.addEventListener('seeked', done, { once: true });
          setTimeout(done, 1500);
        });
      }),
    );
  }, 1 / FPS);
}

async function frame(page) {
  await stepVideo(page);
  await tick(page);
}

async function landing(rig) {
  const page = await rig.page({ width: 1440, height: 960 });
  await allowFonts(page);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.goto(`${rig.site.origin}/play/lattice/lumio/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 3, null, { timeout: 60000 });
  // Let the hero's intro play out in real time before taking over the clock.
  await page.waitForTimeout(4500);
  await freeze(page);
  await adoptCss(page);
  await frame(page);
  return page;
}

export default async function lattice(rig) {
  const only = process.env.ONLY;
  const shots = {};

  if (only !== 'stills') {
    const page = await landing(rig);
    const cues = [
      [HOW_AT, 'how'],
      [CATEGORIES_AT, 'categories'],
    ];
    const take = await rig.film(page, 'tour', seconds(LENGTH), async (i) => {
      const t = i / FPS;
      while (cues.length && t >= cues[0][0]) {
        await page.evaluate((anchor) => window.__latticeScrollToSection(anchor), cues.shift()[1]);
      }
      await frame(page);
    });

    const film = path.join(rig.outDir, 'loop.mp4');
    console.log('  film', encodeLoop({ clips: [take], out: film, crossfade: CROSSFADE, crf: 20 }));
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

    const at = (s) => path.join(take.frames, `frame_${String(seconds(s)).padStart(5, '0')}.jpg`);
    shots.hero = at(CROSSFADE + 0.4);
    shots.how = at(CATEGORIES_AT - 0.2);
    shots.categories = at(LENGTH - 0.1);
  }

  if (only !== 'film') {
    if (!shots.hero) {
      const page = await landing(rig);
      shots.hero = await rig.photo(page, 'still-hero');
      for (const [anchor, wait] of [['how', 5], ['categories', 4.5]]) {
        await page.evaluate((a) => window.__latticeScrollToSection(a), anchor);
        for (let i = 0; i < seconds(wait); i++) await frame(page);
        shots[anchor] = await rig.photo(page, `still-${anchor}`);
      }
    }

    // The app itself, signed in as the demo's seeded customer.
    const app = await rig.page({ width: 1440, height: 960, frozen: false });
    app.on('pageerror', (e) => console.log('  page error:', e.message));
    await app.goto(`${rig.site.origin}/play/lattice/index.html#/home`, { waitUntil: 'load' });
    await app.waitForSelector('main', { timeout: 60000 });
    await app.evaluate(() => {
      const key = 'lattice.data.v2';
      const data = JSON.parse(localStorage.getItem(key));
      const day = new Date();
      const at = (h, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString();
      data.requests = [
        {
          id: 'req_film',
          userId: 'user_lucas',
          category: 'food',
          needType: 'lunch',
          budgetMin: 0,
          budgetMax: 15,
          distanceKm: 5,
          timeStart: at(11, 30),
          timeEnd: at(14, 0),
          preferences: [],
          verifiedHuman: true,
          status: 'submitted',
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(key, JSON.stringify(data));
    });

    const visit = async (name, hash, wait = 2500) => {
      await app.evaluate((h) => {
        location.hash = h;
      }, hash);
      await app.waitForTimeout(wait);
      await app.evaluate(() => window.scrollTo(0, 0));
      await app.waitForTimeout(400);
      return rig.photo(app, name);
    };
    await app.reload({ waitUntil: 'load' });
    await app.waitForSelector('main', { timeout: 60000 });
    shots.home = await visit('still-home', '#/home');
    shots.matches = await visit('still-matches', '#/matches?request=req_film', 4500);
    shots.explore = await visit('still-explore', '#/explore', 4000);
  }

  if (only === 'film') return;
  const pages = [shots.hero, shots.how, shots.categories, shots.home, shots.matches, shots.explore];
  for (let i = 0; i < pages.length; i++) {
    await still(rig.sharp, pages[i], path.join(rig.outDir, `page-${i + 1}.webp`));
  }
}
