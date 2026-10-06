import type { Controller } from './index';
import {
  arenaFor,
  canCast,
  createRng,
  inShoveCone,
  nextFloat,
  isCharging,
  nextRange,
  tapTicks,
  type AiLevel,
  type GoalGeometry,
  type InputCommand,
  type MatchState,
  type Player,
  type SimConfig,
  type Vec2,
} from '../sim';
import { avoidCircle, avoidGoals, seek, spaceOut } from './steering';
import {
  attackGoal,
  defendGoal,
  defensiveAssignments,
  dist,
  goalFrame,
  laneOpen,
  nearestOpponentDist,
  offenseSpot,
  possessingTeam,
  teamRunners,
} from './tactics';

type Plan =
  | { kind: 'none' }
  | { kind: 'charge'; aim: Vec2; releaseAt: number; ticks: number }
  | { kind: 'releasePass'; aim: Vec2 };

const IDLE: InputCommand = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } };

/**
 * Runner AI (SPEC §7). On the ball: shoot with an open look, juke to make one, pass to
 * an open teammate, or carry. Off the ball on offense: hold a spread spot, cut to the
 * crease, and get open. On defense: mark a man goal-side (with a reaction lag), the
 * nearest defender pressures and checks the carrier, sag to the crease when your man is
 * far away. Loose balls: the nearest runner on each team goes for it. Every decision is
 * an InputCommand, exactly what a human would send.
 */
export function createRunnerAI(config: SimConfig, seed: number, level: AiLevel): Controller {
  const rc = config.ai.runner;
  const hz = config.tickHz;
  const ticks = (s: number) => Math.round(s * hz);
  const rng = createRng(seed);
  const shotClearance = config.player.radius + config.ball.radius + rc.shotLaneMargin;
  const reactionTicks = Math.max(1, ticks(level.reactionSeconds));

  let plan: Plan = { kind: 'none' };
  let carryTicks = 0;
  let blockedTicks = 0;
  let inRangeTicks = 0;
  let resetTicks = 0;
  let laneSide = 0;
  let jukeDir = 1;
  let anchor: { pos: Vec2; tick: number } | null = null;
  /** Where we think our mark is; lags the truth by about `reactionSeconds`. */
  let perceived: { id: number; pos: Vec2 } | null = null;

  function perceive(mark: Player): Vec2 {
    if (!perceived || perceived.id !== mark.id) perceived = { id: mark.id, pos: { ...mark.pos } };
    perceived.pos.x += (mark.pos.x - perceived.pos.x) / reactionTicks;
    perceived.pos.y += (mark.pos.y - perceived.pos.y) / reactionTicks;
    return perceived.pos;
  }

  /** Throw a check at `target` if it's in range and we feel like it this tick. */
  function maybeCheck(
    state0: Readonly<MatchState> | null,
    me: Player,
    target: Player,
    aim: Vec2,
  ): InputCommand | null {
    if (me.checkCooldown > 0 || target.staggerTicks > 0) return null;
    if (target.role === 'goalie') return null; // never worth it (and protected in the crease)
    if (dist(me.pos, target.pos) > rc.checkRange) return null;
    const windingUp = state0 !== null && state0.ball.carrier === target.id && isCharging(target, config);
    const p = level.checkChancePerTick * (windingUp ? rc.checkWindupMultiplier : 1);
    if (nextFloat(rng) >= p) return null;
    return { move: seek(me.pos, target.pos, 0), aim, check: true };
  }

  function carrier(state: Readonly<MatchState>, me: Player, attack: GoalGeometry): InputCommand {
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

    const clockLeft = state.shotClock.team === me.team ? state.shotClock.ticksLeft / hz : Infinity;
    const urgency =
      clockLeft < rc.shotClockDesperateSeconds ? 2 : clockLeft < rc.shotClockUrgentSeconds ? 1 : 0;
    const shotAim = shotTarget(state, me, attack, urgency);
    const throughTraffic = shotAim !== null && (urgency > 0 || nextFloat(rng) < rc.forceShotChancePerTick);
    if (shotAim && (throughTraffic || laneOpen(state, me.team, me.pos, shotAim, shotClearance, false))) {
      // Sometimes put some bend on it first (Bent Shot arms this tick; the shot starts next tick).
      if (
        !me.bentArmed &&
        canCast(me, 'bentShot', config) &&
        nextFloat(rng) < rc.bentShotChance * level.spellEagerness
      ) {
        return { move: { x: 0, y: 0 }, aim: shotAim, cast: 'bentShot' };
      }
      const d = dist(attack.mouth, me.pos);
      const fullCharge = ticks(config.shot.fullChargeSeconds);
      const charge = 0.35 + 0.65 * Math.min(1, d / level.shootRange) * (0.6 + 0.4 * nextFloat(rng));
      const releaseAt = Math.max(tapTicks(config) + 2, Math.round(fullCharge * charge));
      const aim = { x: shotAim.x, y: shotAim.y + nextRange(rng, -level.aimErrorM, level.aimErrorM) };
      plan = { kind: 'charge', aim, releaseAt, ticks: 1 };
      return { move: { x: 0, y: 0 }, aim, primary: true };
    }
    inRangeTicks = shotAim ? inRangeTicks + 1 : 0;

    const pressured = nearestOpponentDist(state, me) < rc.pressureRadius;
    blockedTicks = Math.hypot(me.vel.x, me.vel.y) < rc.blockedSpeed ? blockedTicks + 1 : 0;
    if (!anchor || dist(anchor.pos, me.pos) > rc.noProgressRadius) {
      anchor = { pos: { x: me.pos.x, y: me.pos.y }, tick: state.tick };
    }
    const noProgress = state.tick - anchor.tick > ticks(rc.noProgressSeconds);
    const stuck =
      blockedTicks > ticks(rc.blockedSeconds) / 2 || inRangeTicks > ticks(rc.inRangePatienceSeconds);

    if (carryTicks > ticks(rc.minHoldSeconds)) {
      const mate = bestPassTarget(state, me, attack, stuck || pressured || noProgress);
      if (mate) {
        plan = { kind: 'releasePass', aim: mate.pos };
        return { move: { x: 0, y: 0 }, aim: mate.pos, primary: true };
      }
    }

    // Worked the goal too long without a look, or going nowhere: reset back out.
    if (inRangeTicks > ticks(rc.inRangePatienceSeconds) || noProgress) {
      anchor = null;
      resetTicks = ticks(rc.resetSeconds);
      inRangeTicks = 0;
      laneSide = -laneSide;
    }

    const aimAtGoal = { x: attack.mouth.x, y: attack.mouth.y };
    // In range but covered: juke across the goal face to open a shooting angle.
    if (shotAim && resetTicks === 0) {
      if (blockedTicks > ticks(rc.blockedSeconds)) {
        jukeDir = -jukeDir;
        blockedTicks = 0;
      } else if (state.tick % ticks(rc.jukeSeconds) === me.id % ticks(rc.jukeSeconds)) {
        jukeDir = nextFloat(rng) < 0.5 ? -1 : 1;
      }
      const tx = attack.mouth.x - me.pos.x;
      const ty = attack.mouth.y - me.pos.y;
      const d = Math.hypot(tx, ty) || 1;
      // Sideways; drift in from range, back out when tight to the crease.
      const front = (me.pos.x - attack.mouth.x) * -attack.backDir;
      const inward = front < 5 || d < attack.creaseRadius + 1.5 ? -0.5 : 0.25;
      const move = { x: (-ty / d) * jukeDir + (tx / d) * inward, y: (tx / d) * jukeDir + (ty / d) * inward };
      return { move, aim: aimAtGoal };
    }
    if (resetTicks > 0) resetTicks--;

    if (blockedTicks > ticks(rc.blockedSeconds)) {
      laneSide = -laneSide;
      blockedTicks = 0;
    }
    const spot = goalFrame(attack, level.shootRange - 3, laneSide * 3.5);
    let move = seek(me.pos, spot, 0);
    // Under pressure from in front: sidestep around the defender while still driving
    // toward goal. (Leaning straight away just cancels the drive and stalls the carrier.)
    const presser = closestOpponent(state, me);
    if (presser && dist(presser.pos, me.pos) < rc.pressureRadius) {
      const px = presser.pos.x - me.pos.x;
      const py = presser.pos.y - me.pos.y;
      const pl = Math.hypot(px, py) || 1;
      if (px * move.x + py * move.y > 0) {
        // The perpendicular on our lane's side of the floor (world y), the same for both teams.
        let side = { x: -py / pl, y: px / pl };
        if (side.y * laneSide < 0) side = { x: -side.x, y: -side.y };
        move = { x: move.x * 0.5 + side.x * 0.9, y: move.y * 0.5 + side.y * 0.9 };
      }
    }
    return { move, aim: aimAtGoal };
  }

  /** A shooting target inside a post (away from the goalie), or null if out of range or too sharp. */
  /** `urgency`: 0 normal, 1 shot clock running low (longer range), 2 about to expire (anything goes). */
  function shotTarget(state: Readonly<MatchState>, me: Player, goal: GoalGeometry, urgency = 0): Vec2 | null {
    const front = (me.pos.x - goal.mouth.x) * -goal.backDir;
    const dy = me.pos.y - goal.mouth.y;
    const d = Math.hypot(front, dy);
    const range =
      urgency === 2 ? rc.desperateRange : level.shootRange + (urgency === 1 ? rc.urgentRangeBonus : 0);
    if (d > range || d < goal.creaseRadius + 0.3) return null;
    if (urgency < 2 && (front < rc.minShotFront || Math.abs(dy) > front * rc.maxShotAngleRatio)) return null;
    if (front < 0.5) return null; // behind the goal line: no angle at all
    const keeper = state.players.find((p) => p.role === 'goalie' && p.team === goal.defendedBy);
    const keeperY = keeper ? keeper.pos.y - goal.mouth.y : 0;
    const side = keeperY > 0.05 ? -1 : keeperY < -0.05 ? 1 : dy > 0 ? -1 : 1;
    return { x: goal.mouth.x, y: goal.mouth.y + side * (goal.width / 2 - rc.postInset) };
  }

  /**
   * The most promising open teammate: open lane, nobody on top of them, and closer to the
   * goal than us (unless we're desperate).
   */
  function bestPassTarget(
    state: Readonly<MatchState>,
    me: Player,
    attack: GoalGeometry,
    desperate: boolean,
  ): Player | null {
    const myDist = dist(attack.mouth, me.pos);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const q of teamRunners(state, me.team)) {
      if (q.id === me.id || q.staggerTicks > 0) continue;
      const d = dist(attack.mouth, q.pos);
      if (!desperate && d > myDist - 3) continue;
      if (dist(q.pos, me.pos) > config.pass.maxAssistRange) continue;
      if (!laneOpen(state, me.team, me.pos, q.pos, level.passLaneClearance, true)) continue;
      const space = Math.min(6, nearestOpponentDist(state, q));
      if (space < 1.5) continue;
      const score = space - d * 0.5;
      if (score > bestScore) {
        best = q;
        bestScore = score;
      }
    }
    return best;
  }

  function offBallOffense(state: Readonly<MatchState>, me: Player, attack: GoalGeometry): InputCommand {
    const ball = state.ball;
    const carrierP = ball.carrier !== null ? state.players[ball.carrier]! : null;
    const aim = carrierP?.pos ?? ball.pos;
    const { out, lateral } = offenseSpot(state, me);
    const phase = (state.tick + me.id * 97) % ticks(rc.cutEverySeconds);
    let target: Vec2;
    if (me.lean === 'attack' && phase < ticks(rc.cutSeconds)) {
      // Cut to the edge of the crease on our side.
      target = goalFrame(attack, attack.creaseRadius + 1.3, Math.sign(lateral || 1) * 1.8);
    } else {
      const w = (2 * Math.PI) / ticks(rc.driftSeconds);
      const drift = Math.sin((state.tick + me.id * 37) * w) * rc.driftLateral;
      const depth = Math.cos((state.tick + me.id * 53) * w * 0.8) * rc.driftDepth;
      target = goalFrame(attack, out + depth, lateral + drift);
      // Get open: step away from the nearest defender.
      const o = closestOpponent(state, me, target);
      if (o) {
        const d = dist(o.pos, target);
        if (d < rc.getOpenRadius) {
          const ax = target.x - o.pos.x;
          const ay = target.y - o.pos.y;
          const a = Math.hypot(ax, ay) || 1;
          target = {
            x: target.x + (ax / a) * (rc.getOpenRadius - d),
            y: target.y + (ay / a) * (rc.getOpenRadius - d),
          };
        }
      }
    }
    return { move: seek(me.pos, target, 1.2), aim };
  }

  function defense(state: Readonly<MatchState>, me: Player, defend: GoalGeometry): InputCommand {
    const ball = state.ball;
    const markId = defensiveAssignments(state, me.team).get(me.id);
    const mark = markId !== undefined ? state.players[markId]! : null;
    if (!mark) return { move: seek(me.pos, me.home, 1), aim: ball.pos };

    const onBall = ball.carrier === mark.id;
    const seen = perceive(mark);
    const toGoal = { x: defend.mouth.x - seen.x, y: defend.mouth.y - seen.y };
    const dGoal = Math.hypot(toGoal.x, toGoal.y) || 1;

    if (onBall) {
      const hit = maybeCheck(state, me, mark, ball.pos);
      if (hit) return hit;
      const g = Math.min(rc.pressureGap, Math.max(0, dGoal - defend.creaseRadius));
      const spot = { x: seen.x + (toGoal.x / dGoal) * g, y: seen.y + (toGoal.y / dGoal) * g };
      return { move: seek(me.pos, spot, 0.8), aim: ball.pos };
    }

    if (dGoal > rc.sagDistance) {
      // Our man is far from goal: sag toward the crease on his side of the floor, shaded
      // toward the ball. Using his line (not the ball's) keeps sagging defenders spread out.
      const r = defend.creaseRadius + 3.5;
      const sway = (2 * Math.PI) / ticks(rc.driftSeconds);
      const lateral = Math.sin((state.tick + me.id * 41) * sway) * rc.driftLateral * 0.6;
      const sx = -toGoal.x / dGoal;
      const sy = -toGoal.y / dGoal;
      const base = { x: defend.mouth.x + sx * r - sy * lateral, y: defend.mouth.y + sy * r + sx * lateral };
      const spot = { x: base.x + (ball.pos.x - base.x) * 0.25, y: base.y + (ball.pos.y - base.y) * 0.25 };
      return { move: seek(me.pos, spot, 1), aim: ball.pos };
    }

    // Goal-side of our man, shaded toward the ball to clog the passing lane.
    const g = Math.min(rc.markGap, Math.max(0, dGoal - defend.creaseRadius));
    const goalSide = { x: seen.x + (toGoal.x / dGoal) * g, y: seen.y + (toGoal.y / dGoal) * g };
    const spot = {
      x: goalSide.x + (ball.pos.x - goalSide.x) * 0.2,
      y: goalSide.y + (ball.pos.y - goalSide.y) * 0.2,
    };
    return { move: seek(me.pos, spot, 1), aim: ball.pos };
  }

  /** Plan for the current faceoff: when to press (or jump early), decided once per faceoff. */
  let faceoffMemo: {
    key: number;
    misfireAt: number | null;
    reaction: number;
    sawWhistle: number | null;
    pressed: boolean;
  } | null = null;

  function faceoff(state: Readonly<MatchState>, me: Player): InputCommand {
    const f = state.faceoff!;
    if (!f.takers.includes(me.id)) return IDLE;
    const key = state.tick - f.ticks; // the tick this faceoff was set
    if (!faceoffMemo || faceoffMemo.key !== key) {
      const early = nextFloat(rng) < level.faceoffMisfireChance;
      faceoffMemo = {
        key,
        // A misfire jumps before the earliest possible whistle.
        misfireAt: early
          ? Math.floor(nextRange(rng, 0.3, 0.9) * ticks(config.faceoff.minDelaySeconds))
          : null,
        reaction: ticks(level.faceoffReactionSeconds + nextFloat(rng) * level.faceoffWindowSeconds),
        sawWhistle: null,
        pressed: false,
      };
    }
    const m = faceoffMemo;
    const aim = { x: 0, y: 0 };
    if (m.pressed) return { ...IDLE, aim };
    if (m.misfireAt !== null && f.ticks >= m.misfireAt) {
      m.pressed = true;
      return { ...IDLE, aim, primary: true };
    }
    if (f.whistled) {
      m.sawWhistle ??= state.tick;
      if (state.tick - m.sawWhistle >= m.reaction) {
        m.pressed = true;
        return { ...IDLE, aim, primary: true };
      }
    }
    return { ...IDLE, aim };
  }

  /** Final touches on every command: keep space from teammates and steer around goals. */
  function polish(
    state: Readonly<MatchState>,
    me: Player,
    cmd: InputCommand,
    carrying: boolean,
  ): InputCommand {
    let move = carrying ? cmd.move : spaceOut(state, me, cmd.move, rc.teammateSpacing);
    move = avoidGoals(me.pos, move, arenaFor(config), config.player.radius + 0.2, rc.goalLookahead);
    // Never step into the opponent's crease (SPEC §4.4).
    const attack = attackGoal(config, me.team);
    move = avoidCircle(me.pos, move, attack.mouth, attack.creaseRadius + rc.creaseMargin, rc.goalLookahead);
    return { ...cmd, move };
  }

  function decideRaw(state: Readonly<MatchState>, me: Player): InputCommand {
    const id = me.id;
    const attack = attackGoal(config, me.team);
    const defend = defendGoal(config, me.team);
    const ball = state.ball;
    if (laneSide === 0) laneSide = me.home.y >= 0 ? 1 : -1;

    if (ball.carrier === id) return carrier(state, me, attack);
    plan = { kind: 'none' };
    carryTicks = 0;
    blockedTicks = 0;
    inRangeTicks = 0;
    resetTicks = 0;
    anchor = null;

    // A pass is coming to me: meet it.
    if (ball.flight?.kind === 'pass' && ball.flight.target === id) {
      return { move: seek(me.pos, ball.pos, 3), aim: ball.pos };
    }

    // Loose ground ball: the nearest runner on each team goes for it, and fights for it.
    const ballInTheirCrease =
      dist(ball.pos, attack.mouth) < attack.creaseRadius + rc.creaseMargin + config.player.radius;
    if (
      ball.carrier === null &&
      ball.flight === null &&
      !ballInTheirCrease &&
      closestRunnerOnTeam(state, me, ball.pos)
    ) {
      const rival = closestOpponent(state, me, ball.pos);
      if (rival && dist(rival.pos, ball.pos) < dist(me.pos, ball.pos)) {
        const hit = maybeCheck(state, me, rival, ball.pos);
        if (hit) return hit;
      }
      const lead = { x: ball.pos.x + ball.vel.x * 0.3, y: ball.pos.y + ball.vel.y * 0.3 };
      return { move: seek(me.pos, lead, 1), aim: ball.pos };
    }

    return possessingTeam(state) === me.team ? offBallOffense(state, me, attack) : defense(state, me, defend);
  }

  /**
   * Situational spells (SPEC §7: "not on cooldown spam"): Hex Shove at a carrier or a
   * defender crowding us, or in a loose-ball fight; Quickstep for a breakaway or a race to
   * a loose ball. (Bent Shot is decided with the shot itself.)
   */
  function chooseSpell(state: Readonly<MatchState>, me: Player): InputCommand['cast'] {
    const ball = state.ball;
    const eager = level.spellEagerness;
    if (canCast(me, 'hexShove', config)) {
      for (const o of state.players) {
        if (o.team === me.team || o.role === 'goalie' || o.staggerTicks > 0 || !inShoveCone(me, o, config))
          continue;
        const theyCarry = ball.carrier === o.id;

        const looseFight =
          ball.carrier === null && ball.flight === null && dist(o.pos, ball.pos) < dist(me.pos, ball.pos);
        // A defensive emergency tool: a carrier winding up, or right on top of our goal.
        const threat =
          theyCarry &&
          (isCharging(o, config) ||
            dist(o.pos, defendGoal(config, me.team).mouth) < rc.hexShoveThreatDistance);
        const weight = threat ? 3 : looseFight ? 0.3 : 0;
        if (weight > 0 && nextFloat(rng) < rc.hexShoveChancePerTick * eager * weight) return 'hexShove';
      }
    }
    // Quickstep only with mana to spare for a Hex Shove afterward.
    const reserve = config.spells.quickstep.cost + config.spells.hexShove.cost;
    if (canCast(me, 'quickstep', config) && me.quickstepTicks === 0 && me.mana >= reserve) {
      const attack = attackGoal(config, me.team);
      const breakaway =
        ball.carrier === me.id &&
        dist(me.pos, attack.mouth) > rc.quickstepBreakawayDistance &&
        laneOpen(state, me.team, me.pos, attack.mouth, 3, false) &&
        nearestOpponentDist(state, me) > rc.quickstepBreakawaySpace;
      let race = false;
      if (
        ball.carrier === null &&
        ball.flight === null &&
        dist(me.pos, ball.pos) < rc.quickstepRaceDistance * 2
      ) {
        const rival = closestOpponent(state, me, ball.pos);
        race =
          rival !== null &&
          dist(rival.pos, ball.pos) < rc.quickstepRaceDistance &&
          dist(rival.pos, ball.pos) < dist(me.pos, ball.pos) + 1;
      }
      if (
        (breakaway && nextFloat(rng) < rc.quickstepBreakawayChancePerTick * eager) ||
        (race && nextFloat(rng) < rc.quickstepRaceChancePerTick * eager)
      )
        return 'quickstep';
    }
    return undefined;
  }

  return {
    decide(state: Readonly<MatchState>, id: number): InputCommand {
      const me = state.players[id]!;
      if (state.phase === 'faceoff') return faceoff(state, me);
      faceoffMemo = null;
      if (state.phase !== 'live' || me.staggerTicks > 0) return IDLE;
      const cmd = polish(state, me, decideRaw(state, me), state.ball.carrier === id);
      if (cmd.cast) return cmd;
      const spell = chooseSpell(state, me);
      return spell ? { ...cmd, cast: spell } : cmd;
    },
  };
}

function closestOpponent(state: Readonly<MatchState>, me: Player, to: Vec2 = me.pos): Player | null {
  let best: Player | null = null;
  for (const o of state.players) {
    if (o.team === me.team || o.role === 'goalie') continue;
    if (!best || dist(o.pos, to) < dist(best.pos, to)) best = o;
  }
  return best;
}

function closestRunnerOnTeam(state: Readonly<MatchState>, me: Player, pos: Vec2): boolean {
  const mine = dist(pos, me.pos);
  return state.players.every((p) => {
    if (p.id === me.id || p.team !== me.team || p.role === 'goalie') return true;
    const theirs = dist(pos, p.pos);
    return theirs > mine || (theirs === mine && p.id > me.id);
  });
}
