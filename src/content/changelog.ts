/**
 * The "What's new" list on the title screen, newest first. Plain, player-facing words;
 * add an entry at the top when a playtest build ships something worth noticing.
 */
export interface ChangelogEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-10-15',
    title: 'Choose your spells',
    items: [
      'Ten spells now, from the card game. Pick three before each match: they go on Q, E, and R (X, Y, B).',
      'New: Pinpoint, Blink, Snare, Ice Wall, Stone Skin, Tailwind, and Glamour Self.',
      'Hex Shove is now Thunderclap, Quickstep is Burst of Speed, and Bent Shot is Misdirection.',
    ],
  },
  {
    date: '2026-10-15',
    title: 'Training remembers, and two teams',
    items: [
      'Training remembers the lessons you finish and picks up where you left off.',
      "The Willowmere Witches are gone: the Wyverns are Willowmere's team. Other teams will join later.",
      'New to Spellstick? The Training button lights up until you finish a lesson.',
    ],
  },
  {
    date: '2026-10-15',
    title: 'Training, goal replays, and team styles',
    items: [
      'Training on this screen: seven short lessons, from scooping a loose ball to winning faceoffs.',
      'Every goal replays in slow motion. Click, Space, or A skips it.',
      'Each team plays its own way: the Wyverns hit hard and carry the ball, and the Ichthyocentaurs pass.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'Settings: report a problem, or unlink your account',
    items: [
      'Report a problem from Settings or the link at the bottom of this screen. It opens an email to the Darkspace admins.',
      'Settings → Unlink my Discord account deletes your Spellstick data and logs you out. Your Discord account is not touched.',
      'The Terms of Service and Privacy Policy are linked at the bottom of this screen and in Settings.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'A new home, and Discord login',
    items: [
      'Spellstick now lives at spellstick.games.darkspace.press.',
      "Log in with Discord to play. It's open to Players in the Darkspace Discord server.",
      'The game only sees your Discord name, avatar, and Darkspace server roles.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'Controllers and 8-bit witches',
    items: [
      'Play with a controller: Xbox, PlayStation, Switch Pro, and most PC pads. The menus work on it too.',
      'Point the right stick at the goal and your shot goes on net.',
      'The new 8-bit look is the default. Add ?look=classic to the address for the old one.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'The announcer picks a side',
    items: [
      'The announcer is on your team now, and gets properly angry when the other side scores or flattens one of yours.',
      'No more laughing at big hits.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'The announcer speaks',
    items: ['Every call has a recorded voice. Sound effects dip under it, and M mutes both.'],
  },
  {
    date: '2026-10-06',
    title: 'A full match',
    items: [
      'Pick your team, your opponent, and Easy, Normal, or Hard.',
      'Results after the final whistle, sound effects, and Esc to pause.',
      'Everyone moves at half speed, and the AI plays a little less chaotically.',
    ],
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-10" → "10 Oct 2026", the same in every locale. */
export function changelogDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}
