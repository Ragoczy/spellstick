/**
 * Recorded announcer clips, found at build time: `announcer-voice/<line id>.mp3` (or
 * .ogg / .wav). Lines without a file stay text-only. See announcer-voice/README.md.
 */
const files = import.meta.glob<string>('./announcer-voice/*.{mp3,ogg,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Preferred format when a line has more than one file. */
const RANK: Record<string, number> = { mp3: 0, ogg: 1, wav: 2 };

/** Line id → clip URL. */
export const VOICE_CLIPS: Readonly<Record<string, string>> = (() => {
  const out: Record<string, { url: string; rank: number }> = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /\/([a-z0-9-]+)\.(mp3|ogg|wav)$/.exec(path);
    if (!m) continue;
    const [, id, ext] = m as unknown as [string, string, string];
    const rank = RANK[ext] ?? 9;
    if (!out[id] || rank < out[id].rank) out[id] = { url, rank };
  }
  return Object.fromEntries(Object.entries(out).map(([id, v]) => [id, v.url]));
})();
