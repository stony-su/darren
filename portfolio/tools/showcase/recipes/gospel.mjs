/**
 * Gospel: three phones on black, showing the app's real screens. The centre one
 * reads down a whole recipe, from the photograph to the credit at the bottom,
 * while the grocery list and pantry drift past on either side.
 *
 * Screens come from the app's own captures in <work>/src/gospel/screenshots.
 * The plan screen (14-plan) is deliberately not used anywhere: it has a data bug.
 * Only the tamagoyaki photo appears in the film and on the recipe page; it is
 * CC BY 2.0 and the app's own credit for it is what the film ends on.
 */
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { serve } from '../lib/rig.mjs';
import { encodeLoop, posterFromFilm, still } from '../lib/encode.mjs';
import { ease, FPS, seconds, track } from './_webfilm.mjs';
import { PHONE_CSS, phoneStyle } from './_phonestage.mjs';

const CROSSFADE = 0.6;
const LENGTH = 11.6;
const SOURCE_WIDTH = 824;
const SOURCE_HEIGHT = 1830; // one phone screen

const CENTRE = { src: 'full/19-recipe.png', height: 4078, width: 376 };
const LEFT = { src: 'full/17-grocery-aisle.png', height: 3852, width: 292 };
const RIGHT = { src: 'full/18-pantry.png', height: 7216, width: 292 };

/** Down the recipe, pausing on the photo, the numbers, the method and the credit. */
const recipeTravel = CENTRE.height - SOURCE_HEIGHT;
const RECIPE = track([
  [0, 0],
  [2.2, 0],
  [4.0, 1130],
  [5.3, 1130],
  [7.3, 1960],
  [8.5, 1960],
  [10.2, recipeTravel],
  [LENGTH, recipeTravel],
]);

/** The side phones move slowly and steadily, against each other. */
const drift = (from, to) => (t) => from + (to - from) * (t / LENGTH);
const GROCERY = drift(0, 880);
const PANTRY = drift(1020, 120);

function stageHtml() {
  const screen = (id, phone) => `
    <div class="screen"><img id="${id}" src="/${phone.src}" alt=""
      style="width:${phone.width}px;height:${(phone.height * phone.width) / SOURCE_WIDTH}px"></div>`;
  const heightOf = (w) => Math.round((w * SOURCE_HEIGHT) / SOURCE_WIDTH);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: 1440px; height: 960px; overflow: hidden; background: #060607; }
    ${PHONE_CSS}
    #stage { position: absolute; inset: 0; transform-origin: 50% 46%; }
    #glow { position: absolute; inset: 0;
      background:
        radial-gradient(60% 74% at 50% 42%, #303035 0%, #1e1e22 40%, #111113 72%, #0b0b0c 100%); }
    .screen img { display: block; will-change: transform; }
    .side { filter: brightness(0.86); }
  </style></head><body>
    <div id="stage">
      <div id="glow"></div>
      <div class="phone side" style="${phoneStyle({ width: LEFT.width, height: heightOf(LEFT.width), x: 300, y: 486, bezel: 9, radius: 35,
        extra: 'transform:perspective(2000px) rotateY(24deg);' })}">${screen('left', LEFT)}</div>
      <div class="phone side" style="${phoneStyle({ width: RIGHT.width, height: heightOf(RIGHT.width), x: 1140, y: 486, bezel: 9, radius: 35,
        extra: 'transform:perspective(2000px) rotateY(-24deg);' })}">${screen('right', RIGHT)}</div>
      <div class="phone" style="${phoneStyle({ width: CENTRE.width, height: heightOf(CENTRE.width), x: 720, y: 480, bezel: 12, radius: 46 })}">
        ${screen('centre', CENTRE)}
      </div>
    </div>
  </body></html>`;
}

export default async function gospel(rig) {
  const screens = path.join(rig.work, 'src', 'gospel', 'screenshots');
  writeFileSync(path.join(rig.cap, 'stage.html'), stageHtml());
  const server = await serve([rig.cap, screens]);
  try {
    const page = await rig.page({ width: 1440, height: 960, scale: 2, frozen: false });
    await page.goto(`${server.origin}/stage.html`, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));

    const scale = (phone) => phone.width / SOURCE_WIDTH;
    const clip = await rig.film(page, 'stage', seconds(LENGTH), async (i) => {
      const t = i / FPS;
      await page.evaluate(
        ([c, l, r, zoom]) => {
          document.getElementById('centre').style.transform = `translateY(${-c}px)`;
          document.getElementById('left').style.transform = `translateY(${-l}px)`;
          document.getElementById('right').style.transform = `translateY(${-r}px)`;
          document.getElementById('stage').style.transform = `scale(${zoom})`;
        },
        [
          RECIPE(t) * scale(CENTRE),
          GROCERY(t) * scale(LEFT),
          PANTRY(t) * scale(RIGHT),
          1.0 + 0.022 * ease(t / LENGTH),
        ],
      );
    });

    const film = path.join(rig.outDir, 'loop.mp4');
    console.log('  film', encodeLoop({ clips: [clip], out: film, crossfade: CROSSFADE, crf: 17 }));
    await posterFromFilm(rig.sharp, film, path.join(rig.outDir, 'poster.webp'));
  } finally {
    server.close();
  }

  // ── Glass pages: the top of each real screen, in the proportions shards suit.
  const page = async (n, file, { top = 0 } = {}) => {
    const out = path.join(rig.outDir, `page-${n}.webp`);
    const input = path.join(screens, file);
    if (!top) return still(rig.sharp, input, out, { width: SOURCE_WIDTH, height: 1030, position: 'top' });
    const cut = path.join(rig.cap, `cut-${n}.png`);
    await rig.sharp(input).extract({ left: 0, top, width: SOURCE_WIDTH, height: 1030 }).toFile(cut);
    return still(rig.sharp, cut, out, { width: SOURCE_WIDTH });
  };
  await page(1, '19-recipe.png');
  // Taken below the meal thumbnails, so the swap page carries no food photos.
  await page(2, 'full/21-swap-open.png', { top: 530 });
  await page(3, '22-nutrition-category.png');
  await page(4, 'full/17-grocery-aisle.png');
  await page(5, 'full/18-pantry.png');
  await page(6, 'full/24-references.png');

  // ── The phone on the project's stage: whole screens, long ones included.
  const stageScreens = [
    'full/19-recipe.png',
    '15-nutrition.png',
    '23-nutrient.png',
    'full/17-grocery-aisle.png',
    'full/18-pantry.png',
    'full/24-references.png',
  ];
  for (let i = 0; i < stageScreens.length; i++) {
    await rig.sharp(path.join(screens, stageScreens[i]))
      .resize({ width: SOURCE_WIDTH })
      .webp({ quality: 78 })
      .toFile(path.join(rig.outDir, `screen-${i + 1}.webp`));
  }
}
