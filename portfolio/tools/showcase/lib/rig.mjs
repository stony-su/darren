/**
 * The filming rig: a headless browser whose clock can be moved by hand.
 *
 * Heavy WebGL can't hold frame rate on an integrated GPU, and a screenshot
 * takes longer than a frame anyway. So time is stepped by hand: advance one
 * frame, photograph it, repeat. However slow the machine, the footage comes out
 * perfectly even.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PORTFOLIO = path.resolve(here, '../../..');
export const PUBLIC = path.join(PORTFOLIO, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.pck': 'application/octet-stream',
};

/** Serves one or more folders, tried in order. */
export function serve(roots) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    for (const root of roots) {
      let file = path.join(root, rel);
      if (!file.startsWith(root)) continue;
      if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!existsSync(file)) continue;
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
    });
  });
}

/** Added to every page before its own scripts run. */
function initScript({ seed }) {
  // Screenshots have to be able to read a WebGL canvas between frames, and
  // anything random should come out the same on every take.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, attrs) {
    if (/webgl/i.test(String(kind))) attrs = { ...(attrs || {}), preserveDrawingBuffer: true };
    return getContext.call(this, kind, attrs);
  };
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function createRig({ work, slug }) {
  const require = createRequire(path.join(work, 'pw', 'package.json'));
  const { chromium } = require('playwright');
  const sharp = require('sharp');
  const cap = path.join(work, 'cap', slug);
  mkdirSync(cap, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      '--force-color-profile=srgb',
    ],
  });
  const site = await serve([PUBLIC]);
  const outDir = path.join(PUBLIC, 'showcase', slug);
  mkdirSync(outDir, { recursive: true });

  return {
    slug,
    work,
    sharp,
    browser,
    site,
    cap,
    outDir,

    /**
     * A page with a fake clock. It keeps flowing until it is paused, so recipes
     * that step time call `freeze(page)` from recipes/_handclock.mjs first, then
     * move it with `page.clock.runFor(ms)`.
     */
    async page({ width = 1440, height = 960, scale = 1, frozen = true, seed = 7, touch = false } = {}) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: scale,
        hasTouch: touch,
      });
      const page = await context.newPage();
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await page.addInitScript(initScript, { seed });
      if (frozen) await page.clock.install({ time: 0 });
      return page;
    },

    /** Photograph `count` frames. `step(i)` moves the world on by one frame. */
    async film(page, name, count, step) {
      const dir = path.join(cap, name);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < count; i++) {
        await step(i);
        await page.screenshot({
          path: path.join(dir, `frame_${String(i).padStart(5, '0')}.jpg`),
          type: 'jpeg',
          quality: 96,
          animations: 'allow',
          caret: 'initial',
        });
        if (i % 30 === 0) process.stdout.write(`\r  ${name}: ${i}/${count}   `);
      }
      process.stdout.write(`\r  ${name}: ${count} frames\n`);
      return { frames: dir, count };
    },

    /** A full-size still kept for the glass screens. */
    async photo(page, name) {
      const file = path.join(cap, `${name}.png`);
      await page.screenshot({ path: file, animations: 'allow' });
      return file;
    },

    async close() {
      await browser.close();
      site.close();
    },
  };
}
