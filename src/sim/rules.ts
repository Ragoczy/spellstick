import { secondsToTicks } from './actions';
import type { ArenaGeometry, TeamIndex } from './arena';
import type { SimConfig } from './config';
import {
  gainPossession,
  giveBall,
  inOpponentCrease,
  otherTeam,
  resetShotClock,
  turnOver,
} from './possession';
import { nextFloat, nextInt } from './rng';
import { NO_INPUT, type InputCommand, type MatchState, type Player } from './types';

export const isOvertime = (state: MatchState, config: SimConfig): boolean =>
  state.period > config.match.periods;

/** The faceoff taker for a team: its first attack-leaning runner, else its first runner. */
export function faceoffTaker(state: MatchState, team: TeamIndex): Player | null {
  const runners = state.players.filter((p) => p.team === team && p.role === 'runner');
  return runners.find((p) => p.lean === 'attack') ?? runners[0] ?? null;
}

/** Puts every player back at their start spot, the ball loose at center, and play live. */
export function resetPositions(state: MatchState): void {
  for (const p of state.players) {
    p.pos = { x: p.home.x, y: p.home.y };
    p.vel = { x: 0, y: 0 };
    p.facing = p.team === 0 ? 0 : Math.PI;
    p.stickCooldown = 0;
    p.primaryTicks = 0;
    p.checkCooldown = 0;
    p.dashTicks = 0;
    p.staggerTicks = 0;
    p.quickstepTicks = 0;
    p.wardTicks = 0;
  }
  state.ball = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, carrier: null, flight: null, lastTouch: null };
  state.faceoff = null;
  state.shotClock = { team: null, ticksLeft: state.shotClock.ticksLeft };
}

/**
 * Sets up a faceoff at center (SPEC §4.1): everyone resets, the two takers lock up at the
 * dot, and the whistle is scheduled for a random moment. If either team has no runner to
 * take it (drills), play just restarts with a loose ball at center.
 */
export function setupFaceoff(state: MatchState, config: SimConfig): void {
  resetPositions(state);
  state.shotClock = { team: null, ticksLeft: secondsToTicks(config.shotClock.seconds, config) };
  const home = faceoffTaker(state, 0);
  const away = faceoffTaker(state, 1);
  if (!home || !away) {
    state.phase = 'live';
    return;
  }
  const off = config.faceoff.takerOffset;
  home.pos = { x: -off, y: 0 };
  home.facing = 0;
  away.pos = { x: off, y: 0 };
  away.facing = Math.PI;
  const fc = config.faceoff;
  state.faceoff = {
    takers: [home.id, away.id],
    ticks: 0,
    whistleAt: nextInt(
      state.rng,
      secondsToTicks(fc.minDelaySeconds, config),
      secondsToTicks(fc.maxDelaySeconds, config),
    ),
    whistled: false,
  };
  state.phase = 'faceoff';
  state.events.push({ type: 'faceoffSet', takers: [home.id, away.id] });
}

/**
 * One faceoff tick. Everyone is frozen. The takers' fresh presses of the action button
 * count: before the whistle a press is a misfire and loses; after it, first press wins.
 */
export function stepFaceoff(
  state: MatchState,
  inputs: ReadonlyArray<InputCommand | undefined>,
  config: SimConfig,
): void {
  const f = state.faceoff!;
  f.ticks++;
  // Track every player's button so a press held from before doesn't count as fresh later.
  const pressed: [boolean, boolean] = [false, false];
  for (const p of state.players) {
    const down = (inputs[p.id] ?? NO_INPUT).primary === true;
    if (p.id === f.takers[0] && down && !p.primaryDown) pressed[0] = true;
    if (p.id === f.takers[1] && down && !p.primaryDown) pressed[1] = true;
    p.primaryDown = down;
    p.vel = { x: 0, y: 0 };
  }

  if (!f.whistled && f.ticks >= f.whistleAt) {
    f.whistled = true;
    state.events.push({ type: 'whistle' });
  }

  if (pressed[0] || pressed[1]) {
    // Both on the same tick: a coin flip decides who was faster (or who jumped first).
    const first: TeamIndex =
      pressed[0] && pressed[1] ? (nextFloat(state.rng) < 0.5 ? 0 : 1) : pressed[0] ? 0 : 1;
    if (f.whistled) awardFaceoff(state, first, 'faster', config);
    else awardFaceoff(state, otherTeam(first), 'misfire', config);
    return;
  }

  if (f.whistled && f.ticks - f.whistleAt > secondsToTicks(config.faceoff.timeoutSeconds, config)) {
    // Nobody went for it: drop the ball and play on.
    state.faceoff = null;
    state.phase = 'live';
    state.events.push({ type: 'faceoffWin', team: null, playerId: null, reason: 'timeout' });
  }
}

function awardFaceoff(
  state: MatchState,
  team: TeamIndex,
  reason: 'faster' | 'misfire',
  config: SimConfig,
): void {
  const winner = state.players[state.faceoff!.takers[team]]!;
  state.faceoff = null;
  state.phase = 'live';
  giveBall(state, winner, config);
  gainPossession(state, team, config);
  state.events.push({ type: 'faceoffWin', team, playerId: winner.id, reason });
}

/**
 * After the ball has moved this tick: possession changes restart the shot clock, shots
 * off the frame or the goalie reset it, and a carrier in the opponent's crease turns it
 * over to the goalie.
 */
export function applyLiveRules(state: MatchState, arena: ArenaGeometry, config: SimConfig): void {
  for (const e of state.events) {
    if (e.type === 'pickup' || e.type === 'catch') gainPossession(state, e.team, config);
    if (e.type === 'save' && e.caught) gainPossession(state, e.team, config);
    if (e.type === 'save' || e.type === 'post' || e.type === 'wardBlock') resetShotClock(state, config);
  }

  const carrier = state.ball.carrier !== null ? state.players[state.ball.carrier]! : null;
  if (carrier && inOpponentCrease(carrier, arena)) {
    state.events.push({ type: 'creaseViolation', playerId: carrier.id, team: carrier.team });
    turnOver(state, otherTeam(carrier.team), true, config);
  }

  tickShotClock(state, config);
}

function tickShotClock(state: MatchState, config: SimConfig): void {
  const sc = state.shotClock;
  if (sc.team === null) return;
  if (sc.ticksLeft > 0) sc.ticksLeft--;
  if (sc.ticksLeft > 0) return;
  // A shot already in the air when the clock hits zero gets to finish.
  const flight = state.ball.flight;
  if (flight && flight.kind === 'shot' && flight.team === sc.team) return;
  const team = sc.team;
  state.events.push({ type: 'shotClockViolation', team });
  turnOver(state, otherTeam(team), false, config);
}

/**
 * Game clock (live play only). At the end of a period: a break, then the next period.
 * At the end of regulation (or an overtime period) with the score tied: a break, then
 * sudden-death overtime. Otherwise the match is over.
 */
export function tickGameClock(state: MatchState, config: SimConfig): void {
  state.periodTicksLeft--;
  if (state.periodTicksLeft > 0) return;
  state.events.push({ type: 'periodEnd', period: state.period });
  const lastScheduled = state.period >= config.match.periods;
  if (lastScheduled && state.score[0] !== state.score[1]) {
    endMatch(state);
    return;
  }
  state.phase = 'periodBreak';
  state.pauseTicks = secondsToTicks(config.match.periodBreakSeconds, config);
}

/** After a period break: start the next period (overtime if past regulation) with a faceoff. */
export function startNextPeriod(state: MatchState, config: SimConfig): void {
  state.period++;
  const overtime = isOvertime(state, config);
  state.periodTicksLeft = secondsToTicks(
    overtime ? config.match.overtimeSeconds : config.match.periodSeconds,
    config,
  );
  state.events.push({ type: 'periodStart', period: state.period, overtime });
  setupFaceoff(state, config);
}

export function endMatch(state: MatchState): void {
  state.phase = 'final';
  state.faceoff = null;
  state.events.push({ type: 'matchEnd', score: [state.score[0], state.score[1]] });
}
