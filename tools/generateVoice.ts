/**
 * Generates the announcer recordings with ElevenLabs text-to-speech:
 *
 *   npm run announcer:voice                       # every line that doesn't have a clip yet
 *   npm run announcer:voice -- --only goal-01,save-02 --force   # redo specific lines
 *   npm run announcer:voice -- --only hit-01 --takes regular --force   # just the regular take
 *   npm run announcer:voice -- --info             # just show which voice is configured
 *
 * Reads ELEVENLABS_API_KEY from the environment or from `.env.local` in the project root
 * (git-ignored). The key is never printed. Clips go to src/content/announcer-voice/<id>.mp3,
 * which the game picks up at build time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { allAnnouncerLines, clipId, type CalloutKind, type CalloutSide } from '../src/content/announcer';

/** Paul's chosen ElevenLabs voice (2026-10-10). */
export const VOICE_ID = 'hA4zGnmTwX2NQiTRMt7o';
const API = 'https://api.elevenlabs.io/v1';
const OUTPUT_FORMAT = 'mp3_44100_128';
const DEFAULT_MODEL = 'eleven_v3';

/**
 * Delivery tags for eleven_v3, which reads bracketed audio tags as direction rather than
 * speaking them. Other models would read them out loud, so they're only sent to v3.
 * They mirror CALLOUT_DIRECTION in src/content/announcer.ts: the regular take (the moment
 * favors the player's team) and the angry take (it favors the opponent). Emotion tags
 * only: sound tags like [laughing] add noises (Paul cut the laugh on big hits).
 */
const V3_TAGS: Record<CalloutSide, Record<CalloutKind, string>> = {
  for: {
    goal: '[excited] [shouting]',
    overtimeWinner: '[ecstatic] [shouting]',
    save: '[excited]',
    wardBlock: '[awed]',
    bigHit: '[excited]',
    pileup: '[excited]',
    turnover: '[mischievously]',
    shotClock: '[exasperated]',
    crease: '[firmly]',
  },
  against: {
    goal: '[angry] [shouting]',
    overtimeWinner: '[furious] [shouting]',
    save: '[angry]',
    wardBlock: '[angry]',
    bigHit: '[angry] [shouting]',
    pileup: '[angry]',
    turnover: '[angry]',
    shotClock: '[frustrated] [angry]',
    crease: '[angry]',
  },
};

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../src/content/announcer-voice/', import.meta.url));

function apiKey(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const file = `${ROOT}.env.local`;
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*ELEVENLABS_API_KEY\s*=\s*(.*)\s*$/.exec(raw);
      if (m) return m[1]!.replace(/^['"]|['"]$/g, '').trim();
    }
  }
  throw new Error('No ELEVENLABS_API_KEY in the environment or in .env.local.');
}

/** ElevenLabs' error body, without anything sensitive. */
async function apiError(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const j = JSON.parse(body) as { detail?: { message?: string; status?: string } | string };
    const d = j.detail;
    return `${res.status} ${typeof d === 'string' ? d : (d?.message ?? d?.status ?? body.slice(0, 200))}`;
  } catch {
    return `${res.status} ${body.slice(0, 200)}`;
  }
}

async function voiceInfo(key: string): Promise<string> {
  const res = await fetch(`${API}/voices/${VOICE_ID}`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`Looking up voice ${VOICE_ID} failed: ${await apiError(res)}`);
  const v = (await res.json()) as { name?: string; labels?: Record<string, string>; category?: string };
  const labels = v.labels ? Object.values(v.labels).join(', ') : '';
  return `${v.name ?? '(unnamed)'}${labels ? ` (${labels})` : ''}${v.category ? ` [${v.category}]` : ''}`;
}

async function synthesize(key: string, text: string, model: string): Promise<Buffer> {
  const voice_settings =
    model === 'eleven_v3'
      ? { stability: 0.5, similarity_boost: 0.8 } // v3: "Natural"; it takes its cues from the tags
      : { stability: 0.3, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true };
  const res = await fetch(`${API}/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings }),
  });
  if (!res.ok) throw new Error(await apiError(res));
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 2000) throw new Error(`suspiciously small response (${audio.length} bytes)`);
  return audio;
}

/** Rough duration of a 128 kbps MP3. */
const seconds = (bytes: number) => (bytes * 8) / 128_000;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: 'string' },
      force: { type: 'boolean', default: false },
      model: { type: 'string', default: DEFAULT_MODEL },
      info: { type: 'boolean', default: false },
      /** Which takes to make: regular (favors the player's team), angry (favors the opponent), or both. */
      takes: { type: 'string', default: 'both' },
    },
  });
  const key = apiKey();
  // The name lookup needs the voices_read permission; a key restricted to text-to-speech is fine without it.
  const info = await voiceInfo(key).catch(
    (e: Error) => `(name not available: ${e.message.replace(/^.*failed: /, '')})`,
  );
  console.log(`Voice ${VOICE_ID}: ${info}`);
  if (values.info) return;

  const only = values.only ? new Set(values.only.split(',').map((s) => s.trim())) : null;
  const lines = allAnnouncerLines().filter((l) => !only || only.has(l.id));
  if (only) {
    const known = new Set(lines.map((l) => l.id));
    const unknown = [...only].filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`Unknown line ids: ${unknown.join(', ')}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const sides: CalloutSide[] =
    values.takes === 'regular' ? ['for'] : values.takes === 'angry' ? ['against'] : ['for', 'against'];

  let made = 0;
  let skipped = 0;
  let bytes = 0;
  const failed: string[] = [];
  for (const line of lines) {
    for (const side of sides) {
      const id = clipId(line.id, side);
      const file = `${OUT_DIR}${id}.mp3`;
      if (existsSync(file) && !values.force) {
        skipped++;
        continue;
      }
      const text = values.model === 'eleven_v3' ? V3_TAGS[side][line.kind] + ' ' + line.text : line.text;
      try {
        const audio = await synthesize(key, text, values.model);
        writeFileSync(file, audio);
        made++;
        bytes += audio.length;
        console.log(`  ${id.padEnd(22)} ${seconds(audio.length).toFixed(1)} s  ${line.text}`);
      } catch (err) {
        failed.push(id);
        console.error(`  ${id.padEnd(22)} FAILED: ${(err as Error).message}`);
        if (made === 0 && failed.length === 1 && /401|402|403|quota|model/i.test((err as Error).message)) {
          throw new Error('Stopping: the first request failed for a reason every request would hit.', {
            cause: err,
          });
        }
      }
    }
  }
  console.log(
    `\n${made} generated (${(bytes / 1024).toFixed(0)} KB), ${skipped} already had a clip (use --force to redo), ${failed.length} failed.`,
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
