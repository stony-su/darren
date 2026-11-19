/**
 * Helpers for filming live websites on the rig.
 *
 * `rig.page()` installs a fake clock that keeps flowing until it is paused, so a
 * page can load normally and be frozen once it is ready. From then on one film
 * frame is two 16 ms animation frames, which keeps anything counted per rAF
 * (shaders, tweens) moving perfectly evenly.
 */

/** Fake milliseconds per film frame: exactly two rAF ticks. */
export const TICK_MS = 32;
export const FPS = 30;

export const seconds = (s) => Math.round(s * FPS);

/** A gentle ease-in-out. */
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2);

/**
 * `keys` is [[second, value], ...]. Equal neighbours hold, different ones ease,
 * which reads as a calm move followed by a pause.
 */
export function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** The rig blocks web fonts for its own pages; live sites need theirs. */
export async function allowFonts(page) {
  await page.unroute(/fonts\.(googleapis|gstatic)\.com/);
}

/**
 * Stop the page's clock. It keeps running while this call is on its way, and the
 * time a busy page reports can lag behind it by seconds, so aim a little ahead
 * and aim further each time that turns out not to be far enough.
 */
export async function freeze(page) {
  const margins = [120, 300, 800, 2000, 5000, 12000, 30000];
  for (let attempt = 0; ; attempt++) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + margins[attempt]);
      return;
    } catch (error) {
      if (attempt === margins.length - 1) throw error;
    }
  }
}

/**
 * CSS animations and transitions run on the compositor's own clock, so they are
 * paused and stepped by hand along with everything else.
 */
export async function adoptCss(page) {
  await page.evaluate(() => {
    window.__stepCss = (ms) => {
      for (const a of document.getAnimations()) {
        if (!a.__held) {
          a.__held = true;
          a.__at = a.currentTime ?? 0;
          a.pause();
        }
        a.__at += ms;
        const end = a.effect?.getComputedTiming?.().endTime ?? Infinity;
        if (a.__at >= end && end !== Infinity) a.finish();
        else a.currentTime = a.__at;
      }
    };
  });
}

/** One film frame: CSS and the page clock move on together. */
export async function tick(page, frames = 1) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate((ms) => window.__stepCss?.(ms), 1000 / FPS);
    await page.clock.runFor(TICK_MS);
  }
}

/** Jump the window without the site's smooth scrolling, and say so at once. */
export async function scrollWindow(page, y) {
  await page.evaluate((top) => {
    window.scrollTo({ top, left: 0, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
  }, y);
}

/** Wait, in real time, for every image on the page that should have loaded. */
export async function imagesReady(page, timeout = 20000) {
  await page
    .waitForFunction(() => [...document.images].every((i) => !i.src || i.complete), null, { timeout })
    .catch(() => {});
}
