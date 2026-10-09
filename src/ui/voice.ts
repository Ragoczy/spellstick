/** Where the voice plays; the real one is Sfx (src/ui/audio.ts). */
export interface VoiceOutput {
  readonly isMuted: boolean;
  readonly context: { decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> } | null;
  playVoice(buffer: AudioBuffer, onEnded: () => void): (() => void) | null;
}

export type ClipLoader = (url: string) => Promise<ArrayBuffer>;

const fetchClip: ClipLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.arrayBuffer();
};

/**
 * The announcer's voice: plays the recorded clip for a line, if there is one. A more
 * important call cuts off a less important one already playing; otherwise the new line
 * stays text-only so nothing gets clipped mid-word. Clips are fetched and decoded once,
 * after the first user gesture.
 */
export class AnnouncerVoice {
  private readonly buffers = new Map<string, AudioBuffer>();
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

  /** Fetches and decodes every clip (once). Needs an unlocked audio context. */
  preload(): Promise<void> {
    const ctx = this.out.context;
    if (this.loading || !ctx || Object.keys(this.clips).length === 0)
      return this.loading ?? Promise.resolve();
    this.loading = Promise.all(
      Object.entries(this.clips).map(async ([id, url]) => {
        try {
          this.buffers.set(id, await ctx.decodeAudioData(await this.load(url)));
        } catch (err) {
          // A bad or missing file just leaves that line text-only.
          console.warn(`Announcer clip ${id} failed to load:`, err);
        }
      }),
    ).then(() => undefined);
    return this.loading;
  }

  /** Speaks line `id` at `priority`. Returns true if it started playing. */
  speak(id: string, priority: number): boolean {
    if (this.out.isMuted) return false;
    const buffer = this.buffers.get(id);
    if (!buffer) {
      if (this.clips[id]) void this.preload(); // not loaded yet: get ready for next time
      return false;
    }
    if (this.current && this.current.priority >= priority) return false;
    this.current?.stop();
    const entry = { priority, stop: () => {} };
    const stop = this.out.playVoice(buffer, () => {
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
