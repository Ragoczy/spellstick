import { describe, expect, it } from 'vitest';
import { REPORT_CATEGORIES, REPORT_EMAIL, reportMailto } from './report';

/** mailto:to?subject=..&body=.. → its parts, decoded. */
const parse = (href: string) => {
  const [to, query] = href.slice('mailto:'.length).split('?') as [string, string];
  const params = new Map(query.split('&').map((kv) => kv.split('=') as [string, string]));
  return {
    to,
    subject: decodeURIComponent(params.get('subject') ?? ''),
    body: decodeURIComponent(params.get('body') ?? ''),
  };
};

describe('Report a problem (mailto to the admins)', () => {
  it('has the five categories, each going to admin@darkspace.press with a "[Spellstick Report]" subject', () => {
    expect(REPORT_CATEGORIES).toEqual([
      'Bug',
      'Player behavior / harassment',
      'Cheating or exploit',
      'Privacy / data request',
      'Other',
    ]);
    expect(REPORT_EMAIL).toBe('admin@darkspace.press');
    for (const c of REPORT_CATEGORIES) {
      const m = parse(reportMailto(c, null));
      expect(m.to).toBe('admin@darkspace.press');
      expect(m.subject).toBe(`[Spellstick Report] ${c}`);
    }
  });

  it('includes the player name and Discord user ID when logged in, and nothing about the player otherwise', () => {
    const inBody = parse(reportMailto('Bug', { username: 'test-witch', id: '80351110224678912' })).body;
    expect(inBody).toContain('Player name: test-witch');
    expect(inBody).toContain('Discord user ID: 80351110224678912');
    const outBody = parse(reportMailto('Bug', null)).body;
    expect(outBody).not.toContain('Player name');
    expect(outBody).not.toContain('Discord user ID');
    expect(outBody).toContain('What happened');
  });

  it('encodes spaces as %20, not "+", and keeps "/" and "&" from breaking the link', () => {
    const href = reportMailto('Player behavior / harassment', { username: 'a&b', id: '1' });
    expect(href).not.toContain('+');
    expect(href.match(/&/g)).toHaveLength(1); // only the subject/body separator
    expect(parse(href).body).toContain('Player name: a&b');
  });
});
