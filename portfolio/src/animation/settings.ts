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
  mode: string;                 // particle behaviour mode (modes.ts)
  preset: string | null;        // running scenario (presets.ts); null = none
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  speed: 1,
  noiseSize: 1.5,
  mouseMode: 'auto',
  mouseStrength: 1,
  lineMode: 'auto',
  trailOverride: null,
  bloomMult: 1,
  count: null,
  mode: 'off',
  preset: null,
};

const KEY = 'pg-settings';

export function loadSettings(): PlaygroundSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // `gather` was the standalone knot toggle before presets existed; carry a
    // saved one over as the equivalent preset rather than dropping it.
    // `randomSpeed` is a removed feature; strip a saved one.
    const { gather, randomSpeed, ...parsed } = JSON.parse(raw) as Partial<PlaygroundSettings> & {
      gather?: unknown;
      randomSpeed?: unknown;
    };
    const settings = { ...DEFAULT_SETTINGS, ...parsed };
    if (gather === true && settings.preset === null) settings.preset = 'knot';
    return settings;
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
