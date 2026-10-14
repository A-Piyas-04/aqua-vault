/**
 * Procedural Web Audio: no audio files, off by default, created only after a user
 * gesture enables sound.
 */
export type SoundName = 'dig' | 'plunk' | 'build' | 'chime' | 'erase' | 'error' | 'harvest';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private enabled = false;
  private lastPlay = new Map<SoundName, number>();
  private birdTimer = 0;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.ensure();
    if (this.ctx) {
      if (on) void this.ctx.resume();
      else void this.ctx.suspend();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private ensure(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Ambient rain: looped filtered noise.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(filter).connect(this.rainGain).connect(this.master);
    src.start();
  }

  /** Called a few times per second with the current weather intensity (0..1) and ecology (0..1). */
  ambient(rain: number, ecology: number, dt: number): void {
    if (!this.enabled || !this.ctx || !this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(rain * 0.12, this.ctx.currentTime, 0.8);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 4 + Math.random() * 8;
      if (ecology > 0.2 && rain < 0.5 && Math.random() < 0.3 + ecology * 0.5) this.chirp();
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  private chirp(): void {
    const base = 2200 + Math.random() * 900;
    this.tone(base, 0.09, 'sine', 0.05, base * 1.4);
    this.tone(base * 1.1, 0.08, 'sine', 0.04, base * 1.5, 0.13);
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    const minGap = name === 'dig' ? 60 : 90;
    if (now - (this.lastPlay.get(name) ?? 0) < minGap) return;
    this.lastPlay.set(name, now);
    switch (name) {
      case 'dig':
        this.noise(0.07, 500, 0.25);
        break;
      case 'erase':
        this.noise(0.08, 900, 0.18);
        break;
      case 'plunk':
        this.tone(520, 0.18, 'sine', 0.12, 260);
        break;
      case 'build':
        this.tone(330, 0.08, 'triangle', 0.14);
        this.tone(250, 0.1, 'triangle', 0.1, undefined, 0.06);
        break;
      case 'chime':
        this.tone(660, 0.6, 'sine', 0.1);
        this.tone(990, 0.7, 'sine', 0.07, undefined, 0.12);
        this.tone(1320, 0.8, 'sine', 0.05, undefined, 0.24);
        break;
      case 'harvest':
        this.tone(440, 0.15, 'triangle', 0.1, 660);
        break;
      case 'error':
        this.tone(200, 0.12, 'triangle', 0.08, 160);
        break;
    }
  }
}
