import type { RosterEntry } from './types';

/** One home player, for solo practice in the browser (M1). */
export function practiceRoster(): RosterEntry[] {
  return [{ team: 0, number: 7, pos: { x: -6, y: 0 } }];
}

/** One player per side, for the headless sim until full teams arrive (M3). */
export function duelRoster(): RosterEntry[] {
  return [
    { team: 0, number: 7, pos: { x: -6, y: 0 } },
    { team: 1, number: 9, pos: { x: 6, y: 0 } },
  ];
}
