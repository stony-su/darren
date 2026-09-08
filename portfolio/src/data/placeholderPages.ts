import type { Project, ProjectPage } from './projects';
import { THEMES } from '../theme/themes';

/* ── Placeholder page art ──────────────────────────────────────────────────
 * Until real screenshots land in `Project.pages`, each page shard gets a
 * generated wireframe of a web page, tinted with the slide's accent. Four
 * layouts cycle so a shattered pane doesn't read as the same picture seven
 * times over.
 * TODO(darren): drop real captures into projects.ts and these go away. */

export const PLACEHOLDER_LABELS = [
  'Landing',
  'Features',
  'Dashboard',
  'Detail',
  'Search',
  'Profile',
  'Settings',
];

/** Viewport-only proportions — a browser page with the chrome cropped off. */
export const PAGE_ASPECT = 1.6; // 1440 × 900

function svgUri(body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" ` +
    `width="1440" height="900">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function pageArt(accent: string, variant: number): string {
  const a = accent;
  const bg = '#0d0f18';
  const bar = '#151a29';
  const line = '#242a3d';
  const edge = '#333b55';

  const nav = `
    <rect width="1440" height="900" fill="${bg}"/>
    <rect width="1440" height="70" fill="${bar}"/>
    <circle cx="46" cy="35" r="11" fill="${a}"/>
    <rect x="72" y="28" width="78" height="13" rx="6" fill="${edge}"/>
    <rect x="980" y="28" width="64" height="13" rx="6" fill="${line}"/>
    <rect x="1064" y="28" width="64" height="13" rx="6" fill="${line}"/>
    <rect x="1148" y="28" width="64" height="13" rx="6" fill="${line}"/>
    <rect x="1246" y="20" width="146" height="30" rx="15" fill="${a}" fill-opacity="0.9"/>`;

  const foot = `
    <rect y="812" width="1440" height="88" fill="${bar}"/>
    <rect x="80" y="846" width="190" height="12" rx="6" fill="${line}"/>
    <rect x="1170" y="846" width="190" height="12" rx="6" fill="${line}"/>`;

  const tile = (x: number, y: number, w: number, h: number): string => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${bar}" stroke="${line}" stroke-width="2"/>
    <rect x="${x + 26}" y="${y + 26}" width="46" height="46" rx="13" fill="${a}" fill-opacity="0.45"/>
    <rect x="${x + 26}" y="${y + 94}" width="${w - 96}" height="14" rx="7" fill="${edge}"/>
    <rect x="${x + 26}" y="${y + 120}" width="${w - 150}" height="10" rx="5" fill="${line}"/>
    <rect x="${x + 26}" y="${y + 142}" width="${w - 120}" height="10" rx="5" fill="${line}"/>`;

  let body: string;
  switch (variant % 4) {
    // Hero split: copy left, feature panel right, three cards under it.
    case 0:
      body = `
        <rect x="80" y="150" width="460" height="32" rx="9" fill="${edge}"/>
        <rect x="80" y="198" width="350" height="32" rx="9" fill="${edge}"/>
        <rect x="80" y="262" width="430" height="12" rx="6" fill="${line}"/>
        <rect x="80" y="288" width="380" height="12" rx="6" fill="${line}"/>
        <rect x="80" y="314" width="290" height="12" rx="6" fill="${line}"/>
        <rect x="80" y="362" width="168" height="48" rx="24" fill="${a}"/>
        <rect x="270" y="362" width="142" height="48" rx="24" fill="none" stroke="${edge}" stroke-width="2"/>
        <rect x="660" y="130" width="700" height="360" rx="20" fill="${a}" fill-opacity="0.15" stroke="${a}" stroke-opacity="0.34" stroke-width="2"/>
        <circle cx="1010" cy="310" r="56" fill="${a}" fill-opacity="0.55"/>
        ${tile(80, 560, 400, 200)}
        ${tile(520, 560, 400, 200)}
        ${tile(960, 560, 400, 200)}`;
      break;
    // Centered hero over a wide media band.
    case 1:
      body = `
        <rect x="450" y="152" width="540" height="34" rx="9" fill="${edge}"/>
        <rect x="545" y="202" width="350" height="34" rx="9" fill="${edge}"/>
        <rect x="510" y="268" width="420" height="12" rx="6" fill="${line}"/>
        <rect x="575" y="294" width="290" height="12" rx="6" fill="${line}"/>
        <rect x="616" y="342" width="208" height="50" rx="25" fill="${a}"/>
        <rect x="150" y="440" width="1140" height="320" rx="20" fill="${a}" fill-opacity="0.12" stroke="${a}" stroke-opacity="0.3" stroke-width="2"/>
        <circle cx="720" cy="600" r="46" fill="${a}" fill-opacity="0.6"/>
        <rect x="640" y="586" width="14" height="28" rx="3" fill="${bg}"/>
        <rect x="786" y="586" width="14" height="28" rx="3" fill="${bg}"/>`;
      break;
    // App dashboard: rail, stat row, chart, side list.
    case 2:
      body = `
        <rect y="70" width="240" height="742" fill="#101422"/>
        <rect x="32" y="118" width="120" height="14" rx="7" fill="${a}" fill-opacity="0.7"/>
        <rect x="32" y="176" width="160" height="12" rx="6" fill="${line}"/>
        <rect x="32" y="214" width="140" height="12" rx="6" fill="${line}"/>
        <rect x="32" y="252" width="168" height="12" rx="6" fill="${line}"/>
        <rect x="32" y="290" width="130" height="12" rx="6" fill="${line}"/>
        <rect x="290" y="118" width="230" height="26" rx="9" fill="${edge}"/>
        ${[0, 1, 2, 3]
          .map(
            (i) => `
        <rect x="${290 + i * 272}" y="182" width="248" height="128" rx="16" fill="${bar}" stroke="${line}" stroke-width="2"/>
        <rect x="${314 + i * 272}" y="208" width="96" height="12" rx="6" fill="${line}"/>
        <rect x="${314 + i * 272}" y="238" width="130" height="26" rx="8" fill="${a}" fill-opacity="0.65"/>`,
          )
          .join('')}
        <rect x="290" y="350" width="740" height="330" rx="18" fill="${bar}" stroke="${line}" stroke-width="2"/>
        <polyline points="330,600 440,530 550,568 660,440 770,494 880,398 990,436"
                  fill="none" stroke="${a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="1062" y="350" width="298" height="330" rx="18" fill="${bar}" stroke="${line}" stroke-width="2"/>
        ${[0, 1, 2, 3, 4]
          .map(
            (i) => `
        <circle cx="1104" cy="${396 + i * 58}" r="15" fill="${a}" fill-opacity="0.4"/>
        <rect x="1134" y="${389 + i * 58}" width="180" height="13" rx="6" fill="${line}"/>`,
          )
          .join('')}
        <rect x="290" y="712" width="1070" height="12" rx="6" fill="${line}"/>
        <rect x="290" y="748" width="880" height="12" rx="6" fill="${line}"/>`;
      break;
    // Gallery grid.
    default:
      body = `
        <rect x="80" y="132" width="280" height="28" rx="9" fill="${edge}"/>
        <rect x="1020" y="130" width="110" height="32" rx="16" fill="${a}" fill-opacity="0.75"/>
        <rect x="1150" y="130" width="110" height="32" rx="16" fill="none" stroke="${edge}" stroke-width="2"/>
        <rect x="1280" y="130" width="80" height="32" rx="16" fill="none" stroke="${edge}" stroke-width="2"/>
        ${[0, 1, 2]
          .map((col) =>
            [0, 1]
              .map(
                (row) => `
        <rect x="${80 + col * 440}" y="${210 + row * 300}" width="400" height="260" rx="18" fill="${a}" fill-opacity="${row === col % 2 ? 0.18 : 0.1}" stroke="${line}" stroke-width="2"/>
        <rect x="${104 + col * 440}" y="${414 + row * 300}" width="200" height="14" rx="7" fill="${edge}"/>
        <rect x="${104 + col * 440}" y="${438 + row * 300}" width="140" height="10" rx="5" fill="${line}"/>`,
              )
              .join(''),
          )
          .join('')}`;
      break;
  }

  return svgUri(nav + body + foot);
}

export function placeholderPages(project: Project): ProjectPage[] {
  const accent = THEMES[project.theme].css.accent;
  return PLACEHOLDER_LABELS.map((label, i) => ({
    src: pageArt(accent, i),
    label,
  }));
}
