/**
 * Right Next Door (ShadBus): the live OpenLayers map of Calgary's grocery bus
 * routes. The camera pushes slowly in over the network with the buses crawling
 * along their routes, the culture filter narrows the map, then Winter Mode snows
 * over it.
 *
 * Time is stepped by hand, so every frame waits for its map tiles and shows the
 * buses exactly where they belong. OpenStreetMap tiles are cached on disk so
 * re-takes do not hit their servers again.
 */
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { adoptCss, allowFonts, FPS, freeze, seconds, tick, track } from './_webfilm.mjs';

const SITE = 'https://shadbusv2.vercel.app/';
const CROSSFADE = 0.6;

/** The app's own starting view, in web-mercator metres. */
const HOME = [-12698425.8, 6629204.4];
/** Slid left so the busy centre of town sits clear of the side panel. */
const OPEN = [HOME[0] - 3300, HOME[1] - 500];

const NETWORK_SECONDS = 9.4;
const WINTER_SECONDS = 3.6;

// Everything stays inside one tile level (z13 tiles serve zooms 12.42 to 13.41),
// so map labels grow smoothly and never swap mid-shot.
const NETWORK = {
  x: track([[0, OPEN[0]], [NETWORK_SECONDS, OPEN[0] + 2600]]),
  y: track([[0, OPEN[1]], [NETWORK_SECONDS, OPEN[1] - 1500]]),
  zoom: track([[0, 12.72], [NETWORK_SECONDS, 13.34]]),
};
// Filters whose first few buses all have stock to show in the panel.
const FILTERS = [
  [5.0, 'Artisan'],
  [7.2, 'Mexican'],
];
const WINTER = {
  x: track([[0, HOME[0] - 2500], [WINTER_SECONDS, HOME[0] - 1400]]),
  y: track([[0, HOME[1] - 1200], [WINTER_SECONDS, HOME[1] - 900]]),
  zoom: track([[0, 13.05], [WINTER_SECONDS, 13.2]]),
};

const at = (camera, t) => [camera.x(t), camera.y(t), camera.zoom(t)];

/**
 * Serve map tiles from disk when we have them. New ones come through the browser
 * as normal (proper headers, nothing unusual for the tile servers) and are kept.
 */
async function cacheTiles(page, work) {
  const root = path.join(work, 'cache', 'osm');
  const fileFor = (url) => {
    const m = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    return path.join(root, m[1], m[2], `${m[3]}.png`);
  };
  await page.route(/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png/, (route) => {
    const file = fileFor(route.request().url());
    if (existsSync(file)) {
      return route.fulfill({
        path: file,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
      });
    }
    return route.continue();
  });
  page.on('response', async (res) => {
    if (!/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png/.test(res.url()) || res.status() !== 200) return;
    try {
      const file = fileFor(res.url());
      if (existsSync(file)) return;
      const body = await res.body();
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    } catch {
      // A tile we could not keep is simply fetched again next take.
    }
  });
}

/** Helpers that live in the page: finding the map, and the app's own controls. */
async function installHooks(page) {
  await page.evaluate(() => {
    window.__grabMap = () => {
      const host = document.querySelector('.ol-viewport').parentElement;
      const key = Object.keys(host).find((k) => k.startsWith('__reactFiber'));
      for (let fiber = host[key]; fiber; fiber = fiber.return) {
        let hook = fiber.memoizedState;
        for (let n = 0; hook && typeof hook === 'object' && 'next' in hook && n < 80; n++) {
          const value = hook.memoizedState;
          if (value?.current?.getView && value.current.getLayers) {
            window.__map = value.current;
            // New tiles appear at once rather than fading in over several frames.
            window.__map.getLayers().item(0).getSource().tileOptions.transition = 0;
            return true;
          }
          hook = hook.next;
        }
      }
      return false;
    };
    window.__setFilter = (value) => {
      const select = document.querySelector('#culture-filter');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.__look = (x, y, zoom) => {
      const view = window.__map.getView();
      view.setCenter([x, y]);
      view.setZoom(zoom);
    };
    window.__tilesBusy = () => {
      const map = window.__map;
      map.handlePostRender();
      return map.tileQueue_.getTilesLoading() + map.tileQueue_.getCount();
    };
    window.__settle = async () => {
      // React and its effects run on real tasks: let them finish, then draw.
      for (let i = 0; i < 4; i++) {
        await new Promise((done) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => done();
          channel.port2.postMessage(0);
        });
      }
      window.__map.renderSync();
    };
  });
}

async function look(page, [x, y, zoom]) {
  await page.evaluate(([a, b, c]) => window.__look(a, b, c), [x, y, zoom]);
}

async function tilesLoaded(page) {
  for (let i = 0; i < 600; i++) {
    if (!(await page.evaluate(() => window.__tilesBusy()))) return;
    await page.waitForTimeout(50);
  }
  throw new Error('map tiles never finished loading');
}

/** Bring a frame fully up to date: state, tiles, then the final draw. */
async function develop(page) {
  await page.evaluate(() => window.__settle());
  await tilesLoaded(page);
  await page.evaluate(() => window.__map.renderSync());
}

/** Fly the whole shot once, so every tile it needs is already here. */
async function rehearse(page, camera, length) {
  for (let t = 0; t <= length; t += 0.3) {
    await look(page, at(camera, t));
    await page.waitForTimeout(80);
    await tilesLoaded(page);
  }
  await look(page, at(camera, length));
  await tilesLoaded(page);
}

/** Screen position of something on the map, kept clear of the side panel. */
async function findMarker(page, layerIndex) {
  return page.evaluate((index) => {
    const map = window.__map;
    const features = map.getLayers().item(index).getSource().getFeatures();
    const spots = features
      .map((f) => ({ f, px: map.getPixelFromCoordinate(f.getGeometry().getCoordinates()) }))
      .filter(({ px }) => px && px[0] > 640 && px[0] < 1180 && px[1] > 200 && px[1] < 800);
    const wanted = spots.find(({ f }) => f.get('busStatus') === 'active') ?? spots[0];
    return wanted ? wanted.px.map(Math.round) : null;
  }, layerIndex);
}

export default async function shadbus(rig) {
  const page = await rig.page({ width: 1440, height: 960 });
  await allowFonts(page);
  await cacheTiles(page, rig.work);
  // Third-party widgets can hold up 'load' for a long time; the app is what matters.
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => /Active Buses: [1-9]/.test(document.body.innerText), null, { timeout: 120000 });
  // Let the live data settle: a late snapshot rebuilds the map.
  await page.waitForTimeout(5000);

  // Tidy the frame. The translate widget sits on top of the map's OpenStreetMap
  // credit (which has to stay visible), and the placeholder driver names are
  // kept out of a public portfolio.
  await page.addStyleTag({
    content: `
      #google_translate_element, .skiptranslate { display: none !important; }
      .font-semibold.text-blue-700 > .text-xs.text-gray-400 { visibility: hidden; }
    `,
  });

  await installHooks(page);
  await page.evaluate(() => window.__grabMap());
  // A map rebuilt by a late snapshot loses its route lines until the route list
  // is next applied, so apply it: a filter there and back.
  await page.evaluate(() => {
    window.__setFilter('Asian');
    window.__setFilter('All');
  });
  await page.waitForTimeout(500);

  await rehearse(page, NETWORK, NETWORK_SECONDS);
  await look(page, at(NETWORK, 0));
  await tilesLoaded(page);
  await page.waitForTimeout(300);

  await freeze(page);
  await adoptCss(page);
  await tick(page, seconds(0.5));

  const pending = [...FILTERS];
  const network = await rig.film(page, 'network', seconds(NETWORK_SECONDS), async (i) => {
    const t = i / FPS;
    await look(page, at(NETWORK, t));
    while (pending.length && t >= pending[0][0]) {
      await page.evaluate((value) => window.__setFilter(value), pending.shift()[1]);
    }
    await tick(page);
    await develop(page);
  });
  const networkEnd = at(NETWORK, NETWORK_SECONDS);

  // Stills from the same session: the whole map, then downtown up close.
  const photo = async (name, view, wait = 0.4) => {
    await look(page, view);
    await tick(page, seconds(wait));
    await develop(page);
    return rig.photo(page, name);
  };
  await page.evaluate(() => window.__setFilter('All'));
  const shots = {};
  shots.network = await photo('still-network', [HOME[0] - 2200, HOME[1] - 200, 13]);
  await page.evaluate(() => window.__setFilter('Artisan'));
  shots.filter = await photo('still-filter', [HOME[0] - 2200, HOME[1] - 200, 13]);
  await page.evaluate(() => window.__setFilter('All'));
  shots.downtown = await photo('still-downtown', [HOME[0] - 1700, HOME[1] - 900, 14.2], 0.6);

  // A bus's own card. Clicks are ordinary read-only map selections.
  await look(page, [HOME[0] - 2200, HOME[1] - 200, 13]);
  await tick(page, 3);
  await develop(page);
  const bus = await findMarker(page, 3);
  await page.mouse.click(bus[0], bus[1]);
  await tick(page, seconds(0.5));
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('.bg-blue-50')) {
      if (/^Driver/.test(row.textContent)) row.style.display = 'none';
    }
  });
  await develop(page);
  shots.bus = await rig.photo(page, 'still-bus');
  await page.mouse.click(760, 880);
  await tick(page, seconds(0.5));
  await develop(page);

  // Winter Mode rebuilds the map, so find it again and let its tiles come in.
  await page.evaluate(() => document.querySelector('#winter-mode-toggle').click());
  await page.clock.resume();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__grabMap());
  await rehearse(page, WINTER, WINTER_SECONDS);
  await look(page, at(WINTER, 0));
  await tilesLoaded(page);
  await page.waitForTimeout(500);
  await freeze(page);
  await tick(page, seconds(0.5));

  const winter = await rig.film(page, 'winter', seconds(WINTER_SECONDS), async (i) => {
    await look(page, at(WINTER, i / FPS));
    await tick(page);
    await develop(page);
  });

  shots.winter = await photo('still-winter', at(WINTER, WINTER_SECONDS));

  // A community hub, the pink markers Winter Mode adds.
  const hub = await findMarker(page, 4);
  await page.mouse.click(hub[0], hub[1]);
  await tick(page, seconds(0.5));
  await develop(page);
  shots.hub = await rig.photo(page, 'still-hub');

  const film = path.join(rig.outDir, 'loop.mp4');
  console.log('  film', encodeLoop({ clips: [network, winter], out: film, crossfade: CROSSFADE, crf: 21 }));
  console.log('  network ended at', networkEnd.map((v) => Math.round(v * 100) / 100).join(' '));
  await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));

  const pages = [shots.network, shots.downtown, shots.filter, shots.bus, shots.winter, shots.hub];
  for (let i = 0; i < pages.length; i++) {
    await still(rig.sharp, pages[i], path.join(rig.outDir, `page-${i + 1}.webp`));
  }
}
