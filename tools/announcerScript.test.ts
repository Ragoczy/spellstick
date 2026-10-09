import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allAnnouncerLines, ANNOUNCER, CALLOUT_DIRECTION } from '../src/content/announcer';
import { renderScript, SCRIPT_PATH } from './announcerScript';

const VOICE_DIR = fileURLToPath(new URL('../src/content/announcer-voice/', import.meta.url));

describe('announcer recording script', () => {
  it('docs/ANNOUNCER_SCRIPT.md is up to date (run `npm run announcer:script` if this fails)', () => {
    expect(readFileSync(SCRIPT_PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(renderScript());
  });

  it('every line has a unique, file-name-safe id', () => {
    const ids = allAnnouncerLines().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('every situation has direction and at least one line', () => {
    for (const kind of Object.keys(ANNOUNCER) as (keyof typeof ANNOUNCER)[]) {
      expect(ANNOUNCER[kind].length).toBeGreaterThan(0);
      expect(CALLOUT_DIRECTION[kind].when).not.toBe('');
      expect(CALLOUT_DIRECTION[kind].delivery).not.toBe('');
    }
  });

  it('every recording in announcer-voice/ matches a line id (catches typos in file names)', () => {
    const ids = new Set(allAnnouncerLines().map((l) => l.id));
    const files = readdirSync(VOICE_DIR).filter((f) => f !== 'README.md');
    for (const f of files) {
      const m = /^([a-z0-9-]+)\.(mp3|ogg|wav)$/.exec(f);
      expect(m, `unexpected file in announcer-voice/: ${f}`).not.toBeNull();
      expect(ids.has(m![1]!), `${f} doesn't match any announcer line id`).toBe(true);
    }
  });
});
