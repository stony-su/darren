/**
 * Rico Rite is a portrait game, so a 3:2 film shows two of its screens side by
 * side: each panel is the whole playfield, top to bottom, cut from the trailer.
 * Everything else comes from the same trailer and from the screenshots a bot
 * took while playing each paddle loadout.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { encodeLoop, posterFromFilm } from '../lib/encode.mjs';

const CLIP_SECONDS = 2.4;
const CROSSFADE = 0.4;

/** The game's window inside the 1440x1080 trailer, in the shape of one panel. */
const GAME = 'crop=790:1058:325:11';
const PANEL = { width: 478, height: 640, right: 482 };
const GUTTER = '0x08080c';

/** Left and right halves of each clip, as stretches of the trailer between its cuts. */
const PAIRS = [
  { left: [[3.2, 5.6]], right: [[32.55, 33.85], [22.28, 23.38]] }, // tesla lightning | the Prism Core
  { left: [[23.5, 25.9]], right: [[36.95, 39.35]] },
  { left: [[0.2, 2.6]], right: [[11.2, 13.6]] },
  { left: [[14.4, 16.8]], right: [[44.1, 46.5]] },
];

const LOADOUTS = ['standard', 'pinball', 'aegis', 'mitosis', 'hive', 'vampire', 'boomerang', 'twincast', 'tesla', 'cannon'];
const FLIP_FRAMES = 8;
const PAGE_LOADOUTS = [['pinball', 2], ['tesla', 3], ['twincast', 4], ['hive', 5]];
const BOSS_FRAMES = [33.1, 22.6];
const POSTER_AT = 3.6;
const TRAILER_MAX_BYTES = 12 * 1024 * 1024;

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

/** One clip: both halves cut from the trailer and set side by side. */
function buildPair(trailer, { left, right }, out) {
  const stretches = [...left, ...right];
  const inputs = stretches.flatMap(([from, to]) => ['-ss', String(from), '-t', (to - from).toFixed(3), '-i', trailer]);
  const parts = stretches.map(
    (_, i) =>
      `[${i}:v]${GAME},scale=${PANEL.width}:${PANEL.height}:flags=lanczos,fps=30,setsar=1,format=yuv420p,settb=AVTB[s${i}]`,
  );
  const join = (from, count, label) => {
    const names = Array.from({ length: count }, (_, i) => `[s${from + i}]`).join('');
    parts.push(count > 1 ? `${names}concat=n=${count}:v=1:a=0[${label}]` : `${names}null[${label}]`);
  };
  join(0, left.length, 'l');
  join(left.length, right.length, 'r');
  parts.push(`color=c=${GUTTER}:s=960x640:r=30:d=${CLIP_SECONDS}[bg]`);
  parts.push(`[bg][l]overlay=0:0:eof_action=repeat[x]`);
  parts.push(`[x][r]overlay=${PANEL.right}:0:eof_action=repeat,format=yuv420p[out]`);
  ffmpeg([
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '[out]',
    '-t', String(CLIP_SECONDS),
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12',
    out,
  ]);
}

function grabFrame(trailer, seconds, out, filter) {
  ffmpeg(['-ss', String(seconds), '-i', trailer, '-frames:v', '1', ...(filter ? ['-vf', filter] : []), out]);
}

/** The whole trailer, sound included, at a size that streams. Two passes land it on target. */
function encodeTrailer(trailer, out, passlog) {
  const seconds = 50;
  const audioKbps = 128;
  const videoKbps = Math.floor(((TRAILER_MAX_BYTES * 0.94 * 8) / 1000 - audioKbps * seconds) / seconds);
  const video = [
    '-vf', 'scale=1280:960:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${videoKbps}k`,
    '-maxrate', `${videoKbps * 2}k`, '-bufsize', `${videoKbps * 4}k`,
    '-profile:v', 'high', '-passlogfile', passlog,
  ];
  ffmpeg(['-i', trailer, ...video, '-pass', '1', '-an', '-f', 'null', '-']);
  ffmpeg(['-i', trailer, ...video, '-pass', '2', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-movflags', '+faststart', out]);
  return statSync(out).size;
}

/** How much is happening in a screenshot: the share of the picture that isn't dark background. */
async function busyness(sharp, file) {
  const { data, info } = await sharp(file).resize(240).greyscale().raw().toBuffer({ resolveWithObject: true });
  let lit = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 48) lit++;
  return lit / (info.width * info.height);
}

/** The `count` busiest frames at least `gap` apart, back in the order they happened. */
function pickBusiest(scored, count, gap) {
  const chosen = [];
  for (const shot of [...scored].sort((a, b) => b.score - a.score)) {
    if (chosen.length === count) break;
    if (chosen.every((c) => Math.abs(c.index - shot.index) >= gap)) chosen.push(shot);
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/** Two portrait screens on one landscape page, the same layout as the film. */
async function twoUp(sharp, a, b, out) {
  const width = 1024;
  const height = 683;
  const panel = 510;
  const fit = (input) =>
    sharp(input).resize(panel, height, { fit: 'cover', position: 'centre' }).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: `#${GUTTER.slice(2)}` } })
    .composite([
      { input: await fit(a), left: 0, top: 0 },
      { input: await fit(b), left: width - panel, top: 0 },
    ])
    .webp({ quality: 80 })
    .toFile(out);
}

export default async function ricoRite(rig) {
  const { sharp, work, cap, outDir } = rig;
  const trailer = path.join(work, 'src', 'rouge1.1', 'RitoRiteTrailer1.mp4');
  const shotsDir = path.join(work, 'src', 'rouge-shots', 'ai_screenshots');
  const shots = readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort();
  const shot = (name) => path.join(shotsDir, name);

  // The film.
  const clips = PAIRS.map((pair, i) => {
    const file = path.join(cap, `pair-${i + 1}.mp4`);
    buildPair(trailer, pair, file);
    return { video: file, start: 0, duration: CLIP_SECONDS };
  });
  const film = path.join(outDir, 'loop.mp4');
  console.log('  film', encodeLoop({ clips, out: film, crossfade: CROSSFADE }));
  await posterFromFilm(sharp, film, path.join(outDir, 'poster.webp'));

  // The trailer and its poster.
  const bytes = encodeTrailer(trailer, path.join(outDir, 'trailer.mp4'), path.join(cap, 'trailer-pass'));
  console.log('  trailer', (bytes / 1024 / 1024).toFixed(1), 'MB');
  const posterPng = path.join(cap, 'trailer-poster.png');
  grabFrame(trailer, POSTER_AT, posterPng, 'scale=1280:960:flags=lanczos');
  await sharp(posterPng).webp({ quality: 82 }).toFile(path.join(outDir, 'trailer.webp'));

  // A flipbook per loadout, and the busiest moments for the glass pages.
  const scoredBy = {};
  for (const loadout of LOADOUTS) {
    const files = shots.filter((f) => f.split('_')[1] === loadout);
    const scored = [];
    for (let index = 0; index < files.length; index++) {
      scored.push({ index, file: shot(files[index]), score: await busyness(sharp, shot(files[index])) });
    }
    scoredBy[loadout] = scored;
    const picks = pickBusiest(scored, FLIP_FRAMES, 2);
    for (let i = 0; i < picks.length; i++) {
      await sharp(picks[i].file)
        .resize({ height: 800 })
        .webp({ quality: 72 })
        .toFile(path.join(outDir, `${loadout}-${i + 1}.webp`));
    }
    console.log(`  ${loadout}: frames ${picks.map((p) => p.index).join(' ')}`);
  }

  // Page 1: the title screen, cropped to its pediment, logo and menu.
  await sharp(shot('003_title.png'))
    .extract({ left: 0, top: 14, width: 960, height: 640 })
    .webp({ quality: 82 })
    .toFile(path.join(outDir, 'page-1.webp'));

  // Pages 2 to 5: two moments from each loadout.
  for (const [loadout, page] of PAGE_LOADOUTS) {
    const [a, b] = pickBusiest(scoredBy[loadout], 2, 8);
    await twoUp(sharp, a.file, b.file, path.join(outDir, `page-${page}.webp`));
  }

  // Page 6: the boss, which only the trailer shows without the excluded loadout.
  const boss = BOSS_FRAMES.map((seconds, i) => {
    const file = path.join(cap, `boss-${i + 1}.png`);
    grabFrame(trailer, seconds, file, GAME);
    return file;
  });
  await twoUp(sharp, boss[0], boss[1], path.join(outDir, 'page-6.webp'));
}
