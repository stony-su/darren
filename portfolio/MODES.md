# Particle modes & presets

Backlog and design notes for the Modes page (the ✦ button beside the gear).

Two different things live there:

- **Modes** rewire the physics every particle runs under, and leave it rewired.
  No timeline — it is the field's behaviour until you switch it back.
  Registry: `src/animation/modes.ts`, implementation in the GPGPU sim
  (`src/shaders/ss-curl.glsl`) and the render shaders.
- **Presets** are choreography: they drive the existing formation / shockwave /
  bloom machinery on a timeline, and every run plays out the same way. They sit
  on top of whichever mode is active. Registry: `src/animation/presets.ts`,
  shapes in `src/animation/IntroChoreography.ts`.

✅ = shipped.

## Modes

| | Mode | Idea | Notes for building it |
|---|---|---|---|
| 1 | **Strange attractor** ✅ | The field becomes the Lorenz system: particles ride its flow, winding out one lobe of the butterfly, flipping to the other, never repeating. | Shipped. See the constraints section below — most of them were learned here. |
| 2 | **Black hole** ✅ | The pointer becomes a gravity well: tangential capture into an accretion disc, an event horizon that eats particles and respawns them at the rim. | Shipped. Respawn turned out not to need a dodge — see "Teleports need a flag" below. |
| 3 | **Minimal surface** ✅ | Gradient-descend onto a gyroid isosurface (`sin x cos y + sin y cos z + sin z cos x = 0`) — particles trapped on an infinite glowing labyrinth. | Shipped. The density trap is handled by spreading the population across a band of iso levels (each particle settles on its own nearby level set, so the labyrinth is a soft shell, not a razor sheet), plus the same bloom/glow/trail dimming the other concentrating modes use. |
| 4 | **Crystal lattice** ✅ | Particles snap to the nearest point of a 3D grid; motion quantizes and the field freezes into a shimmering solid that slowly re-tunes. | Shipped. A bare `round()` stacks every particle in a cell onto one point — the density trap at its worst — so each particle keeps a fixed jitter offset inside its node and every node is a small glittering cluster. The breathing pitch also does the re-tuning for free: cell boundaries sweep past edge particles, which hop to a new nearest node. |
| 5 | **Charged** ✅ | Half the field positive, half negative; opposites attract, likes repel, and the population knits itself into filament arcs. | Shipped, via the fixed-texel approximation: a 6x4 grid of texels is sampled as roving macro-charges (a particle's live position + a fixed random sign), and every particle feels only those 24. Sign comes from `rand(uv)` rather than the target texture's `w` — `t_target` is unbound until the first formation runs. |
| 6 | **Galaxy** | Differential rotation about a core — inner particles orbit faster, so spiral arms emerge from shear alone, no arm ever authored. | Tangential velocity ∝ 1/√r with a soft core. The arms only appear if particles keep their radius, so radial damping matters more than the tangential term. |
| 7 | **Murmuration** | Boids: separation, alignment, cohesion — the field behaves like a flock of starlings. | Needs neighbours, which GPGPU makes awkward: texture-space neighbours are unrelated in world space. Either a spatial hash pass or borrow the filament trick and treat each 64-texel chain as one flock. |
| 8 | **Aurora** | Particles confined to vertical curtains that ripple on a travelling wave, folding and unfolding across the stage. | Confine to `x = f(z, t)` sheets; the beauty is in the fold, so the wave needs both a travelling and a standing component. Pairs well with the blizzard theme. |
| 9 | **Dipole** | A magnetic dipole's arcing field lines, pole to pole. | Closed-form field, trivially cheap. Risk: field lines converge hard at the poles, which is two very dense points — cap the speed near them or they bloom out. |
| 10 | **Sediment** | Gravity plus terminal velocity plus wind shear — the whole field falls, drifts and settles like snow against an invisible floor. | Nearly free: the wind uniform already exists. Needs a floor plane and a re-emit at the top — the black hole's respawn flag is the machinery for it, already built. |

## Presets

| | Preset | Idea | Notes for building it |
|---|---|---|---|
| 1 | **Supernova** ✅ | A star gathers out of the field, strains, detonates in an expanding shell — then the debris falls back together and does it again. | Shipped. 7.6s loop on a beat sheet. |
| 2 | **Trefoil knot** ✅ | The field ties itself into a woven trefoil and holds it. | Shipped (was the Playground's Gather toggle; a saved `gather: true` migrates to it). |
| 3 | **Solar system** ✅ | A sun with planets on real elliptical orbits; particles chasing the moving planets smear into visible orbital rings. | Shipped. Real Kepler ellipses (mean anomaly → eccentric anomaly by fixed-point iteration), sun at the focus, periods on T ∝ a^1.5 so the inner planets visibly lap the outer. Participation 0.1 and bloom pinned to 0.3 keep the rings rings. |
| 4 | **DNA helix** | A double helix with rungs, turning slowly. | Two sine strands plus ladder rungs. Rotation has to be stop-motion (discrete held frames), not continuous, or the springs never settle and it blurs into a cylinder. |
| 5 | **Hourglass** | The field pours through a neck, piles up, then the glass flips. | Wants a real constraint (funnel walls + gravity), so it is half preset, half mode — probably built as a mode with a flip on a timer. |
| 6 | **Fireworks** | Shells launch on a stagger, arc, and burst — several in flight at once. | Multiple simultaneous shockwave centres, which the sim does not have (one `shockCenter`). Either add a small array of centres or fake it by firing them in sequence. |
| 7 | **Clock** | A working analog clock. The particle field tells you the actual time. | Charming and legible: hands move in discrete ticks, which is exactly the static-target behaviour the springs want. Cheapest preset on this list. |
| 8 | **Heartbeat** | An EKG trace sweeping across the stage, with a shockwave fired on every QRS spike. | The sweep is a moving target, so it will smear — which reads as the trace's phosphor tail. Sync `shockwave()` to the spike. |
| 9 | **Möbius** | A strip turning through its own twist, so the surface visibly has one side. | Needs the same over/under weave logic the trefoil drawer already implements — reuse `knotDrawer`'s run-splitting. |
| 10 | **Ocean** | A sine-swell surface seen at a low angle, with crests that steepen and break. | Broad and thin, so it is one of the few shapes that can take high participation without blooming. |

## Constraints worth knowing before building one

Learned the hard way; the code carries the same notes at the relevant lines.

- **Density is the enemy.** A fixed particle budget concentrated onto a thin
  manifold or a compact shape overlaps into bloom-white. Spread wide, lower
  `formationParticipation`, or cut brightness at the source. Theme 0 colours
  particles by their normals, which bypasses the `uFormationGlow` guard
  entirely — so a mode that needs dimming has to do it in `fs-snake.glsl`.
- **Static targets settle, moving targets blur.** Particle springs chase; a
  target that moves every frame is never reached, and the shape fills its own
  convex hull. Draw a preset's shape identically every frame unless the smear
  *is* the effect (orbits, EKG tails).
- **Shock strength is not linear in what you see.** Above ~0.08 a shockwave
  releases the formation hold (`arrive`), and the settle damping that was
  absorbing it goes too — so a "quiver" becomes a detonation. Shock force also
  scales with the sim clock, so a preset running hot needs a smaller number for
  the same result.
- **Swirl lines do not compose with everything.** A 64-particle chain is about
  as long as a whole formation, so the followers wrap across it and smear it.
  Attractor mode suppresses lines for exactly this reason; assume a new mode
  will need to decide the same question.
- **Hand the sim speed back before releasing a formation.** A preset's release
  blast scales with whatever speed is in force when it lands, and the knot runs
  at 10x.

- **Teleports need a flag.** Velocity is not stored anywhere: it is the
  difference between the two position buffers. So any mode that *writes* a
  position instead of integrating one — a respawn, a re-emit, a wrap — hands
  the next frame a stage-crossing step, which the sim reads as an enormous
  velocity and the vertex rig draws as a stretched, glowing streak. The
  position texture's `w` channel was unused, so it now carries 1 for an
  integrated position and 0 for a written one; `ss-curl.glsl` and
  `vs-snake.glsl` both drop the delta across a 0. This is the general fix, and
  the reason the "wrap position instead of reseeding" dodge is unnecessary —
  respawn wherever you like.

- **What you see is not always the constant you named.** The black hole's
  visible shadow is roughly eight times its event horizon: the dark centre is
  drawn by the *plunge* term sweeping the inner region clean, not by the radius
  at which particles are actually eaten. Before tuning a constant, check that it
  is the one producing the thing on screen.

- **Concentrating modes leave a mess behind them.** Switching Chaos back on
  hands the field back packed into a fraction of the stage and still flying
  along coherent paths, and curl noise alone takes ten seconds or more to
  spread it out — during which a glowing theme blooms white. Fixed in
  `setMode`: leaving any concentrating mode fires the existing release burst
  (`this.burst = 1`, a curl scatter plus a push into the depth fog) and
  `kickDamp`s the trails, the same pair `setTextFormation` uses when a held
  formation lets go. The gyroid made this unavoidable — it packs the whole
  population into a thin z-slab, the densest hand-back of the three.
