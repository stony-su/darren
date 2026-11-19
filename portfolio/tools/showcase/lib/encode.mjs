/**
 * Turns captured frames or existing video into the site's media: a silent 3:2
 * loop that joins itself invisibly, a poster equal to its first frame, and
 * compressed stills.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';

export const FILM = { width: 960, height: 640, fps: 30, maxBytes: 3.5 * 1024 * 1024 };

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

export function probeDuration(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  return parseFloat(out);
}

/**
 * A clip is either `{ frames: dir, count }` (frame_00000.jpg and so on) or
 * `{ video, start, duration }`. `crop` optionally overrides the default
 * centre crop, as an ffmpeg crop expression.
 */
function clipInput(clip, fps) {
  if (clip.frames) {
    return ['-framerate', String(fps), '-start_number', '0', '-i', path.join(clip.frames, 'frame_%05d.jpg')];
  }
  return ['-ss', String(clip.start ?? 0), '-t', String(clip.duration), '-i', clip.video];
}

function clipSeconds(clip, fps) {
  return clip.frames ? clip.count / fps : clip.duration;
}

function clipFilter(clip, index, { width, height, fps }) {
  const aspect = width / height;
  const crop = clip.crop ?? `'min(iw,ih*${aspect})':'min(ih,iw/${aspect})'`;
  const matrix = clip.frames ? 'in_color_matrix=bt601:in_range=pc:' : '';
  const before = clip.before ? `${clip.before},` : '';
  return (
    `[${index}:v]${before}crop=${crop},` +
    `scale=${width}:${height}:flags=lanczos:${matrix}out_color_matrix=bt709:out_range=tv,` +
    `fps=${fps},format=yuv420p,setsar=1,settb=AVTB[c${index}]`
  );
}

/**
 * Join the clips with crossfades and make the end flow into the beginning.
 *
 * The first clip is played again after the last one and the result is cut one
 * period later, so the final crossfade lands exactly on the frame the film
 * opens with. There is no seam to hide, because there isn't one.
 */
export function encodeLoop({ clips, out, crossfade = 0.6, crf = 23, width = FILM.width, height = FILM.height, fps = FILM.fps }) {
  mkdirSync(path.dirname(out), { recursive: true });
  const lengths = clips.map((c) => clipSeconds(c, fps));
  const period = lengths.reduce((sum, l) => sum + l, 0) - clips.length * crossfade;
  if (period <= 0) throw new Error('clips are shorter than their crossfades');

  const inputs = clips.flatMap((c) => clipInput(c, fps));
  const parts = clips.map((c, i) => clipFilter(c, i, { width, height, fps }));
  parts.push('[c0]split[first][again]');

  let chain = 'first';
  let offset = 0;
  const order = clips.map((_, i) => (i === 0 ? null : `c${i}`)).slice(1).concat('again');
  order.forEach((label, i) => {
    offset += lengths[i] - crossfade;
    const next = `x${i}`;
    parts.push(
      `[${chain}][${label}]xfade=transition=fade:duration=${crossfade}:offset=${offset.toFixed(4)}[${next}]`,
    );
    chain = next;
  });
  parts.push(
    `[${chain}]trim=start=${crossfade}:duration=${period.toFixed(4)},setpts=PTS-STARTPTS[out]`,
  );

  let quality = crf;
  for (;;) {
    ffmpeg([
      ...inputs,
      '-filter_complex', parts.join(';'),
      '-map', '[out]',
      '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(quality),
      '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', String(fps),
      '-maxrate', '3200k', '-bufsize', '6400k',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart',
      out,
    ]);
    const size = statSync(out).size;
    if (size <= FILM.maxBytes || quality >= 34) return { bytes: size, seconds: period, crf: quality };
    quality += 2;
  }
}

/** The film's actual first frame, so nothing jumps when playback begins. */
export async function posterFromFilm(sharp, film, out, { quality = 80 } = {}) {
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.png`;
  ffmpeg(['-i', film, '-frames:v', '1', tmp]);
  await sharp(tmp).webp({ quality }).toFile(out);
  rmSync(tmp, { force: true });
}

export async function still(sharp, input, out, { width = 1024, height, quality = 78, fit = 'cover', position = 'centre' } = {}) {
  mkdirSync(path.dirname(out), { recursive: true });
  await sharp(input).resize({ width, height, fit, position, withoutEnlargement: true }).webp({ quality }).toFile(out);
}

/** A tiled overview for checking a film by eye. */
export function contactSheet(film, out, { columns = 4, rows = 2, tile = 480 } = {}) {
  const seconds = probeDuration(film);
  const every = seconds / (columns * rows);
  ffmpeg([
    '-i', film,
    '-vf', `fps=1/${every.toFixed(3)},scale=${tile}:-1,tile=${columns}x${rows}`,
    '-frames:v', '1', out,
  ]);
}
