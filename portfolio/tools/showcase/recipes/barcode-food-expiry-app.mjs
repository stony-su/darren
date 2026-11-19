/**
 * The food expiry app, from its one screen recording (888x1920, 74 s). The film
 * stands the best stretches in a phone over a dark, blurred copy of themselves:
 * the pantry, the items read off a receipt, generated recipes, the calendar.
 *
 * The recording shows some private things, so:
 *   - the film and the page stills keep clear of them entirely;
 *   - demo.mp4 is the whole recording with them blurred out: the account email
 *     (login 0.7-4.1 s and Settings 70.5-72 s), and the shop address, totals and
 *     card payment lines of the receipt in the camera view (7.9-12.8 s).
 *
 * For the same reason the original must stay out of public/. Keep it at
 * <work>/src/barcode/, where it can be restored from git:
 *   git show 515a177:portfolio/public/pictures/websites/Screen_Recording_Jun_6_2025.mp4
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { serve } from '../lib/rig.mjs';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { FPS, seconds } from './_webfilm.mjs';
import { PHONE_CSS, phoneStyle } from './_phonestage.mjs';

const RECORDING_NAME = 'Screen_Recording_Jun_6_2025.mp4';
let RECORDING = '';
const WIDTH = 888;
const HEIGHT = 1920;
const CROSSFADE = 0.6;

/** In order of appearance. The first frame after its crossfade is the poster. */
const CLIPS = [
  { name: 'pantry', start: 40.45, length: 3.2 }, // settles on the dashboard
  { name: 'results', start: 25.2, length: 3.8 }, // items read from a receipt
  { name: 'recipes', start: 55.0, length: 3.7 }, // recipes from what's in the pantry
  { name: 'calendar', start: 62.4, length: 3.4 }, // expiry calendar
];

/** Full frames for the glass, none of which show anything private. */
const PAGES = [
  { at: 41.6, note: 'Pantry' },
  { at: 24.9, note: 'Receipt results' },
  { at: 47.2, note: 'Pantry ingredients' },
  { at: 56.0, note: 'Recipe' },
  { at: 63.9, note: 'Expiry calendar' },
  { at: 73.2, note: 'Settings' },
];

/** Regions of the recording to blur in demo.mp4, as time ranges with shapes. */
const REDACTIONS = [
  // The keyboard's password suggestion names the account. It slides up with the
  // keyboard, then sits in the bar on top of it until Face ID takes over.
  { from: 0.7, to: 1.13, shapes: [rect(0, 1180, 888, 470)] },
  { from: 1.1, to: 2.05, shapes: [rect(0, 1140, 888, 130)] },
  // The email once it has been filled in.
  { from: 1.9, to: 4.15, shapes: [rect(148, 788, 640, 118)] },
  // The receipt in the camera: the shop's address at the top; the totals, card
  // and transaction lines at the bottom. The shutter button stays sharp.
  {
    from: 7.85,
    to: 12.78,
    shapes: [rect(20, 196, 848, 356), rect(0, 1165, 888, 501)],
    holes: [circle(444, 1505, 100), circle(444, 1652, 82)],
  },
  // The account card in Settings, then the whole top of the screen while it
  // scrolls away under the status bar.
  { from: 70.45, to: 71.52, shapes: [rect(150, 300, 620, 220)] },
  { from: 71.48, to: 72.05, shapes: [rect(0, 0, 888, 520)] },
];

function rect(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="FILL"/>`;
}
function circle(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="FILL"/>`;
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

/** Stills straight from the recording, at full resolution. */
function grabFrame(at, file) {
  ffmpeg(['-ss', String(at), '-i', RECORDING, '-frames:v', '1', file]);
}

function extractClip(clip, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  ffmpeg([
    '-ss', String(clip.start), '-i', RECORDING,
    '-frames:v', String(seconds(clip.length)),
    '-vf', `fps=${FPS}`, '-start_number', '0', '-q:v', '2',
    path.join(dir, 'frame_%05d.jpg'),
  ]);
}

function stageHtml() {
  const screenHeight = 860;
  const screenWidth = Math.round((screenHeight * WIDTH) / HEIGHT);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: 1440px; height: 960px; overflow: hidden; background: #08090a; }
    ${PHONE_CSS}
    /* Blurred small and scaled up: the same look as a huge blur, far cheaper. */
    #bg { position: absolute; left: 0; top: 0; width: 240px; height: 160px; object-fit: cover;
          transform-origin: 0 0; transform: scale(6); filter: blur(8px) brightness(0.24) saturate(1.7); }
    #shade { position: absolute; inset: 0;
          background: radial-gradient(56% 78% at 50% 50%, rgba(0,0,0,0), rgba(0,0,0,0.55)); }
    #fg { display: block; width: 100%; height: 100%; object-fit: cover; }
  </style></head><body>
    <img id="bg" alt=""><div id="shade"></div>
    <div class="phone" style="${phoneStyle({ width: screenWidth, height: screenHeight, x: 720, y: 480, bezel: 12, radius: 46 })}">
      <div class="screen"><img id="fg" alt=""></div>
    </div>
  </body></html>`;
}

/** Turns time ranges and shapes into white-on-black masks and blurs through them. */
async function renderDemo(rig, out) {
  const inputs = [];
  const parts = ['[0:v]split[base][toblur]', `[toblur]boxblur=luma_radius=30:luma_power=2:chroma_radius=15:chroma_power=2,split=${REDACTIONS.length}${REDACTIONS.map((_, i) => `[b${i}]`).join('')}`];
  for (let i = 0; i < REDACTIONS.length; i++) {
    const r = REDACTIONS[i];
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="black"/>` +
      r.shapes.map((s) => s.replace('FILL', 'white')).join('') +
      (r.holes ?? []).map((s) => s.replace('FILL', 'black')).join('') +
      `</svg>`;
    const file = path.join(rig.cap, `mask-${i}.png`);
    await rig.sharp(Buffer.from(svg)).png().toFile(file);
    inputs.push('-loop', '1', '-framerate', '60000/1001', '-t', '75', '-i', file);
    parts.push(`[${i + 1}:v]format=gray[m${i}]`, `[b${i}][m${i}]alphamerge[o${i}]`);
  }
  let chain = 'base';
  REDACTIONS.forEach((r, i) => {
    parts.push(`[${chain}][o${i}]overlay=enable='between(t,${r.from},${r.to})':shortest=0[v${i}]`);
    chain = `v${i}`;
  });
  parts.push(`[${chain}]trim=duration=74.1,scale=-2:1280:flags=lanczos,fps=30,format=yuv420p[out]`);
  ffmpeg([
    '-i', RECORDING, ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '[out]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', out,
  ]);
}

export default async function expiry(rig) {
  RECORDING = path.join(rig.work, 'src', 'barcode', RECORDING_NAME);
  if (!existsSync(RECORDING)) throw new Error(`the original recording belongs at ${RECORDING}`);

  const sourceDir = path.join(rig.cap, 'source');
  for (const clip of CLIPS) extractClip(clip, path.join(sourceDir, clip.name));

  writeFileSync(path.join(rig.cap, 'stage.html'), stageHtml());
  const server = await serve([rig.cap]);
  let films;
  try {
    const page = await rig.page({ width: 1440, height: 960, scale: 2, frozen: false });
    await page.goto(`${server.origin}/stage.html`, { waitUntil: 'load' });
    films = [];
    for (const clip of CLIPS) {
      films.push(
        await rig.film(page, clip.name, seconds(clip.length), (i) =>
          page.evaluate(async (url) => {
            const fg = document.getElementById('fg');
            const bg = document.getElementById('bg');
            fg.src = url;
            bg.src = url;
            await Promise.all([fg.decode(), bg.decode()]);
          }, `${server.origin}/source/${clip.name}/frame_${String(i).padStart(5, "0")}.jpg`),
        ),
      );
    }
  } finally {
    server.close();
  }

  const film = path.join(rig.outDir, 'loop.mp4');
  console.log('  film', encodeLoop({ clips: films, out: film, crossfade: CROSSFADE, crf: 18 }));
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  // Glass pages: the upper part of each screen, the proportions shards suit.
  for (let i = 0; i < PAGES.length; i++) {
    const frame = path.join(rig.cap, `still-${i + 1}.png`);
    grabFrame(PAGES[i].at, frame);
    await still(rig.sharp, frame, path.join(rig.outDir, `page-${i + 1}.webp`), {
      width: WIDTH, height: 1110, position: 'top',
    });
  }

  // The full recording, silent, with the private details blurred.
  // It takes minutes, so a re-take of the film alone can leave it be:
  // set SHOWCASE_KEEP_DEMO=1 to reuse the one already rendered.
  const demo = path.join(rig.outDir, 'demo.mp4');
  if (!(process.env.SHOWCASE_KEEP_DEMO && existsSync(demo))) await renderDemo(rig, demo);
  const poster = path.join(rig.cap, 'demo-poster.png');
  grabFrame(PAGES[0].at, poster);
  await rig.sharp(poster).resize({ width: 592 }).webp({ quality: 80 }).toFile(path.join(rig.outDir, 'demo.webp'));
}
