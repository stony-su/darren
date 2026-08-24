# Particle modes & presets

Design notes for the Modes page (the ✦ button beside the gear). Everything on
both lists is now built; the "notes" column has been rewritten as it went, so
each row records what the idea actually cost rather than what it was expected
to. Add a new one to the bottom of a table.

Two different things live there:

- **Modes** rewire the physics every particle runs under, and leave it rewired.
  No timeline — it is the field's behaviour until you switch it back.
  Registry: `src/animation/modes.ts`, implementation in the GPGPU sim
  (`src/shaders/ss-curl.glsl`) and the render shaders.
- **Presets** are choreography: they drive the existing formation / shockwave /
  bloom machinery on a timeline, and every run plays out the same way. They sit
  on top of whichever mode is active. Registry: `src/animation/presets.ts`,
  shapes in `src/animation/IntroChoreography.ts`.

✅ = shipped. Each mode's registry entry also declares two things the scene
needs from it: `dense` (how hard it concentrates the field, which scales the
bloom / trail / glow compensation) and `flow` (whether its particles travel
smooth coherent paths, which picks the render rig and the brightness cut).

## Modes

| | Mode | Idea | Notes from building it |
|---|---|---|---|
| 1 | **Strange attractor** ✅ | The field becomes the Lorenz system: particles ride its flow, winding out one lobe of the butterfly, flipping to the other, never repeating. | Shipped. See the constraints section below — most of them were learned here. |
| 2 | **Black hole** ✅ | The pointer becomes a gravity well: tangential capture into an accretion disc, an event horizon that eats particles and respawns them at the rim. | Shipped. Respawn turned out not to need a dodge — see "Teleports need a flag" below. |
| 3 | **Minimal surface** ✅ | Gradient-descend onto a gyroid isosurface (`sin x cos y + sin y cos z + sin z cos x = 0`) — particles trapped on an infinite glowing labyrinth. | Shipped. The density trap is handled by spreading the population across a band of iso levels (each particle settles on its own nearby level set, so the labyrinth is a soft shell, not a razor sheet), plus the same bloom/glow/trail dimming the other concentrating modes use. |
| 4 | **Crystal lattice** ✅ | Particles snap to the nearest point of a 3D grid; motion quantizes and the field freezes into a shimmering solid that slowly re-tunes. | Shipped. A bare `round()` stacks every particle in a cell onto one point — the density trap at its worst — so each particle keeps a fixed jitter offset inside its node and every node is a small glittering cluster. The breathing pitch also does the re-tuning for free: cell boundaries sweep past edge particles, which hop to a new nearest node. |
| 5 | **Charged** ✅ | Half the field positive, half negative; opposites attract, likes repel, and the population knits itself into filament arcs. | Shipped, via the fixed-texel approximation: a 6x4 grid of texels is sampled as roving macro-charges (a particle's live position + a fixed random sign), and every particle feels only those 24. Sign comes from `rand(uv)` rather than the target texture's `w` — `t_target` is unbound until the first formation runs. |
| 6 | **Galaxy** ✅ | Differential rotation about a core — inner particles orbit faster, so spiral arms emerge from shear alone, no arm ever authored. | Shipped, but not by shear: shear has nothing to pull on in a smooth disc. The arms are Lindblad's kinematic density wave — every particle rides a slightly oval orbit, each oval turned a little further round than the one inside it, and the arms are where they crowd. Three things had to be true at once; see "Steering lags, and the lag points outward" below. |
| 7 | **Murmuration** ✅ | Boids: separation, alignment, cohesion — the field behaves like a flock of starlings. | Shipped via the filament trick: each 64-texel chain is one flock, and because a flock stays together in the air its members really are each other's spatial neighbours. Six are sampled per particle (a different six each, so the flock stays coupled). The rules are summed, normalized, and flown at a fixed airspeed — a bird answers its neighbours by turning, and a flock that varies its speed comes apart into a cloud. |
| 8 | **Aurora** ✅ | Particles confined to vertical curtains that ripple on a travelling wave, folding and unfolding across the stage. | Shipped, and the `x = f(z, t)` note was right: seen from the camera a sheet is edge-on, so its whole depth projects onto a band and piles up into a bright line wherever `f` turns around. Those caustics are the folds. Hence the standing component — a purely travelling wave's turning points move with it and never make a fold. Rays re-emit at the foot of the curtain on their own fixed ceiling, which is what thins the population out with height. |
| 9 | **Dipole** ✅ | A magnetic dipole's arcing field lines, pole to pole. | Shipped. The poles are handled by the physics that handles them in reality: each particle carries a fixed mirror latitude and is turned around before it gets there, exactly as trapped particles are in the radiation belts. Also confined to a slab near the screen plane — the field is axisymmetric so it costs nothing, and without it the lines fan through every azimuth at once and project into an unreadable vortex. |
| 10 | **Sediment** ✅ | Gravity plus terminal velocity plus wind shear — the whole field falls, drifts and settles like snow against an invisible floor. | Shipped, and the wind uniform did most of it. Particles don't collide, so a bare floor stacks the population into a flat sheet: each grain instead holds a fixed slot in the bank, under a dune profile that gives its top some shape. Nothing tracks how long a grain has rested either, so the lift back into the sky is a dice roll re-thrown a few times a second. |

## Presets

| | Preset | Idea | Notes from building it |
|---|---|---|---|
| 1 | **Supernova** ✅ | A star gathers out of the field, strains, detonates in an expanding shell — then the debris falls back together and does it again. | Shipped. 7.6s loop on a beat sheet. |
| 2 | **Trefoil knot** ✅ | The field ties itself into a woven trefoil and holds it. | Shipped (was the Playground's Gather toggle; a saved `gather: true` migrates to it). |
| 3 | **Solar system** ✅ | A sun with planets on real elliptical orbits; particles chasing the moving planets smear into visible orbital rings. | Shipped. Real Kepler ellipses (mean anomaly → eccentric anomaly by fixed-point iteration), sun at the focus, periods on T ∝ a^1.5 so the inner planets visibly lap the outer. Participation 0.1 and bloom pinned to 0.3 keep the rings rings. |
| 4 | **DNA helix** ✅ | A double helix with rungs, turning slowly. | Shipped, stop-motion as predicted (0.85s held frames). The thing the note missed: the ladder has to run *up* the stage, not across it. See "Rank is very nearly row" below — laid on its side, every turn redealt the whole population along the strands and it drew as one horizontal bar. |
| 5 | **Hourglass** ✅ | The field pours through a neck, piles up, then the glass flips. | Shipped, and it needed no constraint at all — the rank ordering already is one. Sand above the neck, the falling stream, then the pile, in that order down the stage: a particle whose rank lands in the stream band is in the stream, and draining the top walks every rank down through the neck on its own. Areas conserve by construction (the bulbs are cones, so the two sand surfaces are mirror images). No glass is drawn: a frame's ranks shift every time the sand above them redistributes, and particles hop between frame and sand for the whole pour. |
| 6 | **Fireworks** ✅ | Shells launch on a stagger, arc, and burst — several in flight at once. | Shipped one shell at a time, and that is forced rather than lazy. With several alight, a burst opening high up shifts the rank of every pixel below it and the whole population stampedes sideways — it drew one diagonal white streak. One shell means the ranks describe that shell alone, so the rising comet's particles are the ones that go out with its petals. Bursts fire a real `shockwave()` in sequence, as the note suggested. |
| 7 | **Clock** ✅ | A working analog clock. The particle field tells you the actual time. | Shipped, and it is the cheapest as billed — but the seconds are a bead running the rim, not a hand. A full second hand is a twentieth of the dial, and swinging it once a second drags the population a twentieth of the way round the ranking: a permanent comb of particles migrating vertically. A bead is under one percent and the dial holds still. |
| 8 | **Heartbeat** ✅ | An EKG trace sweeping across the stage, with a shockwave fired on every QRS spike. | Shipped with a static trace and a vertical sweep bar, which is the only sweep that leaves the ranks alone: the bar adds the same number of pixels to every row it crosses wherever it is. Thickening the trace at the cursor (tried first) piles pixels into the rows the trace already owns and slides the whole population along the strip. The pulse comes from the shockwave. |
| 9 | **Möbius** ✅ | A strip turning through its own twist, so the surface visibly has one side. | Shipped, though `knotDrawer`'s weave could not be reused directly — it splits a curve into two layers, and a surface crossing itself needs a real depth sort. What is reused is the punch: quads are drawn far to near, each cutting a gap along its own two long edges first. Only the long edges, never the short ones shared along the ribbon, or the band comes apart into slats. The band is split down its midline, or a solid ribbon reads as a plain annulus. |
| 10 | **Ocean** ✅ | A sine-swell surface seen at a low angle, with crests that steepen and break. | Shipped, and the note was right about membership — 0.42, the highest here after the hourglass. Faking the perspective by hand drew a mountain range; it takes an actual pinhole projection (rows placed geometrically in depth, sampled evenly across the *screen* and projected back out to the water) before it reads as sea. Gerstner rather than plain sines, so the crests sharpen and the sampling crowds along them. |

## Constraints worth knowing before building one

Learned the hard way; the code carries the same notes at the relevant lines.

- **Density is the enemy.** A fixed particle budget concentrated onto a thin
  manifold or a compact shape overlaps into bloom-white. Spread wide, lower
  `formationParticipation`, or cut brightness at the source. Theme 0 colours
  particles by their normals, which bypasses the `uFormationGlow` guard
  entirely — so a mode that needs dimming has to do it in `fs-snake.glsl`,
  which is what the registry's `flow` flag buys (it feeds `uFlow`, the one
  uniform both render shaders read). A mode that packs the field onto coherent
  *paths* wants that cut; one that merely packs it into a small volume is
  handled by the `dense` weight scene-side.
- **Static targets settle, moving targets blur.** Particle springs chase; a
  target that moves every frame is never reached, and the shape fills its own
  convex hull. Draw a preset's shape identically every frame unless the smear
  *is* the effect (orbits, EKG tails).

- **Rank is very nearly row, and it is the whole of a preset's design.**
  `rasterizeTargets` scans lit pixels top to bottom and hands particle *i* the
  one at a fixed fraction `assignRand[i]` into that list. So a particle's rank
  is, to a good approximation, its row on the stage — and every drawing
  decision is really a decision about ranks:

  - Anything that changes the pixel count in one band of rows *renumbers every
    row below it*, and every particle down there slides. Since ranks run down
    the rows, the slide is vertical, and a formation quietly combed through
    with vertical streaks is always this. It cost the clock's second hand, the
    heartbeat's travelling bolus, and simultaneous fireworks.
  - Which means motion is free if it stays inside a row: the DNA helix turns by
    moving each particle along its own rung, and the EKG's sweep bar adds the
    same count to every row it crosses. Both animate as much as anything here
    and neither disturbs the ranking.
  - It also means the ordering can do real work. The hourglass pours with no
    physics whatsoever: draw the upper sand, the stream, then the pile, in that
    order down the stage, and draining the top walks each rank down through the
    neck by itself.
  - Keep the total lit area roughly constant while things move. Membership is
    dealt by lit pixel, so a shape that draws a fifth as much at one moment as
    at another packs five times the particles onto every pixel it has left. The
    fireworks shells are sized to a fixed pixel budget for exactly this reason.

- **Steering lags, and on a curve the lag points outward.** Every mode that
  steers (`mix(vel, vTarget, ~0.2)`) leaves the velocity a handful of frames
  behind the direction it is chasing, and a few frames behind a tangent is a
  chord. The tighter the turn the worse it gets, until particles leave the path
  faster than anything can pull them back — which draws as a clean hole where
  the structure is tightest. The galaxy's bulge and the middle of the dipole's
  belt were both missing for this reason. Three answers, all in use: aim inward
  of the tangent by the angle the lag costs (galaxy), steer harder where the
  curvature is high (dipole, at 0.45), and slow the inner region down —
  solid-body rotation inside the galaxy's core is the honest rotation curve
  *and* it caps the turn rate.
- **Shock strength is not linear in what you see.** Above ~0.08 a shockwave
  releases the formation hold (`arrive`), and the settle damping that was
  absorbing it goes too — so a "quiver" becomes a detonation. Shock force also
  scales with the sim clock, so a preset running hot needs a smaller number for
  the same result.
- **Swirl lines do not compose with anything.** A 64-particle chain is about as
  long as a whole formation, so the followers wrap across it and smear it.
  Every mode ends up suppressing them, so `applyLine` now just asks whether a
  mode is running at all. Murmuration is the interesting case: it *keeps* the
  chain topology, as flock membership, and still has to turn the drawing off.
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
  respawn wherever you like. Three modes now do: the black hole's horizon, the
  aurora's spent rays, and sediment's bank. They share one `warped` / `warpPos`
  pair at the top of `main()`.

- **Nothing stores per-particle state, and mostly it does not need to.** There
  are only two positions and a `w` flag. Everything else is either a fixed draw
  off `uv` (a lattice node's jitter, a curtain index, a mirror latitude, a slot
  in the sediment bank — all stable forever because `rand(uv)` is), or it is
  read back out of the velocity (the dipole's travel direction along a field
  line), or it is a dice roll re-thrown on a `floor(uTime * rate)` seed
  (sediment's lift). Reach for those three before concluding a mode needs
  state it cannot have.

- **What you see is not always the constant you named.** The black hole's
  visible shadow is roughly eight times its event horizon: the dark centre is
  drawn by the *plunge* term sweeping the inner region clean, not by the radius
  at which particles are actually eaten. Before tuning a constant, check that it
  is the one producing the thing on screen.

- **Concentrating modes leave a mess behind them.** Switching Chaos back on
  hands the field back packed into a fraction of the stage and still flying
  along coherent paths, and curl noise alone takes ten seconds or more to
  spread it out — during which a glowing theme blooms white. Fixed in
  `setMode`: leaving any mode fires the existing release burst (`this.burst =
  1`, a curl scatter plus a push into the depth fog) and `kickDamp`s the
  trails, the same pair `setTextFormation` uses when a held formation lets go.
  The gyroid made this unavoidable — it packs the whole population into a thin
  z-slab, the densest hand-back of any of them.

- **A mode also has to be given time to arrive.** `MODE_SETTLE_MS` is how long
  the trails stay flushed on the way in, and it is per mode because the spread
  is wide: the gyroid and the lattice condense in under two seconds (every
  particle already sits within half a cell of somewhere to settle), while the
  black hole and the dipole take nearly four, because both have to haul the
  corners of the stage inward before their structure exists at all.
