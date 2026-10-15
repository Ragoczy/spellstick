/**
 * The Discord side of the game, loaded only when Discord launched the page (see discord.ts).
 * Kept in its own file so the Discord SDK is a separate download that normal players never get.
 *
 * As in Discord's own Activity guide: wait for Discord, then ask the player's permission once,
 * right after ready (Discord shows its prompt the first time), for everything the game needs:
 * who they are and their Darkspace server roles (the same as browser login) and the
 * "Playing Spellstick" profile details. The one-time code goes to our server, which trades it
 * for a token and signs the player in if their roles allow it. The token then lets us set the
 * profile details.
 */

import { DiscordSDK } from '@discord/embedded-app-sdk';
import { warnOnce, type DiscordConnection, type DiscordSignIn, type Presence } from './discord';

/** Discord limits how often an app may change its presence: at most one change per 5 seconds. */
const PRESENCE_GAP_MS = 5000;
const SIGN_IN_URL = '/api/discord/signin';

/** Discord serves the game from https://<client id>.discordsays.com. */
function clientIdFromAddress(): string {
  const match = /^(\d+)\.discordsays\.com$/.exec(window.location.hostname);
  if (!match) throw new Error(`Not served by Discord (${window.location.hostname}).`);
  return match[1]!;
}

/** Connects to Discord and signs in. Throws (with Discord's own error) if Discord can't be reached. */
export async function connect(): Promise<DiscordConnection> {
  const clientId = clientIdFromAddress();
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  openOutsideLinksInBrowser(sdk);

  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds.members.read', 'rpc.activities.write'],
  });

  // A relative address: inside Discord it goes through Discord's proxy to our server.
  const res = await fetch(SIGN_IN_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Sign-in with Discord's code failed: ${res.status}`);
  const answer = (await res.json()) as { access_token: string; signedIn: boolean; reason?: string };
  const reason = answer.reason === 'not-member' || answer.reason === 'no-role' ? answer.reason : 'failed';
  const signIn: DiscordSignIn = answer.signedIn ? { signedIn: true } : { signedIn: false, reason };

  // Profile details are a nice extra: if Discord turns the token down, sign-in still counts.
  let setPresence: (presence: Presence) => void = () => {};
  try {
    const auth = await sdk.commands.authenticate({ access_token: answer.access_token });
    if (!auth) throw new Error('Discord turned down the token.');
    setPresence = presenceSender(sdk);
  } catch (err) {
    warnOnce(err);
  }
  return {
    signIn,
    setPresence,
    openExternal: (url) => void sdk.commands.openExternalLink({ url }).catch(warnOnce),
  };
}

/** Sends presence changes to Discord, at most one per PRESENCE_GAP_MS; the latest one wins. */
function presenceSender(sdk: DiscordSDK): (presence: Presence) => void {
  let waiting: Presence | null = null;
  let lastSentAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!waiting) return;
    const presence = waiting;
    waiting = null;
    lastSentAt = Date.now();
    sdk.commands
      .setActivity({
        activity: {
          type: 0, // "Playing"
          details: presence.details,
          state: presence.state,
          timestamps: presence.startedAt ? { start: presence.startedAt } : undefined,
        },
      })
      .catch(warnOnce);
  };

  return (presence) => {
    waiting = presence;
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, lastSentAt + PRESENCE_GAP_MS - Date.now()));
  };
}

/**
 * Inside Discord, a normal link to another website goes nowhere. Send those clicks to Discord,
 * which asks the player and then opens the link in their browser (Terms, Privacy). Links into
 * the game itself are left alone.
 */
function openOutsideLinksInBrowser(sdk: DiscordSDK): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = event
      .composedPath()
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && node.href !== '');
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin || (url.protocol !== 'https:' && url.protocol !== 'http:'))
      return;
    event.preventDefault();
    sdk.commands.openExternalLink({ url: url.href }).catch(warnOnce);
  });
}
