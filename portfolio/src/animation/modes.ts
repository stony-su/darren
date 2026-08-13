/**
 * Modes — behaviour/appearance changes to the particle system itself.
 *
 * A mode rewires how every particle moves (a different force field in the
 * GPGPU sim, a different render rig, or both) and then stays that way. It has
 * no timeline: it is the physics the field lives under until you switch it
 * back. Contrast with a preset (presets.ts), which is a scripted scenario that
 * plays out on top of whatever mode is running.
 *
 * Modes compose with the rest of the scene — the mouse force and every preset
 * keep working while one is active. Swirl lines are the exception: a
 * 64-particle chain is about as long as a whole formation, so the followers
 * wrap across whatever the mode just built and smear it. Every mode below
 * takes the lines over while it runs.
 *
 * Each entry names the sim uniform its strength lives in; the scene ramps
 * exactly one toward 1 and every other toward 0, so switching cross-fades.
 */

export interface ModeDef {
  id: string;
  label: string;
  hint: string;
  /** Sim uniform carrying this mode's 0..1 strength. Absent on 'off', which
   *  is simply every other uniform at zero. */
  uniform?: string;
  /** How hard the mode concentrates the field, 0..1. Scales the bloom, trail
   *  and palette-glow compensation the scene applies while it runs: a mode
   *  that packs the population onto a thin manifold needs all of it, one that
   *  spreads it back over the stage needs little. */
  dense?: number;
  /** True for modes whose particles travel smooth, coherent paths. Those need
   *  the render rig meant for near-straight motion — the legacy velocity frame
   *  degenerates on one and confettis the normals — and the same brightness
   *  cut swirl lines get, since coherent paths stack up per pixel. Drives the
   *  shared `flowStrength` / `uFlow` uniform. */
  flow?: boolean;
}

export const MODES: ModeDef[] = [
  {
    id: 'off',
    label: 'Chaos',
    hint: 'The house behaviour: particles drift through a curl-noise field, endlessly.',
  },
  {
    id: 'attractor',
    label: 'Strange attractor',
    hint: 'The field becomes the Lorenz system. Every particle rides its flow, winding out one lobe of the butterfly, flipping to the other, never repeating. Takes over from swirl lines while it runs.',
    uniform: 'attractorStrength',
    dense: 1,
    flow: true,
  },
  {
    id: 'blackhole',
    label: 'Black hole',
    hint: 'The pointer becomes a gravity well. The field is captured into a tilted accretion disc, inner rings shearing past outer ones, and whatever reaches the event horizon is eaten and dropped back at the rim. Takes over from swirl lines while it runs.',
    uniform: 'holeStrength',
    dense: 1,
    flow: true,
  },
  {
    id: 'gyroid',
    label: 'Minimal surface',
    hint: 'The field condenses onto a gyroid — an infinite triply-periodic labyrinth — and wanders its glowing walls forever, never finding an edge. Takes over from swirl lines while it runs.',
    uniform: 'surfaceStrength',
    dense: 1,
  },
  {
    id: 'lattice',
    label: 'Crystal lattice',
    hint: 'Every particle snaps to the nearest point of a 3D grid and freezes — the field becomes a shimmering solid that slowly re-tunes as the lattice breathes. Takes over from swirl lines while it runs.',
    uniform: 'latticeStrength',
    dense: 1,
  },
  {
    id: 'charged',
    label: 'Charged',
    hint: 'Half the field positive, half negative. Opposites attract, likes repel, and the population knits itself into drifting filament arcs between clusters. Takes over from swirl lines while it runs.',
    uniform: 'chargedStrength',
    dense: 1,
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    hint: 'A disc turning about its own core, inner rings lapping outer ones. Nobody draws the spiral arms — they are the lanes where the orbits crowd, and the field streams through them. Takes over from swirl lines while it runs.',
    uniform: 'galaxyStrength',
    dense: 1,
    flow: true,
  },
  {
    id: 'murmur',
    label: 'Murmuration',
    hint: 'The field breaks into flocks. Each bird watches a handful of neighbours and does three things — keep close, keep clear, keep pace — and the shapes that come out of it are nobody\'s idea. Takes over from swirl lines while it runs.',
    uniform: 'murmurStrength',
    dense: 0.85,
    flow: true,
  },
  {
    id: 'aurora',
    label: 'Aurora',
    hint: 'Particles are confined to a few vertical curtains, streaming upward and rippling on a travelling wave. Where a curtain turns edge-on the whole sheet stacks into one bright fold. Takes over from swirl lines while it runs.',
    uniform: 'auroraStrength',
    dense: 0.8,
    flow: true,
  },
  {
    id: 'dipole',
    label: 'Dipole',
    hint: 'A magnet\'s field, drawn in particles: arcs leaving one pole and closing on the other. Each one bounces between its own mirror points, so the poles glow rather than swallow. Takes over from swirl lines while it runs.',
    uniform: 'dipoleStrength',
    dense: 0.9,
    flow: true,
  },
  {
    id: 'sediment',
    label: 'Sediment',
    hint: 'Gravity, a terminal velocity and wind shear. The whole field falls, drifts, and banks up against an invisible floor — and the bank slowly lifts back into the sky. Takes over from swirl lines while it runs.',
    uniform: 'sedimentStrength',
    dense: 0.5,
    flow: true,
  },
];

export const DEFAULT_MODE = 'off';

/** Every mode that owns a sim uniform, in registry order. The scene ramps all
 *  of them every frame — one toward 1, the rest toward 0. */
export const MODE_FIELDS: { uniform: string; dense: number; flow: boolean; id: string }[] =
  MODES.filter((m) => m.uniform).map((m) => ({
    id: m.id,
    uniform: m.uniform!,
    dense: m.dense ?? 1,
    flow: m.flow ?? false,
  }));

export function isModeId(id: string): boolean {
  return MODES.some((m) => m.id === id);
}
