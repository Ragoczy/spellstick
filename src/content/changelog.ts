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
    date: '2026-10-10',
    title: 'A new home, and Discord login',
    items: [
      'Spellstick now lives at spellstick.games.darkspace.press.',
      'Log in with your Discord account to play. The game only sees your Discord name and avatar.',
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
