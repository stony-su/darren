/**
 * The grade-9 personal site, still online. A scripted tour: the hero with its
 * typed headline, the About section, then the skills and the project grid, which
 * are the parts that still look the way they did. The plexus video behind the
 * page is seeked frame by frame so it drifts at its true speed.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { adoptCss, allowFonts, FPS, freeze, scrollWindow, seconds, tick, track } from './_webfilm.mjs';

const SITE = 'https://stony-su.github.io/personal-website/';
const CROSSFADE = 0.6;

/** Where each stop sits relative to the top of its section. */
const STOP_OFFSET = { about: 30, resume: 50, services: 40, skills: 130, portfolio: 122 };

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Show the background video at an exact moment of its own timeline. */
async function showVideoAt(page, seconds_) {
  const seek = page.evaluate(async (t) => {
    const video = document.querySelector('video.body-overlay');
    video.currentTime = t % video.duration;
    if (video.seeking) await new Promise((done) => video.addEventListener('seeked', done, { once: true }));
  }, seconds_);
  await Promise.race([seek, sleep(4000)]);
}

export default async function oldSite(rig) {
  const page = await rig.page({ width: 1440, height: 960 });
  await allowFonts(page);
  await page.goto(SITE, { waitUntil: 'load', timeout: 150000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('video.body-overlay')?.readyState >= 3, null, { timeout: 60000 });
  // Catch the headline the moment it has finished typing its first word.
  await page.waitForFunction(() => document.querySelector('.typed-text')?.textContent === 'Darren', null, { timeout: 30000 });
  await freeze(page);
  await adoptCss(page);
  await page.evaluate(() => document.querySelector('video.body-overlay').pause());

  const tops = await page.evaluate(() =>
    Object.fromEntries(
      ['about', 'resume', 'services', 'skills', 'portfolio'].map((id) => [
        id,
        Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY),
      ]),
    ),
  );
  const stop = (id, extra = 0) => tops[id] + STOP_OFFSET[id] + extra;
  console.log('  sections', JSON.stringify(tops));

  const opening = track([
    [0, 0],
    [2.7, 0],
    [4.3, stop('about')],
    [5.4, stop('about')],
  ]);
  const closing = track([
    [0, stop('skills')],
    [1.3, stop('skills')],
    [3.3, stop('portfolio')],
    [4.7, stop('portfolio')],
    [6.3, stop('portfolio', 520)],
    [7.5, stop('portfolio', 520)],
  ]);

  let videoTime = 2;
  const shoot = (name, length, path_) =>
    rig.film(page, name, seconds(length), async (i) => {
      await scrollWindow(page, path_(i / FPS));
      await showVideoAt(page, videoTime);
      videoTime += 1 / FPS;
      await tick(page);
    });

  const intro = await shoot('intro', 5.4, opening);

  // Cut down the page. The scroll animations need a moment to land.
  await scrollWindow(page, closing(0));
  await tick(page, seconds(2));
  const projects = await shoot('projects', 7.5, closing);

  const film = path.join(rig.outDir, 'loop.mp4');
  console.log('  film', encodeLoop({ clips: [intro, projects], out: film, crossfade: CROSSFADE, crf: 21 }));
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  const shot = async (name, y) => {
    await scrollWindow(page, y);
    await tick(page, seconds(1.6));
    await showVideoAt(page, 6);
    await tick(page, 2);
    return rig.photo(page, name);
  };
  const hero = path.join(intro.frames, `frame_${String(seconds(CROSSFADE)).padStart(5, '0')}.jpg`);
  const pages = [
    hero,
    await shot('still-about', stop('about')),
    await shot('still-resume', stop('resume')),
    await shot('still-services', stop('services')),
    await shot('still-skills', stop('skills')),
    await shot('still-portfolio', stop('portfolio')),
  ];
  for (let i = 0; i < pages.length; i++) {
    await still(rig.sharp, pages[i], path.join(rig.outDir, `page-${i + 1}.webp`));
  }
}
