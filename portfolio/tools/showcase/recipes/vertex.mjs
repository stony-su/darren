/**
 * Vertex: a calm scripted tour of the live landing page. The hero is a WebGL
 * shader whose rings pulse out of the centre every 3.2 seconds, so the film is
 * timed to open on a pulse, and to flow back into the next one at the loop point.
 *
 * The opportunity and business listings need a database that is no longer
 * reachable, so the tour keeps to the pages that do not depend on it.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { adoptCss, allowFonts, FPS, freeze, scrollWindow, seconds, tick, track } from './_webfilm.mjs';

const SITE = 'https://fblc-26.vercel.app';
const CROSSFADE = 0.6;

const STOPS = { hero: 0, features: 808, philosophy: 1490, earn: 4117, begin: 4903 };

/** The top of the page: the pulse, the feature cards, the statement. */
const OPENING = track([
  [0, STOPS.hero],
  [2.1, STOPS.hero],
  [3.8, STOPS.features],
  [5.6, STOPS.features],
  [6.9, STOPS.philosophy],
  [8.1, STOPS.philosophy],
]);

/** The last step of the protocol, then the call to action under it. */
const CLOSING = track([
  [0, STOPS.earn],
  [1.2, STOPS.earn],
  [3.0, STOPS.begin],
  [4.5, STOPS.begin],
]);

/** How much light the shader canvas is putting out, 0 to 1. */
async function installGlowMeter(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    window.__glow = () => {
      const px = new Uint8Array(4);
      const n = 20;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          gl.readPixels(
            Math.floor((canvas.width * (i + 0.5)) / n),
            Math.floor((canvas.height * (j + 0.5)) / n),
            1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px,
          );
          sum += px[0] + px[1] + px[2];
        }
      }
      return sum / (3 * n * n * 255);
    };
  });
}

/** Run until a new pulse of rings has just begun to appear. */
async function waitForPulse(page) {
  const glow = () => page.evaluate(() => window.__glow());
  let dark = false;
  for (let i = 0; i < 300; i++) {
    const g = await glow();
    if (g < 0.02) dark = true;
    if (dark && g >= 0.03) return i;
    await tick(page);
  }
  throw new Error('the hero shader never pulsed');
}

export default async function vertex(rig) {
  const page = await rig.page({ width: 1440, height: 960 });
  await allowFonts(page);
  await page.goto(`${SITE}/`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await freeze(page);
  await adoptCss(page);

  // Let the hero finish arriving and ScrollTrigger measure the final layout.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await tick(page, seconds(2.5));
  await installGlowMeter(page);
  console.log('  pulse found after', await waitForPulse(page), 'frames');

  const shoot = (name, length, path_) =>
    rig.film(page, name, seconds(length), async (i) => {
      await scrollWindow(page, path_(i / FPS));
      await tick(page);
    });
  const opening = await shoot('opening', 8.1, OPENING);

  // Cut to the end of the page rather than racing through 2,600 pixels of it.
  await scrollWindow(page, STOPS.earn);
  await tick(page, seconds(1.5));
  const closing = await shoot('closing', 4.5, CLOSING);

  const film = path.join(rig.outDir, 'loop.mp4');
  console.log('  film', encodeLoop({ clips: [opening, closing], out: film, crossfade: CROSSFADE, crf: 20 }));
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  // The film's own opening moment is the hero's best one.
  const heroFrame = path.join(opening.frames, `frame_${String(seconds(CROSSFADE)).padStart(5, '0')}.jpg`);

  const settle = async (name, y, wait) => {
    await scrollWindow(page, y);
    await tick(page, seconds(wait));
    return rig.photo(page, name);
  };
  // The feature cards animate on their own; wait for the moment they all look
  // their best: the blue card on top, a day picked, the cursor on the calendar.
  await scrollWindow(page, STOPS.features);
  await tick(page, seconds(4.5));
  for (let i = 0; i < seconds(30); i++) {
    const ready = await page.evaluate(() => {
      const style = (el) => getComputedStyle(el);
      const top = [...document.querySelectorAll('.shuffler-card')].find((c) => style(c).zIndex === '3');
      return (
        top?.textContent.includes('Meaningful') &&
        parseFloat(style(top).opacity) > 0.98 &&
        style(document.querySelector('.day-cell-active')).backgroundColor === 'rgb(78, 168, 243)' &&
        parseFloat(style(document.querySelector('.animated-cursor')).opacity) > 0.9
      );
    });
    if (ready) break;
    await tick(page);
  }
  const shots = {
    features: await rig.photo(page, 'still-features'),
    philosophy: await settle('still-philosophy', STOPS.philosophy, 2),
    begin: await settle('still-begin', STOPS.begin, 1.5),
  };

  // The real discovery and sign-up pages. The browse page is shot just above its
  // (currently empty) results so it shows the page rather than the outage.
  const browse = await rig.page({ width: 1440, height: 900 });
  await allowFonts(browse);
  await browse.goto(`${SITE}/browse`, { waitUntil: 'load', timeout: 120000 });
  await browse.evaluate(() => document.fonts.ready);
  await browse.waitForTimeout(3000);
  shots.browse = await rig.photo(browse, 'still-browse');

  const signup = await rig.page({ width: 1440, height: 960 });
  await allowFonts(signup);
  await signup.goto(`${SITE}/auth/signup`, { waitUntil: 'load', timeout: 120000 });
  await signup.evaluate(() => document.fonts.ready);
  await signup.waitForTimeout(3000);
  shots.signup = await rig.photo(signup, 'still-signup');

  const pages = [heroFrame, shots.features, shots.philosophy, shots.begin, shots.browse, shots.signup];
  for (let i = 0; i < pages.length; i++) {
    await still(rig.sharp, pages[i], path.join(rig.outDir, `page-${i + 1}.webp`));
  }
}
