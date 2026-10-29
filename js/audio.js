// Ljud och musik via Web Audio API. Inga ljudfiler: allt syntetiseras med oscillatorer och brus.
// - AudioContext skapas först vid första tangent- eller pekarinteraktion (webbläsarna kräver det).
// - Alla anrop är säkra utan AudioContext: då blir det bara tyst.
// - Musiken schemaläggs med en lookahead-scheduler mot AudioContext.currentTime.
const STORAGE_KEY = 'buggjakten.muted';
const MASTER_VOL = 0.7;
const SFX_VOL = 0.8;
const MUSIC_VOL = 0.5;
const LOOKAHEAD = 0.25;   // sekunder framåt som toner schemaläggs
const LOG_SIZE = 20;      // antal effektnamn som sparas i audio.log
const STEPS = 64;         // fyra takter med 16 steg (sextondelar)

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(m) {
  try {
    localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
  } catch { /* privat läge eller blockerad lagring: ignorera */ }
}

// ---------------------------------------------------------------------------------------------
// Musik: två egna loopar. Normal: D-moll (D - Bb - F - C) med puls-bas och arpeggio.
// Boss: E frygisk/halvton-spänning (Em - F - Em - Bb) med snabbare, hårdare mönster.
// ---------------------------------------------------------------------------------------------
const N = null;
const VARIANTS = {
  normal: {
    roots: [38, 34, 41, 36],                    // D2, Bb1, F2, C2
    chords: [[62, 65, 69, 74], [58, 62, 65, 70], [60, 65, 69, 72], [60, 64, 67, 72]],
    bass: [0, N, N, 0, N, N, 12, N, 0, N, 7, N, 0, N, 12, N],
    arp: [0, 1, 2, 3, 2, 1, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2],
    melody: [
      [0, 0, 74, 3], [0, 4, 77, 2], [0, 6, 76, 2], [0, 8, 74, 4],
      [1, 0, 77, 3], [1, 4, 74, 2], [1, 6, 70, 2], [1, 8, 74, 4],
      [2, 0, 72, 3], [2, 4, 77, 2], [2, 6, 76, 2], [2, 8, 69, 2], [2, 12, 72, 2],
      [3, 0, 76, 3], [3, 4, 79, 2], [3, 6, 76, 2], [3, 8, 72, 2], [3, 10, 74, 2], [3, 12, 73, 4],
    ],
    kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
    bassWave: 'triangle', arpWave: 'square', leadWave: 'square',
  },
  boss: {
    roots: [40, 41, 40, 34],                    // E2, F2, E2, Bb1
    chords: [[64, 67, 71, 76], [65, 69, 72, 77], [64, 67, 71, 76], [58, 62, 65, 70]],
    bass: [0, N, 0, 0, N, 0, 12, N, 0, N, 0, 0, N, 0, 13, N],
    arp: [0, 2, 1, 3, 0, 2, 3, 1, 0, 3, 1, 2, 0, 3, 2, 1],
    melody: [
      [0, 0, 76, 2], [0, 3, 75, 1], [0, 4, 76, 2], [0, 8, 79, 2], [0, 11, 78, 1], [0, 12, 76, 4],
      [1, 0, 77, 2], [1, 3, 76, 1], [1, 4, 77, 2], [1, 8, 81, 2], [1, 11, 80, 1], [1, 12, 77, 4],
      [2, 0, 76, 2], [2, 3, 75, 1], [2, 4, 76, 2], [2, 8, 83, 2], [2, 10, 81, 2], [2, 12, 79, 4],
      [3, 0, 82, 2], [3, 4, 81, 2], [3, 8, 79, 2], [3, 10, 77, 2], [3, 12, 75, 4],
    ],
    kick: [0, 3, 6, 8, 11, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    bassWave: 'sawtooth', arpWave: 'square', leadWave: 'square',
  },
};
for (const v of Object.values(VARIANTS)) {
  v.melodyAt = new Map(v.melody.map(([bar, s, midi, len]) => [bar * 16 + s, { midi, len }]));
}

// Tempot (slag per minut) ökar med fiendernas hastighet; bossen har eget tempo per fas
export function tempoFor({ boss, phase = 1, speedRatio = 1 }) {
  if (boss) return 128 + 14 * (phase - 1);
  return Math.round(92 + 34 * (Math.max(1, speedRatio) - 1));
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuf = null;
    this.muted = loadMuted();
    this.log = [];            // senaste effektnamnen (äldst först)
    this.effectCount = 0;     // totalt antal begärda effekter
    this.notesScheduled = 0;  // totalt antal schemalagda musiktoner
    this.music = { want: false, boss: false, tempo: 0, running: false, step: 0, next: 0, bus: null, variant: 'normal' };
    this.listening = false;
  }

  // Lyssnar efter första interaktionen och skapar då AudioContext
  listen() {
    if (this.listening) return;
    this.listening = true;
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    // På touchenheter räknas först pointerup/touchend som användargest för ljud
    window.addEventListener('pointerup', unlock);
    window.addEventListener('touchend', unlock);
  }

  get ctxState() {
    return this.ctx ? this.ctx.state : 'none';
  }

  get masterGain() {
    return this.master ? this.master.gain.value : null;
  }

  get musicTempo() {
    return this.music.want ? this.music.tempo : 0;
  }

  get musicPlaying() {
    return this.music.want && !!this.ctx;
  }

  get musicVariant() {
    return this.music.want && this.ctx ? this.music.variant : null;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOL;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = SFX_VOL;
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = MUSIC_VOL;
        this.musicGain.connect(this.master);
        this.noiseBuf = this.makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null; // tyst om något går fel
    }
  }

  setMuted(m) {
    this.muted = !!m;
    saveMuted(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOL;
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 1);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345; // egen LCG: rör inte spelets seedade slump
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = s / 2147483648 - 1;
    }
    return buf;
  }

  // ---- Byggstenar ----------------------------------------------------------------------------
  // Ton med envelope. opts: to (slutfrekvens), delay, attack, dest
  tone(type, f0, dur, vol, opts = {}) {
    const { to = f0, delay = 0, attack = 0.004, dest = this.sfxGain } = opts;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (to !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtrerat brus. opts: filter ('lowpass'|'highpass'|'bandpass'), f0, to, delay, dest
  noise(dur, vol, opts = {}) {
    const { filter = 'lowpass', f0 = 2000, to = f0, delay = 0, dest = this.sfxGain, at } = opts;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    if (to !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- Ljudeffekter --------------------------------------------------------------------------
  // name: shoot, hit, explosion, powerup, rank, hurt, shieldbreak, refactor, flicker, levelclear, gameover
  // opts.scale: storlek (explosion). Namnet loggas alltid, även om ljudet är tyst eller saknas.
  sfx(name, opts = {}) {
    this.log.push(name);
    if (this.log.length > LOG_SIZE) this.log.shift();
    this.effectCount += 1;
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    try {
      const fx = EFFECTS[name];
      if (fx) fx(this, opts);
    } catch { /* ett trasigt ljud får aldrig stoppa spelet */ }
  }

  // ---- Musik ---------------------------------------------------------------------------------
  // Anropas varje frame. active: ska musik spelas? boss: bossvarianten? tempo: slag per minut.
  updateMusic({ active, boss, tempo }) {
    const m = this.music;
    m.want = active;
    m.tempo = tempo;
    const ctx = this.ctx;
    if (!ctx) return;
    if (!active) {
      if (m.running) this.stopMusic();
      return;
    }
    const variant = boss ? 'boss' : 'normal';
    if (m.running && variant !== m.variant) {
      this.stopMusic(); // byte av variant: tona ut den gamla och börja om i den nya
    }
    if (!m.running) {
      m.variant = variant;
      m.running = true;
      m.step = 0;
      m.bus = ctx.createGain();
      m.bus.connect(this.musicGain);
      m.next = ctx.currentTime + 0.06;
    }
    if (ctx.currentTime > m.next + 0.3) m.next = ctx.currentTime + 0.05; // hängde efter: hoppa framåt
    while (m.next < ctx.currentTime + LOOKAHEAD) {
      const stepDur = 60 / m.tempo / 4;
      try {
        this.scheduleStep(m.step, m.next, stepDur);
      } catch { /* tyst */ }
      m.next += stepDur;
      m.step = (m.step + 1) % STEPS;
    }
  }

  stopMusic() {
    const m = this.music;
    m.running = false;
    const bus = m.bus;
    m.bus = null;
    if (!bus || !this.ctx) return;
    try {
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      setTimeout(() => { try { bus.disconnect(); } catch { /* redan bortkopplad */ } }, 300);
    } catch { /* tyst */ }
  }

  // Startar om loopen från början vid ny match
  resetMusic() {
    if (this.music.running) this.stopMusic();
  }

  scheduleStep(step, t, dur) {
    const v = VARIANTS[this.music.variant];
    const bus = this.music.bus;
    const bar = step >> 4;
    const s = step & 15;
    const chord = v.chords[bar];
    const note = (type, midi, len, vol) => {
      this.tone(type, mtof(midi), len, vol, { delay: t - this.ctx.currentTime, dest: bus });
      this.notesScheduled += 1;
    };
    const bassOff = v.bass[s];
    if (bassOff !== null) note(v.bassWave, v.roots[bar] + bassOff, dur * 1.7, 0.2);
    note(v.arpWave, chord[v.arp[s]], dur * 0.9, s % 4 === 0 ? 0.06 : 0.04);
    const lead = v.melodyAt.get(bar * 16 + s);
    if (lead) note(v.leadWave, lead.midi, dur * lead.len * 0.92, 0.07);
    const at = (arr) => arr.includes(s);
    if (at(v.kick)) this.tone('sine', 140, 0.12, 0.28, { to: 40, delay: t - this.ctx.currentTime, dest: bus });
    if (at(v.snare)) this.noise(0.1, 0.1, { filter: 'bandpass', f0: 1800, at: t, dest: bus });
    if (at(v.hat)) this.noise(0.03, 0.05, { filter: 'highpass', f0: 7000, at: t, dest: bus });
  }
}

// Effektdefinitioner. Håll dem korta och tysta.
const EFFECTS = {
  shoot: (a) => a.tone('square', 1100, 0.09, 0.1, { to: 320 }),
  hit: (a) => {
    a.tone('square', 520, 0.1, 0.12, { to: 160 });
    a.noise(0.06, 0.1, { filter: 'highpass', f0: 3000 });
  },
  explosion: (a, o) => {
    const k = o.scale ?? 1;
    a.noise(0.35 + 0.35 * k, 0.28 * Math.min(1, 0.5 + k / 2), { filter: 'lowpass', f0: 1600, to: 90 });
    a.tone('sine', 120, 0.35 + 0.3 * k, 0.3, { to: 35 });
  },
  powerup: (a) => [72, 76, 79, 84].forEach((m, i) => a.tone('square', mtof(m), 0.09, 0.09, { delay: i * 0.06 })),
  hurt: (a) => {
    a.tone('sawtooth', 320, 0.35, 0.16, { to: 55 });
    a.noise(0.25, 0.14, { filter: 'lowpass', f0: 900, to: 150 });
  },
  shieldbreak: (a) => {
    a.tone('triangle', 500, 0.2, 0.12, { to: 1400 });
    a.noise(0.12, 0.08, { filter: 'bandpass', f0: 3000 });
  },
  refactor: (a) => {
    a.tone('sawtooth', 180, 0.5, 0.12, { to: 1800 });
    a.noise(0.5, 0.1, { filter: 'highpass', f0: 800, to: 6000 });
  },
  rank: (a) => [76, 83, 88].forEach((m, i) => a.tone('square', mtof(m), 0.08, 0.08, { delay: i * 0.06 })),
  flicker: (a) => a.tone('sine', 1900, 0.04, 0.035, { to: 1500 }),
  levelclear: (a) => [67, 71, 74, 79, 83].forEach((m, i) => a.tone('square', mtof(m), 0.14, 0.09, { delay: i * 0.09 })),
  gameover: (a) => [62, 59, 55, 50].forEach((m, i) => a.tone('sawtooth', mtof(m), 0.28, 0.1, { delay: i * 0.22 })),
};
