/**
 * Running inside Discord, as a Discord Activity (see docs/discord-activity.md).
 *
 * Discord serves the game from https://<client id>.discordsays.com/?frame_id=... Only then do we
 * load Discord's SDK (discordActivity.ts, a separate download), sign the player in through
 * Discord, and show what they're doing on their Discord profile. Everywhere else this file does
 * nothing and the SDK is never downloaded.
 *
 * Nothing here may break the game: if Discord doesn't answer or turns us down, one warning goes
 * to the console and the title screen says what to do.
 */

import { TEAMS, type TeamId } from '../content/teams';

/** Inside Discord: whether the player was signed in at launch, and if not, why. */
export type DiscordSignIn =
  | { signedIn: true }
  /** not-member / no-role / failed come from the server; discord means the SDK step failed. */
  | { signedIn: false; reason: 'not-member' | 'no-role' | 'failed' | 'discord' };

/** What Discord shows under "Playing <app name>". startedAt (ms since 1970) adds an elapsed timer. */
export interface Presence {
  details: string;
  state?: string;
  startedAt?: number;
}

/** Discord launched this page: its address is <client id>.discordsays.com and it carries a frame_id. */
export function isDiscordLaunch(hostname: string, search: string): boolean {
  return /^\d+\.discordsays\.com$/.test(hostname) && new URLSearchParams(search).has('frame_id');
}

export const IN_DISCORD =
  typeof window !== 'undefined' && isDiscordLaunch(window.location.hostname, window.location.search);

export const MENU_PRESENCE: Presence = { details: 'In the menu' };

export const trainingPresence = (lessonTitle: string): Presence => ({
  details: 'Training',
  state: lessonTitle,
});

const matchup = (home: TeamId, away: TeamId) => `${TEAMS[home].name} vs ${TEAMS[away].name}`;

/** A match in progress. The player is always the home side. Periods past `periods` are overtime. */
export function matchPresence(
  m: { home: TeamId; away: TeamId; score: readonly [number, number]; period: number; periods: number },
  startedAt: number,
): Presence {
  const when = m.period > m.periods ? 'Overtime' : `Period ${m.period}`;
  return { details: matchup(m.home, m.away), state: `${when} · ${m.score[0]}–${m.score[1]}`, startedAt };
}

/** A finished match, from the player's (home) side. */
export function resultPresence(m: {
  home: TeamId;
  away: TeamId;
  score: readonly [number, number];
}): Presence {
  const [us, them] = m.score;
  const outcome = us > them ? 'Won' : us < them ? 'Lost' : 'Final';
  return { details: matchup(m.home, m.away), state: `${outcome} ${us}–${them}` };
}

let warned = false;

/** Writes the first Discord problem to the console and ignores the rest. */
export function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('Spellstick: Discord features are off.', err);
}

/** What connecting gives the rest of the game (from discordActivity.ts). */
export interface DiscordConnection {
  signIn: DiscordSignIn;
  setPresence(presence: Presence): void;
  openExternal(url: string): void;
}

let latestKey = '';
let latest: Presence | null = null;
let connection: Promise<DiscordConnection> | null = null;
let connected: DiscordConnection | null = null;

/** Connects to Discord when Discord launched the page. Call once at startup. */
export function startDiscord(): void {
  if (!IN_DISCORD || connection) return;
  connection = import('./discordActivity').then((activity) => activity.connect());
  connection.then((c) => {
    connected = c;
    if (latest) c.setPresence(latest);
  }, warnOnce);
}

/** Inside Discord: the sign-in result at launch, once Discord has answered. Outside Discord: null. */
export function discordSignIn(): Promise<DiscordSignIn> | null {
  return (
    connection?.then(
      (c) => c.signIn,
      (): DiscordSignIn => ({ signedIn: false, reason: 'discord' }),
    ) ?? null
  );
}

/** Shows this on the player's Discord profile. Repeats are skipped. Does nothing outside Discord. */
export function setDiscordPresence(presence: Presence): void {
  if (!IN_DISCORD) return;
  const key = JSON.stringify(presence);
  if (key === latestKey) return;
  latestKey = key;
  latest = presence;
  connected?.setPresence(presence);
}

/**
 * Opens a link outside the game: in Discord, Discord asks the player and opens it in their
 * browser (a frame can't navigate away); elsewhere, the page goes there (mailto: opens email).
 */
export function openExternal(url: string): void {
  if (connected) connected.openExternal(url);
  else window.location.href = url;
}
