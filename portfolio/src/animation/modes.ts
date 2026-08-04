/**
 * Modes — behaviour/appearance changes to the particle system itself.
 *
 * A mode rewires how every particle moves (a different force field in the
 * GPGPU sim, a different render rig, or both) and then stays that way. It has
 * no timeline: it is the physics the field lives under until you switch it
 * back. Contrast with a preset (presets.ts), which is a scripted scenario that
 * plays out on top of whatever mode is running.
 *
 * Modes compose with the rest of the scene — swirl lines, the mouse force and
 * every preset keep working while one is active.
 */

export interface ModeDef {
  id: string;
  label: string;
  hint: string;
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
  },
  {
    id: 'blackhole',
    label: 'Black hole',
    hint: 'The pointer becomes a gravity well. The field is captured into a tilted accretion disc, inner rings shearing past outer ones, and whatever reaches the event horizon is eaten and dropped back at the rim. Takes over from swirl lines while it runs.',
  },
];

export const DEFAULT_MODE = 'off';

export function isModeId(id: string): boolean {
  return MODES.some((m) => m.id === id);
}
