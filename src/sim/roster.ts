import { arenaGeometry, type TeamIndex } from './arena';
import type { SimConfig } from './config';
import type { Lean, RosterEntry } from './types';

/** Jersey numbers handed out to runners in order. */
const RUNNER_NUMBERS = [7, 12, 18, 22, 33, 41];

/** Where a team's goalie starts: just in front of the goal mouth. */
function goaliePos(config: SimConfig, team: TeamIndex) {
  const goal = arenaGeometry(config).goals[team];
  return { x: goal.mouth.x - goal.backDir * 1.0, y: goal.mouth.y };
}

/** Leans for `n` runners: half attack (rounded down), the rest defense. 4 → 2 + 2 (SPEC §3). */
export function runnerLeans(n: number): Lean[] {
  const attackers = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i) => (i < attackers ? 'attack' : 'defense'));
}

/** Spreads `n` values evenly across ±`half` (0 for a single value). */
function spread(n: number, half: number): number[] {
  if (n <= 1) return [0];
  return Array.from({ length: n }, (_, i) => -half + (2 * half * i) / (n - 1));
}

/**
 * `runners` per side plus a goalie each. Attack-leaning runners start near center,
 * defense-leaning runners deeper in their own half.
 */
export function scrimmageRoster(config: SimConfig, runners: number): RosterEntry[] {
  const halfWidth = config.rink.width / 2;
  const roster: RosterEntry[] = [];
  for (const team of [0, 1] as const) {
    const side = team === 0 ? -1 : 1;
    roster.push({ team, number: 1, pos: goaliePos(config, team), role: 'goalie' });
    const leans = runnerLeans(runners);
    const attackYs = spread(leans.filter((l) => l === 'attack').length, halfWidth * 0.4);
    const defenseYs = spread(leans.filter((l) => l === 'defense').length, halfWidth * 0.45);
    leans.forEach((lean, i) => {
      const y = lean === 'attack' ? attackYs.shift()! : defenseYs.shift()!;
      const x = side * (lean === 'attack' ? 4 : 13);
      roster.push({ team, number: RUNNER_NUMBERS[i] ?? 50 + i, pos: { x, y }, lean });
    });
  }
  return roster;
}

/** A full match: `config.teams.runnersPerSide` runners plus a goalie per side. */
export function matchRoster(config: SimConfig): RosterEntry[] {
  return scrimmageRoster(config, config.teams.runnersPerSide);
}

/** M2 practice: you and one teammate attack the away goalie (2v0 + goalie). */
export function practiceRoster(config: SimConfig): RosterEntry[] {
  return [
    { team: 0, number: 7, pos: { x: -4, y: 0 }, lean: 'attack' },
    { team: 0, number: 12, pos: { x: 6, y: -7 }, lean: 'attack' },
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
