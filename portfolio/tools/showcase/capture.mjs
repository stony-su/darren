#!/usr/bin/env node
/**
 * Films projects for the showcase. Each one has a recipe in recipes/<slug>.mjs.
 *
 *   node tools/showcase/capture.mjs --work <folder> <slug> [<slug> ...]
 *
 * <folder>/pw must hold an npm install of `playwright` and `sharp`: they are
 * filming tools and stay out of the site's own dependencies. Intermediate
 * frames go in <folder>/cap, finished media in public/showcase/<slug>/.
 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRig } from './lib/rig.mjs';
import { contactSheet } from './lib/encode.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = args.indexOf('--work');
if (flag < 0 || !args[flag + 1]) {
  console.error('usage: capture.mjs --work <folder> <slug> [<slug> ...]');
  process.exit(1);
}
const work = path.resolve(args[flag + 1]);
const slugs = args.filter((_, i) => i !== flag && i !== flag + 1);

for (const slug of slugs) {
  console.log(`\n${slug}`);
  const recipe = await import(pathToFileURL(path.join(here, 'recipes', `${slug}.mjs`)).href);
  const rig = await createRig({ work, slug });
  try {
    await recipe.default(rig);
    contactSheet(path.join(rig.outDir, 'loop.mp4'), path.join(rig.cap, 'sheet.jpg'));
    console.log(`  sheet: ${path.join(rig.cap, 'sheet.jpg')}`);
  } finally {
    await rig.close();
  }
}
