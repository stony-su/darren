/**
 * KEEP is filmed frame-perfect with Godot's Movie Maker. A bot plays each room
 * through its real input actions (see _keep-film.mjs); the film is the game's
 * signature move, over and over: fall, drink the speed into the Pocket just above
 * the spikes, and pour it back out as a rocket.
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { prepareFilmCopy, USER_DIR } from './_keep-film.mjs';

const GODOT = ['godot', 'Godot_v4.7.2-stable_win64_console.exe'];
const SIZE = '1620x1080'; // 405x270 game pixels at 4x: already 3:2
const ZOOM = '1.35';
const CROSSFADE = 0.5;

/** Every room the bot plays, with how many 60 fps frames to record. */
const ROOMS = [
  { route: 'gallery', level: 6, frames: 370 },
  { route: 'reliquary', level: 3, frames: 300 },
  { route: 'well', level: 4, frames: 300 },
  { route: 'threshold', level: 1, frames: 340 },
  { route: 'choir', level: 5, frames: 335 },
  { route: 'keep', level: 8, frames: 480 },
];

/** Seconds into each recording. The film opens CROSSFADE into the first clip. */
const CLIPS = [
  { route: 'gallery', from: 1.7, to: 5.0 },
  { route: 'reliquary', from: 1.45, to: 4.5 },
  { route: 'well', from: 2.2, to: 4.75 },
  { route: 'threshold', from: 2.9, to: 5.4 },
];

/** One moment per glass page, in the site's label order. */
const PAGES = [
  { route: 'threshold', at: 3.8 },
  { route: 'reliquary', at: 2.05 },
  { route: 'well', at: 3.85 },
  { route: 'choir', at: 1.65 },
  { route: 'gallery', at: 2.55 },
  { route: 'keep', at: 3.8 },
];

function record(godot, project, cap, { route, level, frames }) {
  const movie = path.join(cap, `${route}.avi`);
  const log = execFileSync(
    godot,
    [
      '--path', project,
      '--write-movie', movie,
      '--fixed-fps', '60',
      '--resolution', SIZE,
      '--quit-after', String(frames),
      '--', `--level=${level}`, `--film=${route}`, `--zoom=${ZOOM}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
  );
  // A take only counts if the Keeper got through the room alive.
  const lines = log.split(/\r?\n/);
  const finished = lines.findIndex((l) => l.startsWith('COMPLETE'));
  const died = lines.findIndex((l) => l.startsWith('DIED'));
  if (finished < 0 || (died >= 0 && died < finished)) throw new Error(`${route}: the run failed`);
  console.log(`  ${route}: ${lines[finished]}`);
  return movie;
}

function grabFrame(movie, seconds, out) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(seconds), '-i', movie, '-frames:v', '1', out], {
    stdio: 'inherit',
  });
}

export default async function keep(rig) {
  const godot = path.join(rig.work, ...GODOT);
  const project = prepareFilmCopy(rig.work);
  const movies = {};
  try {
    for (const room of ROOMS) movies[room.route] = record(godot, project, rig.cap, room);
  } finally {
    if (process.env.APPDATA) rmSync(path.join(process.env.APPDATA, USER_DIR), { recursive: true, force: true });
  }

  const film = path.join(rig.outDir, 'loop.mp4');
  const clips = CLIPS.map(({ route, from, to }) => ({ video: movies[route], start: from, duration: +(to - from).toFixed(3) }));
  console.log('  film', encodeLoop({ clips, out: film, crossfade: CROSSFADE }));
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  for (const [i, { route, at }] of PAGES.entries()) {
    const png = path.join(rig.cap, `page-${i + 1}.png`);
    grabFrame(movies[route], at, png);
    await still(rig.sharp, png, path.join(rig.outDir, `page-${i + 1}.webp`));
  }
}
