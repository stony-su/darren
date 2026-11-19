/**
 * APEIRON steps its own fixed-rate simulation, so no clock has to be faked:
 * stop its loop, drive a bot through its virtual input, and render on demand.
 * Each world is a different algorithmic-art technique, so the film visits four.
 */
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';

const WORLDS = [
  { id: 'w1-1', form: 3, name: 'lattice', page: 1 },
  { id: 'w2-1', form: 4, name: 'voronoi', page: 2 },
  { id: 'w3-1', form: 5, name: 'currents', page: 3 },
  { id: 'w4-1', form: 6, name: 'gardens', page: 4 },
  { id: 'w5-1', form: 99, name: 'spire', page: 5 },
  { id: 'w4-boss', form: 6, name: 'recursion', page: 6, boss: true },
];
// The boss goes first: its opening frame is the poster.
const FILMED = ['recursion', 'lattice', 'currents', 'spire'];
const SECONDS = 3.2;
const FPS = 30;
const STEPS_PER_FRAME = 2; // the simulation runs at 60

/** Load a level and let its entrance finish, with a bot already running. */
function enterLevel({ id, form, boss }) {
  const I = AP.Input;
  AP.Test.god(true);
  AP.Scenes.goNow('level', { id, form, mode: 'test' });
  const L = AP.level;
  // Keeps moving and jumps twice in each cycle, so forms with a double jump
  // clear the walls that stop a single one.
  window.__bot = (i) => {
    const hop = i % 54;
    I.setVirtual('right', (i % 300) < 250);
    I.setVirtual('left', (i % 300) >= 262);
    I.setVirtual('jump', hop < 12 || (hop >= 22 && hop < 32));
    I.setVirtual('dash', (i % 120) === 30);
  };
  window.__i = 0;
  const run = (n) => {
    for (let k = 0; k < n; k++) {
      window.__bot(window.__i++);
      AP.Loop.step(1);
    }
  };
  window.__run = run;
  // Long enough for the level title and first tutorial sign to be left behind.
  run(boss ? 150 : 420);
  if (boss) {
    const b = L.findBoss();
    if (b && !L.bossInfo) L.bossStart(b);
    run(200);
    // Into the phase where it starts dividing.
    for (let k = 0; k < 3; k++) {
      const target = L.bossEnt && !L.bossEnt.dead ? L.bossEnt : L.findBoss();
      if (target) L.hook(target, 'debugDamage', L);
      run(90);
    }
  }
  AP.Loop.renderOnce();
  return { phase: L.phase, scene: AP.Scenes.current };
}

export default async function apeiron(rig) {
  // 16:9 is the game's own shape; the encoder takes the 3:2 middle of it.
  const page = await rig.page({ width: 1600, height: 900, frozen: false });
  await page.goto(`${rig.site.origin}/play/apeiron/index.html#level=w1-1&form=3`);
  await page.waitForFunction(() => window.AP && AP.level && AP.Loop && AP.Test, null, { timeout: 60000 });
  await page.evaluate(() => AP.Loop.stop());

  const clips = {};
  const stills = {};
  for (const world of WORLDS) {
    const state = await page.evaluate(enterLevel, world);
    console.log(`  ${world.id}`, JSON.stringify(state));
    stills[world.name] = await rig.photo(page, `still-${world.name}`);
    if (!FILMED.includes(world.name)) continue;
    clips[world.name] = await rig.film(page, world.name, Math.round(SECONDS * FPS), () =>
      page.evaluate((n) => {
        window.__run(n);
        AP.Loop.renderOnce();
      }, STEPS_PER_FRAME),
    );
  }

  const film = path.join(rig.outDir, 'loop.mp4');
  const result = encodeLoop({ clips: FILMED.map((n) => clips[n]), out: film, crossfade: 0.5 });
  console.log('  film', result);
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
  for (const world of WORLDS) {
    await still(rig.sharp, stills[world.name], path.join(rig.outDir, `page-${world.page}.webp`));
  }
}
