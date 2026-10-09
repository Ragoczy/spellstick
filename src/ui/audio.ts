/**
 * Simple sound effects, synthesized with Web Audio (no asset files): hit, pass, shot,
 * goal horn, whistle, and a spell shimmer. Optional and mutable (SPEC §8); the mute
 * setting is remembered per browser when storage is available.
 *
 * Also plays recorded announcer clips on their own voice bus; effects duck under the
 * voice so the call is easy to hear. One mute covers everything.
 */
export type SoundName = 'hit' | 'pass' | 'shot' | 'goal' | 'whistle' | 'spell' | 'click';

const MUTE_KEY = 'spellstick.muted';
const MASTER_GAIN = 0.5;
/** Effects drop to this level while the announcer is talking... */
const DUCK_GAIN = 0.45;
/** ...and fade back over this long (s). */
const DUCK_RELEASE = 0.25;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Effects bus (ducked under the voice) and voice bus, both into master. */
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private muted: boolean;
  private lastPlayed = new Map<SoundName, number>();

  constructor() {
    this.muted = readMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage blocked (private mode etc.): just don't remember it.
    }
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_GAIN;
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.connect(this.master);
  }

  /** The audio context, once unlocked. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Plays a decoded announcer clip on the voice bus, ducking the effects until it ends.
   * Returns a function that stops it early, or null if audio isn't available.
   */
  playVoice(buffer: AudioBuffer, onEnded: () => void): (() => void) | null {
    const ctx = this.ctx;
    if (!ctx || !this.voiceBus || !this.sfxBus) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.voiceBus);
    const duck = this.sfxBus.gain;
    const now = ctx.currentTime;
    duck.cancelScheduledValues(now);
    duck.setTargetAtTime(DUCK_GAIN, now, 0.03);
    let stopped = false;
    src.onended = () => {
      duck.cancelScheduledValues(ctx.currentTime);
      duck.setTargetAtTime(1, ctx.currentTime, DUCK_RELEASE / 3);
      if (!stopped) onEnded();
    };
    src.start(now);
    return () => {
      stopped = true;
      try {
        src.stop();
      } catch {
        // Already finished.
      }
    };
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    // Don't machine-gun the same sound.
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.06) return;
    this.lastPlayed.set(name, now);
    switch (name) {
      case 'hit':
        this.noise(now, 0.12, 900, 0.9);
        this.tone(now, 'sine', 90, 50, 0.15, 0.8);
        break;
      case 'pass':
        this.noise(now, 0.06, 2500, 0.25);
        break;
      case 'shot':
        this.noise(now, 0.1, 1800, 0.5);
        this.tone(now, 'triangle', 600, 300, 0.08, 0.25);
        break;
      case 'goal':
        for (const f of [220, 277, 330]) this.tone(now, 'sawtooth', f, f, 1.1, 0.12);
        break;
      case 'whistle':
        this.tone(now, 'sine', 2800, 2700, 0.35, 0.25, 30);
        break;
      case 'spell':
        for (const [i, f] of [880, 1320, 1760].entries())
          this.tone(now + i * 0.04, 'sine', f, f * 1.05, 0.25, 0.12);
        break;
      case 'click':
        this.tone(now, 'square', 700, 700, 0.03, 0.08);
        break;
    }
  }

  private tone(
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    vol: number,
    vibratoHz = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
    if (vibratoHz > 0) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = vibratoHz;
      depth.gain.value = 60;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur);
    }
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain).connect(this.sfxBus!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(at: number, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.sfxBus!);
    src.start(at);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
