import { describe, expect, it } from 'vitest';
import { AnnouncerVoice, type VoiceOutput } from './voice';

/** A fake audio output that records what played and lets the test end clips. */
function fakeOutput(muted = false) {
  const playing: { id: number; ended: () => void; stopped: boolean }[] = [];
  let n = 0;
  const out: VoiceOutput & { playing: typeof playing } = {
    isMuted: muted,
    context: { decodeAudioData: async (data) => ({ data }) as unknown as AudioBuffer },
    playVoice: (_buffer, onEnded) => {
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
