/**
 * "Report a problem": a prefilled email to the Darkspace admins. There's no mail service behind
 * the game, so the player's own mail app sends it.
 */

export const REPORT_EMAIL = 'admin@darkspace.press';

export const REPORT_CATEGORIES = [
  'Bug',
  'Player behavior / harassment',
  'Cheating or exploit',
  'Privacy / data request',
  'Other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Who's reporting, when logged in: included so the admins can act on the report. */
export interface Reporter {
  /** The in-game player name (the Discord username; the game has no separate name). */
  username: string;
  /** Discord user ID. */
  id: string;
}

/** A mailto: link to the admins with "[Spellstick Report] <category>" and a body to fill in. */
export function reportMailto(category: ReportCategory, reporter: Reporter | null): string {
  const lines = reporter ? [`Player name: ${reporter.username}`, `Discord user ID: ${reporter.id}`, ''] : [];
  lines.push('What happened (and when):', '', '');
  // encodeURIComponent, not URLSearchParams: mail apps show URLSearchParams' "+" as a literal plus.
  const subject = encodeURIComponent(`[Spellstick Report] ${category}`);
  const body = encodeURIComponent(lines.join('\r\n'));
  return `mailto:${REPORT_EMAIL}?subject=${subject}&body=${body}`;
}
