import {
  arenaFor,
  distToSegment,
  type GoalGeometry,
  type MatchState,
  type Player,
  type SimConfig,
  type TeamIndex,
  type Vec2,
} from '../sim';

/**
 * Team-level reads shared by every AI player on a team. They depend only on match state,
 * so each player computes the same answer; results are cached per tick.
 */

export const otherTeam = (t: TeamIndex): TeamIndex => (t === 0 ? 1 : 0);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function attackGoal(config: SimConfig, team: TeamIndex): GoalGeometry {
  return arenaFor(config).goals[otherTeam(team)];
}

export function defendGoal(config: SimConfig, team: TeamIndex): GoalGeometry {
  return arenaFor(config).goals[team];
}

/** A point `out` meters in front of a goal's mouth and `lateral` meters to the side. */
export function goalFrame(goal: GoalGeometry, out: number, lateral: number): Vec2 {
  return { x: goal.mouth.x - goal.backDir * out, y: goal.mouth.y + lateral };
}

export function runnersOf(state: Readonly<MatchState>, team: TeamIndex): Player[] {
  return state.players.filter((p) => p.team === team && p.role === 'runner');
}

/** Which team has the ball: a carrier, or the team whose pass/shot is in the air. Null if loose. */
export function possessingTeam(state: Readonly<MatchState>): TeamIndex | null {
  const ball = state.ball;
  if (ball.carrier !== null) return state.players[ball.carrier]!.team;
  if (ball.flight) return ball.flight.team;
  return null;
}

/** Distance from `p` to the nearest opponent (optionally ignoring goalies). */
export function nearestOpponentDist(state: Readonly<MatchState>, p: Player, includeGoalies = false): number {
  let best = Infinity;
  for (const o of state.players) {
    if (o.team === p.team || (!includeGoalies && o.role === 'goalie')) continue;
    best = Math.min(best, dist(o.pos, p.pos));
  }
  return best;
}

/** True if no opponent body (optionally including goalies) is within `clearance` of the segment. */
export function laneOpen(
  state: Readonly<MatchState>,
  team: TeamIndex,
  from: Vec2,
  to: Vec2,
  clearance: number,
  includeGoalies: boolean,
): boolean {
  for (const o of state.players) {
    if (o.team === team || (o.role === 'goalie' && !includeGoalies)) continue;
    if (distToSegment(o.pos, from, to) <= clearance) return false;
  }
  return true;
}

const byHomeY = (a: Player, b: Player) => a.home.y - b.home.y || a.id - b.id;

/** Everything about the teams that never changes during a match, computed once. */
interface Layout {
  runners: [Player[], Player[]];
  /** Base man-to-man matchups for each team on defense: defender id → attacker id. */
  baseMarks: [Map<number, number>, Map<number, number>];
  /** Offensive home spot for each runner id. */
  spots: Map<number, { out: number; lateral: number }>;
}

// Keyed by the players array, which the sim mutates in place for the whole match.
const layoutCache = new WeakMap<object, Layout>();

function layout(state: Readonly<MatchState>): Layout {
  let l = layoutCache.get(state.players);
  if (l) return l;
  const runners: [Player[], Player[]] = [runnersOf(state, 0), runnersOf(state, 1)];
  const baseMarks: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  for (const team of [0, 1] as const) {
    const ours = runners[team];
    const theirs = runners[otherTeam(team)];
    if (theirs.length === 0) continue;
    const defenders = [
      ...ours.filter((p) => p.lean === 'defense').sort(byHomeY),
      ...ours.filter((p) => p.lean === 'attack').sort(byHomeY),
    ];
    const attackers = [
      ...theirs.filter((p) => p.lean === 'attack').sort(byHomeY),
      ...theirs.filter((p) => p.lean === 'defense').sort(byHomeY),
    ];
    defenders.forEach((d, i) => baseMarks[team].set(d.id, attackers[i % attackers.length]!.id));
  }
  const spots = new Map<number, { out: number; lateral: number }>();
  for (const team of [0, 1] as const) {
    for (const lean of ['attack', 'defense'] as const) {
      const mates = runners[team].filter((p) => p.lean === lean).sort(byHomeY);
      const n = mates.length;
      const half = lean === 'attack' ? 5 : 5.5;
      mates.forEach((p, i) => {
        // Lateral is in world y for both teams: the rink is a left-right mirror image.
        const lateral = n <= 1 ? (lean === 'attack' ? 3 : 0) : -half + (2 * half * i) / (n - 1);
        spots.set(p.id, { out: lean === 'attack' ? 6 : 12, lateral });
      });
    }
  }
  l = { runners, baseMarks, spots };
  layoutCache.set(state.players, l);
  return l;
}

const assignmentCache = new WeakMap<object, { tick: number; byTeam: Map<TeamIndex, Map<number, number>> }>();

/**
 * Man-to-man assignments for `team` on defense: defender id → attacker id.
 *
 * Base matchups pair our defense-leaning runners with their attack-leaning runners (and
 * vice versa), ordered across the floor. Then the defender nearest the ball carrier
 * picks up the carrier and swaps marks with whoever had them (SPEC §7: "the nearest
 * defender pressures the carrier").
 */
export function defensiveAssignments(state: Readonly<MatchState>, team: TeamIndex): Map<number, number> {
  let cached = assignmentCache.get(state);
  if (!cached || cached.tick !== state.tick) {
    cached = { tick: state.tick, byTeam: new Map() };
    assignmentCache.set(state, cached);
  }
  const hit = cached.byTeam.get(team);
  if (hit) return hit;

  const l = layout(state);
  const ours = l.runners[team];
  const result = new Map(l.baseMarks[team]);
  const carrierId = state.ball.carrier;
  const carrier = carrierId !== null ? state.players[carrierId] : undefined;
  if (result.size > 0 && carrier && carrier.team !== team && carrier.role === 'runner') {
    let presser = ours[0]!;
    for (const d of ours) if (dist(d.pos, carrier.pos) < dist(presser.pos, carrier.pos)) presser = d;
    const presserMark = result.get(presser.id)!;
    for (const [d, a] of result) if (a === carrier.id) result.set(d, presserMark);
    result.set(presser.id, carrier.id);
  }
  cached.byTeam.set(team, result);
  return result;
}

/**
 * Home spot on offense for an off-ball runner: attack-leaning runners work the near
 * wings, defense-leaning runners the high slots. Expressed as (out, lateral) from the
 * attacking goal.
 */
export function offenseSpot(state: Readonly<MatchState>, me: Player): { out: number; lateral: number } {
  return layout(state).spots.get(me.id) ?? { out: 8, lateral: 0 };
}

/** The runners on a team (cached for the match). */
export function teamRunners(state: Readonly<MatchState>, team: TeamIndex): readonly Player[] {
  return layout(state).runners[team];
}
