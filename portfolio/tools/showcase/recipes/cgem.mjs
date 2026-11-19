/**
 * cGEM: the hero's particle field folding helix -> plasmid -> maple leaf and back,
 * plus three sections of the real site.
 *
 * On the site the hero holds each shape for 6 to 8 seconds, which would not fit a
 * short film. While filming, its timing constants are shortened in the response
 * (nothing on disk changes), and the helix's spin is set so that one full cycle
 * is exactly one turn: the loop then returns to the same picture it left.
 *
 * Only index.html and info.html of the site are ever served to the browser, and
 * everything but the section being photographed is removed from the page.
 * `ONLY=film` or `ONLY=stills` redoes half the work while iterating.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { serve } from '../lib/rig.mjs';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { freeze } from './_handclock.mjs';

const FRAME = 1000 / 30;
const FADE = 0.8;
const MORPH = 2000;
const HOLDS = [2000, 1700, 1800];
const CYCLE = HOLDS[0] + HOLDS[1] + HOLDS[2] + 3 * MORPH;
const SPIN = (2 * Math.PI) / CYCLE;
const SETTLE = 2700; // the opening assembly, and a moment of helix after it
/** Rendered smaller and doubled, so the dots and bonds stay legible at film size. */
const VIEW = { width: 1100, height: 734, scale: 2 };
/** The hero is drawn a little above centre, and very faintly for a dark page. */
const FRAMING = 'iw*0.93:ih*0.93:(iw-ow)/2:ih*0.47-oh/2';
/** Lifts the dots and bonds and leaves the dark water where it is. */
const GRADE = "curves=all='0/0 0.1/0.09 0.3/0.62 0.62/0.92 1/1'";
const SITE = 'C:\\Users\\Darre\\Downloads\\CGEM\\CGEM';

function tuned(source) {
  const out = source
    .replace('const HOLDS = [8200, 6200, 6400];', `const HOLDS = [${HOLDS.join(', ')}];`)
    .replace('ry: t * 0.00035', `ry: t * ${SPIN}`);
  if (out.includes('8200') || out.includes('0.00035')) throw new Error('hero.js has changed; timing patch did not apply');
  return out;
}

/** Film time (s) at which each shape is held still, given where the take starts. */
function heldAt(shape) {
  const intoHold = (SETTLE - 2100) / 1000;
  const h = HOLDS.map((v) => v / 1000);
  const m = MORPH / 1000;
  if (shape === 0) return (h[0] - intoHold) / 2;
  if (shape === 1) return h[0] - intoHold + m + h[1] / 2;
  return h[0] - intoHold + m + h[1] + m + h[2] / 2;
}

/** The film's framing and grade, applied to a photograph of the hero. */
function asFilmed(input) {
  const out = input.replace(/\.png$/, '-graded.png');
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-vf', `crop=${FRAMING},${GRADE}`, out]);
  return out;
}

async function filmCycle(rig) {
  const page = await rig.page(VIEW);
  await freeze(page);
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.route('**/play/cgem/hero.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: tuned(await res.text()) });
  });
  await page.goto(`${rig.site.origin}/play/cgem/index.html`);
  await page.waitForFunction(() => window.cgemHero);
  await page.addStyleTag({ content: '.scale{display:none!important}' });
  for (let t = 0; t < SETTLE; t += 100) await page.clock.runFor(100);

  const stills = {};
  const wanted = [
    ['helix', Math.round(heldAt(0) * 30)],
    ['plasmid', Math.round(heldAt(1) * 30)],
    ['leaf', Math.round(heldAt(2) * 30)],
  ];
  const count = Math.round((CYCLE / 1000 + FADE) * 30);
  const clip = await rig.film(page, 'cycle', count, async (i) => {
    await page.clock.runFor(FRAME);
    for (const [name, at] of wanted) {
      if (i === at) stills[name] = await rig.photo(page, `still-${name}`);
    }
  });
  await page.context().close();
  return { clip: { ...clip, crop: FRAMING, before: GRADE }, stills };
}

/** Photographs one section of the real site, with the rest of the page removed. */
async function section(rig, site, file, id, zoom, css = '') {
  const page = await rig.page({ width: 1120, height: 747, scale: 2, frozen: false });
  await page.route(/(teams|people)\.(html|js)/, (r) => r.abort());
  await page.goto(`${site.origin}/${file}`);
  await page.addStyleTag({
    content: `
      .reveal{opacity:1!important;transform:none!important;transition:none!important}
      .site-header,.skip-link,footer,.site-footer,.ticker{display:none!important}
      main>*:not(#${id}){display:none!important}
      html,body{height:100%}
      main{min-height:100vh;display:flex;flex-direction:column;justify-content:center}
      #${id}{width:100%;padding-block:0!important}
      #${id} .wrap{zoom:${zoom}}
      ${css}`,
  });
  await page.evaluate(async (sectionId) => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
    // Let the section's own colour run to the edges of the frame.
    const bg = getComputedStyle(document.getElementById(sectionId)).backgroundColor;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.querySelector('main').style.background = bg;
  }, id);
  await page.waitForTimeout(400);
  const shot = await rig.photo(page, `still-${id}`);
  await page.context().close();
  return shot;
}

export default async function cgem(rig) {
  const only = process.env.ONLY;
  let heroStills = null;
  if (only !== 'stills') {
    const { clip, stills } = await filmCycle(rig);
    heroStills = stills;
    const film = path.join(rig.outDir, 'loop.mp4');
    const result = encodeLoop({ clips: [clip], out: film, crossfade: FADE, crf: 20 });
    console.log('  film', result);
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
    await still(rig.sharp, asFilmed(stills.helix), path.join(rig.outDir, 'page-1.webp'));
    await still(rig.sharp, asFilmed(stills.plasmid), path.join(rig.outDir, 'page-2.webp'));
    await still(rig.sharp, asFilmed(stills.leaf), path.join(rig.outDir, 'page-3.webp'));
  }
  if (only !== 'film') {
    const site = await serve([SITE]);
    try {
      const format = await section(rig, site, 'index.html', 'format', 1.3);
      const domains = await section(rig, site, 'index.html', 'domains', 1.28, '.domain-row{grid-template-columns:repeat(5,1fr)!important}');
      const rules = await section(rig, site, 'info.html', 'rules', 1.3, '.doc-cards{display:none!important}');
      await still(rig.sharp, format, path.join(rig.outDir, 'page-4.webp'));
      await still(rig.sharp, domains, path.join(rig.outDir, 'page-5.webp'));
      await still(rig.sharp, rules, path.join(rig.outDir, 'page-6.webp'));
    } finally {
      site.close();
    }
  }
}
