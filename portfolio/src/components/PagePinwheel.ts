import type { Project, ProjectPage } from '../data/projects';
import { THEMES } from '../theme/themes';

/* ── Placeholder page art ──────────────────────────────────────────────────
 * Until real screenshots land in `Project.pages`, each panel gets a generated
 * wireframe of a web page, tinted with the slide's accent. Four layouts cycle
 * so a fanned deck doesn't read as the same picture seven times.
 * TODO(darren): drop real captures into projects.ts and these go away. */

const PLACEHOLDER_LABELS = [
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

function pageArt(accent: string, variant: number): string {
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

function placeholderPages(project: Project): ProjectPage[] {
  const accent = THEMES[project.theme].css.accent;
  return PLACEHOLDER_LABELS.map((label, i) => ({
    src: pageArt(accent, i),
    label,
  }));
}

/* ── Fan geometry ──────────────────────────────────────────────────────────
 * Panels sit on a barrel: each is a flat facet turned FACET° from its
 * neighbour and pushed back along the arc, so the deck reads as one curved
 * octagonal surface rather than a row of stickers. */

const FACET = 19;      // degrees of turn between neighbouring facets
const RADIUS_K = 1.7;  // arc radius driving sideways spread, in panel widths
const GAP = 8;         // px of clearance between one facet's plane and the next
const ROLL = 1.6;      // degrees of roll per step — tips the drum off-axis
const BOW = 0.013;     // parabolic sag of the arc, in panel widths
const SPIN = -64;      // collapsed roll: how far each panel unwinds on open

const DEG = Math.PI / 180;

interface PanelGeom {
  open: string;
  shut: string;
}

/**
 * The hover deck on a project card's image: a stack of page screenshots that
 * spins out into a curved fan and winds back in when the pointer leaves.
 */
export class PagePinwheel {
  private card: HTMLElement;
  private media: HTMLElement;
  private pages: ProjectPage[];
  private root: HTMLElement | null = null;
  private panels: HTMLElement[] = [];
  private geom: PanelGeom[] = [];
  private geomKey = '';
  private opened = false;
  private liveTimer: number | null = null;

  constructor(card: HTMLElement, media: HTMLElement, project: Project) {
    this.card = card;
    this.media = media;
    this.pages = project.pages?.length ? project.pages : placeholderPages(project);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** Idempotent — called on slide-change warm-up and again on first hover. */
  build(): void {
    if (this.root) return;

    const root = document.createElement('div');
    root.className = 'page-fan';
    root.setAttribute('aria-hidden', 'true');

    const stage = document.createElement('div');
    stage.className = 'fan-stage';

    const c = (this.pages.length - 1) / 2;
    this.panels = this.pages.map((page, i) => {
      const panel = document.createElement('div');
      panel.className = 'fan-panel';
      panel.style.setProperty('--dim', Math.min(0.5, Math.abs(i - c) * 0.12).toFixed(3));
      panel.innerHTML =
        `<img src="${page.src}" alt="" decoding="async" draggable="false" />` +
        `<span class="fan-label">${page.label}</span>`;
      return panel;
    });

    // Append back-to-front, outermost facet first. A 3D rendering context is
    // supposed to sort by depth, but the facets of a barrel interpenetrate and
    // browsers fall back to DOM order there — which paints the far side over
    // the near one. Ordering by depth ourselves makes both rules agree.
    this.panels
      .map((panel, i) => ({ panel, depth: Math.abs(i - c) }))
      .sort((a, b) => b.depth - a.depth)
      .forEach(({ panel }, order) => {
        panel.style.zIndex = String(order);
        stage.appendChild(panel);
      });

    root.appendChild(stage);
    this.card.appendChild(root);
    this.root = root;

    this.layout(true);
  }

  setOpen(on: boolean): void {
    if (on) this.build();
    if (!this.root || this.opened === on) return;
    this.opened = on;

    if (on) this.layout(false);

    const n = this.panels.length;
    this.panels.forEach((panel, i) => {
      // Open sweeps left→right like a blade passing; close unwinds the other way.
      const d = on ? i * 42 : (n - 1 - i) * 26;
      // Two delays: transform first, then opacity — so closing panels are seen
      // spinning back rather than simply blinking out.
      panel.style.transitionDelay = on ? `${d}ms, ${d}ms` : `${d}ms, ${d + 240}ms`;
      panel.style.transform = on ? this.geom[i].open : this.geom[i].shut;
    });

    this.root.classList.add('is-live');
    this.root.classList.toggle('is-open', on);
    this.card.classList.toggle('fan-active', on);

    // Drop the compositing hint once the deck has settled.
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => {
      this.liveTimer = null;
      if (!this.opened) this.root?.classList.remove('is-live');
    }, 1100);
  }

  /** Re-fit to the card after a viewport change. No-op while fanned open. */
  refit(): void {
    if (!this.root || this.opened) return;
    this.layout(false);
  }

  destroy(): void {
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.root?.remove();
    this.root = null;
    this.panels = [];
    this.geom = [];
    this.opened = false;
  }

  /* ── internals ── */

  /**
   * Recompute panel size and the two transform endpoints. Both endpoints use
   * the same function list, which is what lets the browser interpolate them.
   */
  private layout(force: boolean): void {
    if (!this.root) return;

    const cardRect = this.card.getBoundingClientRect();
    const mediaRect = this.media.getBoundingClientRect();
    if (cardRect.width === 0) return;

    // The deck spans ~2.8 panel widths; keep it inside the card either way.
    const byWidth = Math.min(300, Math.max(120, cardRect.width * 0.31));
    const byHeight = cardRect.height * 0.56 * PAGE_ASPECT;
    const w = Math.round(Math.min(byWidth, byHeight));
    const h = Math.round(w / PAGE_ASPECT);

    // Collapsed panels hide in the middle of the image they spring out of.
    const hubX = Math.round(
      mediaRect.left + mediaRect.width / 2 - (cardRect.left + cardRect.width / 2),
    );
    const hubY = Math.round(
      mediaRect.top + mediaRect.height / 2 - (cardRect.top + cardRect.height / 2),
    );

    const key = `${w}:${hubX}:${hubY}`;
    if (!force && key === this.geomKey) return;
    this.geomKey = key;

    const r = w * RADIUS_K;
    const c = (this.panels.length - 1) / 2;
    const shut = `translate3d(${hubX}px, ${hubY}px, -60px) rotate(${SPIN}deg) rotateY(0deg) scale(0.34)`;

    // Depth per step out from the middle. Placing the facets on a plain circle
    // is not enough: a turned panel is wide enough to poke through its
    // neighbour's plane, and the browser resolves that crossing per pixel —
    // which paints the far panel over the near one down the middle of the
    // deck. Pushing each ring back past the previous one's deepest corner
    // keeps the stack strictly front-to-back.
    const depth: number[] = [0];
    for (let j = 1; j <= c; j++) {
      const reachPrev = (w / 2) * Math.abs(Math.sin((j - 1) * FACET * DEG));
      const reach = (w / 2) * Math.abs(Math.sin(j * FACET * DEG));
      depth[j] = depth[j - 1] - reachPrev - reach - GAP;
    }

    this.geom = this.panels.map((panel, i) => {
      const k = i - c;
      const ang = k * FACET;
      const x = Math.round(r * Math.sin(ang * DEG));
      const z = Math.round(depth[Math.abs(k)]);
      // Sag, re-centred so the arc straddles the card's midline instead of
      // hanging below it.
      const y = Math.round(BOW * w * (k * k - (c * c) / 2));

      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
      panel.style.marginLeft = `${-w / 2}px`;
      panel.style.marginTop = `${-h / 2}px`;

      return {
        open:
          `translate3d(${x}px, ${y}px, ${z}px) ` +
          `rotate(${(k * ROLL).toFixed(2)}deg) rotateY(${ang.toFixed(2)}deg) scale(1)`,
        shut,
      };
    });

    if (!this.opened) {
      // Land on the new closed pose without animating there from the old one.
      this.panels.forEach((panel, i) => {
        panel.style.transition = 'none';
        panel.style.transform = this.geom[i].shut;
      });
      void this.root.offsetHeight;
      this.panels.forEach((panel) => {
        panel.style.transition = '';
      });
    }
  }
}
