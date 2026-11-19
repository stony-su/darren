'use strict';
// ─────────────────────────────────────────────────────────────
// synth: Web Audio voices, the mix bus they play into, and a
// lookahead conductor that owns song time.
//
// The bus is where the production lives: every kick ducks the pads
// and bass (sidechain), instruments sit across the stereo field, and
// each track belongs to a layer that the player's momentum fades in.
// ─────────────────────────────────────────────────────────────

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// name: [layer, sidechain depth, reverb send, delay send]
// layer 0 always plays; 1 = percussion detail, 2 = harmony, 3 = sparkle
const TRACKS = {
  kick: [0, 0, 0, 0], drum: [0, 0, 0.3, 0], cym: [0, 0, 0.6, 0], hat: [0, 0, 0, 0], perc: [1, 0, 0.1, 0],
  bass: [0, 0.5, 0, 0], pad: [0, 0.62, 0.9, 0], keys: [2, 0.35, 0.35, 0.2], super: [2, 0.58, 0.4, 0.1],
  arp: [3, 0.25, 0.3, 0.6], counter: [3, 0.25, 0.5, 0.35], lead: [0, 0.16, 0.45, 0.5], fx: [0, 0, 0.5, 0],
};

class Synth {
  constructor(ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = ctx || new AC({ latencyHint: 'interactive' });
    const c = this.ctx;

    // master: glue compression, then a soft clipper so a loud passage saturates instead of cracking
    this.out = c.createGain();
    this.out.gain.value = 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3.5;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    const pre = c.createGain(); pre.gain.value = 0.5;
    const clip = c.createWaveShaper();
    clip.curve = Synth.softClip();
    clip.oversample = '2x';
    this.out.connect(comp).connect(pre).connect(clip).connect(c.destination);
    // the shaders listen here: everything the player hears
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.analyser.minDecibels = -90; this.analyser.maxDecibels = -12;
    clip.connect(this.analyser);

    this.musicVol = c.createGain(); this.musicVol.connect(this.out);
    this.fxVol = c.createGain(); this.fxVol.connect(this.out);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 3.2);
    const revOut = c.createGain(); revOut.gain.value = 0.28;
    this.reverb.connect(revOut).connect(this.musicVol);

    // ping-pong delay: the echoes alternate left and right
    this.delayIn = c.createGain();
    this.dl = c.createDelay(2); this.dr = c.createDelay(2);
    const fbL = c.createGain(), fbR = c.createGain(); fbL.gain.value = 0.42; fbR.gain.value = 0.42;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    const wet = c.createGain(); wet.gain.value = 0.22;
    this.delayIn.connect(this.dl);
    this.dl.connect(damp).connect(fbL).connect(this.dr);
    this.dr.connect(fbR).connect(this.dl);
    this.dl.connect(this.pan(-0.65)).connect(wet);
    this.dr.connect(this.pan(0.65)).connect(wet);
    wet.connect(this.musicVol);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.bus = null;
    this.reactive = true;
    this.layerLevel = [1, 1, 1, 1];
    this.toneMax = Math.min(20000, c.sampleRate * 0.45);
  }

  // linear up to 0.8, then a tanh shoulder that lands on 1. The curve spans an input of ±2.
  static softClip() {
    const n = 2049, curve = new Float32Array(n), T = 0.8;
    for (let i = 0; i < n; i++) {
      const u = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(u);
      curve[i] = a <= T ? u : Math.sign(u) * (T + (1 - T) * Math.tanh((a - T) / (1 - T)));
    }
    return curve;
  }

  pan(v) {
    const c = this.ctx;
    if (!c.createStereoPanner) return c.createGain();
    const p = c.createStereoPanner();
    p.pan.value = v;
    return p;
  }

  setVolumes(music, fx) {
    this.musicVol.gain.value = music;
    this.fxVol.gain.value = fx;
  }

  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  newBus(beatSec) {
    const c = this.ctx;
    const G = v => { const n = c.createGain(); n.gain.value = v; return n; };
    const bus = { dry: G(1), rev: G(1), dly: G(1), tracks: {}, ducks: [], layers: [[], [], [], []], spb: beatSec };
    bus.tone = c.createBiquadFilter();
    bus.tone.type = 'lowpass'; bus.tone.frequency.value = this.toneMax; bus.tone.Q.value = 0.5;
    bus.dry.connect(bus.tone).connect(this.musicVol);
    bus.rev.connect(this.reverb);
    bus.dly.connect(this.delayIn);
    const dt = Math.min(1.9, beatSec * 0.75);                       // dotted eighth
    this.dl.delayTime.value = dt; this.dr.delayTime.value = dt;
    for (const k in TRACKS) {
      const [layer, duck, rev, dly] = TRACKS[k];
      const input = G(1);
      let tail = input;
      if (layer) { const g = G(this.layerLevel[layer]); tail.connect(g); tail = g; bus.layers[layer].push(g); }
      if (duck) { const g = G(1); tail.connect(g); tail = g; bus.ducks.push([g, duck]); }
      tail.connect(bus.dry);
      if (rev) { const s = G(rev); tail.connect(s); s.connect(bus.rev); }
      if (dly) { const s = G(dly); tail.connect(s); s.connect(bus.dly); }
      bus.tracks[k] = input;
    }
    this.bus = bus;
    return bus;
  }

  stopBus(bus, fade = 0.06) {
    if (!bus) return;
    const t = this.ctx.currentTime;
    for (const g of [bus.dry, bus.rev, bus.dly]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
    }
    if (this.bus === bus) this.bus = null;
    setTimeout(() => { for (const g of [bus.dry, bus.rev, bus.dly, bus.tone]) g.disconnect(); }, (fade + 0.3) * 1000);
  }

  // Sidechain: the kick pushes the pads, bass and chords down, and they swell back before the next beat.
  sidechain(bus, t, amount) {
    const rel = clamp(bus.spb * 0.2, 0.06, 0.14);
    for (const [g, depth] of bus.ducks) {
      g.gain.setTargetAtTime(1 - depth * amount, t, 0.008);
      g.gain.setTargetAtTime(1, t + 0.05, rel);
    }
  }

  // ── the music listens to the player ─────────────────────────
  // Momentum (0..1) fills the arrangement in: percussion detail first, then harmony, then the sparkle on top.
  setMomentum(m) {
    const s = (a, b) => clamp((m - a) / (b - a), 0, 1);
    this.layerLevel = this.reactive ? [1, s(0.1, 0.28), s(0.36, 0.58), s(0.66, 0.88)] : [1, 1, 1, 1];
    const bus = this.bus;
    if (!bus) return;
    const t = this.ctx.currentTime;
    for (let i = 1; i < 4; i++) for (const g of bus.layers[i]) g.gain.setTargetAtTime(this.layerLevel[i], t, 0.09);
  }
  // The melody plays while you are hitting. A miss takes it away until the next hit.
  leadOpen(open) {
    const bus = this.bus;
    if (!bus) return;
    bus.tracks.lead.gain.setTargetAtTime(open || !this.reactive ? 1 : 0.1, this.ctx.currentTime, open ? 0.012 : 0.05);
  }
  // A miss also closes the top end of the music for a moment.
  muffle() {
    const bus = this.bus;
    if (!bus || !this.reactive) return;
    const t = this.ctx.currentTime, f = bus.tone.frequency;
    f.setTargetAtTime(650, t, 0.02);
    f.setTargetAtTime(this.toneMax, t + 0.22, 0.22);
  }

  env(g, t, peak, attack, decay, sustain, end, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0002), t + attack + decay);
    g.gain.setValueAtTime(Math.max(sustain, 0.0002), Math.max(end, t + attack + decay));
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(end, t + attack + decay) + release);
  }

  noiseHit(dest, t, dur, type, freq, vel, q = 0.8, pan = 0) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    if (pan) g.connect(this.pan(pan)).connect(dest); else g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  play(bus, ev, t, song) {
    const T = bus.tracks, spb = song.spb, v = ev.vel;
    switch (ev.type) {
      case 'kick': return this.kick(bus, t, v, song.kit.boom);
      case 'snare': return this.snare(ev.soft ? T.perc : T.drum, t, v, song.kit.tone);
      case 'clap': return this.clap(T.drum, t, v);
      case 'hat': return this.noiseHit(ev.soft ? T.perc : T.hat, t, ev.open ? 0.24 : 0.045, 'highpass', ev.open ? 7000 : 7600 + 1400 * v, 0.34 * v, 0.8, ev.pan || 0);
      case 'shaker': return this.shaker(T.perc, t, v);
      case 'rim': return this.rim(T.perc, t, v);
      case 'tom': return this.tom(T.drum, t, v, ev.pitch);
      case 'crash': return this.noiseHit(T.cym, t, 1.6, 'highpass', 4800, 0.2 * v, 0.5);
      case 'bass': return this.bassNote(T.bass, t, ev.midi, ev.dur * spb, v);
      case 'lead': return this.leadNote(T.lead, t, ev, ev.dur * spb, song.leadWave);
      case 'pad': return this.padChord(T.pad, t, ev.notes, ev.dur * spb, v, ev.cut || 1000);
      case 'keys': return this.keysChord(T.keys, t, ev.notes, ev.dur * spb, v, song.keys);
      case 'super': return this.superChord(T.super, t, ev.notes, ev.dur * spb, v, ev.gate, spb / 4);
      case 'arp': return this.bell(T.arp, t, ev.midi, v, ev.pan || 0, ev.long ? 1.1 : 0.42);
      case 'counter': return this.epNote(T.counter, t, ev.midi, ev.dur * spb, v, 0.3);
      case 'riser': return this.riser(T.fx, t, ev.dur * spb, v);
      case 'rev': return this.reverse(T.cym, t, ev.dur * spb, v);
      case 'impact': return this.impact(T.fx, t, v);
      case 'down': return this.downer(T.fx, t, ev.dur * spb, v);
      case 'level': return bus.dry.gain.setTargetAtTime(ev.gain, t, 0.04);      // each section has its own loudness; the peaks are the loudest
    }
  }

  // ── drums ───────────────────────────────────────────────────
  kick(bus, t, v, boom) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), len = boom ? 0.6 : 0.42;
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(boom ? 40 : 44, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(bus.tracks.kick);
    o.start(t); o.stop(t + len + 0.03);
    this.noiseHit(bus.tracks.kick, t, 0.014, 'highpass', 2500, 0.18 * v);
    this.sidechain(bus, t, Math.min(1, v));
  }

  snare(dest, t, v, tone) {
    const c = this.ctx, ghost = v < 0.5;
    this.noiseHit(dest, t, ghost ? 0.09 : 0.2, 'bandpass', 1900, 0.68 * v, 0.7);
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(tone, t);
    o.frequency.exponentialRampToValueAtTime(tone * 0.6, t + 0.1);
    g.gain.setValueAtTime(0.3 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.14);
  }

  clap(dest, t, v) {
    for (let i = 0; i < 3; i++) this.noiseHit(dest, t + i * 0.011, 0.02, 'bandpass', 1400, 0.5 * v, 1.2);
    this.noiseHit(dest, t + 0.033, 0.22, 'bandpass', 1300, 0.44 * v, 1.0);
  }

  shaker(dest, t, v) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6200; f.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.17 * v, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    src.connect(f).connect(g).connect(this.pan(0.35)).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + 0.1);
  }

  rim(dest, t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 1750;
    g.gain.setValueAtTime(0.16 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.pan(-0.3)).connect(dest);
    o.start(t); o.stop(t + 0.04);
    this.noiseHit(dest, t, 0.012, 'highpass', 3000, 0.12 * v, 0.8, -0.3);
  }

  // pitch 0 = low, 1 = mid, 2 = high; the three sit left to right
  tom(dest, t, v, pitch = 1) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = [92, 128, 176][pitch] || 128;
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.pan((1 - pitch) * 0.45)).connect(dest);
    o.start(t); o.stop(t + 0.33);
    this.noiseHit(dest, t, 0.02, 'bandpass', 900, 0.12 * v, 1);
  }

  // ── pitched voices ──────────────────────────────────────────
  bassNote(dest, t, midi, dur, v) {
    const c = this.ctx, f = mtof(midi);
    const saw = c.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = f;
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2 >= 30 ? f / 2 : f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(260 + 1300 * v, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.2);
    const g = c.createGain(), gs = c.createGain();
    this.env(g, t, 0.17 * v, 0.006, 0.12, 0.11 * v, t + dur * 0.9, 0.06);
    this.env(gs, t, 0.22 * v, 0.006, 0.12, 0.18 * v, t + dur * 0.9, 0.06);
    saw.connect(lp).connect(g).connect(dest);
    sub.connect(gs).connect(dest);
    const end = t + dur + 0.2;
    saw.start(t); sub.start(t); saw.stop(end); sub.stop(end);
  }

  // The lead glides in from the note before when the phrase is legato, and long notes take on vibrato.
  leadNote(dest, t, ev, dur, wave) {
    const c = this.ctx, f = mtof(ev.midi), v = ev.vel, end = t + dur + 0.3;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    const g = c.createGain();
    const oscs = [], tune = [];                       // tune = every parameter that carries the pitch
    const osc = (type, ratio, detune, level) => {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f * ratio; o.detune.value = detune;
      if (level === 1) o.connect(lp); else { const m = c.createGain(); m.gain.value = level; o.connect(m).connect(lp); }
      oscs.push(o); tune.push([o, ratio]);
      return o;
    };
    let peak;
    if (wave === 'fm') {
      const mod = c.createOscillator(), mg = c.createGain();
      mod.type = 'sine'; mod.frequency.value = f * 2;
      mg.gain.setValueAtTime(f * 2.4, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.7, t + 0.22);
      mod.connect(mg);
      mg.connect(osc('sine', 1, -5, 1).frequency);
      mg.connect(osc('sine', 1, 6, 1).frequency);
      oscs.push(mod); tune.push([mod, 2]);
      lp.frequency.setValueAtTime(6000, t);
      peak = 0.15 * v;
    } else {
      osc(wave, 1, -6, 1);
      osc(wave === 'sawtooth' ? 'sawtooth' : 'triangle', 1, 7, 1);
      lp.frequency.setValueAtTime(wave === 'triangle' ? 5200 : 3400, t);
      lp.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
      peak = (wave === 'triangle' ? 0.2 : 0.11) * v;
    }
    if (ev.bright) osc('triangle', 2, 3, 0.3);         // an octave on top in the peaks
    if (ev.from) {
      const f0 = mtof(ev.from);
      for (const [o, ratio] of tune) { o.frequency.setValueAtTime(f0 * ratio, t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.045); }
    }
    if (dur > 0.28) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 5.6;
      lg.gain.setValueAtTime(0, t + 0.12);
      lg.gain.linearRampToValueAtTime(13, t + 0.34);  // cents
      lfo.connect(lg);
      for (const [o] of tune) lg.connect(o.detune);
      lfo.start(t); lfo.stop(end);
    }
    this.env(g, t, peak, 0.008, 0.22, peak * 0.4, t + dur * 0.85, 0.14);
    lp.connect(g).connect(dest);
    for (const o of oscs) { o.start(t); o.stop(end); }
  }

  // Two detuned stacks, one each side of the stereo field.
  padChord(dest, t, notes, dur, v, cut) {
    const c = this.ctx;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.6;
    const g = c.createGain();
    this.env(g, t, 0.075 * v, 0.55, 0.3, 0.06 * v, t + dur - 0.2, 0.9);
    lp.connect(g).connect(dest);
    const sides = [this.pan(-0.6), this.pan(0.6)];
    sides[0].connect(lp); sides[1].connect(lp);
    const end = t + dur + 1.1;
    for (const m of notes) {
      for (let k = 0; k < 2; k++) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = k ? 9 : -9;
        o.connect(sides[k]); o.start(t); o.stop(end);
      }
    }
  }

  // FM electric piano: one modulator at the carrier's own pitch, its depth falling away after the strike.
  epNote(dest, t, midi, dur, v, pan = 0) {
    const c = this.ctx, f = mtof(midi), end = t + Math.max(dur, 0.25) + 0.35;
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = f; mod.frequency.value = f;
    mg.gain.setValueAtTime(f * (0.9 + 1.3 * v), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.22, t + 0.4);
    mod.connect(mg).connect(car.frequency);
    this.env(g, t, 0.1 * v, 0.004, 0.45, 0.036 * v, t + dur, 0.3);
    if (pan) car.connect(g).connect(this.pan(pan)).connect(dest); else car.connect(g).connect(dest);
    car.start(t); mod.start(t); car.stop(end); mod.stop(end);
  }

  pluck(dest, t, midi, v) {
    const c = this.ctx, f = mtof(midi);
    const a = c.createOscillator(), b = c.createOscillator(), mix = c.createGain();
    a.type = 'sawtooth'; b.type = 'square'; a.frequency.value = f; b.frequency.value = f; b.detune.value = 8;
    mix.gain.value = 0.5;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(700 + 3600 * v, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    a.connect(lp); b.connect(mix).connect(lp); lp.connect(g).connect(dest);
    a.start(t); b.start(t); a.stop(t + 0.33); b.stop(t + 0.33);
  }

  keysChord(dest, t, notes, dur, v, kind) {
    notes.forEach((m, i) => {
      const at = t + i * 0.007;                        // a slight strum
      if (kind === 'pluck') this.pluck(dest, at, m, v); else this.epNote(dest, at, m, dur, v, -0.15);
    });
  }

  // Supersaw: five detuned saws a note, spread wide, chopped by a rhythmic gate.
  superChord(dest, t, notes, dur, v, gate, step) {
    const c = this.ctx, end = t + dur;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.value = 900;
    const gt = c.createGain(); gt.gain.value = 0;
    const g = c.createGain(); g.gain.value = 0.1 * v;
    const sides = [this.pan(-0.75), this.pan(0.75)];
    sides[0].connect(lp); sides[1].connect(lp);
    lp.connect(gt).connect(g).connect(dest);
    const det = [-22, -9, 0, 9, 22];
    for (const m of notes) {
      const f = mtof(m);
      for (let k = 0; k < 5; k++) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f; o.detune.value = det[k] + (Math.random() - 0.5) * 3;
        o.connect(sides[k % 2]);
        o.start(Math.max(0, t - Math.random() * 0.03));   // started at scattered moments behind the closed gate, so the saws are never in phase
        o.stop(end + 0.12);
      }
    }
    const n = Math.round(dur / step);
    for (let i = 0; i < n; i++) {
      if (gate[i % gate.length] === '.') continue;
      const ts = t + i * step;
      gt.gain.setTargetAtTime(1, ts, 0.004);
      gt.gain.setTargetAtTime(0, ts + step * 0.62, 0.028);
      lp.frequency.setTargetAtTime(1100 + 3200 * v, ts, 0.004);
      lp.frequency.setTargetAtTime(800, ts + 0.03, step * 0.55);
    }
    gt.gain.setTargetAtTime(0, end, 0.02);
  }

  // FM bell: a modulator at an inharmonic ratio gives the metallic strike.
  bell(dest, t, midi, v, pan, ring) {
    const c = this.ctx, f = mtof(midi);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2.2 * v, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.18);
    mod.connect(mg).connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    if (pan) car.connect(g).connect(this.pan(pan)).connect(dest); else car.connect(g).connect(dest);
    car.start(t); mod.start(t); car.stop(t + ring + 0.03); mod.stop(t + ring + 0.03);
  }

  // ── transitions ─────────────────────────────────────────────
  // Filtered noise sweeping up into a peak, with a whistle rising under it. It cuts dead on the downbeat.
  riser(dest, t, dur, v) {
    const c = this.ctx, end = t + dur;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(9000, end);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * v, end - 0.02);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(f).connect(g).connect(dest);
    src.start(t); src.stop(end + 0.02);
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(1760, end);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.035 * v, end - 0.02);
    og.gain.linearRampToValueAtTime(0, end);
    o.connect(og).connect(dest);
    o.start(t); o.stop(end + 0.02);
  }

  // A cymbal played backwards: it swells and stops.
  reverse(dest, t, dur, v) {
    const c = this.ctx, end = t + dur;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5200; f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * v, end - 0.015);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(f).connect(g).connect(dest);
    src.start(t); src.stop(end + 0.02);
  }

  // The drop: a sub that falls away and a burst of low noise.
  impact(dest, t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(68, t);
    o.frequency.exponentialRampToValueAtTime(31, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 1.15);
    const f = this.noiseHit(dest, t, 0.7, 'lowpass', 2400, 0.3 * v, 0.7);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.6);
  }

  // Noise sweeping down, for the fall into a break.
  downer(dest, t, dur, v) {
    const f = this.noiseHit(dest, t, dur, 'bandpass', 6500, 0.14 * v, 1.4);
    f.frequency.exponentialRampToValueAtTime(260, t + dur * 0.9);
  }

  // Hitsounds fire immediately on input. The pen tap is tuned to the note under it.
  // `when` (context time) lets the auto-player place a tap on the exact sample.
  hit(kind, midi = 72, when = 0) {
    const c = this.ctx, t = Math.max(c.currentTime + 0.002, when), out = this.fxVol;
    if (kind === 'normal' || kind === 'finish') {
      this.noiseHit(out, t, 0.03, 'bandpass', 3800, 0.32, 1.4);
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = mtof(midi + 12);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.12);
    }
    if (kind === 'finish') {
      for (const [ratio, amp, dec] of [[1, 0.09, 0.9], [2.76, 0.05, 0.5], [5.4, 0.03, 0.3]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = mtof(midi + 12) * ratio;
        g.gain.setValueAtTime(amp, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g).connect(out);
        const s = c.createGain(); s.gain.value = 0.5; g.connect(s).connect(this.reverb);
        o.start(t); o.stop(t + dec + 0.05);
      }
    }
    if (kind === 'tick') {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = mtof(midi + 24);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.07);
    }
    if (kind === 'break') {
      const f = this.noiseHit(out, t, 0.4, 'lowpass', 900, 0.25, 2);
      f.frequency.exponentialRampToValueAtTime(90, t + 0.35);
    }
  }
}

// Owns the clock. Song time is derived from the audio hardware, not frames.
class Conductor {
  constructor(synth, song, leadInMs, offsetMs) {
    this.synth = synth; this.song = song;
    this.leadIn = leadInMs / 1000; this.offset = offsetMs;
    this.idx = 0; this.timer = null; this.bus = null;
    this.last = -Infinity; this.untilBeat = Infinity; this.onEnd = null;
  }
  // `fromBeat` starts part-way through the piece and `untilBeat` stops there (used by the menu preview).
  start(fromBeat = 0, untilBeat = Infinity) {
    const c = this.synth.ctx, evs = this.song.events;
    this.bus = this.synth.newBus(this.song.spb);
    this.musicStart = c.currentTime + 0.1 + this.leadIn - fromBeat * this.song.spb;
    this.idx = 0; this.last = -Infinity; this.untilBeat = untilBeat;
    while (this.idx < evs.length && evs[this.idx].beat < fromBeat) this.idx++;
    this.timer = setInterval(() => this.pump(), 20);
    this.pump();
  }
  pump() {
    const c = this.synth.ctx;
    if (c.state !== 'running' || !this.bus) return;
    const horizon = c.currentTime + 0.25, evs = this.song.events, spb = this.song.spb;
    while (this.idx < evs.length) {
      const ev = evs[this.idx];
      const when = this.musicStart + ev.beat * spb;
      if (when > horizon) break;
      if (ev.beat >= this.untilBeat) { this.idx = evs.length; break; }
      if (when >= c.currentTime - 0.01) this.synth.play(this.bus, ev, when, this.song);
      this.idx++;
    }
    if (this.onEnd && c.currentTime > this.musicStart + Math.min(this.untilBeat, this.song.totalBeats) * spb) { const f = this.onEnd; this.onEnd = null; f(); }
  }
  // Song time in ms (negative during lead-in). Monotonic.
  timeMs() {
    const c = this.synth.ctx;
    let t;
    if (c.state === 'running' && c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) {
        t = ts.contextTime + Math.min(0.05, (performance.now() - ts.performanceTime) / 1000);
      }
    }
    if (t === undefined) t = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    const ms = (t - this.musicStart) * 1000 - this.offset;
    if (ms > this.last) this.last = ms;
    return this.last;
  }
  // Context time at which a sound must start to coincide with song time `ms` in the music.
  ctxTimeFor(ms) { return this.musicStart + ms / 1000; }
  pause() { return this.synth.ctx.suspend(); }
  resume() { return this.synth.ctx.resume(); }
  stop(fade) {
    clearInterval(this.timer); this.timer = null;
    this.synth.stopBus(this.bus, fade);
    this.bus = null;
  }
}
