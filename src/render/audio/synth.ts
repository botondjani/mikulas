/**
 * Hangok: a legtöbb Web Audio-val generált; az állathangok, a horkolás, a morgás és a
 * majszolás valódi, CC0 (közkincs) felvételek (public/sounds, forrás: CREDITS.md).
 * Ha egy felvétel nem töltődik be, a generált változat szól helyette.
 * A dallam saját szerzemény (lassú, keringő-ütemű altatódal).
 */
const SAMPLES: Record<string, string[]> = {
  bark: ['bark1', 'bark2', 'bark3', 'bark4'],
  snore: ['snore'],
  exhale: ['exhale'],
  growl: ['growl1', 'growl2', 'growl3'],
  eat: ['eat1', 'eat2', 'eat3', 'eat4'],
  scream: ['scream1', 'scream2', 'scream3'],
  monster: ['monster1', 'monster2', 'monster3'],
  laugh: ['laugh1'],
};
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
  /** az éppen lejátszott effekt hangereje (távolság szerint) */
  private v = 1;
  private samples = new Map<string, AudioBuffer[]>();

  constructor(
    private muted: boolean,
    private volume = 1,
  ) {}

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
      this.master.gain.value = this.muted ? 0 : 0.8 * this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.loadSamples();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private loadSamples(): void {
    const ctx = this.ctx!;
    for (const [group, files] of Object.entries(SAMPLES))
      for (const f of files)
        fetch(`./sounds/${f}.mp3`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
          .then((b) => new Promise<AudioBuffer>((ok, bad) => ctx.decodeAudioData(b, ok, bad)))
          .then((buf) => this.samples.set(group, [...(this.samples.get(group) ?? []), buf]))
          .catch(() => {
            /* marad a generált hang */
          });
  }

  /** Felvétel lejátszása (véletlen változat, kicsit eltérő hangmagassággal). false, ha nincs betöltve. */
  private sample(group: string, at: number, vol: number, rate = 1): boolean {
    const ctx = this.ctx;
    const list = this.samples.get(group);
    if (!ctx || !this.master || !list?.length) return false;
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (0.93 + Math.random() * 0.14);
    const g = ctx.createGain();
    g.gain.value = vol * this.v;
    src.connect(g).connect(this.master);
    src.start(at);
    return true;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8 * this.volume, this.ctx.currentTime, 0.05);
  }

  get vol(): number {
    return this.volume;
  }

  setVolume(v: number): void {
    this.volume = v;
    this.setMuted(this.muted);
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
    const v = Math.max(0.0002, vol * (opts.dest ? 1 : this.v));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
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
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * this.v), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /**
   * Állati/emberi hangszerű hang: fűrészfog-forrás hangmagasság-görbével, érdesítő
   * amplitúdómodulációval (rezgés), zajjal és formánsszűrőkkel (hangszín).
   */
  private voice(o: {
    at: number;
    dur: number;
    vol: number;
    pitch: [number, number][];
    rough: number;
    roughDepth: number;
    formants: [number, number][];
    noise?: number;
    attack?: number;
    release?: number;
    jitter?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = o.at;
    const end = t + o.dur;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol * this.v), t + (o.attack ?? 0.01));
    out.gain.setValueAtTime(Math.max(0.0002, o.vol * this.v), end - (o.release ?? 0.05));
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(this.master);
    // formánsok párhuzamosan
    const mix = ctx.createGain();
    for (const [f, q] of o.formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      mix.connect(bp).connect(out);
    }
    // érdesség: amplitúdó-moduláció
    const am = ctx.createGain();
    am.gain.value = 1 - o.roughDepth / 2;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = o.rough;
    const lfoG = ctx.createGain();
    lfoG.gain.value = o.roughDepth / 2;
    lfo.connect(lfoG).connect(am.gain);
    am.connect(mix);
    // hangforrás
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.pitch[0][1], t);
    for (const [dt, f] of o.pitch.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + dt);
    if (o.jitter) {
      const j = ctx.createOscillator();
      j.frequency.value = 6 + Math.random() * 5;
      const jg = ctx.createGain();
      jg.gain.value = o.jitter;
      j.connect(jg).connect(osc.frequency);
      j.start(t);
      j.stop(end);
    }
    osc.connect(am);
    if (o.noise) {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      const ng = ctx.createGain();
      ng.gain.value = o.noise;
      n.connect(ng).connect(am);
      n.start(t, Math.random() * 0.5);
      n.stop(end);
    }
    osc.start(t);
    lfo.start(t);
    osc.stop(end + 0.02);
    lfo.stop(end + 0.02);
  }

  private bell(f: number, vol: number, at?: number, dur = 1.2): void {
    this.tone(f, dur, 'sine', vol, { at });
    this.tone(f * 2.76, dur * 0.6, 'sine', vol * 0.35, { at });
    this.tone(f * 5.4, dur * 0.3, 'sine', vol * 0.15, { at });
  }

  // ---------- effektek ----------

  /** `vol`: 0..1 hangerő-szorzó (pl. távolság szerint) */
  play(id: string, vol = 1): void {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    this.v = Math.min(1, vol);
    this.effect(id, this.ctx.currentTime);
    this.v = 1;
  }

  private effect(id: string, t: number): void {
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
      case 'bark': {
        // valódi felvétel: egy-két ugatás
        if (this.sample('bark', t, 0.9)) {
          if (Math.random() < 0.6) this.sample('bark', t + 0.32 + Math.random() * 0.08, 0.8);
          break;
        }
        // „vau-vau": gyors felfutás, a hangmagasság fel-, majd leível
        const base = 0.9 + Math.random() * 0.25;
        for (const [k, at] of [
          [1, t],
          [0.92, t + 0.24],
        ] as const)
          this.voice({
            at,
            dur: 0.17,
            vol: 0.55,
            pitch: [
              [0, 330 * base * k],
              [0.035, 560 * base * k],
              [0.17, 260 * base * k],
            ],
            rough: 70,
            roughDepth: 0.7,
            formants: [
              [650, 4],
              [1500, 5],
              [2600, 6],
            ],
            noise: 0.5,
            attack: 0.006,
            release: 0.12,
            jitter: 25,
          });
        break;
      }
      case 'snore':
        if (this.sample('snore', t, 0.75)) {
          this.sample('exhale', t + 0.95, 0.5);
          break;
        }
        // belégzés: a lágy szájpad csattogása (kb. 30 Hz), mély, érdes
        this.voice({
          at: t,
          dur: 1.3,
          vol: 0.5,
          pitch: [
            [0, 78],
            [1.3, 92],
          ],
          rough: 31,
          roughDepth: 0.95,
          formants: [
            [260, 2],
            [520, 3],
          ],
          noise: 1.2,
          attack: 0.55,
          release: 0.3,
        });
        // kifújás: szuszogás, halk fütty
        this.noise(0.9, 0.06, 'bandpass', 700, { at: t + 1.45, to: 400, q: 1.2 });
        this.tone(980, 0.5, 'sine', 0.012, { at: t + 1.55, to: 820 });
        break;
      case 'tv': {
        // csacsogás: rövid, beszédszerű zajfoszlányok
        const f = 600 + Math.random() * 900;
        this.noise(0.18, 0.05, 'bandpass', f, { to: f * (0.8 + Math.random() * 0.5), q: 6 });
        if (Math.random() < 0.15) this.tone(freq(72 + Math.floor(Math.random() * 12)), 0.25, 'triangle', 0.03);
        break;
      }
      case 'knit':
        this.tone(3200, 0.02, 'sine', 0.05);
        this.tone(2800, 0.02, 'sine', 0.04, { at: t + 0.09 });
        break;
      case 'growl':
        if (this.sample('growl', t, 0.85, 0.95)) break;
        // mély, érdes, remegő torokhang
        this.voice({
          at: t,
          dur: 1.1,
          vol: 0.7,
          pitch: [
            [0, 72],
            [0.3, 96],
            [1.1, 64],
          ],
          rough: 23,
          roughDepth: 0.85,
          formants: [
            [320, 3],
            [780, 4],
            [1300, 6],
          ],
          noise: 0.6,
          attack: 0.12,
          release: 0.35,
          jitter: 6,
        });
        break;
      case 'munch':
        if (this.sample('eat', t, 0.8)) {
          this.sample('eat', t + 0.55, 0.7);
          this.sample('eat', t + 1.1, 0.75);
          break;
        }
        for (let i = 0; i < 4; i++) {
          this.noise(0.08, 0.35, 'bandpass', 1400 + Math.random() * 600, { at: t + i * 0.16, q: 2 });
          this.tone(180, 0.07, 'sine', 0.18, { at: t + i * 0.16 });
        }
        break;
      case 'yum':
        this.voice({
          at: t,
          dur: 0.6,
          vol: 0.45,
          pitch: [
            [0, 140],
            [0.25, 190],
            [0.6, 120],
          ],
          rough: 12,
          roughDepth: 0.3,
          formants: [
            [450, 4],
            [1100, 5],
          ],
          attack: 0.05,
          release: 0.2,
        });
        [79, 84, 88].forEach((m, i) => this.tone(freq(m), 0.25, 'triangle', 0.07, { at: t + 0.5 + i * 0.1 }));
        break;
      case 'chain':
        for (let i = 0; i < 4; i++) this.tone(1800 + Math.random() * 1200, 0.06, 'square', 0.025, { at: t + i * 0.07 });
        break;
      case 'chew':
        this.noise(0.06, 0.05, 'bandpass', 1200, { q: 3 });
        this.noise(0.06, 0.05, 'bandpass', 1000, { at: t + 0.12, q: 3 });
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
        this.effect('growl', t);
        this.effect('chain', t + 0.2);
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
      case 'belt':
        this.tone(150, 0.05, 'triangle', 0.05);
        this.noise(0.04, 0.03, 'bandpass', 2500, { q: 4 });
        break;
      case 'slip':
        this.noise(0.25, 0.1, 'bandpass', 3000, { to: 900, q: 2 });
        this.tone(300, 0.2, 'triangle', 0.1, { at: t + 0.2, to: 90 });
        this.noise(0.2, 0.14, 'lowpass', 500, { at: t + 0.32 });
        break;
      case 'scream':
        if (this.sample('scream', t, 0.9)) {
          this.sample('scream', t + 0.35, 0.7, 1.25);
          break;
        }
        // sikítozó háziak: egymásra csúszó, magas, vibráló hangok
        for (let i = 0; i < 3; i++) this.tone(900 + i * 170, 1.1, 'sawtooth', 0.05, { at: t + i * 0.18, to: 1400 + i * 120 });
        this.noise(1.2, 0.08, 'bandpass', 2500, { to: 1600, q: 2 });
        break;
      case 'thunder':
        this.noise(0.25, 0.25, 'lowpass', 2400, { to: 300 });
        this.noise(2.2, 0.22, 'lowpass', 260, { at: t + 0.35, to: 60 });
        break;
      case 'powerDown':
        this.tone(220, 0.7, 'sawtooth', 0.07, { to: 40 });
        break;
      case 'powerUp':
        this.tone(60, 0.5, 'sawtooth', 0.05, { to: 220 });
        this.tone(1200, 0.08, 'square', 0.03, { at: t + 0.45 });
        break;
      case 'jumpscare':
        // hirtelen, hangos, disszonáns csapás (+ szörnyhang felvételről)
        this.sample('monster', t, 1);
        this.noise(0.6, 0.5, 'bandpass', 1800, { to: 600, q: 0.8 });
        [61, 62, 66, 67].forEach((m) => this.tone(freq(m + 12), 0.9, 'sawtooth', 0.12, { to: freq(m) }));
        this.tone(55, 0.8, 'square', 0.2, { to: 30 });
        this.effect('growl', t);
        break;
      case 'murder':
        this.effect('jumpscare', t);
        this.sample('scream', t + 0.25, 1);
        this.sample('laugh', t + 1.4, 0.9);
        for (let i = 0; i < 3; i++) this.tone(1100 + i * 140, 1.6, 'sawtooth', 0.07, { at: t + 0.1 + i * 0.12, to: 500 });
        this.noise(0.25, 0.4, 'highpass', 2500, { at: t + 0.5 });
        this.noise(0.25, 0.4, 'highpass', 2500, { at: t + 0.85 });
        break;
      case 'heartbeat':
        this.tone(60, 0.12, 'sine', 0.45, { to: 40 });
        this.tone(55, 0.12, 'sine', 0.35, { at: t + 0.18, to: 38 });
        break;
      case 'bang':
        // dörömbölés az ajtón
        this.noise(0.18, 0.5, 'lowpass', 500, { to: 120 });
        this.tone(80, 0.2, 'sine', 0.4, { to: 40 });
        break;
      case 'cuff':
        this.tone(2400, 0.05, 'square', 0.08);
        this.tone(1800, 0.05, 'square', 0.08, { at: t + 0.08 });
        this.noise(0.12, 0.15, 'highpass', 4000, { at: t + 0.04 });
        this.effect('siren', t + 0.3);
        break;
      case 'krampusCatch':
        this.effect('growl', t);
        this.effect('caught', t);
        break;
      case 'carDoor':
        this.noise(0.12, 0.3, 'lowpass', 900, { to: 200 });
        this.tone(140, 0.1, 'sine', 0.2, { to: 70 });
        break;
      case 'siren':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 660 : 880, 0.32, 'square', 0.05, { at: t + i * 0.33 });
        break;
      case 'skid':
        this.noise(0.5, 0.1, 'bandpass', 2500, { to: 700, q: 3 });
        break;
      case 'thud':
        this.tone(90, 0.25, 'sine', 0.2, { to: 45 });
        this.noise(0.25, 0.12, 'lowpass', 600, { to: 200 });
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
