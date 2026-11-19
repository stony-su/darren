'use strict';
// ─────────────────────────────────────────────────────────────
// composer: one seed → one piece of music, as a list of timed events.
//
// A piece has a groove (its drum language and tempo range), a key,
// two or three eight-bar chord cycles voiced with sevenths and ninths
// and led smoothly from chord to chord, a hook that returns in every
// peak, and a lift of a step for the last peak.
// ─────────────────────────────────────────────────────────────

const SCALES = {
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
};
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// Eight-bar chord cycles, as scale degrees of the roots. The second half answers the first.
const PROGRESSIONS = [
  [0, 5, 3, 4, 0, 5, 1, 4], [0, 3, 4, 3, 0, 3, 4, 4], [0, 6, 5, 6, 0, 6, 5, 4], [0, 4, 5, 3, 0, 4, 3, 4],
  [0, 2, 3, 4, 0, 2, 5, 4], [5, 3, 0, 4, 5, 3, 0, 6], [0, 5, 3, 4, 3, 5, 1, 4], [0, 3, 6, 4, 0, 3, 5, 4],
  [3, 4, 5, 5, 3, 4, 0, 0], [5, 4, 3, 4, 5, 4, 3, 0], [0, 0, 3, 3, 5, 5, 4, 4], [3, 0, 4, 5, 3, 0, 4, 4],
];

// [section, bars, energy, kiai]
const FORMS = [
  [['intro', 4, 0.3], ['A', 8, 0.6], ['B', 8, 1.0, true], ['break', 4, 0.15], ['A', 8, 0.7], ['B', 8, 1.0, true], ['outro', 4, 0.35]],
  [['intro', 4, 0.35], ['A', 8, 0.65], ['B', 8, 1.0, true], ['break', 4, 0.15], ['C', 8, 0.8], ['B', 8, 1.0, true], ['outro', 4, 0.3]],
  [['intro', 4, 0.3], ['A', 8, 0.6], ['A', 4, 0.75], ['B', 8, 1.0, true], ['break', 4, 0.15], ['B', 8, 1.0, true], ['outro', 4, 0.35]],
];
// the fast grooves get through their bars quickly, so their peaks run sixteen
const FORMS_LONG = [
  [['intro', 4, 0.3], ['A', 8, 0.6], ['B', 16, 1.0, true], ['break', 4, 0.15], ['A', 8, 0.7], ['B', 16, 1.0, true], ['outro', 4, 0.35]],
  [['intro', 4, 0.35], ['A', 8, 0.65], ['B', 16, 1.0, true], ['break', 4, 0.15], ['C', 8, 0.8], ['B', 16, 1.0, true], ['outro', 4, 0.3]],
];

// Drum languages. Each pattern is one bar of sixteenths: x accent, o normal, - ghost, . rest.
const GROOVES = {
  four: {
    label: 'four on the floor', tempos: [118, 122, 124, 126, 128, 132, 136], swing: 0, bass: 'offbeat',
    kick: ['x...x...x...x...', 'x...x...x...x..o', 'x...x..ox...x...'], low: 'x.......x.......',
    snare: '....x.......x...', ghost: ['................', '.......-.....-..', '.........-.....-'],
    hat: '..x...x...x...x.', hatHi: '-.x--.x--.x--.x-', open: '......o.......o.', perc: '..-...-.-.-...-.',
  },
  break: {
    label: 'breakbeat', tempos: [112, 118, 124, 128, 132, 138], swing: 0.012, bass: 'synco',
    kick: ['x.....x...x.....', 'x.x.......xo....', 'x......x..x.....'], low: 'x.........x.....',
    snare: '....x.......x...', ghost: ['.......-.-.....-', '..-....-.-......', '.......-..-....-'],
    hat: 'x.o.x.o.x.o.x.o.', hatHi: 'x-o-x-o-x-o-x-o-', open: '..............o.', perc: '...-..-....-..-.',
  },
  half: {
    label: 'half-time', tempos: [128, 132, 138, 144, 150], swing: 0, bass: 'long', boom: true,
    kick: ['x.........x.....', 'x.....o...x.....', 'x..o......x..o..'], low: 'x...............',
    snare: '........x.......', ghost: ['..............--', '.....-........-.', '...........-..-.'],
    hat: 'x.o.x.o.x.o.x.o.', hatHi: 'x.o.x.oox.o.x-o-', open: '....o.......o...', perc: '....-.......-...',
  },
  shuffle: {
    label: 'shuffle', tempos: [112, 116, 120, 124, 128], swing: 0.07, bass: 'walk',
    kick: ['x...x...x...x...', 'x...x...x...x..o', 'x..ox...x..ox...'], low: 'x.......x.......',
    snare: '....x.......x...', ghost: ['...-...-...-...-', '.......-.......-', '...-.......-....'],
    hat: 'x..ox..ox..ox..o', hatHi: 'x.-ox.-ox.-ox.-o', open: '..o.......o.....', perc: '......-.......-.',
  },
  dnb: {
    label: 'drum and bass', tempos: [160, 166, 172], swing: 0, bass: 'long', long: true,
    kick: ['x.........x.....', 'x.....o...x.....', 'x.........xo....'], low: 'x.........x.....',
    snare: '....x.......x...', ghost: ['.......-.-....-.', '..-....-......-.', '.......-.-.....-'],
    hat: 'x.o.x.o.x.o.x.o.', hatHi: 'x.xox.xox.xox.xo', open: '..............o.', perc: '..-...-...-...-.',
  },
};
const VEL = { x: 1, o: 0.72, '-': 0.34 };
const FILLS = ['roll', 'toms', 'stutter', 'trip', 'gap'];
const COMPS = ['....x.....x...x.', 'x..x..x...x.x...', '..x...x...x...x.', 'x.....x..x....x.', '..x..x....x..x..'];
const GATES = ['x..x..x.x..x..x.', 'x.x.x.x.x.x.x.x.', 'x..x..x..x..x.x.', 'xxx.xxx.xxx.xxx.', 'x.xxx.xxx.xxx.xx'];
const ARPS = [[0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 5], [0, 1, 2, 0, 1, 2, 0, 1], [0, 4, 2, 5, 3, 6, 4, 7], [7, 5, 6, 4, 5, 3, 4, 2]];

const TITLE_WORDS = [
  'Moiré', 'Rosette', 'Harmonograph', 'Gravel', 'Interference', 'Tessellation', 'Spirograph',
  'Attractor', 'Isoline', 'Hatching', 'Recursion', 'Lattice', 'Epicycle', 'Hypotrochoid', 'Lissajous Knot', 'Contour',
  'Pentagrid', 'Limit Set', 'Sandpile', 'Bifurcation', 'Phyllotaxis', 'Quasicrystal', 'Gyroid', 'Slime Mould',
];

class Song {
  constructor(seed) {
    const r = new RNG(seed, 31337);
    this.seed = seed;
    this.grooveName = r.weighted(['four', 'break', 'half', 'shuffle', 'dnb'], [30, 24, 16, 16, 14]);
    this.groove = GROOVES[this.grooveName];
    this.bpm = r.pick(this.groove.tempos);
    this.spb = 60 / this.bpm;
    this.scaleName = r.pick(Object.keys(SCALES));
    this.scale = SCALES[this.scaleName];
    this.root = r.int(0, 11);
    this.tonic = 36 + this.root;
    if (this.tonic > 42) this.tonic -= 12;           // bass sits between F♯1 and F♯2
    this.form = r.pick(this.groove.long ? FORMS_LONG : FORMS);
    this.lift = r.chance(0.7) ? r.pick([1, 2, 2]) : 0;   // semitones the last peak rises by
    this.leadWave = r.pick(['triangle', 'square', 'sawtooth', 'fm']);
    this.keys = r.pick(['epiano', 'pluck']);
    this.kit = {
      tone: r.range(170, 230), clap: r.chance(0.45), open: r.chance(0.6), boom: !!this.groove.boom,
      kick: r.int(0, this.groove.kick.length - 1), ghost: r.int(0, this.groove.ghost.length - 1),
    };
    this.keyName = `${NOTE_NAMES[this.root]} ${this.scaleName}`;
    this.title = `${r.pick(TITLE_WORDS)} in ${this.keyName}`;
    this.opus = (seed % 997) + 1;
    this.events = [];
    this.lead = [];
    this.chords = [];
    this.compose(r);
    this.events.sort((a, b) => a.beat - b.beat);
    this.duration = this.totalBeats * this.spb;
  }

  degreeToMidi(deg, base) {
    const n = this.scale.length;
    const o = Math.floor(deg / n);
    const i = ((deg % n) + n) % n;
    return base + this.scale[i] + 12 * o;
  }
  chordAt(beat) {
    const cs = this.chords;
    let lo = 0, hi = cs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cs[mid].beat <= beat + 1e-6) lo = mid; else hi = mid - 1; }
    return cs[lo];
  }
  chordDegAtBar(bar) { return this.chordAt(bar * 4).deg; }
  rootMidiAt(beat, base) { const c = this.chordAt(beat); return this.degreeToMidi(c.deg, base) + c.shift; }
  sectionAt(beat) {
    for (const s of this.sections) if (beat >= s.startBeat && beat < s.endBeat) return s;
    return this.sections[this.sections.length - 1];
  }

  ev(beat, type, extra) { this.events.push(Object.assign({ beat, type, vel: 1 }, extra)); }

  compose(r) {
    const G = this.groove;
    let bar = 0;
    this.sections = [];
    for (const [name, bars, energy, kiai] of this.form) {
      this.sections.push({ name, startBar: bar, bars, energy, kiai: !!kiai, startBeat: bar * 4, endBeat: (bar + bars) * 4, shift: 0 });
      bar += bars;
    }
    this.totalBars = bar;
    this.totalBeats = bar * 4 + 6;
    let lastPeak = -1;
    this.sections.forEach((s, i) => { if (s.kiai) lastPeak = i; });
    this.sections.forEach((s, i) => { if (this.lift && lastPeak > 0 && i >= lastPeak) s.shift = this.lift; });

    this.harmony(r);
    const fills = FILLS.slice();
    for (let i = fills.length - 1; i > 0; i--) { const j = r.int(0, i); [fills[i], fills[j]] = [fills[j], fills[i]]; }
    const riffs = [this.riff(r, false), this.riff(r, true)];
    const comp = r.pick(COMPS), gate = r.pick(GATES), arp = r.pick(ARPS);
    let fillN = 0;

    for (let si = 0; si < this.sections.length; si++) {
      const s = this.sections[si], next = this.sections[si + 1], prev = this.sections[si - 1];
      const tier = s.name === 'break' ? 0 : s.kiai ? 3 : s.energy >= 0.6 ? 2 : 1;
      const build = !!(next && next.kiai);            // the last two bars wind up into a peak

      this.ev(s.startBeat, 'level', { gain: s.kiai ? 1 : tier === 2 ? 0.8 + 0.12 * (s.energy - 0.6) / 0.2 : 0.84 });
      if (s.kiai) { this.ev(s.startBeat, 'crash'); this.ev(s.startBeat, 'impact'); }
      else if (prev && s.name !== 'break') this.ev(s.startBeat, 'crash', { vel: 0.65 });
      if (s.name === 'break') this.ev(s.startBeat, 'down', { dur: 4, vel: 0.9 });
      if (build) {
        const len = Math.min(8, s.bars * 4);
        this.ev(s.endBeat - len, 'riser', { dur: len });
        this.ev(s.endBeat - 2, 'rev', { dur: 2 });
      }

      for (let b = 0; b < s.bars; b++) {
        const B = (s.startBar + b) * 4, left = s.bars - 1 - b;
        const winding = build && left < 2;
        // the sixteenth where a fill takes the bar over: half a bar out of a section, a beat every fourth bar
        const fillFrom = winding ? 16 : tier >= 2 ? (left === 0 ? 8 : b % 4 === 3 ? 12 : 16) : tier === 1 && left === 0 && next ? 12 : 16;
        const fill = fillFrom < 16 ? fills[fillN++ % fills.length] : null;
        const quiet = fill === 'gap' ? fillFrom : 16;                                       // a gap fill silences everything

        if (winding && left === 0) this.snareRoll(B);
        else {
          if (tier > 0) this.drumBar(r, s, b, B, tier, Math.min(fillFrom, quiet));
          if (winding) for (let q = 0; q < 4; q++) this.ev(B + q, 'snare', { vel: 0.42 + q * 0.05, soft: tier > 0 });
          if (fill) this.fill(fill, B, fillFrom);
          if (fillFrom < 16 && next && !next.kiai && left === 0 && fill !== 'gap') this.ev(B + 3, 'rev', { dur: 1, vel: 0.5 });
        }

        // bass rests through breaks, the first half of the intro, and the bar before a drop
        if (tier > 0 && !(s.name === 'intro' && b < 2) && !(winding && left === 0)) this.bassBar(riffs[s.kiai ? 1 : 0], B, quiet, s.name === 'outro' && left === 0);
      }

      for (const c of this.chords) {
        if (c.beat < s.startBeat || c.beat >= s.endBeat) continue;
        const soft = tier < 2;
        const cut = s.name === 'intro' ? 650 + 1100 * ((c.beat - s.startBeat) / (s.bars * 4)) : s.kiai ? 1400 : 1000;
        this.ev(c.beat, 'pad', { notes: c.notes, dur: c.dur, vel: soft ? 1 : s.kiai ? 0.5 : 0.62, cut });
        const from = Math.round((c.beat % 4) * 4), steps = c.dur * 4;
        if (tier === 2) {
          for (let i = 0; i < steps; i++) {
            if (comp[(from + i) % 16] === '.') continue;
            this.ev(c.beat + i / 4 + (i % 2 ? G.swing : 0), 'keys', { notes: c.notes.slice(1), dur: 0.5, vel: 0.62 + 0.2 * r.next() });
          }
        }
        if (s.kiai) {
          this.ev(c.beat, 'super', { notes: [c.notes[0] - 12].concat(c.notes), dur: c.dur, vel: 0.9, gate: (gate + gate).slice(from, from + steps) });
          const tones = c.notes.concat(c.notes.map(n => n + 12));
          for (let i = 0; i < steps; i++) {
            const k = from + i;
            this.ev(c.beat + i / 4 + (i % 2 ? G.swing : 0), 'arp', { midi: tones[arp[k % arp.length]] + 12, vel: k % 4 === 0 ? 1 : 0.6, pan: k % 2 ? 0.5 : -0.5 });
          }
        }
        if (s.name === 'break' && c.beat < s.endBeat - 8) {            // a slow chime over the pad, until the wind-up starts
          for (let i = 0; i < c.dur * 2; i++) this.ev(c.beat + i / 2, 'arp', { midi: c.notes[[0, 2, 1, 3][i % 4]] + 12, vel: 0.75, pan: i % 2 ? 0.4 : -0.4, long: true });
        }
      }
    }
    // the last chord rings on after the final bar
    const end = this.chords[this.chords.length - 1];
    this.ev(end.beat, 'pad', { notes: end.notes, dur: end.dur, vel: 1, cut: 900 });
    this.ev(end.beat, 'bass', { midi: this.bassMidi(end), dur: 3, vel: 0.8 });
    this.ev(end.beat, 'arp', { midi: end.notes[3] + 12, vel: 0.9, long: true });
    this.ev(end.beat, 'kick', { vel: 0.9 });

    this.melody(r);
    this.lead.sort((a, b) => a.beat - b.beat);
  }

  // ── harmony ─────────────────────────────────────────────────
  // Lays the chord cycles over the form, then voices every chord as close as possible to the one before.
  harmony(r) {
    const P = PROGRESSIONS, ia = r.int(0, P.length - 1);
    let ib = r.int(0, P.length - 1);
    for (let k = 0; k < 8 && (ib === ia || P[ib][0] === P[ia][0]); k++) ib = r.int(0, P.length - 1);   // the peaks start somewhere new
    const ic = (ia + 1 + r.int(0, P.length - 2)) % P.length;
    const progOf = { intro: P[ia], A: P[ia], B: P[ib], C: P[ic], break: P[ib], outro: P[ib] };
    const stride = this.groove.long ? 2 : 1;          // fast grooves hold each chord for two bars
    for (let si = 0; si < this.sections.length; si++) {
      const s = this.sections[si], next = this.sections[si + 1], prog = progOf[s.name];
      for (let b = 0; b < s.bars; b++) {
        const beat = (s.startBar + b) * 4, deg = prog[Math.floor(b / stride) % 8];
        const last = b === s.bars - 1, pivot = last && next && next.shift !== s.shift;
        const turn = pivot || (deg !== 4 && (last || b % 8 === 7) && r.chance(0.4));
        this.chords.push({ beat, dur: turn ? 2 : 4, deg, shift: s.shift });
        // a turnaround on the dominant; before the lift it is the dominant of the new key
        if (turn) this.chords.push({ beat: beat + 2, dur: 2, deg: 4, shift: pivot ? next.shift : s.shift });
      }
    }
    this.chords.push({ beat: this.totalBars * 4, dur: 6, deg: 0, shift: this.sections[this.sections.length - 1].shift });
    let prev = null;
    for (const c of this.chords) { c.notes = this.voice(c, prev); prev = c.notes; }
  }

  // Four voices: third, fifth, seventh, and the ninth where it is a whole tone above the root (else the root).
  // The bass has the root, so the chord can do without it.
  voice(c, prev) {
    const pc = d => (((this.degreeToMidi(c.deg + d, this.tonic) + c.shift) % 12) + 12) % 12;
    const pcs = [pc(2), pc(4), pc(6), pc(8)], root = pc(0);
    if ((pcs[3] - root + 12) % 12 !== 2) pcs[3] = root;
    const LO = 52;
    let best = null, bestCost = Infinity;
    for (let m = 0; m < 16; m++) {
      const v = pcs.map((p, i) => LO + ((p - LO) % 12 + 12) % 12 + (((m >> i) & 1) ? 12 : 0)).sort((a, b) => a - b);
      let cost = 0;
      for (let i = 0; i < 4; i++) cost += prev ? Math.abs(v[i] - prev[i]) : Math.abs(v[i] - (57 + i * 4)) * 0.5;
      for (let i = 0; i < 3; i++) if (v[i + 1] - v[i] < 2) cost += 8;                // no seconds rubbing
      if (v[3] - v[0] > 15) cost += (v[3] - v[0] - 15) * 1.5;
      if (v[1] - v[0] < 4 && v[0] < 56) cost += 4;                                    // no mud at the bottom
      cost += Math.abs((v[0] + v[1] + v[2] + v[3]) / 4 - 63) * 0.8;                   // and no slow slide out of the middle register
      if (cost < bestCost) { bestCost = cost; best = v; }
    }
    return best;
  }

  bassMidi(c, kind = 0) {
    let m = this.degreeToMidi(c.deg, this.tonic) + c.shift;
    while (m > this.tonic + 9) m -= 12;
    while (m < 31) m += 12;
    if (kind === 1 && m + 12 <= 55) m += 12;
    if (kind === 2) m += this.degreeToMidi(c.deg + 4, 0) - this.degreeToMidi(c.deg, 0);
    return m;
  }

  // ── bass ────────────────────────────────────────────────────
  // One riff for the piece and a busier one for its peaks: [sixteenth, length, 0 root | 1 octave | 2 fifth | 3 approach]
  riff(r, hot) {
    const P = {
      offbeat: s => (s === 0 ? 0.55 : s % 4 === 2 ? 0.9 : s % 4 === 0 ? 0.3 : 0.1),
      synco: s => (s === 0 ? 1 : [3, 6, 10, 11, 14].includes(s) ? 0.55 : s % 4 === 0 ? 0.35 : 0.08),
      long: s => (s === 0 ? 1 : s === 10 ? 0.6 : s === 6 || s === 14 ? 0.3 : 0.02),
      walk: s => (s % 4 === 0 ? 1 : s % 4 === 3 ? 0.22 : 0.04),
    }[this.groove.bass];
    const cap = this.groove.bass === 'long' ? 8 : 4, notes = [];
    for (let s = 0; s < 16; s++) {
      if (!r.chance(Math.min(1, P(s) * (hot ? 1.25 : 1)))) continue;
      const kind = s === 0 ? 0 : r.weighted([0, 1, 2], [3, s % 4 === 2 ? 1.6 : 0.7, 0.6]);
      notes.push([s, 1, kind]);
    }
    if (!notes.length || notes[0][0] > 2) notes.unshift([0, 1, 0]);
    for (let i = 0; i < notes.length; i++) {
      const gap = (i + 1 < notes.length ? notes[i + 1][0] : 16) - notes[i][0];
      notes[i][1] = Math.max(1, Math.min(gap, cap) - (gap > 1 && r.chance(0.3) ? 1 : 0));
    }
    const last = notes[notes.length - 1];
    if (last[0] >= 13 && notes.length > 1) last[2] = 3;
    return notes;
  }

  bassBar(riff, B, until, ending) {
    for (const [st, len, kind] of riff) {
      if (st >= until || (ending && st > 0)) continue;
      const beat = B + st / 4 + (st % 2 ? this.groove.swing : 0), c = this.chordAt(beat);
      let midi;
      if (kind === 3) {                               // step up into the next bar's root from the note below it
        const nx = this.chordAt(B + 4), to = this.bassMidi(nx);
        midi = this.degreeToMidi(nx.deg - 1, this.tonic) + nx.shift;
        while (midi > to) midi -= 12;
        while (midi < to - 4) midi += 12;
        if (midi >= to) midi = to - 2;
      } else midi = this.bassMidi(c, kind);
      this.ev(beat, 'bass', { midi, dur: (ending ? 8 : len) / 4, vel: st % 4 === 0 ? 0.92 : 0.84 });
    }
  }

  // ── drums ───────────────────────────────────────────────────
  drumBar(r, s, b, B, tier, until) {
    const G = this.groove, kit = this.kit;
    const each = (str, fn) => {
      for (let i = 0; i < until; i++) if (str[i] !== '.') fn(B + i / 4 + (i % 2 ? G.swing : 0), VEL[str[i]], i);
    };
    if (tier === 1) {                                 // intro and outro: the pulse and little else
      if (!(s.name === 'intro' && b < 2)) each(G.low, (t, v) => this.ev(t, 'kick', { vel: v * 0.9 }));
      each('..x...x...x...x.', (t, v, i) => this.ev(t, 'hat', { vel: 0.5 + 0.1 * r.next(), pan: i % 8 === 2 ? -0.25 : 0.25 }));
      return;
    }
    const kick = b % 4 === 3 ? G.kick[(kit.kick + 1) % G.kick.length] : G.kick[kit.kick];
    each(kick, (t, v) => this.ev(t, 'kick', { vel: v * (0.95 + 0.05 * r.next()) }));
    each(G.snare, (t, v) => {
      this.ev(t, kit.clap ? 'clap' : 'snare', { vel: v * 0.9 });
      if (tier === 3 && !kit.clap) this.ev(t, 'clap', { vel: 0.4 });      // the peaks layer a clap under the snare
    });
    each(G.ghost[kit.ghost], (t, v) => this.ev(t, 'snare', { vel: v * (0.75 + 0.5 * r.next()), soft: true }));
    const open = tier === 3 && kit.open ? G.open : '................';
    each(tier === 3 ? G.hatHi : G.hat, (t, v, i) => {
      if (open[i] !== '.') return;
      this.ev(t, 'hat', { vel: v * (0.72 + 0.14 * r.next()), soft: v < 0.9, pan: i % 4 < 2 ? -0.25 : 0.25 });
    });
    each(open, t => this.ev(t, 'hat', { vel: 0.8, open: true, soft: true, pan: 0.3 }));
    if (tier === 3 || s.energy >= 0.7) each(G.perc, (t, v, i) => this.ev(t, i % 8 === 4 ? 'rim' : 'shaker', { vel: 0.9 + 0.3 * r.next() }));
  }

  // The bar before a drop: no kick, a snare that doubles its speed and climbs.
  snareRoll(B) {
    for (let i = 0; i < 4; i++) this.ev(B + i / 2, 'snare', { vel: 0.5 + i * 0.06 });
    for (let i = 0; i < 8; i++) this.ev(B + 2 + i / 4, 'snare', { vel: 0.66 + i * 0.045 });
  }

  fill(kind, B, from) {
    const n = 16 - from;
    switch (kind) {
      case 'roll':
        for (let i = from; i < 16; i++) this.ev(B + i / 4, 'snare', { vel: 0.42 + 0.53 * ((i - from) / (n - 1)) });
        break;
      case 'toms': {
        const seq = from === 8 ? [8, 10, 11, 12, 13, 14, 15] : [12, 13, 14, 15];
        seq.forEach((st, k) => this.ev(B + st / 4, 'tom', { vel: 0.72 + 0.24 * (k / seq.length), pitch: 2 - Math.floor((3 * k) / seq.length) }));
        break;
      }
      case 'stutter': {
        const seq = from === 8 ? [[8, 'kick'], [10, 'snare'], [12, 'kick'], [13, 'snare'], [14, 'kick'], [15, 'snare']] : [[12, 'kick'], [13, 'snare'], [14, 'kick'], [15, 'snare']];
        for (const [st, type] of seq) this.ev(B + st / 4, type, { vel: type === 'kick' ? 0.9 : 0.86 });
        break;
      }
      case 'trip':
        for (let q = from / 4; q < 4; q++) for (let k = 0; k < 3; k++) this.ev(B + q + k / 3, 'snare', { vel: 0.5 + 0.14 * k + 0.1 * (q - from / 4) });
        break;
      case 'gap':                                     // silence, and a cymbal drawn backwards into the next bar
        this.ev(B + from / 4, 'rev', { dur: n / 4, vel: 0.7 });
        break;
    }
  }

  // ── melody ──────────────────────────────────────────────────
  // Melodies are written in scale degrees above the tonic. A phrase is two bars of eighth-note slots.
  // The hook belongs to the peaks; the intro and outro quote it, so it is familiar when it arrives.
  melody(r) {
    const G = this.groove, synco = G.bass === 'synco' || G.bass === 'offbeat' ? 0.14 : 0.04;
    const period = (density, reg) => {
      const q = this.question(r, density, synco, reg);
      return [q, this.answer(r, q, [2, 4]), this.vary(r, q), this.answer(r, q, [0])];
    };
    const hook = period(0.7, 4), verse = period(0.55, 1);
    const axis = 4, bridge = period(0.56, 3).map(m => m.map(n => ({ slot: n.slot, len: n.len, deg: clamp(2 * axis - n.deg, -3, 10) })));
    let counterAt = this.tonic + 19;
    for (const s of this.sections) {
      const phrases = Math.floor(s.bars / 2);
      for (let p = 0; p < phrases; p++) {
        const at = s.startBar + p * 2;
        let m, vel = 1;
        switch (s.name) {
          case 'B': m = hook[p % 4]; break;
          case 'A': m = s.bars === 4 ? verse[p ? 3 : 0] : verse[p % 4]; break;
          case 'C': m = bridge[p % 4]; break;
          case 'intro': m = this.thin(hook[p ? 1 : 0]); vel = 0.75; break;
          case 'outro': m = this.thin(hook[p ? 3 : 0]); vel = 0.85; break;
          default: m = p === 0 ? this.thin(hook[0]).filter(n => n.slot % 8 === 0) : []; vel = 0.6;
        }
        this.phrase(m, at, s, vel);
        if (s.kiai) counterAt = this.counter(m, at, counterAt);
      }
    }
  }

  // One bar of rhythm: the eighth-note slots that carry a note.
  cell(r, density, synco) {
    const on = [];
    for (let s = 0; s < 8; s++) {
      const w = s === 0 ? 1.6 : s === 4 ? 1.25 : s % 2 === 0 ? 1 : 0.62 + synco;
      if (r.chance(Math.min(0.95, density * w))) on.push(s);
    }
    if (!on.length || on[0] > 1) on.unshift(0);
    for (const s of [4, 2, 6, 3, 7]) { if (on.length >= (density > 0.6 ? 4 : 3)) break; if (!on.includes(s)) on.push(s); }   // never a bare bar
    return on.sort((a, b) => a - b);
  }
  nearest(deg, classes) {
    for (const o of [0, -1, 1, -2, 2, -3, 3]) if (classes.includes((((deg + o) % 7) + 7) % 7)) return deg + o;
    return deg;
  }
  lens(notes) {
    notes.sort((a, b) => a.slot - b.slot);
    notes.forEach((n, i) => { n.len = Math.min((i + 1 < notes.length ? notes[i + 1].slot : 16) - n.slot, 4); });
    return notes;
  }

  // A question: the second bar repeats the first a step away (a sequence), stops early to breathe, and ends open.
  question(r, density, synco, reg) {
    const first = this.cell(r, density, synco);
    const second = first.filter(s => s <= 5);
    const onsets = first.concat(second.map(s => s + 8));
    const shape = r.pick(['arch', 'fall', 'rise', 'wave', 'leap']);
    const curve = u => (shape === 'arch' ? reg + 4 * Math.sin(Math.PI * u) : shape === 'fall' ? reg + 4 - 5 * u
      : shape === 'rise' ? reg - 1 + 5 * u : shape === 'wave' ? reg + 2 + 2.5 * Math.sin(TAU * u) : reg + 5 - 5 * u);
    const seq = r.weighted([-1, 1, -2, 2], [3, 2, 1.5, 1]);
    const steps = [-3, -2, -1, 0, 1, 2, 3], bias = [0.25, 0.7, 2.2, 0.6, 2.2, 0.7, 0.25];
    const notes = [];
    let d = this.nearest(Math.round(shape === 'leap' ? reg : curve(0)), [0, 2, 4]);
    for (let i = 0; i < onsets.length; i++) {
      const slot = onsets[i], twin = slot >= 8 ? notes.find(n => n.slot === slot - 8) : null;
      if (twin) d = twin.deg + seq;
      else if (i > 0) {
        const target = curve(slot / 16);
        d += r.weighted(steps, steps.map((k, j) => bias[j] * Math.exp(-Math.abs(d + k - target) * 0.55)));
      }
      d = clamp(d, reg - 4, reg + 6);
      notes.push({ slot, deg: d });
    }
    const last = notes[notes.length - 1];
    last.deg = this.nearest(last.deg, [1, 4]);
    return this.lens(notes);
  }

  // An answer: the same first bar, then a walk by step to a cadence that lands on beat three and holds.
  answer(r, q, cadence) {
    const notes = q.filter(n => n.slot < 8).map(n => ({ slot: n.slot, deg: n.deg }));
    const from = notes[notes.length - 1].deg;
    const slots = q.filter(n => n.slot >= 8 && n.slot < 12).map(n => n.slot);
    if (!slots.length || (slots[0] > 8 && r.chance(0.6))) slots.unshift(8);
    slots.push(12);
    const goal = this.nearest(from - 2, cadence);
    slots.forEach((slot, i) => {
      const u = (i + 1) / slots.length;
      notes.push({ slot, deg: i === slots.length - 1 ? goal : Math.round(lerp(from, goal, u) + (i % 2 ? 1 : 0) * Math.sign(from - goal || 1)) });
    });
    return this.lens(notes);
  }

  // The question again with one note turned and, where there is room, a pickup into the next phrase.
  vary(r, q) {
    const notes = q.map(n => ({ slot: n.slot, deg: n.deg }));
    if (notes.length > 2) notes[r.int(1, notes.length - 2)].deg += r.pick([-1, 1]);
    const last = notes[notes.length - 1];
    if (last.slot <= 12 && r.chance(0.7)) notes.push({ slot: 15, deg: notes[0].deg + r.pick([-1, 1]) });
    return this.lens(notes);
  }

  // Only the notes on the beat, held: how the intro and outro quote the hook.
  thin(q) {
    const keep = q.filter(n => n.slot % 4 === 0).map(n => ({ slot: n.slot, deg: n.deg }));
    return this.lens(keep.length ? keep : [{ slot: 0, deg: q[0].deg }]);
  }

  phrase(m, bar, s, vel) {
    let prevEnd = -9, prevMidi = 0;
    for (const n of m) {
      const beat = bar * 4 + n.slot * 0.5, c = this.chordAt(beat);
      const strong = n.slot % 4 === 0 || n.len >= 3;
      let deg = strong ? this.nearest(n.deg, [c.deg % 7, (c.deg + 2) % 7, (c.deg + 4) % 7]) : n.deg;
      while (deg < -4) deg += 7;                      // keep the line in the lead's register
      while (deg > 11) deg -= 7;
      const midi = this.degreeToMidi(deg, this.tonic + 24) + c.shift;
      const dur = n.len * 0.5;
      const ev = { midi, dur, vel: (n.slot % 2 === 0 ? 0.9 : 0.72) * vel, bright: s.kiai };
      if (beat - prevEnd < 0.05 && Math.abs(midi - prevMidi) <= 5 && midi !== prevMidi) ev.from = prevMidi;
      this.ev(beat, 'lead', ev);
      this.lead.push({ beat, dur, midi, section: s });
      prevEnd = beat + dur; prevMidi = midi;
    }
  }

  // A second voice under the hook: it speaks in the slots the lead leaves empty and moves through the chords' thirds and sevenths.
  counter(m, bar, at) {
    const used = new Set(m.map(n => n.slot));
    for (let b = 0; b < 2; b++) {
      const free = [3, 7, 1, 5, 6, 2].filter(s => !used.has(b * 8 + s)).slice(0, 2).sort((x, y) => x - y);
      free.forEach((slot, i) => {
        const beat = (bar + b) * 4 + slot * 0.5, c = this.chordAt(beat);
        let best = at, cost = Infinity;
        for (const d of [2, 6, 4]) {
          let p = this.degreeToMidi(c.deg + d, this.tonic + 12) + c.shift;
          while (p > this.tonic + 28) p -= 12;
          while (p < this.tonic + 14) p += 12;
          const k = Math.abs(p - at) + (p === at ? 3 : 0) + (d === 4 ? 1.5 : 0);
          if (k < cost) { cost = k; best = p; }
        }
        at = best;
        this.ev(beat, 'counter', { midi: at, dur: ((i + 1 < free.length ? free[i + 1] : 8) - slot) * 0.5, vel: 0.95 });
      });
    }
    return at;
  }
}
