/**
 * ReSound runs its simulation at a fixed 60 ticks a second off the page clock,
 * so a paused clock stepped by hand gives the same fight on every take. The bots
 * play; `?debug` is only there for the hooks that lock the picture at full
 * sharpness and hide the debug read-out.
 *
 * Filmed in a 3:2 window rather than 16:9: the HUD is pinned to the corners, and
 * a centre crop of a wide frame would cut its panels in half.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';

const VIEW = { width: 1440, height: 960 };
const FPS = 30;
const MEDIA = 'C:/Users/Darre/Downloads/rougelike/itch/media';

const CROWD = 'stress=30&team=sword,bow,fist&stop=9&seed=7';
const BOSS = 'team=sword,bow,fist&stop=6&seed=7';

/** Seconds of game time. The film opens `CROSSFADE` into the first clip. */
const CROSSFADE = 0.5;
const SHOTS = {
  crowd: [
    { name: 'bells', from: 3.4, to: 7.1 },
    { name: 'swarm', from: 13.5, to: 17.3 },
  ],
  boss: [{ name: 'carillon', from: 26.0, to: 29.2 }],
};
const ORDER = ['swarm', 'carillon', 'bells'];
const BOSS_STILL_AT = 24.0;

const PAGES = [
  ['title.png', 1],
  ['classes.png', 2],
  ['swordsman.png', 3],
  ['archer-hook-shot.png', 4],
  ['brawler.png', 5],
];

/** Whole milliseconds per frame that still add up to exactly 30 a second. */
const frameMs = (i) => Math.round(((i + 1) * 1000) / FPS) - Math.round((i * 1000) / FPS);

async function open(rig, query) {
  const page = await rig.page(VIEW);
  // Installing the fake clock leaves it running on real time until it is paused.
  await page.clock.pauseAt(1000);
  await page.goto(`${rig.site.origin}/play/resound/index.html?${query}&autopilot=expert&solo&debug`);
  await page.waitForFunction(() => window.__resound && window.__resound.game, null, { timeout: 60000 });
  await page.evaluate(() => {
    const game = window.__resound.game;
    game.quality.frame = () => {};
    game.quality.reset();
    game.debugText.visible = false;
  });
  return { page, ms: 0 };
}

async function advanceTo(scene, seconds) {
  const target = Math.round(seconds * 1000);
  while (scene.ms < target) {
    const step = Math.min(100, target - scene.ms);
    await scene.page.clock.runFor(step);
    scene.ms += step;
  }
}

async function shoot(rig, scene, { name, from, to }) {
  await advanceTo(scene, from);
  const count = Math.round((to - from) * FPS);
  const clip = await rig.film(scene.page, name, count, async (i) => {
    const step = frameMs(i);
    await scene.page.clock.runFor(step);
    scene.ms += step;
  });
  return clip;
}

export default async function resound(rig) {
  const clips = {};

  const crowd = await open(rig, CROWD);
  for (const shot of SHOTS.crowd) clips[shot.name] = await shoot(rig, crowd, shot);
  await crowd.page.context().close();

  const boss = await open(rig, BOSS);
  await advanceTo(boss, BOSS_STILL_AT);
  const carillon = await rig.photo(boss.page, 'still-carillon');
  for (const shot of SHOTS.boss) clips[shot.name] = await shoot(rig, boss, shot);
  await boss.page.context().close();

  const film = path.join(rig.outDir, 'loop.mp4');
  const result = encodeLoop({ clips: ORDER.map((n) => clips[n]), out: film, crossfade: CROSSFADE });
  console.log('  film', result);
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  for (const [file, n] of PAGES) {
    await still(rig.sharp, path.join(MEDIA, file), path.join(rig.outDir, `page-${n}.webp`));
  }
  await still(rig.sharp, carillon, path.join(rig.outDir, 'page-6.webp'));
}
