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
    /** Carries white text, so both states must keep 4.5:1 against it. */
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
      buttonClass: 'bg-indigo-600 hover:bg-indigo-700',
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
      buttonClass: 'bg-pink-600 hover:bg-pink-700',
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
      buttonClass: 'bg-emerald-700 hover:bg-emerald-800',
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
      buttonClass: 'bg-cyan-700 hover:bg-cyan-800',
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
      buttonClass: 'bg-blue-600 hover:bg-blue-700',
    },
  },
  /* ── One per showcase project, sampled from that project's own footage ── */
  {
    name: 'frenzy', // Rico Rite: crimson, gold and blue bricks on black
    bg: 0x09080d,
    palette: [
      [0.87, 0.16, 0.24],
      [0.94, 0.68, 0.18],
      [0.23, 0.48, 0.82],
      [0.74, 0.87, 1.0],
      [0.62, 0.1, 0.18],
    ],
    normalMode: false,
    fx: { glow: 0.5, sparkle: 0.0, tScale: [5.0, 3.0] },
    snowflake: 0,
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.42 },
    afterimageDamp: 0.78,
    css: {
      accent: '#f87171',
      accentBorder: 'rgba(248,113,113,0.55)',
      glowShadow: '0 4px 24px rgba(248,113,113,0.35), 0 0 48px rgba(248,113,113,0.12)',
      textClass: 'text-red-300',
      borderClass: 'border-red-400/30',
      tagClass: 'bg-red-500/20 text-red-200',
      buttonClass: 'bg-red-600 hover:bg-red-700',
    },
  },
  {
    name: 'sumi', // Ink: paper and grey washes, with a vermilion seal for the button
    bg: 0x0f1013,
    palette: [
      [0.93, 0.9, 0.83],
      [0.62, 0.6, 0.57],
      [0.86, 0.2, 0.16],
      [0.97, 0.95, 0.9],
      [0.38, 0.38, 0.4],
    ],
    normalMode: false,
    fx: { glow: 0.3, sparkle: 0.0, tScale: [3.0, 2.0] },
    snowflake: 0,
    bloom: { strength: 0.32, radius: 0.6, threshold: 0.5 },
    afterimageDamp: 0.84,
    css: {
      accent: '#e8e0d0',
      accentBorder: 'rgba(232,224,208,0.5)',
      glowShadow: '0 4px 24px rgba(232,224,208,0.28), 0 0 48px rgba(232,224,208,0.1)',
      textClass: 'text-stone-200',
      borderClass: 'border-stone-300/25',
      tagClass: 'bg-stone-300/15 text-stone-200',
      buttonClass: 'bg-red-700 hover:bg-red-800',
    },
  },
  {
    name: 'carillon', // ReSound: gold bells and pink attacks over slate and moss
    bg: 0x0e1518,
    palette: [
      [0.98, 0.76, 0.25],
      [0.95, 0.25, 0.42],
      [0.55, 0.62, 0.78],
      [0.35, 0.72, 0.66],
      [0.2, 0.5, 0.4],
    ],
    normalMode: false,
    fx: { glow: 0.5, sparkle: 0.0, tScale: [4.0, 2.5] },
    snowflake: 0,
    bloom: { strength: 0.45, radius: 0.5, threshold: 0.42 },
    afterimageDamp: 0.78,
    css: {
      accent: '#fbbf24',
      accentBorder: 'rgba(251,191,36,0.55)',
      glowShadow: '0 4px 24px rgba(251,191,36,0.32), 0 0 48px rgba(251,191,36,0.11)',
      textClass: 'text-amber-300',
      borderClass: 'border-amber-400/30',
      tagClass: 'bg-amber-500/20 text-amber-200',
      buttonClass: 'bg-amber-700 hover:bg-amber-800',
    },
  },
  {
    name: 'mould', // Fragment Ecology: Physarum blue and cream, Reagent copper, Fold gold
    bg: 0x0a0b0e,
    palette: [
      [0.22, 0.42, 0.85],
      [0.92, 0.88, 0.76],
      [0.78, 0.52, 0.32],
      [0.9, 0.74, 0.1],
      [0.1, 0.35, 0.36],
    ],
    normalMode: false,
    fx: { glow: 0.45, sparkle: 0.0, tScale: [4.5, 3.0] },
    snowflake: 0,
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.42 },
    afterimageDamp: 0.8,
    css: {
      accent: '#60a5fa',
      accentBorder: 'rgba(96,165,250,0.55)',
      glowShadow: '0 4px 24px rgba(96,165,250,0.32), 0 0 48px rgba(96,165,250,0.11)',
      textClass: 'text-blue-300',
      borderClass: 'border-blue-400/30',
      tagClass: 'bg-blue-500/20 text-blue-200',
      buttonClass: 'bg-blue-600 hover:bg-blue-700',
    },
  },
  {
    name: 'plasmid', // cGEM: ice-white particles on deep navy, with one maple red
    bg: 0x040f25,
    palette: [
      [0.72, 0.85, 0.95],
      [0.95, 0.97, 1.0],
      [0.37, 0.92, 0.83],
      [0.33, 0.45, 0.6],
      [0.85, 0.3, 0.27],
    ],
    normalMode: false,
    fx: { glow: 0.35, sparkle: 0.0, tScale: [4.0, 2.5] },
    snowflake: 0,
    bloom: { strength: 0.38, radius: 0.5, threshold: 0.45 },
    afterimageDamp: 0.76,
    css: {
      accent: '#5eead4',
      accentBorder: 'rgba(94,234,212,0.55)',
      glowShadow: '0 4px 24px rgba(94,234,212,0.32), 0 0 48px rgba(94,234,212,0.11)',
      textClass: 'text-teal-200',
      borderClass: 'border-teal-400/30',
      tagClass: 'bg-teal-500/20 text-teal-200',
      buttonClass: 'bg-teal-700 hover:bg-teal-800',
    },
  },
  {
    name: 'forms', // APEIRON: fractal green, lattice teal, current blue, boss orange
    bg: 0x0b1410,
    palette: [
      [0.45, 0.85, 0.35],
      [0.25, 0.85, 0.8],
      [0.3, 0.55, 0.95],
      [0.95, 0.45, 0.15],
      [0.93, 0.9, 0.8],
    ],
    normalMode: false,
    fx: { glow: 0.5, sparkle: 0.0, tScale: [6.0, 4.0] },
    snowflake: 0,
    bloom: { strength: 0.48, radius: 0.5, threshold: 0.42 },
    afterimageDamp: 0.8,
    css: {
      accent: '#a3e635',
      accentBorder: 'rgba(163,230,53,0.55)',
      glowShadow: '0 4px 24px rgba(163,230,53,0.3), 0 0 48px rgba(163,230,53,0.1)',
      textClass: 'text-lime-300',
      borderClass: 'border-lime-400/30',
      tagClass: 'bg-lime-500/20 text-lime-200',
      buttonClass: 'bg-lime-700 hover:bg-lime-800',
    },
  },
  {
    name: 'tide', // Lost Bottle: night water, mint contours, parchment and red wax
    bg: 0x06141b,
    palette: [
      [0.5, 0.89, 0.79],
      [0.04, 0.35, 0.42],
      [0.87, 0.84, 0.76],
      [0.72, 0.22, 0.2],
      [0.1, 0.55, 0.55],
    ],
    normalMode: false,
    fx: { glow: 0.4, sparkle: 0.0, tScale: [3.0, 1.8] },
    snowflake: 0,
    bloom: { strength: 0.4, radius: 0.55, threshold: 0.42 },
    afterimageDamp: 0.82,
    css: {
      accent: '#7fe3ca',
      accentBorder: 'rgba(127,227,202,0.55)',
      glowShadow: '0 4px 24px rgba(127,227,202,0.32), 0 0 48px rgba(127,227,202,0.11)',
      textClass: 'text-emerald-200',
      borderClass: 'border-emerald-300/30',
      tagClass: 'bg-emerald-400/20 text-emerald-100',
      buttonClass: 'bg-emerald-700 hover:bg-emerald-800',
    },
  },
  {
    name: 'plotter', // cosu: neon magenta and cyan, then paper and pen colours
    bg: 0x140f1a,
    palette: [
      [0.93, 0.3, 0.7],
      [0.35, 0.85, 0.95],
      [0.95, 0.93, 0.87],
      [0.82, 0.25, 0.22],
      [0.25, 0.4, 0.75],
    ],
    normalMode: false,
    fx: { glow: 0.3, sparkle: 0.0, tScale: [7.0, 4.0] },
    snowflake: 0,
    bloom: { strength: 0.32, radius: 0.45, threshold: 0.5 },
    afterimageDamp: 0.74,
    css: {
      accent: '#f0abfc',
      accentBorder: 'rgba(240,171,252,0.55)',
      glowShadow: '0 4px 24px rgba(240,171,252,0.32), 0 0 48px rgba(240,171,252,0.11)',
      textClass: 'text-fuchsia-300',
      borderClass: 'border-fuchsia-400/30',
      tagClass: 'bg-fuchsia-500/20 text-fuchsia-200',
      buttonClass: 'bg-fuchsia-600 hover:bg-fuchsia-700',
    },
  },
  {
    name: 'lantern', // KEEP: lantern gold and Pocket cyan in an indigo castle
    bg: 0x14112c,
    palette: [
      [0.96, 0.72, 0.28],
      [0.36, 0.3, 0.62],
      [0.35, 0.85, 0.95],
      [0.5, 0.25, 0.72],
      [0.9, 0.5, 0.2],
    ],
    normalMode: false,
    fx: { glow: 0.45, sparkle: 0.0, tScale: [3.5, 2.2] },
    snowflake: 0,
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.42 },
    afterimageDamp: 0.78,
    css: {
      accent: '#f59e0b',
      accentBorder: 'rgba(245,158,11,0.55)',
      glowShadow: '0 4px 24px rgba(245,158,11,0.32), 0 0 48px rgba(245,158,11,0.11)',
      textClass: 'text-orange-300',
      borderClass: 'border-orange-400/30',
      tagClass: 'bg-orange-500/20 text-orange-200',
      buttonClass: 'bg-orange-700 hover:bg-orange-800',
    },
  },
  {
    name: 'larder', // Gospel: egg yolk, rice and soy on a near-black app
    bg: 0x0c0b09,
    palette: [
      [0.96, 0.76, 0.3],
      [0.96, 0.92, 0.82],
      [0.98, 0.97, 0.93],
      [0.55, 0.35, 0.2],
      [0.45, 0.6, 0.35],
    ],
    normalMode: false,
    fx: { glow: 0.35, sparkle: 0.0, tScale: [4.0, 2.5] },
    snowflake: 0,
    bloom: { strength: 0.36, radius: 0.5, threshold: 0.46 },
    afterimageDamp: 0.78,
    css: {
      accent: '#fde68a',
      accentBorder: 'rgba(253,230,138,0.5)',
      glowShadow: '0 4px 24px rgba(253,230,138,0.28), 0 0 48px rgba(253,230,138,0.1)',
      textClass: 'text-amber-200',
      borderClass: 'border-amber-200/25',
      tagClass: 'bg-amber-200/15 text-amber-100',
      buttonClass: 'bg-amber-700 hover:bg-amber-800',
    },
  },
  {
    name: 'curtain', // Lattice: the hero's cobalt and cyan glass curtain over deep navy
    bg: 0x040a1c,
    palette: [
      [0.05, 0.3, 0.95],
      [0.16, 0.71, 0.96],
      [0.85, 0.94, 1.0],
      [0.2, 0.25, 0.75],
      [0.55, 0.45, 0.95],
    ],
    normalMode: false,
    fx: { glow: 0.5, sparkle: 0.0, tScale: [4.0, 3.0] },
    snowflake: 0,
    bloom: { strength: 0.44, radius: 0.5, threshold: 0.4 },
    afterimageDamp: 0.8,
    css: {
      accent: '#7dd3fc',
      accentBorder: 'rgba(125,211,252,0.55)',
      glowShadow: '0 4px 24px rgba(125,211,252,0.3), 0 0 48px rgba(125,211,252,0.1)',
      textClass: 'text-sky-300',
      borderClass: 'border-sky-300/25',
      tagClass: 'bg-sky-400/15 text-sky-100',
      buttonClass: 'bg-blue-700 hover:bg-blue-800',
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
