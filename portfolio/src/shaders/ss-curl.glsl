uniform sampler2D t_oPos;
uniform sampler2D t_pos;

uniform float dT;
uniform float noiseSize;
uniform float exclusionRadius;
uniform vec3  mousePos;
uniform float mouseForce;
uniform vec2  resolution;

uniform sampler2D t_target;
uniform float targetStrength;
uniform float formationHold; // spring gate: tracks targetStrength in, snaps to 0 on release
uniform float formationParticipation; // fraction of particles that join a formation

uniform vec3  cardCenter;
uniform vec2  cardHalfSize;
uniform float cardRadius;
uniform float cardStrength;

uniform vec3  windDir;
uniform float burstStrength;

uniform vec3  shockCenter;
uniform float shockStrength;

uniform float uTime;
uniform float lineStrength;
uniform float attractorStrength; // 0 = curl chaos, 1 = Lorenz strange attractor
uniform float holeStrength; // 0 = curl chaos, 1 = black hole owns the field
uniform vec3  holeCenter;   // world-space gravity well (the eased pointer)
uniform float surfaceStrength; // 0 = curl chaos, 1 = gyroid minimal surface
uniform float latticeStrength; // 0 = curl chaos, 1 = crystal lattice
uniform float chargedStrength; // 0 = curl chaos, 1 = two-sign plasma
uniform float galaxyStrength;  // 0 = curl chaos, 1 = differentially rotating disc
uniform float murmurStrength;  // 0 = curl chaos, 1 = boid flocks
uniform float auroraStrength;  // 0 = curl chaos, 1 = rippling curtains
uniform float dipoleStrength;  // 0 = curl chaos, 1 = magnetic dipole
uniform float sedimentStrength;// 0 = curl chaos, 1 = falling / settling snow
// Rolled up scene-side so the shader never has to spell the whole roster out:
// anyMode is the largest of the strengths above, flowStrength the largest
// among the modes that move particles along smooth coherent paths.
uniform float anyMode;
uniform float flowStrength;

varying vec2 vUv;

// Chain length for filament-line mode (particles per line)
#define CHAIN 64.0

// Lorenz strange attractor (classic sigma/rho/beta — the butterfly). LZ_SCALE
// is world units per Lorenz unit; the attractor spans roughly +/-20 in x and
// 0..50 in z, so 0.04 fills the stage height with margin. LZ_ZC re-centers
// that z range on the world origin, and LZ_DEPTH squashes the attractor's
// remaining axis into screen depth so the silhouette stays the recognizable
// butterfly instead of an edge-on smear.
#define LZ_SIGMA 10.0
#define LZ_RHO   28.0
#define LZ_BETA  2.6666667
// Sized well under the frustum on purpose: particles lag the flow through
// every turn, so the cloud settles onto a manifold noticeably fatter than the
// ideal curve, and a scale that fits on paper overflows the frame in motion.
#define LZ_SCALE 0.030
#define LZ_ZC    25.0
// Depth is mapped 1:1 with the other two axes rather than squashed: flattening
// the attractor toward the screen plane is what turns it from a butterfly into
// a filled violet blob. At full depth the wings tilt through ~1.3 world units
// of z, so perspective and the depth fade separate the near wing from the far
// one and the structure reads.
#define LZ_DEPTH 1.0
#define LZ_CRUISE 0.0095

// Black hole. Speeds below are world units per frame at 60fps / 1x sim speed;
// they get the frame step and the per-particle draw applied at the use site.
// The stage is roughly 4.5 x 2.5 world units at z=0, so a rim at 1.45 fills
// the frame's height and leaves the corners to the free field.
#define BH_RIM     1.45
// Where particles are actually eaten. Much smaller than the shadow you see —
// see the note on the plunge term for which one draws the black centre.
#define BH_HORIZON 0.085
// Softening radius for the orbit law. Without it v ~ 1/sqrt(r) runs away as
// r -> 0 and the last ring before the horizon steps further per frame than it
// is wide, which draws as a scribble rather than a ring.
#define BH_CORE    0.16
#define BH_ORBIT   0.0135
#define BH_INFALL  0.0026
// Disc axis: mostly toward the camera, tilted ~23 degrees off it. Face-on the
// disc is a flat ring with no depth to read; edge-on it is a line. This much
// tilt shows it as an ellipse, and puts the far half far enough back that the
// depth fade separates it from the near half. BH_U/BH_V span the disc plane
// (BH_V = cross(BH_N, BH_U)) and are only used to place respawns on the rim.
#define BH_N vec3(0.0, 0.3873, 0.9221)
#define BH_U vec3(1.0, 0.0, 0.0)
#define BH_V vec3(0.0, 0.9221, -0.3873)

// Gyroid minimal surface: F(q) = sin x cos y + sin y cos z + sin z cos x = 0.
// GY_FREQ is radians per world unit, so one cell spans 2π/GY_FREQ ≈ 1.65
// world units — between two and three cells across the stage width, which is
// enough for the labyrinth to read as one without shrinking its walls into
// texture.
#define GY_FREQ   3.8
// Tangential wander speed (world units per frame at 60fps / 1x). Fast enough
// that particles visibly *stream* along the walls — their motion-stretch and
// trails are what draw the sheets as ribbons; at ambient drift speed the same
// population reads as static clutter.
#define GY_CRUISE 0.006
// Cap on the descent speed toward the surface. Everything starts within half
// a cell of *some* sheet, so even at this crawl the labyrinth condenses out
// of the chaos in a couple of seconds.
#define GY_SNAP   0.012

// Crystal lattice. CL_SPACING is the pitch: ~17 nodes across the stage width,
// enough that the grid reads as a structure and each node's share of the
// population stays a glitter, not a floodlight. The pitch breathes ±CL_BREATH
// on a slow sine — nodes drift apart and back, and particles near the edge of
// a cell hop to a new nearest node as the boundaries sweep past them, which
// is the "slowly re-tunes" of the spec.
#define CL_SPACING 0.30
#define CL_BREATH  0.08
#define CL_RATE    0.22
// Each particle holds a fixed offset inside its node, as a fraction of the
// pitch. A bare round() would stack every particle in a cell onto one point —
// the density trap at its absolute worst, hundreds deep on a single pixel.
#define CL_JITTER  0.18

// Charged mode. True n-body is out of reach, so a fixed 6x4 grid of texels is
// sampled as roving macro-charges: each is some particle's live position with
// a fixed random sign, and every particle feels only those 24. The field they
// make is coarse but it *moves* — clusters of one sign herd particles of the
// other, and the population knits into arcs between them.
#define CH_COLS  6.0
#define CH_ROWS  4.0
// Softening length (squared distance floor). Sets the collapse scale: an
// attracted pair orbits inside this radius instead of falling to a point.
#define CH_SOFT  0.09
// Per-sample force scale. The 1/r^2 sum spans orders of magnitude, so this is
// tuned at the terminal-velocity level: near a macro-charge the pull saturates
// against the global drag at roughly the ambient drift speed.
#define CH_FORCE 0.000016

// Galaxy. Orbit speed goes as 1/sqrt(r) about a softened core, so inner rings
// lap the outer ones — differential rotation, and the shear that comes with
// it. Shear alone will not draw an arm out of a smooth disc though: there is
// no overdensity for it to pull on. The arms are where the orbits *crowd*
// instead — every particle rides a slightly oval orbit, and each oval is
// turned a little further round than the one inside it, so neighbouring ovals
// converge along two lanes. That is Lindblad's kinematic density wave, and it
// is also the standard answer to why real arms don't wind themselves shut: the
// lane pattern turns slowly and rigidly while the particles stream through it
// at whatever pace their own radius sets.
#define GX_RADIUS  1.00   // outer edge of the disc, world units
#define GX_CORE    0.28   // where solid-body rotation hands over to Keplerian
#define GX_ORBIT   0.026  // tangential speed at exactly that radius
#define GX_ECC     0.28   // how oval each orbit is; sets the arms' contrast
// Radians of apsidal turn per world unit of radius — i.e. how tightly the arms
// wind. The crowding an oval set produces is broad and smooth, never a thin
// lane, so an arm that only sweeps half a turn across the disc does not read
// as an arm at all: it reads as one of two lobes, and the galaxy comes out
// looking like two discs that collided. It takes better than a full turn
// before the eye calls it a spiral. GX_TWIST * GX_RADIUS is that total sweep,
// in radians.
#define GX_TWIST   8.00
#define GX_PATTERN 0.045  // rigid turn rate of the arm pattern, rad per sim second
// The radial term is a spring onto the particle's own oval, not a free fall:
// the arms only exist while particles ride their ovals, so of the two terms
// this is the one that has to win. Both are sized against the radial speed
// tracking an oval actually needs (2*a*e*omega, a hundredth of a world unit
// per frame or so): set the cap far under it and the ovals are smoothed back
// into circles, the crowding goes, and the arms with it — set it far over and
// the population chases its ovals hard enough to bunch into two lobes and stop
// being a disc at all.
#define GX_PULL    0.06
#define GX_RMAX    0.011
// Disc axis, tilted ~24 degrees off the camera — the same trick, and nearly
// the same angle, as the black hole's accretion plane: face-on the disc has no
// depth to read, edge-on it is a line. GX_U/GX_V span the disc plane.
#define GX_N vec3(0.0, 0.4067, 0.9135)
#define GX_U vec3(1.0, 0.0, 0.0)
#define GX_V vec3(0.0, 0.9135, -0.4067)

// Murmuration. Boids need neighbours, and a GPGPU sim has no way to ask which
// particles are near: texture-space neighbours are unrelated in world space.
// So the filament rig's topology gets borrowed instead of its rendering — the
// same CHAIN-long runs of consecutive texels become flocks, and because a
// flock stays together in the air, its members ARE each other's spatial
// neighbours. MU_SAMPLES of them are read per particle (a different handful
// for each, so the whole flock stays coupled) and the three classic rules run
// over that sample.
#define MU_SAMPLES 6
#define MU_SEP     0.10   // inside this a neighbour is crowding; push off it
#define MU_CRUISE  0.011  // flocks hold a near-constant airspeed
#define MU_TURN    0.10   // how sharply a bird can answer its neighbours
// Rule weights. They only matter against each other — the sum is normalized to
// a direction and flown at MU_CRUISE, which is what keeps a flock a flock
// instead of a cloud that happens to be moving.
#define MU_COHERE  0.9
#define MU_SEPARATE 0.010
#define MU_ALIGN   20.0
// Pull toward the flock's own roost, a point drifting on a slow curl of its
// own. Without it flocks mill in place; with it they cross the stage and the
// local rules only take over once they arrive.
#define MU_ROOST   0.10

// Aurora. Particles are confined to a few vertical curtains: each is a sheet
// x = f(z, t) spanning the full height, and each particle belongs to one sheet
// for good. Seen from the camera a sheet is edge-on, so its whole depth
// projects onto a band — and piles up into a bright line wherever f turns
// around, because there the sheet is momentarily facing the lens. Those
// caustics are the folds, and the folds are the entire effect, which is why
// the ripple carries a travelling *and* a standing component: a purely
// travelling wave slides past like a flag and its turning points never move.
#define AU_CURTAINS 3.0
#define AU_SPREAD   1.25  // half-width the curtains' base positions span
#define AU_TRAVEL   0.42  // amplitude of the travelling ripple
#define AU_STAND    0.30  // amplitude of the standing one
#define AU_KZ       4.4   // ripple wavenumber along depth
#define AU_SPEED    0.5
#define AU_PULL     0.05  // spring onto the sheet
#define AU_RISE     0.0055// upward streaming speed along the curtain
#define AU_BOTTOM  -1.25
#define AU_TOP      1.30
// Depth slab. Shallower than the frustum: past z ~ -0.9 the fog has the
// particles anyway, and the curtain wants to fade out at the back, not stop.
#define AU_ZNEAR   -0.95
#define AU_ZFAR     0.45

// Dipole. B ~ 3(m.r)r - m: closed form, a handful of instructions, and the
// shape everyone has seen in iron filings. Two problems come with it. The
// magnitude goes as 1/r^3, so the field is used for its direction only and the
// speed is a flat cruise (the same steering the attractor uses, for the same
// reason). And the field lines converge to a point at each pole, which would
// stack the population onto two pixels — the density trap in its purest form.
// The fix is the physics that keeps the real radiation belts from raining into
// the poles: a particle spiralling down a converging field is turned around at
// its mirror point. Each one carries a fixed mirror latitude and bounces
// between the two, so the poles brighten instead of swallowing.
#define DP_AXIS   vec3(0.2588, 0.9659, 0.0) // tilted 15deg, like a planet's
#define DP_CRUISE 0.012
#define DP_INNER  0.24    // the "planet": no field line is drawn inside it
#define DP_OUTER  1.15    // past this, particles sink onto smaller shells
#define DP_CROSS  0.0045  // how fast that cross-field drift moves them

// Sediment. Gravity, a terminal velocity, and wind shear that only the high
// air feels: the field falls, drifts, and banks up against an invisible floor.
// Settling is the interesting half. Particles do not collide, so a bare floor
// plane stacks the whole population into one flat sheet — so each particle
// carries a fixed slot in the bank instead (a depth into it, under a dune
// profile that gives its top some shape) and rests there.
#define SD_TERM   0.011   // terminal fall speed
#define SD_SHEAR  0.0016  // horizontal drift, strongest high up
#define SD_FLOOR -1.12
#define SD_PILE   0.34    // thickness of the settled bank
#define SD_EMIT   1.45    // re-emit height, just off the top of the frame
// Nothing tracks how long a grain has rested, so the lift back into the sky is
// a dice roll re-thrown SD_TICK times a second. At these numbers a grain waits
// in the bank about twice as long as it spends falling, which leaves a third
// of the field in the air at any moment and the snowfall never runs out.
#define SD_TICK    2.5
#define SD_RECYCLE 0.055

// -- simplex noise chunk --
%SIMPLEX%

// -- curl noise chunk --
%CURL%

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main(){

  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 oPos = texture2D( t_oPos , uv );
  vec4 pos  = texture2D( t_pos , uv );

  vec3 vel = pos.xyz - oPos.xyz;
  // Velocity is implicit in the two position buffers, so a position that did
  // not come from the one before it — a respawn, a re-emit, a wrap — reads
  // here as a single stage-crossing step. The sim flags such a write by
  // putting 0 in the w channel (1 otherwise); that particle simply restarts
  // from rest, and the field it lands in accelerates it again.
  vel *= step(0.5, pos.w);

  // Any mode that writes a position instead of integrating one parks it here,
  // and the tail of main() applies it and sets the flag. Three do: the black
  // hole eating at its horizon, the aurora re-emitting a spent ray at the foot
  // of its curtain, and sediment lifting a grain out of the bank.
  float warped = 0.0;
  vec3 warpPos = vec3(0.0);

  // Time-based speed multiplier
  float timeScale = dT * 60.0;

  // Filament-chain topology: consecutive texels form follow-the-leader
  // chains of CHAIN particles. Index 0 of each chain is the leader.
  float texW = resolution.x;
  vec2 texel = floor(gl_FragCoord.xy);
  float idx = texel.y * texW + texel.x;
  float posInChain = mod(idx, CHAIN);
  float isLeader = 1.0 - step(0.5, posInChain);
  float chainId = floor(idx / CHAIN);
  float chainRand = rand(vec2(chainId * 0.137, 4.7));
  float follower = lineStrength * (1.0 - isLeader);

  vec3 curl = curlNoise( pos.xyz * noiseSize );
  // Followers in line mode shed most of their individual jitter so the
  // chains stay thin instead of fuzzing back into a cloud.
  vel += curl * .0001 * timeScale * mix(1.0, 0.18, follower);

  // Ambient wind drift (per-slide direction + scroll gusts)
  vel += windDir * 0.00012 * timeScale;

  // Text-formation lookup (needed by the exclusion logic below):
  // only a fraction of particles join the formation; the rest keep flowing so
  // the release never dumps the whole population in one burst. Compact icon
  // slides lower the fraction so the shape stays sparse and colorful instead of
  // overlapping into a bloom-white blob.
  vec4 tgt = vec4(0.0);
  float participate = 0.0;
  float arrive = 0.0;
  if (targetStrength > 0.001) {
    tgt = texture2D(t_target, uv);
    participate = step(tgt.w, formationParticipation);
    // The spring rides `formationHold`, not the raw ramp: on release the hold
    // is zero from the first frame, so the shockwave and the burst scatter the
    // shape in one continuous throw. (The ramp keeps fading — the glow and the
    // depth drift are still tied to it, and snapping those pops.)
    arrive = clamp(formationHold * 1.6 - fract(tgt.w * 7.0) * 0.5, 0.0, 1.0) * participate;
    // A shockwave overrides the formation hold. Without this the settle
    // damping further down (x0.80/frame while arrive is high) eats the kick
    // on the very frames it is strongest, and the shape only swells a little
    // instead of coming apart. The spring returns as the wave fades, which is
    // what pulls the particles back into the next shape.
    arrive *= 1.0 - smoothstep(0.05, 0.45, shockStrength);
  }

  // Center exclusion zone — particles physically repelled from origin.
  // Formation members ignore it (the letters live near the center).
  vec3 toCenter = pos.xyz;
  float dist = length(toCenter);
  if (dist > 0.001) {
    // Every mode is exempt, which is why this reads `anyMode` rather than a
    // list. The attractor owns the middle of the stage (the saddle between its
    // two lobes sits on the origin); the black hole's well is usually parked
    // near it and an origin repulsion punches a hole straight through the
    // inner disc; the gyroid's sheets pass through the origin like everywhere
    // else, and a bald patch in the middle of the labyrinth reads as broken —
    // as does a lattice with its central nodes blown out, a plasma arc bending
    // round an invisible bubble, a galaxy with no core, or a dipole with
    // nothing at the poles.
    float repel = smoothstep(exclusionRadius, 0.0, dist) * (1.0 - arrive)
                  * (1.0 - anyMode);
    vel += normalize(toCenter) * repel * 0.0007 * timeScale;
  }

  // While the text holds, non-participants drift behind the text plane and
  // into the depth fade, leaving the word crisp against a soft mist.
  float freeAgent = targetStrength * (1.0 - participate);
  if (freeAgent > 0.001) {
    float ahead = smoothstep(-0.8, 0.2, pos.z);
    vel += vec3(0.0, 0.0, -0.0012) * ahead * freeAgent * timeScale;
  }

  // Mouse attraction / repulsion (sign of mouseForce)
  if (mouseForce != 0.0) {
    vec3 toMouse = mousePos - pos.xyz;
    float mDist = length(toMouse);
    float influence = 1.0 / (1.0 + mDist * mDist * 8.0);
    vec3 mouseDir = normalize(toMouse);
    vel += mouseDir * mouseForce * influence * 0.0045 * timeScale;
  }

  // Strange-attractor mode: swap the curl field for the flow of the Lorenz
  // system. Every particle steers toward the local field direction, so the
  // whole population converges onto the attractor's manifold and then orbits
  // it forever — winding out one lobe of the butterfly, flipping to the other,
  // never repeating. Steering (a first-order chase toward a target velocity)
  // rather than integrating the raw derivative: the field's magnitude spans two
  // orders of magnitude, and adding that as acceleration flings the outliers
  // off-screen.
  // Placed above the card deflection and below the mouse force on purpose —
  // both of those then push against the settled flow, so the pointer and the
  // slide's copy still carve visible holes in the butterfly instead of being
  // overwritten by it every frame. In filament-line mode only the leaders
  // steer; their chains draw the flow lines behind them.
  if (attractorStrength > 0.001) {
    float lx = pos.x / LZ_SCALE;
    float ly = pos.z / (LZ_SCALE * LZ_DEPTH);
    float lz = pos.y / LZ_SCALE + LZ_ZC;
    vec3 d = vec3(
      LZ_SIGMA * (ly - lx),
      lx * (LZ_RHO - lz) - ly,
      lx * ly - LZ_BETA * lz
    );
    // Back to world axes: Lorenz z is screen-up, its y is screen depth.
    vec3 flow = vec3(d.x, d.z, d.y * LZ_DEPTH) * LZ_SCALE;
    float fl = length(flow);
    vec3 dir = fl > 1e-6 ? flow / fl : vec3(0.0, 1.0, 0.0);
    // Speed tracks the local field magnitude (clamped): particles crawl through
    // the slow saddle in the middle and swoop through the lobe hand-offs, which
    // is what makes the trails read as a flow rather than a moving crowd.
    // timeScale keeps it frame-rate independent (and speed-slider responsive),
    // capped so a 10x sim can't step further than the manifold is thick.
    float cruise = LZ_CRUISE * clamp(fl / 3.0, 0.35, 2.2) * min(timeScale, 4.0);
    vec3 steered = mix(vel, dir * cruise, clamp(0.30 * timeScale, 0.0, 1.0));
    vel = mix(vel, steered, attractorStrength * (1.0 - follower));
  }

  // Black-hole mode: the pointer becomes a gravity well, and the field is
  // captured into an accretion disc. A tangential term winds particles into
  // orbit, a slow radial term spirals them down, and the event horizon eats
  // whatever reaches it and drops it back on the rim.
  // Steered toward a target velocity rather than integrated from a 1/r^2
  // acceleration, for the same reason the attractor is: real gravity spans
  // orders of magnitude across the stage, and the inner particles leave the
  // frame on the first frame. Steering also makes the orbit law something the
  // shader states outright — v ~ 1/sqrt(r), so inner rings visibly shear past
  // outer ones, which is the whole reason the disc reads as a disc and not a
  // ring of confetti.
  if (holeStrength > 0.001) {
    vec3 rel = pos.xyz - holeCenter;
    float r = length(rel);
    vec3 outward = r > 1e-5 ? rel / r : BH_U;

    // Orbit direction: tangent to the circle this particle traces when rotated
    // about the disc axis. Degenerate only for a particle sitting exactly on
    // the axis, which the fallback shoves off it.
    vec3 tang = cross(BH_N, outward);
    float tlen = length(tang);
    tang = tlen > 1e-4 ? tang / tlen : BH_U;

    // A minority of particles are given a far looser disc and become the halo
    // around it. Without them the entire population stacks onto one thin
    // annulus, which is the density trap the rest of this file keeps warning
    // about — and a bare disc reads flatter than a disc with a haze around it.
    float bhRand = rand(uv * 1.93 + vec2(5.7, 2.1));
    float halo = smoothstep(0.70, 1.0, bhRand);

    float vOrb = BH_ORBIT / sqrt(max(r, BH_CORE));
    // Slow drift inward, plunging below r ~ 0.85, plus a hauling term well
    // outside the rim — at the ambient infall rate, switching the mode on
    // spends fifteen seconds reeling in the corners of the stage before
    // anything recognisable appears.
    // The plunge is what draws the black disc at the centre, not BH_HORIZON:
    // particles cross it several times faster than they drift through the
    // disc, so the region inside it stays swept clean and reads as the hole's
    // shadow. Tightening the plunge fills that in and costs the disc its
    // depth — it narrows to a single uniform ring.
    float vIn = BH_INFALL * (0.55
                             + 1.35 * smoothstep(0.85, 0.12, r)
                             + 2.00 * smoothstep(1.5, 3.2, r));

    // Flatten toward the disc plane, but only past a flared half-thickness:
    // driving every particle onto the plane exactly is the whiteout again.
    float h = dot(rel, BH_N);
    float halfH = (0.045 + 0.085 * r) * (1.0 + 5.0 * halo);
    float over = h - clamp(h, -halfH, halfH);

    // Absolute target speeds, so the frame step has to scale them directly
    // (capped, exactly as the attractor's cruise is).
    float bhStep = min(timeScale, 4.0);
    vec3 vTarget = (tang * vOrb - outward * vIn - BH_N * over * 0.12) * bhStep;
    vec3 steered = mix(vel, vTarget, clamp(0.22 * timeScale, 0.0, 1.0));
    vel = mix(vel, steered, holeStrength * (1.0 - follower));

    // Event horizon. Nothing in this sim can write a velocity, so a respawn
    // has to be a bare position write — see the w-channel flag at the top of
    // main(), which is what keeps the teleport from reading as one colossal
    // step here and as a screen-long streak in the vertex rig.
    // Formation members are exempt: a preset holding a shape over the well
    // would otherwise be shredded a particle at a time.
    if (holeStrength > 0.5 && r < BH_HORIZON && arrive < 0.5) {
      float ang = rand(uv * 7.31 + vec2(fract(uTime * 0.31), 1.7)) * 6.28318530718;
      float rr = BH_RIM * (0.88 + 0.24 * rand(uv * 3.77 + vec2(2.3, fract(uTime * 0.17))));
      // Halo particles come back into the halo, or the disc slowly eats it.
      float lift = (rand(uv * 5.13 + vec2(fract(uTime * 0.23), 8.1)) - 0.5)
                   * (0.10 + 1.6 * halo);
      warpPos = holeCenter + (cos(ang) * BH_U + sin(ang) * BH_V) * rr + BH_N * lift;
      warped = 1.0;
    }
  }

  // Minimal-surface mode: the field condenses onto a gyroid isosurface and
  // then wanders along it forever — an infinite glowing labyrinth. The
  // gradient is analytic, so the descent is a handful of instructions: one
  // Newton step gives the signed distance to the sheet, and the curl flow is
  // projected onto the tangent plane so particles explore *along* the surface
  // instead of fighting it. Steered toward a target velocity like the other
  // modes, and for the same reason: the pull must never outrun the wander, or
  // the population stacks onto the sheet and blooms white.
  if (surfaceStrength > 0.001) {
    // A surface is a 2D manifold — the same density trap as the attractor.
    // Each particle gets its own iso level on a band around zero, so the
    // population fills a soft shell of nearby level sets instead of one
    // razor-thin sheet. The band stays well inside ±1.4, where the gyroid's
    // level sets pinch off and the labyrinth falls apart into blobs.
    float iso = (rand(uv * 2.71 + vec2(3.9, 8.4)) - 0.5) * 0.6;
    vec3 q = pos.xyz * GY_FREQ;
    float f = sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x) - iso;
    vec3 grad = vec3(
      cos(q.x) * cos(q.y) - sin(q.z) * sin(q.x),
      cos(q.y) * cos(q.z) - sin(q.x) * sin(q.y),
      cos(q.z) * cos(q.x) - sin(q.y) * sin(q.z)
    );
    // The gradient vanishes on the lattice of points where all three terms
    // peak together; the floor keeps the normal finite there and the Newton
    // step just reports a small distance, which is true enough.
    float invg = inversesqrt(max(dot(grad, grad), 1e-4));
    vec3 n = grad * invg;
    // Newton step to the sheet, converted to world units (chain rule).
    float d = f * invg / GY_FREQ;

    // Wander: the curl field with its normal component removed, so the flow
    // follows the sheet's twists. A lower frequency than the ambient chaos —
    // the walls are ~1.5 world units apart, and noise finer than the cells
    // reads as jitter, not as travel through the labyrinth. The seed drifts
    // slowly: the projection is not divergence-free on the manifold, so a
    // frozen flow herds the population into its stagnation points and the
    // surface goes patchy; sliding the pattern keeps redealing them.
    vec3 flow = curlNoise(pos.xyz * noiseSize * 0.6 + vec3(11.0 + uTime * 0.05, 5.0, 23.0));
    vec3 tang = flow - n * dot(flow, n);
    vec3 tdir = normalize(tang + vec3(1e-6));
    // Per-particle pace spread, so the surface shimmers with relative motion
    // instead of scrolling as one rigid texture.
    float pace = 0.7 + 0.6 * rand(uv * 4.13 + vec2(6.2, 1.8));

    // Descent speed proportional to the distance, capped — far particles
    // approach at the cap, near ones ease in and settle instead of buzzing
    // across the sheet every frame.
    float vSnap = clamp(d * 0.5, -GY_SNAP, GY_SNAP);
    float gyStep = min(timeScale, 4.0);
    vec3 vTarget = (tdir * GY_CRUISE * pace - n * vSnap) * gyStep;
    vec3 gySteered = mix(vel, vTarget, clamp(0.20 * timeScale, 0.0, 1.0));
    vel = mix(vel, gySteered, surfaceStrength * (1.0 - follower));

    // The sheets are infinite and the wander is a random walk along them, so
    // without a recall the population slowly diffuses off-stage for good (the
    // attractor and the hole recirculate by construction; this mode has to be
    // told). Same soft box the swirl lines use: no force inside, springs back
    // past the bounds. The spring is off-surface, but the descent term
    // re-seats returners on the nearest sheet within a second.
    // The z-slab is much thinner than the frustum on purpose: the labyrinth
    // is only legible one layer at a time — give it the full depth and the
    // camera sees three cells of walls stacked on top of each other, which
    // scrambles the structure back into clutter.
    vec3 gyExcess = pos.xyz - clamp(pos.xyz, vec3(-2.6, -1.5, -0.5), vec3(2.6, 1.5, 0.5));
    vel += -gyExcess * vec3(0.0006, 0.0006, 0.0018) * surfaceStrength * timeScale;
  }

  // Crystal-lattice mode: every particle snaps to the nearest point of a 3D
  // grid and freezes there — the only mode with no flow at all. The character
  // change is carried by the damping as much as the spring: motion doesn't
  // reroute, it *stops*, and the field reads as a solid. The pitch breathes
  // on a slow sine, so nodes drift apart and back, and the odd particle at a
  // cell boundary hops to a new nearest node — a crystal slowly re-tuning.
  // No recall box needed: nothing wanders, so nothing leaks off-stage.
  if (latticeStrength > 0.001) {
    float g = CL_SPACING * (1.0 + CL_BREATH * sin(uTime * CL_RATE));
    // Fixed per-particle offset inside the node (see CL_JITTER): each node is
    // a small glittering cluster with volume, not one white point.
    vec3 jitter = (vec3(
      rand(uv * 3.31 + vec2(0.7, 4.2)),
      rand(uv * 5.87 + vec2(8.1, 2.6)),
      rand(uv * 7.43 + vec2(5.5, 9.3))
    ) - 0.5) * g * CL_JITTER * 2.0;
    vec3 node = floor(pos.xyz / g + 0.5) * g + jitter;
    // Spring + hard settle damping, the formation hold's recipe. The spring
    // is soft enough that a re-tune hop is a visible glide between nodes, and
    // the damping is what freezes a particle once it arrives.
    vel += (node - pos.xyz) * 0.045 * latticeStrength * timeScale;
    vel *= mix(1.0, pow(0.82, timeScale), latticeStrength * 0.9);
  }

  // Charged mode: half the field positive, half negative, opposites attract
  // and likes repel. Applied as an accumulated force rather than the other
  // modes' steering, because the interesting structure IS the acceleration —
  // particles falling along field lines, swinging past clusters, knitting
  // into filament arcs between opposite-signed groups. The curl jitter keeps
  // running underneath, which is what stops the arcs from collapsing into a
  // static diagram.
  if (chargedStrength > 0.001) {
    // This particle's sign, from its own fixed random draw. The macro-charge
    // signs below use the same formula at the sample's uv, so a macro-charge
    // is consistent frame to frame even though it rides a moving particle.
    float qi = sign(rand(uv * 9.17 + vec2(2.4, 7.7)) - 0.5);
    vec3 chAcc = vec3(0.0);
    for (int j = 0; j < 24; j++) {
      float fj = float(j);
      vec2 suv = (vec2(mod(fj, CH_COLS), floor(fj / CH_COLS)) + 0.5)
                 / vec2(CH_COLS, CH_ROWS);
      vec3 pj = texture2D(t_pos, suv).xyz;
      float qj = sign(rand(suv * 9.17 + vec2(2.4, 7.7)) - 0.5);
      vec3 to = pj - pos.xyz;
      float d2 = dot(to, to) + CH_SOFT;
      // -qi*qj: opposite signs pull toward pj, like signs push away.
      chAcc += to * (-qi * qj) * inversesqrt(d2) / d2;
    }
    vel += chAcc * CH_FORCE * chargedStrength * timeScale;

    // Like-signed particles near a like-signed cluster are pushed outward
    // with nothing calling them back, so the same soft recall box the other
    // roaming modes use (full frustum depth — the arcs use it).
    vec3 chExcess = pos.xyz - clamp(pos.xyz, vec3(-2.6, -1.5, -0.9), vec3(2.6, 1.5, 0.9));
    vel += -chExcess * vec3(0.0006, 0.0006, 0.0012) * chargedStrength * timeScale;
  }

  // Galaxy mode: a disc turning about its own core. See the GX_ block above for
  // where the spiral arms come from — the short version is that they are not
  // drawn, they are the lanes where neighbouring oval orbits crowd together.
  // Steered toward a target velocity like the other flow modes; no recall box,
  // because every particle is springing onto an orbit that fits on stage.
  if (galaxyStrength > 0.001) {
    // Disc-plane coordinates about the origin.
    float gh = dot(pos.xyz, GX_N);
    vec3 gPlanar = pos.xyz - GX_N * gh;
    float gr = length(gPlanar);
    vec3 gOut = gr > 1e-5 ? gPlanar / gr : GX_U;
    // Unit by construction: GX_N is unit and gOut lies in the plane it norms.
    vec3 gTan = cross(GX_N, gOut);

    // This particle's own orbit. The mean radius is a fixed draw, shaped so
    // the disc comes out mildly centre-heavy rather than as an even pancake
    // with a pinhole of whiteout in the middle (a uniform draw in radius would
    // do exactly that — surface density goes as 1/r).
    float ga = GX_RADIUS * pow(rand(uv * 6.29 + vec2(1.3, 7.9)), 0.62);
    float gTheta = atan(dot(pos.xyz, GX_V), dot(pos.xyz, GX_U));
    // The oval, and the apsidal turn that stacks the ovals into arms. The
    // whole pattern also rotates rigidly, so the lanes sweep while particles
    // stream through them at their own radius's pace.
    float gWant = ga * (1.0 - GX_ECC
      * cos(2.0 * (gTheta - GX_TWIST * ga - uTime * GX_PATTERN)));

    // Solid-body rotation inside the core, Keplerian outside — which is what
    // real rotation curves do, and also the only way the middle survives. At a
    // constant *linear* speed the turn per frame blows up as r -> 0, the
    // steering (which only closes a fifth of the gap each frame) cannot follow
    // it, and every particle inside a few tenths gets thrown out on the chord:
    // the galaxy comes out as a ring with a hole punched through the bulge.
    // The min() picks whichever law is slower and they meet exactly at GX_CORE.
    float gOrb = GX_ORBIT * min(gr / GX_CORE, sqrt(GX_CORE / max(gr, 1e-4)));
    float gRad = clamp((gWant - gr) * GX_PULL, -GX_RMAX, GX_RMAX);

    // Flare the disc's half-thickness with radius, exactly as the black hole
    // does and for the same reason: driving every particle onto the plane is
    // the whiteout again. The extra term at small radius is the bulge — the
    // core is a rounder swarm, not a thinner disc.
    float gHalf = 0.03 + 0.05 * gr + 0.13 * (1.0 - smoothstep(0.0, 0.45, gr));
    float gOver = gh - clamp(gh, -gHalf, gHalf);

    // Aim inward of the tangent. Steering is first order, so the velocity is
    // always a few frames behind the direction it is chasing — and on a circle
    // "a few frames behind the tangent" is a chord, which points outward. The
    // tighter the orbit the worse it gets, until the inner radii fling
    // themselves out faster than GX_RMAX can reel them back and the bulge
    // comes out as a hole. Offsetting the aim by the angle the lag costs
    // (roughly the turn rate times the steering's ~5-frame time constant)
    // cancels it, and costs nothing out in the disc where the lag is tiny.
    float gLag = min(gOrb / max(gr, 1e-3) * 5.0, 1.2);
    vec3 gAim = normalize(gTan - gOut * gLag);

    float gStep = min(timeScale, 4.0);
    vec3 vTarget = (gAim * gOrb + gOut * gRad - GX_N * gOver * 0.10) * gStep;
    vec3 gSteered = mix(vel, vTarget, clamp(0.20 * timeScale, 0.0, 1.0));
    vel = mix(vel, gSteered, galaxyStrength * (1.0 - follower));
  }

  // Murmuration mode: boids over the filament rig's chains (see the MU_ block
  // above for why the chains are the neighbourhood). Three rules — cohesion,
  // separation, alignment — plus a roost the whole flock drifts toward, summed
  // and then flown as a direction at a fixed airspeed. The normalize is what
  // makes it read as birds: a bird answers its neighbours by *turning*, not by
  // speeding up, and a flock that varies its speed comes apart into a cloud.
  if (murmurStrength > 0.001) {
    vec3 muPos = vec3(0.0);
    vec3 muVel = vec3(0.0);
    vec3 muSep = vec3(0.0);
    for (int j = 0; j < MU_SAMPLES; j++) {
      // Strided across the chain so the sample spans the whole flock, and
      // offset by this particle's own slot so no two birds watch the same set.
      float k = mod(posInChain + 1.0 + floor(float(j) * (CHAIN / float(MU_SAMPLES))), CHAIN);
      float nIdx = chainId * CHAIN + k;
      vec2 nUv = (vec2(mod(nIdx, texW), floor(nIdx / texW)) + 0.5) / resolution;
      vec4 nPos = texture2D(t_pos, nUv);
      vec4 nOld = texture2D(t_oPos, nUv);
      muPos += nPos.xyz;
      muVel += (nPos.xyz - nOld.xyz) * step(0.5, nPos.w);
      vec3 away = pos.xyz - nPos.xyz;
      float d2 = dot(away, away) + 1e-4;
      // Only crowding neighbours push; the falloff is the usual inverse
      // square, so the push is negligible until they are genuinely close.
      muSep += away * step(d2, MU_SEP * MU_SEP) / d2;
    }
    float inv = 1.0 / float(MU_SAMPLES);

    // Each flock's roost drifts on a curl of its own, seeded by the chain, so
    // the flocks travel independently instead of all converging on one point.
    vec3 roost = curlNoise(vec3(chainRand * 31.0, uTime * 0.03, 7.0))
                 * vec3(1.9, 0.95, 0.5);

    vec3 steer = (muPos * inv - pos.xyz) * MU_COHERE
               + muSep * MU_SEPARATE
               + muVel * inv * MU_ALIGN
               + (roost - pos.xyz) * MU_ROOST;
    vec3 muDir = normalize(steer + vec3(1e-5));
    vec3 vTarget = muDir * MU_CRUISE * min(timeScale, 4.0);
    vec3 muSteered = mix(vel, vTarget, clamp(MU_TURN * timeScale, 0.0, 1.0));
    vel = mix(vel, muSteered, murmurStrength * (1.0 - follower));
  }

  // Aurora mode: a few vertical curtains, rippling on a travelling plus a
  // standing wave (see the AU_ block above for why it needs both). Only x is
  // constrained — the sheet is a function of depth, and the particle is free
  // to stream up it. Reaching its own top, a ray is re-emitted at the foot of
  // the curtain; because each carries a different ceiling, the population
  // thins out with height instead of stopping in a line.
  if (auroraStrength > 0.001) {
    float ci = floor(rand(uv * 8.11 + vec2(4.4, 1.2)) * AU_CURTAINS);
    // Golden-angle stagger, so no two curtains ever ripple in step.
    float phase = ci * 2.39996;
    float base = (ci / max(AU_CURTAINS - 1.0, 1.0) - 0.5) * 2.0 * AU_SPREAD;
    float sheetX = base
      + AU_TRAVEL * sin(AU_KZ * pos.z + uTime * AU_SPEED + phase)
      + AU_STAND * sin(AU_KZ * 1.6 * pos.z + phase * 1.7)
                 * sin(uTime * AU_SPEED * 0.61 + phase);

    // Damped spring onto the sheet. The sheet moves under the particle, which
    // is what drags the curtain sideways as the wave travels.
    vel.x += (sheetX - pos.x) * AU_PULL * auroraStrength * timeScale;
    vel.x *= mix(1.0, pow(0.86, timeScale), auroraStrength);

    // Stream upward at a per-particle pace, so rays shear past each other.
    float pace = 0.6 + 0.8 * rand(uv * 4.77 + vec2(1.9, 6.3));
    float vUp = AU_RISE * pace * min(timeScale, 4.0);
    vel.y = mix(vel.y, vUp, clamp(0.15 * timeScale, 0.0, 1.0) * auroraStrength);

    // Keep the sheet inside its depth slab; z is otherwise left to the curl,
    // which is what slowly re-deals the folds.
    float zEx = pos.z - clamp(pos.z, AU_ZNEAR, AU_ZFAR);
    vel.z += -zEx * 0.0025 * auroraStrength * timeScale;

    float ceiling = mix(AU_BOTTOM + 0.35, AU_TOP, rand(uv * 6.61 + vec2(3.3, 7.1)));
    if (auroraStrength > 0.5 && pos.y > ceiling && arrive < 0.5) {
      float seed = fract(uTime * 0.41);
      warpPos = vec3(
        sheetX,
        AU_BOTTOM + rand(uv * 2.83 + vec2(seed, 4.9)) * 0.12,
        mix(AU_ZNEAR, AU_ZFAR, rand(uv * 9.07 + vec2(1.1, seed)))
      );
      warped = 1.0;
    }
  }

  // Dipole mode: particles ride a magnetic dipole's field lines, bouncing
  // between their own mirror points rather than piling into the poles (see the
  // DP_ block above). Direction only — the 1/r^3 magnitude is thrown away and
  // the speed is a flat cruise, the same trick the attractor uses.
  if (dipoleStrength > 0.001) {
    float dr = max(length(pos.xyz), 1e-4);
    vec3 rHat = pos.xyz / dr;
    float cosT = dot(rHat, DP_AXIS);
    vec3 bHat = normalize(3.0 * cosT * rHat - DP_AXIS + vec3(1e-6));

    // Which way along the line this particle is going. Nothing stores it, but
    // the velocity is the state — read the direction back out of it.
    float s = dot(vel, bHat) >= 0.0 ? 1.0 : -1.0;
    // Mirror. Along +B the colatitude only ever grows (dot(B, grad cos0) works
    // out to -sin^2(0)/|B|, never positive), so +B always heads south and -B
    // north: a particle past its northern mirror is sent along +B and one past
    // its southern mirror along -B, and neither reaches a pole.
    float mirror = 0.62 + 0.33 * rand(uv * 2.17 + vec2(7.3, 3.8));
    if (abs(cosT) > mirror) s = cosT > 0.0 ? 1.0 : -1.0;

    // The only term that crosses field lines, and the only reason the belt
    // stays on stage: too far out and a particle sinks onto a smaller shell,
    // inside the planet and it is pushed back off it.
    float shell = smoothstep(DP_OUTER, DP_OUTER + 0.9, dr)
                - (1.0 - smoothstep(DP_INNER, DP_INNER + 0.12, dr));

    vec3 vTarget = (bHat * s * DP_CRUISE - rHat * shell * DP_CROSS)
                   * min(timeScale, 4.0);
    // Steered harder than the other modes. Field lines near the planet turn
    // faster than the belt travels, and a first-order chase that lags them by
    // several frames drifts off the line outward — the same lag that hollows
    // out the galaxy's core, here emptying the middle of the belt.
    vec3 dpSteered = mix(vel, vTarget, clamp(0.45 * timeScale, 0.0, 1.0));
    vel = mix(vel, dpSteered, dipoleStrength * (1.0 - follower));

    // Squeeze the belt toward the screen plane. The field is axisymmetric, so
    // a particle already in the plane through the axis never leaves it and the
    // slab costs nothing — but left in full 3D the lines fan out through every
    // azimuth at once and the projection stacks them into an unreadable
    // vortex. Held near one plane they read as the diagram everyone knows.
    float dpZ = pos.z - clamp(pos.z, -0.26, 0.26);
    vel.z += -dpZ * 0.004 * dipoleStrength * timeScale;
  }

  // Sediment mode: the field falls, drifts and settles (see the SD_ block
  // above). Two behaviours under one uniform, split by whether a grain has
  // reached its slot in the bank: airborne it steers toward a terminal fall
  // plus shear, settled it springs into the slot and brakes hard — the
  // lattice's freeze, which is what makes the bank read as a solid.
  if (sedimentStrength > 0.001) {
    // The bank's top: a couple of standing dunes, fixed in place so the drift
    // has a shape instead of a straight edge.
    float bank = SD_FLOOR + SD_PILE
      * (0.55 + 0.45 * sin(pos.x * 1.9 + 0.7) * cos(pos.x * 0.8 - 1.3));
    // Depth of this grain's slot into the bank, fixed for good.
    float rest = mix(SD_FLOOR, bank, rand(uv * 5.41 + vec2(3.1, 8.8)));
    float settled = 1.0 - smoothstep(0.0, 0.09, pos.y - rest);

    // Airborne. The shear reverses on a slow sine, which is what stops the
    // whole snowfall from leaning the same way forever; the ambient wind
    // uniform is still blowing underneath, so a scroll gust still shows.
    float shear = SD_SHEAR * smoothstep(SD_FLOOR, SD_EMIT, pos.y)
                  * (0.35 + 0.65 * sin(uTime * 0.13));
    // Per-grain flutter, so they do not fall in columns.
    float flutter = sin(uTime * 1.3 + rand(uv * 3.19 + vec2(6.6, 2.9)) * 62.8) * 0.0009;
    vec3 fall = vec3(shear + flutter, -SD_TERM, 0.0) * min(timeScale, 4.0);
    vec3 sdSteered = mix(vel, fall, clamp(0.05 * timeScale, 0.0, 1.0));
    vel = mix(vel, sdSteered, sedimentStrength * (1.0 - settled) * (1.0 - follower));

    // Settled.
    float hold = sedimentStrength * settled;
    vel.y += (rest - pos.y) * 0.05 * hold * timeScale;
    vel *= mix(1.0, pow(0.80, timeScale), hold * 0.9);

    // Lift back into the sky. The floor()'d seed re-throws the dice SD_TICK
    // times a second; everything else about the grain's wait is memoryless.
    // Wrapped, because the seed feeds a sin()-based hash and an unbounded one
    // runs out of float precision after a few minutes on screen — at which
    // point the "dice" quietly stop being random and the bank stops emptying.
    // Every other clock-driven hash in this file is bounded for the same
    // reason (the black hole's respawn takes a fract() of uTime).
    float tick = mod(floor(uTime * SD_TICK), 512.0);
    if (sedimentStrength > 0.5 && settled > 0.5 && arrive < 0.5
        && rand(uv * 7.93 + vec2(tick, 5.2)) > 1.0 - SD_RECYCLE) {
      warpPos = vec3(
        (rand(uv * 1.37 + vec2(tick, 9.4)) - 0.5) * 5.2,
        SD_EMIT + rand(uv * 4.51 + vec2(8.2, tick)) * 0.35,
        -1.0 + rand(uv * 8.69 + vec2(tick, 0.6)) * 1.4
      );
      warped = 1.0;
    }
  }

  // Rounded-box deflection around the visible project card. The z-mask is
  // asymmetric: wide on the camera side (anything glowing between the card
  // and the lens washes out its text through the backdrop blur), narrow on
  // the far side so deep particles still drift behind the card.
  if (cardStrength > 0.001) {
    vec2 rel = pos.xy - cardCenter.xy;
    vec2 q = abs(rel) - (cardHalfSize - vec2(cardRadius));
    float sd = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - cardRadius;
    float dz = pos.z - cardCenter.z;
    float zMask = dz > 0.0 ? smoothstep(1.7, 0.2, dz) : smoothstep(0.9, 0.15, -dz);
    // Softened under the flow modes: at full strength the deflection fountains
    // a steady plume of particles off the top of the frame, since the flow
    // keeps feeding the card's neighbourhood. This much still carves a readable
    // hole around the copy without the leak. Every mode that circulates the
    // population — an attractor lobe, an orbit, a curtain, a falling grain —
    // feeds the card the same way.
    float deflect = smoothstep(0.18, -0.05, sd) * cardStrength * zMask
                    * (1.0 - 0.6 * flowStrength);
    vel += normalize(vec3(rel, 0.0) + vec3(0.0, 0.0, 1e-5)) * deflect * 0.0009 * timeScale;
  }

  // Filament lines (project-card slides): leaders cruise along a slow,
  // lower-frequency curl field; every other particle springs toward its
  // predecessor, so each chain traces the leader's path as one long thin
  // swirling line instead of a swarm of individually-wandering particles.
  if (lineStrength > 0.001) {
    if (isLeader > 0.5) {
      vec3 flow = curlNoise(pos.xyz * noiseSize * 0.55 + vec3(chainRand * 19.0, 7.0, 3.0));
      flow.z *= 0.35; // keep the lines swirling mostly in the screen plane
      vec3 flowDir = normalize(flow + vec3(1e-5));
      float cruise = 0.0032 * (0.7 + 0.6 * chainRand);
      vec3 steered = mix(vel, flowDir * cruise, clamp(0.10 * timeScale, 0.0, 1.0));
      // A mode takes the leaders over (above), so during the crossfade out of
      // line mode the chains trace whatever it built rather than a curl field;
      // the followers keep chasing either way.
      vel = mix(vel, steered, lineStrength * (1.0 - anyMode));
    } else {
      float prevIdx = idx - 1.0;
      vec2 prevUv = (vec2(mod(prevIdx, texW), floor(prevIdx / texW)) + 0.5) / resolution;
      vec3 toPrev = texture2D(t_pos, prevUv).xyz - pos.xyz;
      float d = length(toPrev);
      if (d > 1e-5) {
        // First-order chase toward a fixed spacing behind the predecessor:
        // the follower's velocity converges to the closing speed instead of
        // integrating a spring (which winds up and explodes the field).
        // The repulsion floor keeps coiled chains from knotting into blobs.
        float pull = clamp(d - 0.014, -0.03, 0.03);
        vec3 chase = (toPrev / d) * pull * 0.25;
        vec3 followVel = mix(vel, chase, clamp(0.25 * timeScale, 0.0, 1.0));
        vel = mix(vel, followVel, follower);
      }
    }
    // Containment: a soft box. No force inside (lines roam the whole view
    // freely — a center-pull herds everything behind the card), springs back
    // only past the frustum-ish bounds, stronger in z.
    vec3 excess = pos.xyz - clamp(pos.xyz, vec3(-2.6, -1.5, -0.9), vec3(2.6, 1.5, 0.9));
    vel += -excess * vec3(0.0006, 0.0006, 0.0012) * lineStrength * timeScale;
  }

  // Depth floaters: a few percent of particles (whole chains, in line mode)
  // slowly swim toward the camera and back on a long sine, looming large in
  // perspective before dissolving near the lens. Off while text is forming.
  // Line mode floats fewer, gentler chains — a whole 64-particle chain near
  // the lens is a lot of glow, and several at once wash out the card.
  float floatRand = mix(rand(uv * 1.71 + 3.3), chainRand, lineStrength);
  float floater = step(mix(0.94, 0.97, lineStrength), floatRand);
  float floatAmp = mix(0.00022, 0.00013, lineStrength);
  vel.z += sin(uTime * 0.30 + floatRand * 91.0) * floatAmp
           * floater * (1.0 - targetStrength) * timeScale;

  // Text-formation target attraction: spring toward per-particle target,
  // staggered by the target texel's random w, with settle damping so the
  // letters hold still once formed. The spring is kept soft so particles
  // glide onto their targets over a couple of seconds rather than snapping.
  if (arrive > 0.001) {
    vel += (tgt.xyz - pos.xyz) * 0.04 * arrive * timeScale;
    vel *= mix(1.0, pow(0.80, timeScale), arrive * 0.9);
  }

  // Release burst: scatter + recede into depth so a held formation dissolves
  // into the fog instead of flaring across the screen
  // (fired when text formation lets go, decays scene-side in ~1s)
  if (burstStrength > 0.001) {
    vec3 scatter = curlNoise(pos.xyz * (noiseSize * 2.5) + vec3(37.7, 17.3, 91.1));
    vel += (scatter * 0.001 + vec3(0.0, 0.0, -0.002)) * burstStrength * timeScale;
  }

  // Transition shockwave: a point repulsion at the released shape's center,
  // fired for a fraction of a second so one formation blows apart outward
  // before the next gathers, instead of the two cross-dissolving. Pushed
  // mostly across the screen plane — a straight radial kick throws a wall of
  // particles at the lens, which just blooms white.
  if (shockStrength > 0.001) {
    vec3 away = pos.xyz - shockCenter;
    away.z *= 0.3;
    float d = length(away);
    // Speed grows with distance from the center, so the shape expands
    // self-similarly and thins out. A distance-falloff kick does the opposite:
    // the inner particles overtake the outer ones and compress the silhouette
    // into a dense shell that just blooms white.
    // `reach` confines the wave to the shape's neighborhood; the small
    // radial term gives particles sitting near the center somewhere to go.
    float reach = smoothstep(1.7, 0.15, d);
    vec3 dir = away / max(d, 1e-4);
    vel += (away + dir * 0.22) * reach * shockStrength * 0.115 * timeScale;
  }

  vel *= pow(.97, timeScale); // dampening

  vec3 p = pos.xyz + vel;

  // w = 1 for a position integrated from the previous one, 0 for a position
  // written from nowhere. Consumers of the two position buffers difference
  // them to get velocity, so they need to be told.
  float continuous = 1.0;
  if (warped > 0.5) {
    p = warpPos;
    continuous = 0.0;
  }

  gl_FragColor = vec4( p , continuous );
}
