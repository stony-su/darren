export type MouseMode = 'auto' | 'off' | 'attract' | 'repel';

export interface PlaygroundSettings {
  speed: number;                // sim speed multiplier
  noiseSize: number;            // curl noise scale
  mouseMode: MouseMode;         // 'auto' = slideshow decides
  mouseStrength: number;        // attract/repel force multiplier
  trailOverride: number | null; // afterimage damp; null = per-theme default
  bloomMult: number;            // multiplies per-theme bloom strength
  count: number | null;         // particle count; null = auto device tier
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  speed: 1,
  noiseSize: 0.5,
  mouseMode: 'auto',
  mouseStrength: 1,
  trailOverride: null,
  bloomMult: 0.15,
  count: null,
};

const KEY = 'pg-settings';

export function loadSettings(): PlaygroundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PlaygroundSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: PlaygroundSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable (private mode etc.) — settings just won't persist.
  }
}
