/** How to play a clip: skip the silence at the start, stop after the speech, level its volume. */
export interface ClipShape {
  /** Seconds into the clip where speech starts (minus a little lead-in). */
  offset: number;
  /** Seconds to play from `offset`. */
  duration: number;
  /** Volume multiplier that brings the clip to the common loudness. */
  gain: number;
}

/** Where the voice plays; the real one is Sfx (src/ui/audio.ts). */
export interface VoiceOutput {
  readonly isMuted: boolean;
  readonly context: { decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> } | null;
  playVoice(buffer: AudioBuffer, shape: ClipShape, onEnded: () => void): (() => void) | null;
}

export type ClipLoader = (url: string) => Promise<ArrayBuffer>;

const fetchClip: ClipLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
};

/** Analysis window for finding speech (s). */
const WINDOW_S = 0.01;
/** A window counts as speech if it's at least this fraction of the loudest window. */
const SPEECH_THRESHOLD = 0.05;
/** Keep this much before the first speech and after the last, so words aren't clipped (s). */
const LEAD_IN_S = 0.02;
const TAIL_S = 0.08;
/** Every clip's speech is leveled to this RMS... */
const TARGET_RMS = 0.16;
/** ...within these limits, and never so loud that its peak would clip. */
const MIN_GAIN = 0.5;
const MAX_GAIN = 2.5;
const PEAK_CEILING = 0.98;

/**
 * Finds the speech in a clip and the gain that levels it. Recordings arrive with uneven
 * silence and loudness (text-to-speech especially), so the game evens them out at load
 * instead of relying on every file being trimmed and normalized by hand.
 */
export function analyzeClip(samples: Float32Array, sampleRate: number): ClipShape {
  const total = samples.length / sampleRate;
  const win = Math.max(1, Math.round(sampleRate * WINDOW_S));
  const rms: number[] = [];
  let peak = 0;
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) {
      const v = samples[j]!;
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    rms.push(Math.sqrt(sum / (end - i)));
  }
  const loudest = Math.max(0, ...rms);
  if (loudest === 0) return { offset: 0, duration: total, gain: 1 };
  const threshold = loudest * SPEECH_THRESHOLD;
  const first = rms.findIndex((v) => v >= threshold);
  let last = rms.length - 1;
  while (last > first && rms[last]! < threshold) last--;

  const offset = Math.max(0, first * WINDOW_S - LEAD_IN_S);
  const end = Math.min(total, (last + 1) * WINDOW_S + TAIL_S);
  // Loudness of the speech itself (windows above the threshold).
  let sum = 0;
  let n = 0;
  for (let i = first; i <= last; i++) {
    if (rms[i]! >= threshold) {
      sum += rms[i]! * rms[i]!;
      n++;
    }
  }
  const speechRms = Math.sqrt(sum / Math.max(1, n));
  let gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_RMS / speechRms));
  gain = Math.min(gain, PEAK_CEILING / peak);
  return { offset, duration: Math.max(0.05, end - offset), gain };
}

/**
 * The announcer's voice: plays the recorded clip for a line, if there is one. A more
 * important call cuts off a less important one already playing; otherwise the new line
 * stays text-only so nothing gets clipped mid-word. Clips are fetched, decoded, trimmed,
 * and leveled once, after the first user gesture.
 */
export class AnnouncerVoice {
  private readonly clipsLoaded = new Map<string, { buffer: AudioBuffer; shape: ClipShape }>();
  private loading: Promise<void> | null = null;
  private current: { priority: number; stop: () => void } | null = null;
  /** Recently spoken line ids, newest last (for the debug handle and tests). */
  readonly spoken: string[] = [];

  constructor(
    private readonly out: VoiceOutput,
    private readonly clips: Readonly<Record<string, string>>,
    private readonly load: ClipLoader = fetchClip,
  ) {}

  /** Line ids that have a recording. */
  get recordedIds(): string[] {
    return Object.keys(this.clips).sort();
  }

  /** How a loaded clip will play (for the debug handle and tests). */
  shapeOf(id: string): ClipShape | undefined {
    return this.clipsLoaded.get(id)?.shape;
  }

  /** Fetches, decodes, and analyzes every clip (once). Needs an unlocked audio context. */
  preload(): Promise<void> {
    const ctx = this.out.context;
    if (this.loading || !ctx || Object.keys(this.clips).length === 0)
      return this.loading ?? Promise.resolve();
    this.loading = Promise.all(
      Object.entries(this.clips).map(async ([id, url]) => {
        try {
          const buffer = await ctx.decodeAudioData(await this.load(url));
          const shape = analyzeClip(buffer.getChannelData(0), buffer.sampleRate);
          this.clipsLoaded.set(id, { buffer, shape });
        } catch (err) {
          // A bad or missing file just leaves that line text-only.
          console.warn(`Announcer clip ${id} failed to load:`, err);
        }
      }),
    ).then(() => undefined);
    return this.loading;
  }

  /**
   * Speaks the first of `ids` that has a recording (e.g. the angry take, then the regular
   * one) at `priority`. Returns true if it started playing.
   */
  speak(ids: string | readonly string[], priority: number): boolean {
    if (this.out.isMuted) return false;
    const list = typeof ids === 'string' ? [ids] : ids;
    const id = list.find((i) => this.clipsLoaded.has(i));
    if (id === undefined) {
      if (list.some((i) => this.clips[i])) void this.preload(); // not loaded yet: get ready for next time
      return false;
    }
    const clip = this.clipsLoaded.get(id)!;
    if (this.current && this.current.priority >= priority) return false;
    this.current?.stop();
    const entry = { priority, stop: () => {} };
    const stop = this.out.playVoice(clip.buffer, clip.shape, () => {
      if (this.current === entry) this.current = null;
    });
    if (!stop) return false;
    entry.stop = stop;
    this.current = entry;
    this.spoken.push(id);
    if (this.spoken.length > 20) this.spoken.shift();
    return true;
  }

  /** Cuts off whatever is playing (pause, quit, new match). */
  stop(): void {
    this.current?.stop();
    this.current = null;
  }
}
