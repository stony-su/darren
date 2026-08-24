export type QualityTier = 'high' | 'mid' | 'low';

export const TIER_COUNTS: Record<QualityTier, number> = {
  high: 60000,
  mid: 25000,
  low: 10000,
};

interface NavigatorExt extends Navigator {
  deviceMemory?: number;
}

/** Heuristic device tier from memory / cores / pointer type. */
export function pickTier(): QualityTier {
  const nav = navigator as NavigatorExt;
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  if ((coarse && memory <= 4) || cores <= 4) return 'low';
  if (memory >= 8 && cores >= 8 && !coarse) return 'high';
  return 'mid';
}

export function lowerTier(tier: QualityTier): QualityTier {
  return tier === 'high' ? 'mid' : 'low';
}

/**
 * Watches frame times over a sampling window and fires a one-shot callback
 * if the average frame is slower than the budget (i.e. the device is
 * struggling and particle count should be downgraded).
 */
export class FrameMonitor {
  private samples: number[] = [];
  private skipFrames: number;
  private sampleFrames: number;
  private budgetMs: number;
  private callback: (() => void) | null = null;
  private done = false;

  constructor(skipFrames = 60, sampleFrames = 120, budgetMs = 33) {
    this.skipFrames = skipFrames;
    this.sampleFrames = sampleFrames;
    this.budgetMs = budgetMs;
  }

  onSlow(cb: () => void): void {
    this.callback = cb;
  }

  /** Call once per frame with the delta time in seconds. */
  tick(dtSeconds: number): void {
    if (this.done) return;
    if (this.skipFrames > 0) {
      this.skipFrames--;
      return;
    }
    this.samples.push(dtSeconds * 1000);
    if (this.samples.length >= this.sampleFrames) {
      this.done = true;
      const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      if (avg > this.budgetMs && this.callback) {
        this.callback();
      }
    }
  }
}
