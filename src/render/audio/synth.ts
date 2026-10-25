/**
 * Minden hang Web Audio-val generálva: nincs hangfájl.
 * A dallam saját szerzemény (lassú, keringő-ütemű altatódal).
 */
type Note = [midi: number, beats: number];

// 3/4-es dallam, 16 ütem
const MELODY: Note[] = [
  [67, 2], [76, 1], [74, 2], [72, 1], [74, 1], [76, 1], [79, 1], [76, 3],
  [69, 2], [77, 1], [76, 2], [74, 1], [72, 1], [74, 1], [76, 1], [74, 3],
  [67, 2], [76, 1], [74, 2], [72, 1], [81, 2], [79, 1], [76, 3],
  [77, 2], [74, 1], [76, 1], [72, 1], [69, 1], [71, 1], [74, 1], [67, 1], [72, 3],
];
// ütemenkénti basszus-alaphang
const BASS = [48, 43, 48, 48, 53, 48, 43, 43, 48, 43, 53, 48, 50, 45, 43, 48];

const freq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicOn = false;
  private nextTime = 0;
  private noteIdx = 0;
  private beatInBar = 0;
  private bar = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 0..1: veszélynél gyorsul a zene */
  danger = 0;

  constructor(private muted: boolean) {}

  get isMuted(): boolean {
    return this.muted;
  }

  unlock(): void {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  // ---------- építőkockák ----------

  private tone(
    f: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    opts: { at?: number; to?: number; attack?: number; dest?: AudioNode; vibrato?: number } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = opts.at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    if (opts.vibrato) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = opts.vibrato;
      lg.gain.value = f * 0.04;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur);
    }
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, f: number, opts: { at?: number; to?: number; q?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = opts.at ?? ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const bf = ctx.createBiquadFilter();
    bf.type = filter;
    bf.frequency.setValueAtTime(f, t);
    if (opts.to) bf.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    bf.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  private bell(f: number, vol: number, at?: number, dur = 1.2): void {
    this.tone(f, dur, 'sine', vol, { at });
    this.tone(f * 2.76, dur * 0.6, 'sine', vol * 0.35, { at });
    this.tone(f * 5.4, dur * 0.3, 'sine', vol * 0.15, { at });
  }

  // ---------- effektek ----------

  play(id: string): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (id) {
      case 'step':
        this.noise(0.07, 0.12, 'lowpass', 900);
        break;
      case 'stepQuiet':
        this.noise(0.05, 0.035, 'lowpass', 600);
        break;
      case 'stepWood':
        this.tone(140, 0.05, 'triangle', 0.08);
        this.noise(0.04, 0.05, 'bandpass', 1200);
        break;
      case 'door':
        this.tone(190, 0.45, 'sawtooth', 0.06, { to: 280, vibrato: 22 });
        this.noise(0.12, 0.08, 'lowpass', 400, { at: t + 0.4 });
        break;
      case 'clang':
        this.tone(520, 0.25, 'square', 0.08, { to: 380 });
        this.tone(830, 0.2, 'square', 0.05, { to: 700 });
        this.noise(0.3, 0.12, 'bandpass', 2500, { q: 4 });
        break;
      case 'creak':
        this.tone(320, 0.22, 'sawtooth', 0.07, { to: 240, vibrato: 30 });
        break;
      case 'chimney':
        this.noise(0.5, 0.06, 'bandpass', 500, { to: 1500 });
        break;
      case 'bark':
        this.tone(480, 0.09, 'square', 0.1, { to: 260 });
        this.noise(0.08, 0.06, 'bandpass', 900);
        this.tone(430, 0.1, 'square', 0.09, { at: t + 0.16, to: 230 });
        break;
      case 'bell':
        this.bell(1320, 0.2);
        this.bell(1320, 0.12, t + 0.18);
        break;
      case 'pick':
        this.tone(660, 0.08, 'sine', 0.12, { to: 990 });
        break;
      case 'pack':
        this.noise(0.15, 0.1, 'bandpass', 2000, { to: 5000, q: 2 });
        this.tone(880, 0.08, 'sine', 0.08, { at: t + 0.08 });
        break;
      case 'unpack':
        this.noise(0.12, 0.08, 'bandpass', 4000, { to: 1500, q: 2 });
        break;
      case 'gift':
        this.noise(0.1, 0.12, 'lowpass', 500);
        break;
      case 'happy':
        [72, 76, 79, 84].forEach((m, i) => this.tone(freq(m + 12), 0.4, 'triangle', 0.12, { at: t + i * 0.08 }));
        this.bell(freq(96), 0.08, t + 0.32);
        break;
      case 'sad':
        this.tone(freq(67), 0.3, 'triangle', 0.12);
        this.tone(freq(63), 0.5, 'triangle', 0.12, { at: t + 0.25 });
        break;
      case 'boot':
        this.bell(freq(88), 0.12);
        this.bell(freq(91), 0.1, t + 0.1);
        break;
      case 'stir':
        this.tone(freq(76), 0.25, 'sine', 0.12);
        this.tone(freq(72), 0.35, 'sine', 0.12, { at: t + 0.22 });
        break;
      case 'wake':
        [60, 64, 67, 72].forEach((m, i) => this.tone(freq(m), 0.14, 'square', 0.06, { at: t + i * 0.07 }));
        break;
      case 'caught':
        this.tone(freq(58), 0.3, 'sawtooth', 0.09, { to: freq(55) });
        this.tone(freq(55), 0.3, 'sawtooth', 0.09, { at: t + 0.3, to: freq(52) });
        this.tone(freq(52), 0.7, 'sawtooth', 0.09, { at: t + 0.6, to: freq(46), vibrato: 6 });
        break;
      case 'meow':
        this.tone(700, 0.18, 'sine', 0.1, { to: 1000 });
        this.tone(1000, 0.25, 'sine', 0.08, { at: t + 0.18, to: 600 });
        break;
      case 'krampus':
        this.tone(70, 0.8, 'sawtooth', 0.12, { to: 55, vibrato: 9 });
        this.noise(0.6, 0.05, 'lowpass', 300);
        break;
      case 'steal':
        this.noise(0.3, 0.12, 'bandpass', 800, { to: 3000, q: 3 });
        this.tone(freq(70), 0.25, 'square', 0.06, { to: freq(58) });
        break;
      case 'wind':
        this.noise(3, 0.1, 'bandpass', 400, { to: 900, q: 0.7 });
        break;
      case 'dawn':
        [60, 64, 67].forEach((m) => this.tone(freq(m), 1.6, 'sine', 0.06, { attack: 0.4 }));
        break;
      case 'tick':
        this.tone(1500, 0.03, 'square', 0.04);
        break;
      case 'star':
        this.bell(freq(84), 0.16);
        break;
      case 'window':
        this.bell(freq(79 + Math.floor(Math.random() * 3) * 2), 0.1, undefined, 0.8);
        break;
      case 'win':
        [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => this.tone(freq(m), 0.3, 'triangle', 0.1, { at: t + i * 0.11 }));
        break;
      case 'click':
        this.tone(900, 0.04, 'sine', 0.08);
        break;
    }
  }

  // ---------- zene ----------

  startMusic(): void {
    if (this.musicOn) return;
    this.unlock();
    if (!this.ctx) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.noteIdx = 0;
    this.beatInBar = 0;
    this.bar = 0;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;
    // a lemaradást ne játssza le egyszerre (pl. háttérből visszatérve)
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const bpm = 96 + 40 * this.danger;
      const beat = 60 / bpm;
      const [m, beats] = MELODY[this.noteIdx];
      const dest = this.musicGain;
      // csak a hangjegy kezdetén szól a dallam; minden ütem elején basszus
      this.tone(freq(m), beat * beats * 0.95, 'triangle', 0.16, { at: this.nextTime, attack: 0.02, dest });
      if (beats >= 2) this.tone(freq(m + 12), 0.25, 'sine', 0.03, { at: this.nextTime, dest });
      for (let b = 0; b < beats; b++) {
        const at = this.nextTime + b * beat;
        if (this.beatInBar === 0) this.tone(freq(BASS[this.bar % BASS.length]), beat * 2.6, 'sine', 0.2, { at, attack: 0.03, dest });
        else this.tone(freq(BASS[this.bar % BASS.length] + 19), beat * 0.6, 'sine', 0.05, { at, dest });
        if (this.danger > 0.5 && this.beatInBar !== 0) this.noise(0.04, 0.03, 'highpass', 6000, { at });
        this.beatInBar++;
        if (this.beatInBar >= 3) {
          this.beatInBar = 0;
          this.bar++;
        }
      }
      this.nextTime += beat * beats;
      this.noteIdx = (this.noteIdx + 1) % MELODY.length;
    }
  }
}
