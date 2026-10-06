import type { Controller } from './index';
import {
  arenaFor,
  createRng,
  distToSegment,
  nextFloat,
  tapTicks,
  type GoalGeometry,
  type InputCommand,
  type MatchState,
  type Player,
  type SimConfig,
  type Vec2,
} from '../sim';
import { seek } from './steering';

export interface RunnerSkill {
  /** Shoot from at most this far from the goal mouth (m). */
  shootRange: number;
  /** A pass lane is "open" if no opponent is within this distance of it (m). */
  passLaneClearance: number;
  /** Don't pass within this many ticks of getting the ball (stops ping-pong). */
  minHoldTicks: number;
  /** Defensive reaction lag: how many ticks it takes to mostly catch up to a juke. */
  reactionTicks: number;
}

export const DEFAULT_RUNNER_SKILL: RunnerSkill = {
  shootRange: 11,
  passLaneClearance: 2.2,
  minHoldTicks: 45,
  reactionTicks: 10,
};

const BLOCKED_SPEED = 0.6;
const BLOCKED_TICKS = 30;
/** Ticks per juke before switching direction. */
const JUKE_TICKS = 40;
/** Give up working for a shot and look to pass after this long in range. */
const IN_RANGE_PATIENCE = 75;
/** How long a reset lasts: carry back out to the shooting spot before trying again. */
const RESET_TICKS = 45;
/** A carrier that stays within this radius (m)... */
const NO_PROGRESS_RADIUS = 2.5;
/** ...for this many ticks is going nowhere and resets. */
const NO_PROGRESS_TICKS = 90;

type Plan =
  | { kind: 'none' }
  | { kind: 'charge'; aim: Vec2; releaseAt: number; ticks: number }
  | { kind: 'releasePass'; aim: Vec2 };

/**
 * Basic runner AI: carry toward a shooting spot, shoot with an open look, juke to make
 * one, pass to an open teammate when stuck, support the carrier, mark goal-side (with a
 * reaction lag) on defense, and chase loose balls. Emits the same commands as a human.
 */
export function createRunnerAI(
  config: SimConfig,
  seed: number,
  skill: RunnerSkill = DEFAULT_RUNNER_SKILL,
): Controller {
  const rng = createRng(seed);
  const shotClearance = config.player.radius + config.ball.radius + 0.2;
  let plan: Plan = { kind: 'none' };
  let carryTicks = 0;
  let blockedTicks = 0;
  let inRangeTicks = 0;
  let laneSide = 0;
  let jukeDir = 1;
  let resetTicks = 0;
  /** Where the carrier was when it last made real progress, and when. */
  let anchor: { pos: Vec2; tick: number } | null = null;
  /** Where we think our mark is; lags the truth by about `reactionTicks`. */
  let perceived: { id: number; pos: Vec2 } | null = null;

  return {
    decide(state: Readonly<MatchState>, id: number): InputCommand {
      const me = state.players[id]!;
      const arena = arenaFor(config);
      const attack = arena.goals[me.team === 0 ? 1 : 0];
      const defend = arena.goals[me.team];
      const ball = state.ball;
      if (laneSide === 0) laneSide = me.home.y >= 0 ? 1 : -1;

      if (ball.carrier !== id) {
        plan = { kind: 'none' };
        carryTicks = 0;
        blockedTicks = 0;
        inRangeTicks = 0;
        resetTicks = 0;
        anchor = null;
      }

      // --- I have the ball ---
      if (ball.carrier === id) {
        carryTicks++;
        if (plan.kind === 'releasePass') {
          const aim = plan.aim;
          plan = { kind: 'none' };
          return { move: { x: 0, y: 0 }, aim, primary: false };
        }
        if (plan.kind === 'charge') {
          plan.ticks++;
          const release = plan.ticks >= plan.releaseAt;
          const aim = plan.aim;
          if (release) plan = { kind: 'none' };
          // Step into the shot, but mostly plant and fire.
          const step = seek(me.pos, aim, 0);
          return { move: { x: step.x * 0.3, y: step.y * 0.3 }, aim, primary: !release };
        }

        const shotAim = shotTarget(state, me, attack, skill.shootRange);
        if (shotAim && laneOpen(state, me, me.pos, shotAim, shotClearance, false)) {
          const dist = Math.hypot(attack.mouth.x - me.pos.x, attack.mouth.y - me.pos.y);
          const fullCharge = Math.round(config.shot.fullChargeSeconds * config.tickHz);
          const charge = 0.35 + 0.65 * Math.min(1, dist / skill.shootRange) * (0.6 + 0.4 * nextFloat(rng));
          const releaseAt = Math.max(tapTicks(config) + 2, Math.round(fullCharge * charge));
          plan = { kind: 'charge', aim: shotAim, releaseAt, ticks: 1 };
          return { move: { x: 0, y: 0 }, aim: shotAim, primary: true };
        }
        inRangeTicks = shotAim ? inRangeTicks + 1 : 0;

        const pressured = state.players.some(
          (o) => o.team !== me.team && o.role !== 'goalie' && dist2(o.pos, me.pos) < 2.2 * 2.2,
        );
        blockedTicks = Math.hypot(me.vel.x, me.vel.y) < BLOCKED_SPEED ? blockedTicks + 1 : 0;
        const stuck = blockedTicks > BLOCKED_TICKS / 2 || inRangeTicks > IN_RANGE_PATIENCE;
        if (carryTicks > skill.minHoldTicks && (stuck || !pressured)) {
          const mate = bestPassTarget(state, me, attack, skill, stuck);
          if (mate) {
            plan = { kind: 'releasePass', aim: mate.pos };
            return { move: { x: 0, y: 0 }, aim: mate.pos, primary: true };
          }
        }

        // No real progress for a while (pinned on the boards, dancing in place)?
        if (!anchor || dist2(anchor.pos, me.pos) > NO_PROGRESS_RADIUS ** 2) {
          anchor = { pos: { x: me.pos.x, y: me.pos.y }, tick: state.tick };
        }
        const noProgress = state.tick - anchor.tick > NO_PROGRESS_TICKS;

        // Worked the goal too long without a look, or going nowhere: reset back out to the shooting spot.
        if (inRangeTicks > IN_RANGE_PATIENCE || noProgress) {
          anchor = null;
          resetTicks = RESET_TICKS;
          inRangeTicks = 0;
          laneSide = -laneSide;
        }

        // In range but covered: juke across the goal face to open a shooting angle.
        if (shotAim && resetTicks === 0) {
          if (blockedTicks > BLOCKED_TICKS) {
            jukeDir = -jukeDir; // ran into something: go the other way
            blockedTicks = 0;
          } else if (state.tick % JUKE_TICKS === id % JUKE_TICKS) {
            jukeDir = nextFloat(rng) < 0.5 ? -1 : 1;
          }
          const tx = attack.mouth.x - me.pos.x;
          const ty = attack.mouth.y - me.pos.y;
          const d = Math.hypot(tx, ty) || 1;
          // Sideways, drifting in from range but back out when tight to the goal.
          const front = (me.pos.x - attack.mouth.x) * -attack.backDir;
          const inward = front < 5 ? -0.4 : 0.25;
          const move = {
            x: (-ty / d) * jukeDir + (tx / d) * inward,
            y: (tx / d) * jukeDir + (ty / d) * inward,
          };
          return { move, aim: { x: attack.mouth.x, y: attack.mouth.y } };
        }
        if (resetTicks > 0) resetTicks--;

        // Carry toward a shooting spot on our lane; switch lanes if we're bogged down.
        if (blockedTicks > BLOCKED_TICKS) {
          laneSide = -laneSide;
          blockedTicks = 0;
        }
        const spot = {
          x: attack.mouth.x - attack.backDir * (skill.shootRange - 4),
          y: attack.mouth.y + laneSide * 3.5,
        };
        return { move: seek(me.pos, spot, 0), aim: { x: attack.mouth.x, y: attack.mouth.y } };
      }

      const carrier = ball.carrier !== null ? state.players[ball.carrier]! : null;
      const ourBall =
        (carrier !== null && carrier.team === me.team) ||
        (carrier === null && ball.flight !== null && ball.flight.team === me.team);

      // --- A pass is coming to me: meet it ---
      if (ball.flight?.kind === 'pass' && ball.flight.target === id) {
        return { move: seek(me.pos, ball.pos, 3), aim: ball.pos };
      }

      // --- Loose ball: the closest runner on each team goes for it ---
      if (carrier === null && ball.flight === null && closestRunnerOnTeam(state, me, ball.pos)) {
        const lead = { x: ball.pos.x + ball.vel.x * 0.3, y: ball.pos.y + ball.vel.y * 0.3 };
        return { move: seek(me.pos, lead, 1), aim: ball.pos };
      }

      // --- Our ball: get open on the far side, drifting so we're never a statue ---
      if (ourBall) {
        const anchor = carrier ?? me;
        const side = anchor.pos.y >= attack.mouth.y ? -1 : 1;
        const drift = Math.sin((state.tick + id * 37) / 70) * 3;
        const spot = {
          x: attack.mouth.x - attack.backDir * (7 + Math.cos((state.tick + id * 53) / 90) * 2),
          y: attack.mouth.y + side * 5.5 + drift,
        };
        return { move: seek(me.pos, spot, 1.5), aim: carrier?.pos ?? ball.pos };
      }

      // --- Their ball (or a loose ball a teammate is chasing): mark goal-side ---
      const mark = assignedOpponent(state, me) ?? carrier;
      if (mark) {
        if (!perceived || perceived.id !== mark.id) perceived = { id: mark.id, pos: { ...mark.pos } };
        const k = 1 / Math.max(1, skill.reactionTicks);
        perceived.pos.x += (mark.pos.x - perceived.pos.x) * k;
        perceived.pos.y += (mark.pos.y - perceived.pos.y) * k;
        const seen = perceived.pos;
        const gap = mark.id === carrier?.id ? 1.8 : 3;
        const dx = defend.mouth.x - seen.x;
        const dy = defend.mouth.y - seen.y;
        const d = Math.hypot(dx, dy) || 1;
        const g = Math.min(gap, Math.max(0, d - defend.creaseRadius));
        const spot = { x: seen.x + (dx / d) * g, y: seen.y + (dy / d) * g };
        return { move: seek(me.pos, spot, 1), aim: ball.pos };
      }
      return { move: seek(me.pos, me.home, 1), aim: ball.pos };
    },
  };
}

const dist2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** A shooting target in the goal, or null if we're out of range or at a hopeless angle. */
function shotTarget(state: Readonly<MatchState>, me: Player, goal: GoalGeometry, range: number): Vec2 | null {
  const out = -goal.backDir;
  const front = (me.pos.x - goal.mouth.x) * out; // distance out from the goal line
  const dy = me.pos.y - goal.mouth.y;
  const dist = Math.hypot(front, dy);
  if (front < 2.5 || dist > range || dist < goal.creaseRadius + 0.3) return null;
  if (Math.abs(dy) > front * 1.6) return null; // too sharp an angle
  // Aim inside the post on the side away from the goalie.
  const keeper = state.players.find((p) => p.role === 'goalie' && p.team === goal.defendedBy);
  const keeperY = keeper ? keeper.pos.y - goal.mouth.y : 0;
  const side = keeperY > 0.05 ? -1 : keeperY < -0.05 ? 1 : dy > 0 ? -1 : 1;
  return { x: goal.mouth.x, y: goal.mouth.y + side * (goal.width / 2 - 0.3) };
}

/** No opponent (optionally including goalies) within `clearance` of the segment from → to. */
function laneOpen(
  state: Readonly<MatchState>,
  me: Player,
  from: Vec2,
  to: Vec2,
  clearance: number,
  includeGoalies: boolean,
): boolean {
  return state.players.every(
    (o) =>
      o.team === me.team ||
      (o.role === 'goalie' && !includeGoalies) ||
      distToSegment(o.pos, from, to) > clearance,
  );
}

/**
 * An open teammate to pass to: closer to the attacking goal, or (if we're stuck) anyone open.
 * Picks the one nearest the goal.
 */
function bestPassTarget(
  state: Readonly<MatchState>,
  me: Player,
  attack: GoalGeometry,
  skill: RunnerSkill,
  stuck: boolean,
): Player | null {
  const myDist = Math.hypot(attack.mouth.x - me.pos.x, attack.mouth.y - me.pos.y);
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const q of state.players) {
    if (q.team !== me.team || q.id === me.id || q.role === 'goalie') continue;
    const d = Math.hypot(attack.mouth.x - q.pos.x, attack.mouth.y - q.pos.y);
    if (!stuck && d > myDist - 3) continue;
    if (!laneOpen(state, me, me.pos, q.pos, skill.passLaneClearance, true)) continue;
    if (d < bestDist) {
      best = q;
      bestDist = d;
    }
  }
  return best;
}

function closestRunnerOnTeam(state: Readonly<MatchState>, me: Player, pos: Vec2): boolean {
  const mine = dist2(pos, me.pos);
  return state.players.every((p) => {
    if (p.id === me.id || p.team !== me.team || p.role === 'goalie') return true;
    const theirs = dist2(pos, p.pos);
    return theirs > mine || (theirs === mine && p.id > me.id);
  });
}

/** Man-to-man: my k-th runner marks their k-th runner. */
function assignedOpponent(state: Readonly<MatchState>, me: Player): Player | null {
  const mine = state.players.filter((p) => p.team === me.team && p.role === 'runner');
  const theirs = state.players.filter((p) => p.team !== me.team && p.role === 'runner');
  if (theirs.length === 0) return null;
  const k = mine.findIndex((p) => p.id === me.id);
  return theirs[k % theirs.length] ?? null;
}
