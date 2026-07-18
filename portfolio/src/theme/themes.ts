export type Vec3Tuple = [number, number, number];

export interface ThemeDef {
  name: string;
  /** Background color, authored sRGB hex. */
  bg: number;
  /** Five palette stops (0..1 sRGB) fed to the particle fragment shader. */
  palette: [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
  /** Theme 0 colors particles from their normals instead of the palette. */
  normalMode: boolean;
  /** Fragment fx: glow amount, sparkle amount, gradient t-scale (x, y). */
  fx: { glow: number; sparkle: number; tScale: [number, number] };
  /** 1 = feathers morph into snowflakes (blizzard). */
  snowflake: number;
  bloom: { strength: number; radius: number; threshold: number };
  afterimageDamp: number;
  css: {
    accent: string;
    accentBorder: string;
    glowShadow: string;
    // Full Tailwind class literals (never concatenate — Tailwind v4 scans source for these).
    textClass: string;
    borderClass: string;
    tagClass: string;
    buttonClass: string;
  };
}

export const THEMES: ThemeDef[] = [
  {
    name: 'normal',
    bg: 0x111122,
    palette: [
      [0.51, 0.55, 0.97],
      [0.65, 0.71, 0.99],
      [0.78, 0.82, 1.0],
      [0.55, 0.45, 0.95],
      [0.4, 0.45, 0.85],
    ],
    normalMode: true,
    fx: { glow: 0.0, sparkle: 0.0, tScale: [4.0, 2.7] },
    snowflake: 0,
    bloom: { strength: 0.35, radius: 0.5, threshold: 0.4 },
    afterimageDamp: 0.75,
    css: {
      accent: '#818cf8',
      accentBorder: 'rgba(129,140,248,0.55)',
      glowShadow: '0 4px 24px rgba(129,140,248,0.3), 0 0 48px rgba(129,140,248,0.1)',
      textClass: 'text-slate-100',
      borderClass: 'border-indigo-400/30',
      tagClass: 'bg-indigo-500/20 text-indigo-200',
      buttonClass: 'bg-indigo-500 hover:bg-indigo-400',
    },
  },
  {
    name: 'neon',
    bg: 0x0a0a12,
    palette: [
      [1.0, 0.1, 0.5],
      [1.0, 0.05, 0.15],
      [1.0, 0.4, 0.1],
      [0.95, 0.1, 0.8],
      [0.1, 0.9, 0.95],
    ],
    normalMode: false,
    fx: { glow: 0.5, sparkle: 0.0, tScale: [5.0, 3.0] },
    snowflake: 0,
    bloom: { strength: 0.5, radius: 0.55, threshold: 0.45 },
    afterimageDamp: 0.8,
    css: {
      accent: '#f472b6',
      accentBorder: 'rgba(244,114,182,0.55)',
      glowShadow: '0 4px 24px rgba(244,114,182,0.35), 0 0 48px rgba(244,114,182,0.12)',
      textClass: 'text-pink-400',
      borderClass: 'border-pink-500/30',
      tagClass: 'bg-pink-500/20 text-pink-200',
      buttonClass: 'bg-pink-500 hover:bg-pink-400',
    },
  },
  {
    name: 'matcha',
    bg: 0x0d1a0d,
    palette: [
      [0.53, 0.71, 0.44],
      [0.6, 0.7, 0.55],
      [0.96, 0.94, 0.88],
      [0.76, 0.78, 0.55],
      [0.42, 0.55, 0.35],
    ],
    normalMode: false,
    fx: { glow: 0.33, sparkle: 0.0, tScale: [4.0, 2.5] },
    snowflake: 0,
    bloom: { strength: 0.35, radius: 0.4, threshold: 0.5 },
    afterimageDamp: 0.75,
    css: {
      accent: '#6ee7b7',
      accentBorder: 'rgba(110,231,183,0.55)',
      glowShadow: '0 4px 24px rgba(110,231,183,0.35), 0 0 48px rgba(110,231,183,0.12)',
      textClass: 'text-emerald-300',
      borderClass: 'border-emerald-400/30',
      tagClass: 'bg-emerald-500/20 text-emerald-200',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-500',
    },
  },
  {
    name: 'beach',
    bg: 0x0a1525,
    palette: [
      [0.1, 0.15, 0.35],
      [0.2, 0.45, 0.65],
      [0.5, 0.78, 0.8],
      [0.87, 0.8, 0.65],
      [0.9, 0.55, 0.5],
    ],
    normalMode: false,
    fx: { glow: 0.55, sparkle: 0.0, tScale: [3.5, 2.0] },
    snowflake: 0,
    bloom: { strength: 0.45, radius: 0.5, threshold: 0.35 },
    afterimageDamp: 0.75,
    css: {
      accent: '#a5f3fc',
      accentBorder: 'rgba(165,243,252,0.55)',
      glowShadow: '0 4px 24px rgba(165,243,252,0.35), 0 0 48px rgba(165,243,252,0.12)',
      textClass: 'text-cyan-200',
      borderClass: 'border-cyan-400/30',
      tagClass: 'bg-cyan-500/20 text-cyan-200',
      buttonClass: 'bg-cyan-600 hover:bg-cyan-500',
    },
  },
  {
    name: 'blizzard',
    bg: 0x1a2530,
    palette: [
      [1.0, 1.0, 1.0],
      [0.85, 0.95, 1.0],
      [0.95, 0.98, 1.0],
      [0.8, 0.9, 1.0],
      [0.9, 0.92, 0.95],
    ],
    normalMode: false,
    fx: { glow: 0.33, sparkle: 1.0, tScale: [6.0, 4.0] },
    snowflake: 1,
    bloom: { strength: 0.5, radius: 0.65, threshold: 0.3 },
    afterimageDamp: 0.82,
    css: {
      accent: '#ffffff',
      accentBorder: 'rgba(255,255,255,0.7)',
      glowShadow: '0 4px 24px rgba(255,255,255,0.35), 0 0 48px rgba(220,240,255,0.15)',
      textClass: 'text-white',
      borderClass: 'border-blue-200/30',
      tagClass: 'bg-blue-200/20 text-blue-100',
      buttonClass: 'bg-blue-400 hover:bg-blue-300',
    },
  },
];

/** All text classes, for classList cleanup when switching themes. */
export const ALL_TEXT_CLASSES = THEMES.map((t) => t.css.textClass);

/** Raw sRGB components of a theme background (no color-management round trip). */
export function bgToRgb(hex: number): Vec3Tuple {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Push a theme's accent values into CSS custom properties on <html>. */
export function applyThemeCssVars(index: number): void {
  const t = THEMES[index] ?? THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--accent', t.css.accent);
  root.style.setProperty('--accent-border', t.css.accentBorder);
  root.style.setProperty('--glow-shadow', t.css.glowShadow);
}
