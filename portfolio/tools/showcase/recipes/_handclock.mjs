/**
 * Helpers shared by the recipes that film on the rig's frozen clock.
 *
 * `page.clock` fakes timers, rAF, Date and performance, but CSS animations keep
 * running on the browser's real compositor clock, so on a slow machine they
 * race ahead of the film. These take them over and step them by hand.
 */

/**
 * `clock.install` alone leaves the fake time flowing at real speed; it only
 * stops once paused. Call right after `rig.page()`, before navigating.
 */
export async function freeze(page) {
  await page.clock.pauseAt(60000);
}

/** Call once after the page has loaded. */
export async function takeCssAnimations(page) {
  await page.evaluate(() => {
    window.__cssStep = (ms) => {
      for (const a of document.getAnimations()) {
        if (!a.__hand) {
          a.__hand = true;
          a.__t = 0;
          a.pause();
        }
        a.__t += ms;
        // A paused animation never finishes by itself, and libraries wait on that.
        const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
        if (Number.isFinite(end) && a.__t >= end) a.finish();
        else a.currentTime = a.__t;
      }
    };
  });
}

/** Move the page's clock and its CSS animations on together, in small steps. */
export async function advance(page, ms, { chunk = 1000 / 30 } = {}) {
  let left = ms;
  while (left > 0.01) {
    const dt = Math.min(chunk, left);
    await page.clock.runFor(dt);
    await page.evaluate((d) => window.__cssStep && window.__cssStep(d), dt);
    left -= dt;
  }
}

/** One film frame at 30 fps. */
export const FRAME_MS = 1000 / 30;
