/**
 * Presets — premade scenarios the particle field acts out.
 *
 * Where a mode (modes.ts) changes the physics and leaves it changed, a preset
 * is choreography: it drives the scene's existing formation / shockwave /
 * bloom machinery on a timeline, and every run plays the same way. Presets sit
 * on top of whatever mode is active.
 *
 * A preset talks to the scene only through `PresetScene` — the narrow slice of
 * ParticleScene it is allowed to touch. That keeps the registry free of any
 * import back into the scene (no cycle), and makes the surface a preset can
 * disturb obvious at a glance.
 */

import {
  knotDrawer,
  starCoreDrawer,
  solarDrawer,
  dnaDrawer,
  hourglassDrawer,
  fireworksDrawer,
  clockDrawer,
  ekgDrawer,
  mobiusDrawer,
  oceanDrawer,
  HOURGLASS_POUR,
  HOURGLASS_CYCLE,
  FIREWORKS_LOOP,
  FIREWORKS_BURSTS,
  EKG_BEAT,
  EKG_R_PHASE,
  ekgSpikeAt,
} from './IntroChoreography';
import type { TargetDrawer } from './IntroChoreography';

export interface PresetScene {
  setTargetDrawer(drawer: TargetDrawer | null): void;
  setFormationOffset(x: number, y: number): void;
  setFormationParticipation(fraction: number): void;
  setTextFormation(active: boolean, releaseShock?: number): void;
  /** Bloom strength for the duration of the preset (null = back to the theme). */
  setPresetBloom(strength: number | null): void;
  /** Fire a shockwave (0..1), centred on the formation stage or offset within
   *  it — `stageX`/`stageY` are fractions of the stage rect, 0 being its
   *  middle and ±0.5 its edges, y up. */
  shockwave(strength: number, stageX?: number, stageY?: number): void;
  /** Briefly flush motion trails, so a bright transition doesn't smear. */
  kickTrails(damp: number, durationMs: number): void;
}

export interface PresetRunner {
  /** Called every frame with wall-clock seconds (not sim-scaled). */
  update?(scene: PresetScene, dt: number): void;
  stop(scene: PresetScene): void;
}

export interface PresetDef {
  id: string;
  label: string;
  hint: string;
  /** Sim speed to force while running; the user's speed returns on stop. */
  simSpeed?: number;
  start(scene: PresetScene): PresetRunner;
}

/* ══════════ Trefoil knot ══════════ */

const knotPreset: PresetDef = {
  id: 'knot',
  label: 'Trefoil knot',
  hint: 'The field ties itself into a woven trefoil and holds it. Runs the sim hot so the knot lands in a beat.',
  simSpeed: 10,
  start(scene) {
    scene.setFormationOffset(0, 0);
    // Packing the whole field onto thin strands overflows them and the knot
    // fills in as a solid blob — keep the membership sparse.
    scene.setFormationParticipation(0.16);
    scene.setTargetDrawer(knotDrawer());
    scene.setTextFormation(true);
    return {
      stop(s) {
        s.setTextFormation(false); // fires the usual scatter + shockwave
        s.setTargetDrawer(null);
      },
    };
  },
};

/* ══════════ Supernova ══════════ */

/** Seconds for one full collapse → detonation → drift cycle. Kept tight: the
 *  blast parks the debris out at the edges, and a long drift there is a dead
 *  screen. Re-collapsing while it is still spread is also the better shot —
 *  the formation spring scales with distance, so the field visibly implodes. */
const NOVA_LOOP = 7.6;

/**
 * Beat sheet. Each entry fires once, on the frame the cycle clock crosses it;
 * the last one runs until the clock wraps and re-fires the collapse.
 */
const NOVA_BEATS: { at: number; run: (s: PresetScene) => void }[] = [
  {
    // Collapse: the whole field falls into an eight-point star. Bloom is
    // pinned low for the hold — this is the densest formation in the app and
    // at the theme's own bloom the core washes the entire screen white.
    at: 0,
    run: (s) => {
      s.setFormationOffset(0, 0);
      s.setFormationParticipation(0.34);
      s.setTargetDrawer(starCoreDrawer());
      s.setPresetBloom(0.16);
      s.setTextFormation(true);
    },
  },
  // Quivers: the core swells against the formation hold and snaps back — the
  // star straining before it goes. These have to stay under ~0.08: past that
  // the shock releases the hold outright (see the smoothstep on `arrive` in
  // ss-curl.glsl), the settle damping goes with it, and the "quiver" becomes a
  // premature detonation that clears the screen.
  { at: 2.2, run: (s) => s.shockwave(0.045) },
  { at: 2.9, run: (s) => s.shockwave(0.07) },
  {
    // Detonation: release the formation — that alone fires the scatter burst
    // and the blast — into a bloom spike, with the trails flushed so the flash
    // reads as a flash instead of a lingering smear.
    at: 3.5,
    run: (s) => {
      s.setPresetBloom(1.25);
      s.kickTrails(0.42, 1500);
      s.setTextFormation(false, 0.6);
      s.setTargetDrawer(null);
    },
  },
  // Afterglow: bloom eases back to the theme (the scene tweens it, ~0.3s).
  { at: 4.2, run: (s) => s.setPresetBloom(null) },
  // Echo: a ripple through the debris. Tiny for the same reason the quivers
  // are — with no formation left to damp it, a shock this late spends itself
  // entirely on throwing the remnant further out of frame.
  { at: 5.4, run: (s) => s.shockwave(0.05) },
];

function beatAt(cycle: number): number {
  let i = 0;
  while (i + 1 < NOVA_BEATS.length && cycle >= NOVA_BEATS[i + 1].at) i++;
  return i;
}

const supernovaPreset: PresetDef = {
  id: 'supernova',
  label: 'Supernova',
  hint: 'A star gathers out of the field, strains, detonates in an expanding shell — then the debris falls back together and does it again.',
  // Hot enough that the collapse lands in about a second, cool enough that the
  // blast (whose force scales with the sim clock) stays inside the frame.
  simSpeed: 1.5,
  start(scene) {
    let t = 0;
    let beat = -1;
    scene.setFormationOffset(0, 0);
    return {
      update(s, dt) {
        const cycle = t % NOVA_LOOP;
        const next = beatAt(cycle);
        if (next !== beat) {
          beat = next;
          NOVA_BEATS[next].run(s);
        }
        t += dt;
      },
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
        s.setPresetBloom(null);
      },
    };
  },
};

/* ══════════ Solar system ══════════ */

const solarPreset: PresetDef = {
  id: 'solar',
  label: 'Solar system',
  hint: 'A sun with planets on real elliptical orbits. The particles chasing each planet never catch it, and the lag smears them into visible orbital rings.',
  start(scene) {
    scene.setFormationOffset(0, 0);
    // Low membership is what keeps the rings *rings*: give the springs more
    // of the field and the smears widen until neighbouring orbits merge into
    // one solid disc.
    scene.setFormationParticipation(0.13);
    // The sun's disc is the app's second-densest hold after the supernova
    // core; at theme bloom it floods the inner orbits.
    scene.setPresetBloom(0.3);
    scene.setTargetDrawer(solarDrawer());
    scene.setTextFormation(true);
    return {
      stop(s) {
        s.setTextFormation(false); // fires the usual scatter + shockwave
        s.setTargetDrawer(null);
        s.setPresetBloom(null);
      },
    };
  },
};

/* ══════════ DNA helix ══════════ */

const dnaPreset: PresetDef = {
  id: 'dna',
  label: 'DNA helix',
  hint: 'A double helix with rungs, turning a notch at a time. The stop-motion is the point: at any continuous rate the springs never catch the strands and it fills in as a plain cylinder.',
  // Hot enough that a strand lands well inside the frame it is held for.
  simSpeed: 2.2,
  start(scene) {
    scene.setFormationOffset(0, 0);
    // Two thin strands and a ladder: sparse, or they overlap into one bar.
    scene.setFormationParticipation(0.22);
    scene.setTargetDrawer(dnaDrawer());
    scene.setTextFormation(true);
    return {
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
      },
    };
  },
};

/* ══════════ Hourglass ══════════ */

const hourglassPreset: PresetDef = {
  id: 'hourglass',
  label: 'Hourglass',
  hint: 'The field pours through a neck, piles up, and the glass turns over. No sand physics anywhere — the particles walk down through the stream because of the order the targets are dealt in.',
  start(scene) {
    let t = 0;
    let phase = -1;
    scene.setFormationOffset(0, 0);
    // Sand is a solid and has to read as one, so this is a high membership by
    // the standards of this file — but the pile is the densest thing any of
    // these presets draws, so the bloom is pinned hard to go with it.
    scene.setFormationParticipation(0.5);
    scene.setPresetBloom(0.14);
    scene.setTargetDrawer(hourglassDrawer());
    scene.setTextFormation(true);
    return {
      update(s, dt) {
        t += dt;
        // Flush the trails across each flip: for a second and a bit every
        // particle's rank means something different and the whole mass tumbles
        // at once, which smears white if the afterimage is left alone.
        const flipping = t % HOURGLASS_CYCLE >= HOURGLASS_POUR;
        const id = Math.floor(t / HOURGLASS_CYCLE) * 2 + (flipping ? 1 : 0);
        if (id !== phase) {
          phase = id;
          if (flipping) s.kickTrails(0.4, 1500);
        }
      },
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
        s.setPresetBloom(null);
      },
    };
  },
};

/* ══════════ Fireworks ══════════ */

const fireworksPreset: PresetDef = {
  id: 'fireworks',
  label: 'Fireworks',
  hint: 'Shells climb the stage one after another, arc, and burst — each one taking the field up with it and throwing it back out. Every bang is a real shockwave, fired where the shell opened.',
  start(scene) {
    let t = 0;
    let loopStart = 0;
    let next = 0;
    scene.setFormationOffset(0, 0);
    scene.setFormationParticipation(0.26);
    scene.setPresetBloom(0.45);
    scene.setTargetDrawer(fireworksDrawer());
    scene.setTextFormation(true);
    return {
      update(s, dt) {
        t += dt;
        // Bursts are listed in launch order, so one cursor walks the list and
        // resets with the loop. Kept well under the ~0.08 that would release
        // the formation hold outright: the shockwave is there to throw the
        // petals apart, not to hand the whole membership back mid-display.
        while (next < FIREWORKS_BURSTS.length && t >= loopStart + FIREWORKS_BURSTS[next].at) {
          const b = FIREWORKS_BURSTS[next++];
          s.shockwave(0.05, b.x, b.y);
        }
        if (t >= loopStart + FIREWORKS_LOOP) {
          loopStart += FIREWORKS_LOOP;
          next = 0;
        }
      },
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
        s.setPresetBloom(null);
      },
    };
  },
};

/* ══════════ Clock ══════════ */

const clockPreset: PresetDef = {
  id: 'clock',
  label: 'Clock',
  hint: 'A working analog clock: the field is telling you the actual time. Nothing moves between ticks, so the particles settle completely and the dial holds crisp.',
  start(scene) {
    scene.setFormationOffset(0, 0);
    scene.setFormationParticipation(0.3);
    scene.setTargetDrawer(clockDrawer());
    scene.setTextFormation(true);
    return {
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
      },
    };
  },
};

/* ══════════ Heartbeat ══════════ */

const heartbeatPreset: PresetDef = {
  id: 'heartbeat',
  label: 'Heartbeat',
  hint: 'An EKG trace with a bolus of light running along it, and a shockwave fired on every QRS spike. The lag behind the sweep is the phosphor tail.',
  start(scene) {
    let t = 0;
    let beat = -1;
    scene.setFormationOffset(0, 0);
    // A single thin line: the sparsest membership here, or the trace lights up
    // as one solid bar and the spikes vanish inside it.
    scene.setFormationParticipation(0.16);
    scene.setPresetBloom(0.16);
    scene.setTargetDrawer(ekgDrawer());
    scene.setTextFormation(true);
    return {
      update(s, dt) {
        t += dt;
        const i = Math.floor(t / EKG_BEAT);
        if (i !== beat && (t % EKG_BEAT) / EKG_BEAT >= EKG_R_PHASE) {
          beat = i;
          const at = ekgSpikeAt(i);
          s.shockwave(0.06, at.x, at.y);
        }
      },
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
        s.setPresetBloom(null);
      },
    };
  },
};

/* ══════════ Möbius strip ══════════ */

const mobiusPreset: PresetDef = {
  id: 'mobius',
  label: 'Möbius',
  hint: 'A strip turning through its own twist, a notch at a time. Follow the edge and it goes round twice before it closes — there is no second side to find.',
  simSpeed: 2.2,
  start(scene) {
    scene.setFormationOffset(0, 0);
    // Ribs and one edge: line-work, so the same sparse membership the knot uses.
    scene.setFormationParticipation(0.2);
    scene.setTargetDrawer(mobiusDrawer());
    scene.setTextFormation(true);
    return {
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
      },
    };
  },
};

/* ══════════ Ocean ══════════ */

const oceanPreset: PresetDef = {
  id: 'ocean',
  label: 'Ocean',
  hint: 'A sine swell seen at a low angle, crests steepening and breaking into foam. Broad and thin, so it is the one scene here that takes most of the field without blooming out.',
  start(scene) {
    scene.setFormationOffset(0, 0);
    // The exception to every other participation number in this file: the
    // shape is a dozen long profile lines, so there is room for the field.
    scene.setFormationParticipation(0.42);
    // Even so, the water never settles (every row moves every frame), and a
    // line that never settles is a line the trail pass keeps re-adding.
    scene.setPresetBloom(0.1);
    scene.setTargetDrawer(oceanDrawer());
    scene.setTextFormation(true);
    return {
      stop(s) {
        s.setTextFormation(false);
        s.setTargetDrawer(null);
        s.setPresetBloom(null);
      },
    };
  },
};

export const PRESETS: PresetDef[] = [
  supernovaPreset,
  knotPreset,
  solarPreset,
  dnaPreset,
  hourglassPreset,
  fireworksPreset,
  clockPreset,
  heartbeatPreset,
  mobiusPreset,
  oceanPreset,
];

export function findPreset(id: string | null): PresetDef | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}
