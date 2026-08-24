export type MouseMode = 'auto' | 'off' | 'attract' | 'repel';
export type LineMode = 'auto' | 'on' | 'off';

export interface PlaygroundSettings {
  speed: number;                // sim speed multiplier
  noiseSize: number;            // curl noise scale
  mouseMode: MouseMode;         // 'auto' = slideshow decides
  mouseStrength: number;        // attract/repel force multiplier
  lineMode: LineMode;           // swirl filament lines; 'auto' = slideshow decides
  trailOverride: number | null; // afterimage damp; null = per-theme default
  bloomMult: number;            // multiplies per-theme bloom strength
  count: number | null;         // particle count; null = auto device tier
}

/* These are the scene's starting values too — ParticleScene seeds its uniforms
   from here, and PlaygroundPanel.applyAll() only pushes a setting that differs
   from its default, so the two must not drift apart. */
export const DEFAULT_SETTINGS: PlaygroundSettings = {
  speed: 1,
  noiseSize: 0.5,
  mouseMode: 'auto',
  mouseStrength: 1,
  lineMode: 'auto',
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
