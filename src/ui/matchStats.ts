import type { SimEvent } from '../sim';

/** Per-team numbers for the results screen (SPEC §9). */
export interface TeamTally {
  shots: number;
  /** Saves made by this team's goalie (Ward blocks count). */
  saves: number;
  /** Body checks this team landed. */
  hits: number;
  spells: number;
}

export const emptyTally = (): [TeamTally, TeamTally] => [
  { shots: 0, saves: 0, hits: 0, spells: 0 },
  { shots: 0, saves: 0, hits: 0, spells: 0 },
];

/** Adds one tick's sim events to the tally. */
export function tallyEvents(tally: [TeamTally, TeamTally], events: readonly SimEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'shot':
        tally[e.team].shots++;
        break;
      case 'save':
        tally[e.team].saves++;
        break;
      case 'wardBlock':
        tally[e.team].saves++;
        break;
      case 'check':
        tally[e.team].hits++;
        break;
      case 'cast':
        tally[e.team].spells++;
        break;
    }
  }
}
