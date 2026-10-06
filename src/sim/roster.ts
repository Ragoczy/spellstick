import { arenaGeometry, type TeamIndex } from './arena';
import type { SimConfig } from './config';
import type { RosterEntry } from './types';

/** Where a team's goalie starts: just in front of the goal mouth. */
function goaliePos(config: SimConfig, team: TeamIndex) {
  const goal = arenaGeometry(config).goals[team];
  return { x: goal.mouth.x - goal.backDir * 1.0, y: goal.mouth.y };
}

/** M2 practice: you and one teammate attack the away goalie (2v0 + goalie). */
export function practiceRoster(config: SimConfig): RosterEntry[] {
  return [
    { team: 0, number: 7, pos: { x: -4, y: 0 } },
    { team: 0, number: 12, pos: { x: 6, y: -7 } },
    { team: 1, number: 1, pos: goaliePos(config, 1), role: 'goalie' },
  ];
}

/** One runner per side, no goalies. */
export function duelRoster(): RosterEntry[] {
  return [
    { team: 0, number: 7, pos: { x: -6, y: 0 } },
    { team: 1, number: 9, pos: { x: 6, y: 0 } },
  ];
}

/** `runners` per side plus a goalie each, spread across each team's own half. */
export function scrimmageRoster(config: SimConfig, runners: number): RosterEntry[] {
  const halfWidth = config.rink.width / 2;
  const roster: RosterEntry[] = [];
  for (const team of [0, 1] as const) {
    const side = team === 0 ? -1 : 1;
    roster.push({ team, number: 1, pos: goaliePos(config, team), role: 'goalie' });
    for (let i = 0; i < runners; i++) {
      // Fan out across the width, alternating near and far from center.
      const y = runners === 1 ? 0 : -halfWidth * 0.55 + (halfWidth * 1.1 * i) / (runners - 1);
      const x = side * (i % 2 === 0 ? 5 : 11);
      roster.push({ team, number: [7, 12, 18, 22, 33][i] ?? 40 + i, pos: { x, y } });
    }
  }
  return roster;
}
