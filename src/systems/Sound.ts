// Sound.ts — placeholder sound: little synthesized blips via WebAudio, no audio files.
// Every effect is a tiny recipe (oscillator + envelope, or a burst of noise).

class SoundSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  /** Browsers only allow sound after the first tap/key. Call this from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // 'suspended' before the first gesture; iOS also uses 'interrupted' after a call / app switch
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  private get ready() { return !!this.ctx && !!this.master && this.ctx.state === 'running' && !this.muted; }

  /** A single oscillator note with a pitch slide and a quick fade. */
  private tone(type: OscillatorType, from: number, to: number, dur: number, vol = 0.5, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered noise — impacts, whooshes. */
  private noise(dur: number, vol: number, filterFrom: number, filterTo: number, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(filterFrom, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Hero's sword lands. Heavier with each weapon tier. */
  heroHit(tier: number) {
    this.noise(0.08 + tier * 0.02, 0.6, 1800, 300);
    this.tone('square', 200 - tier * 30, 60, 0.09 + tier * 0.02, 0.35);
  }
  troopHit()    { this.noise(0.06, 0.25, 1500, 400); this.tone('square', 260, 120, 0.06, 0.15); }
  heroHurt()    { this.tone('sine', 110, 55, 0.16, 0.6); this.noise(0.1, 0.4, 600, 150); }
  troopHurt()   { this.tone('triangle', 180, 90, 0.1, 0.25); }
  enemyDie()    { this.noise(0.18, 0.45, 900, 120); this.tone('sawtooth', 160, 40, 0.18, 0.25); }
  troopDie()    { this.tone('sawtooth', 220, 60, 0.35, 0.35); this.noise(0.2, 0.3, 700, 100); }
  gold()        { this.tone('sine', 880, 880, 0.07, 0.35); this.tone('sine', 1320, 1320, 0.1, 0.35, 0.06); }
  arrow()       { this.noise(0.09, 0.25, 3000, 1200); }
  bow()         { this.noise(0.07, 0.3, 2600, 900); this.tone('triangle', 520, 180, 0.09, 0.22); }
  travel()      { this.tone('sine', 330, 330, 0.08, 0.15); this.tone('sine', 440, 440, 0.1, 0.15, 0.09); }
  patrol()      { this.tone('sawtooth', 140, 90, 0.4, 0.4); this.tone('square', 220, 220, 0.12, 0.25, 0.3); this.tone('square', 220, 220, 0.12, 0.25, 0.5); }
  door()        { this.noise(0.12, 0.25, 500, 150); }
  warHorn() {
    this.tone('sawtooth', 110, 165, 0.55, 0.5);
    this.tone('sawtooth', 165, 220, 0.45, 0.4, 0.25);
    this.tone('square', 220, 330, 0.4, 0.2, 0.5);
  }
  charge()      { this.noise(0.18, 0.5, 400, 3200); this.tone('triangle', 150, 400, 0.15, 0.25); }
  chargeHit()   { this.noise(0.1, 0.5, 1200, 200); this.tone('square', 140, 50, 0.12, 0.4); }
  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone('square', n, n, 0.14, 0.3, i * 0.12));
    this.tone('square', 1047, 1047, 0.5, 0.3, 0.5);
  }
  defeat()      { this.tone('sawtooth', 220, 80, 0.8, 0.45); this.tone('sawtooth', 165, 60, 0.9, 0.3, 0.1); }
  click()       { this.tone('square', 700, 600, 0.04, 0.2); }
  buy()         { this.tone('sine', 660, 990, 0.12, 0.3); this.tone('sine', 990, 1320, 0.12, 0.3, 0.1); }
  deny()        { this.tone('square', 200, 150, 0.12, 0.25); }
}

export const Sound = new SoundSystem();
