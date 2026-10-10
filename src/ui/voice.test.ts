import { describe, expect, it } from 'vitest';
import { analyzeClip, AnnouncerVoice, type VoiceOutput } from './voice';

/** A fake audio output that records what played and lets the test end clips. */
function fakeOutput(muted = false) {
  const playing: { id: number; ended: () => void; stopped: boolean }[] = [];
  let n = 0;
  const out: VoiceOutput & { playing: typeof playing } = {
    isMuted: muted,
    context: {
      decodeAudioData: async () =>
        ({
          sampleRate: 1000,
          getChannelData: () => tone(1000, 0.2, 0.5, 0.3, 0.2),
        }) as unknown as AudioBuffer,
    },
    playVoice: (_buffer, _shape, onEnded) => {
      const entry = { id: n++, ended: onEnded, stopped: false };
      playing.push(entry);
      return () => {
        entry.stopped = true;
      };
    },
    playing,
  };
  return out;
}

/** `lead` s of silence, `speech` s of a tone at amplitude `amp`, then `tail` s of silence. */
function tone(rate: number, lead: number, speech: number, amp: number, tail: number): Float32Array {
  const out = new Float32Array(Math.round(rate * (lead + speech + tail)));
  const start = Math.round(rate * lead);
  const end = start + Math.round(rate * speech);
  for (let i = start; i < end; i++) out[i] = amp * Math.sin((2 * Math.PI * 50 * i) / rate);
  return out;
}

const clips = { 'goal-01': 'goal-01.mp3', 'save-01': 'save-01.mp3' };
const loader = async (url: string) => new TextEncoder().encode(url).buffer as ArrayBuffer;

describe('announcer voice', () => {
  it('lists which lines have recordings', () => {
    expect(new AnnouncerVoice(fakeOutput(), clips, loader).recordedIds).toEqual(['goal-01', 'save-01']);
  });

  it('speaks a recorded line once loaded; a line without a recording stays silent', async () => {
    const out = fakeOutput();
    const voice = new AnnouncerVoice(out, clips, loader);
    await voice.preload();
    expect(voice.speak('save-01', 2)).toBe(true);
    expect(voice.speak('hit-01', 9)).toBe(false); // no clip
    expect(voice.spoken).toEqual(['save-01']);
  });

  it('a more important call cuts off a less important one; not the other way round', async () => {
    const out = fakeOutput();
    const voice = new AnnouncerVoice(out, clips, loader);
    await voice.preload();
    expect(voice.speak('save-01', 2)).toBe(true);
    expect(voice.speak('save-01', 2)).toBe(false); // same importance: don't clip mid-word
    expect(voice.speak('goal-01', 4)).toBe(true); // a goal interrupts
    expect(out.playing[0]!.stopped).toBe(true);
    expect(voice.speak('save-01', 2)).toBe(false); // the goal call keeps going
    out.playing[1]!.ended(); // goal call finishes
    expect(voice.speak('save-01', 2)).toBe(true);
  });

  it('is silent when muted', async () => {
    const voice = new AnnouncerVoice(fakeOutput(true), clips, loader);
    await voice.preload();
    expect(voice.speak('goal-01', 4)).toBe(false);
  });

  it('stop() cuts off the current line', async () => {
    const out = fakeOutput();
    const voice = new AnnouncerVoice(out, clips, loader);
    await voice.preload();
    voice.speak('goal-01', 4);
    voice.stop();
    expect(out.playing[0]!.stopped).toBe(true);
    expect(voice.speak('save-01', 1)).toBe(true);
  });

  it('a clip that fails to load leaves that line text-only', async () => {
    const out = fakeOutput();
    const failing = async (url: string) => {
      if (url.startsWith('save')) throw new Error('404');
      return loader(url);
    };
    const warn = console.warn;
    console.warn = () => {};
    const voice = new AnnouncerVoice(out, clips, failing);
    await voice.preload();
    console.warn = warn;
    expect(voice.speak('save-01', 2)).toBe(false);
    expect(voice.speak('goal-01', 4)).toBe(true);
  });

  it('with no recordings at all, nothing loads and nothing plays', async () => {
    const voice = new AnnouncerVoice(fakeOutput(), {}, loader);
    await voice.preload();
    expect(voice.recordedIds).toEqual([]);
    expect(voice.speak('goal-01', 4)).toBe(false);
  });
});

describe('clip trimming and leveling', () => {
  const rate = 8000;

  it('skips the silence before the speech and stops shortly after it', () => {
    const shape = analyzeClip(tone(rate, 1.3, 0.7, 0.3, 1.3), rate);
    expect(shape.offset).toBeGreaterThan(1.2);
    expect(shape.offset).toBeLessThan(1.31);
    expect(shape.duration).toBeGreaterThan(0.7);
    expect(shape.duration).toBeLessThan(0.85);
  });

  it('turns quiet clips up and loud clips down toward the same level', () => {
    const quiet = analyzeClip(tone(rate, 0.1, 0.5, 0.12, 0.1), rate);
    const loud = analyzeClip(tone(rate, 0.1, 0.5, 0.35, 0.1), rate);
    expect(quiet.gain).toBeGreaterThan(1);
    expect(loud.gain).toBeLessThan(1);
    // Leveled speech comes out at about the same RMS.
    const rms = (amp: number, gain: number) => (amp / Math.SQRT2) * gain;
    expect(rms(0.12, quiet.gain)).toBeCloseTo(rms(0.35, loud.gain), 2);
  });

  it('never boosts a clip so much its peak would clip', () => {
    // A spiky clip: low average level but one near-full-scale sample.
    const s = tone(rate, 0.1, 0.5, 0.05, 0.1);
    s[Math.round(rate * 0.3)] = 0.9;
    const shape = analyzeClip(s, rate);
    expect(s[Math.round(rate * 0.3)]! * shape.gain).toBeLessThanOrEqual(0.98 + 1e-6);
  });

  it('a silent file plays as-is', () => {
    expect(analyzeClip(new Float32Array(rate), rate)).toEqual({ offset: 0, duration: 1, gain: 1 });
  });
});
