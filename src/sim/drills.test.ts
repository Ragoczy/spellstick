import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { makeConfig, secondsToTicks, type SimConfig } from './config';
import {
  createDrill,
  DRILL_TARGET,
  DRILLS,
  DrillJudge,
  drillConfig,
  type Drill,
  type DrillVerdict,
} from './drills';
import { stepMatch } from './match';
import type { InputCommand, MatchState, SimEvent } from './types';
import type { Vec2 } from './vec';

const config = drillConfig(makeConfig());
const goal = arenaGeometry(config).goals[1];

const still = (aim: Vec2 = { x: 100, y: 0 }): InputCommand => ({ move: { x: 0, y: 0 }, aim });
const toward = (from: Vec2, to: Vec2): Vec2 => {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};

/**
 * Plays a drill: `human(state, tick)` drives the human's player; everyone else stands still.
 * Returns the first verdict, or null if none came within `maxTicks`.
 */
function play(
  drill: Drill,
  human: (state: MatchState, tick: number) => InputCommand,
  maxTicks = 600,
  cfg: SimConfig = config,
): DrillVerdict | null {
  const judge = new DrillJudge(drill.id);
  const s = drill.state;
  for (let t = 0; t < maxTicks; t++) {
    const inputs = s.players.map((p) => (p.id === drill.humanId ? human(s, t) : still(s.ball.pos)));
    stepMatch(s, inputs, cfg);
    const v = judge.observe(s, drill.humanId);
    if (v) return v;
  }
  return null;
}

/** Feeds the judge one made-up tick. */
function judgeTick(
  judge: DrillJudge,
  events: SimEvent[],
  extra: Partial<MatchState> = {},
): DrillVerdict | null {
  const base = createDrill(config, judge.id, 0, 1).state;
  return judge.observe({ ...base, ...extra, events }, 0);
}

describe('training drills (M9): setups', () => {
  it('every drill gives the human a home runner, a part for every player, and a sane target', () => {
    for (const id of DRILLS) {
      const d = createDrill(config, id, 0, 1);
      const me = d.state.players[d.humanId]!;
      expect(me).toMatchObject({ team: 0, role: 'runner' });
      expect(d.parts).toHaveLength(d.state.players.length);
      expect(DRILL_TARGET[id]).toBeGreaterThanOrEqual(1);
      expect(d.state.events).toEqual([]);
    }
  });

  it('who has the ball at the start', () => {
    const carrier = (id: (typeof DRILLS)[number]) => createDrill(config, id, 0, 1).state.ball.carrier;
    expect(carrier('scoop')).toBeNull();
    expect(carrier('pass')).toBe(0);
    expect(carrier('shoot')).toBe(0);
    expect(carrier('bentShot')).toBe(0);
    const jogged = createDrill(config, 'check', 0, 1);
    expect(jogged.state.ball.carrier).toBe(1);
    expect(jogged.state.players[1]!.team).toBe(1);
    expect(createDrill(config, 'faceoff', 0, 1).state.phase).toBe('faceoff');
  });

  it('a repeat can be set up differently (the second ball to scoop lies elsewhere)', () => {
    const a = createDrill(config, 'scoop', 0, 1).state.ball.pos;
    const b = createDrill(config, 'scoop', 1, 1).state.ball.pos;
    expect(b).not.toEqual(a);
  });

  it("drills keep the clocks out of the way and the goalie's Ward down", () => {
    expect(config.shotClock.seconds).toBe(config.training.clockSeconds);
    expect(config.match.periodSeconds).toBe(config.training.clockSeconds);
    expect(config.goalie.saveBase).toBe(config.training.goalieSaveBase);
    const d = createDrill(config, 'shoot', 0, 1);
    const keeper = d.state.players.find((p) => p.role === 'goalie')!;
    expect(keeper.spellCooldowns.ward).toBe(secondsToTicks(config.training.clockSeconds, config));
    // The base config is untouched.
    expect(makeConfig().shotClock.seconds).toBe(30);
    expect(makeConfig().goalie.saveBase).toBeGreaterThan(config.training.goalieSaveBase);
  });
});

describe('training drills (M9): scoring', () => {
  it('scoop: running over the ball scores a point and resets', () => {
    const d = createDrill(config, 'scoop', 0, 1);
    const v = play(d, (s) => ({ move: toward(s.players[0]!.pos, s.ball.pos), aim: s.ball.pos }));
    expect(v).toEqual({ kind: 'point', reset: true });
  });

  it('pass: a caught pass scores without a reset; standing still scores nothing', () => {
    const d = createDrill(config, 'pass', 0, 1);
    const mate = d.state.players[1]!.pos;
    const v = play(d, (_s, t) => ({ ...still(mate), primary: t < 2 }));
    expect(v).toEqual({ kind: 'point', reset: false });
    expect(play(createDrill(config, 'pass', 0, 1), () => still(), 240)).toBeNull();
  });

  it('pass: a fumbled pass that a teammate scoops up still counts; running down your own does not', () => {
    const pass = (by: number): SimEvent => ({ type: 'pass', playerId: by, team: 0, target: 1 });
    const pickup = (by: number): SimEvent => ({ type: 'pickup', playerId: by, team: 0 });
    const judge = new DrillJudge('pass');
    expect(judgeTick(judge, [pass(0)])).toBeNull();
    expect(judgeTick(judge, [{ type: 'dropPass', playerId: 1 }])).toBeNull();
    expect(judgeTick(judge, [pickup(1)])).toEqual({ kind: 'point', reset: false });
    expect(judgeTick(judge, [pass(1)])).toBeNull();
    expect(judgeTick(judge, [pickup(1)])).toBeNull();
    // A pickup with no pass before it (a loose ball) isn't a pass either.
    expect(judgeTick(judge, [pickup(2)])).toBeNull();
  });

  it('shoot: a shot on target goes in or is saved; a wide one is a miss', () => {
    const corner = { x: goal.mouth.x, y: goal.width / 2 - 0.25 };
    const charged = (aim: Vec2) => (_s: MatchState, t: number) => ({ ...still(aim), primary: t < 50 });
    const onTarget = play(createDrill(config, 'shoot', 0, 1), charged(corner));
    expect([
      { kind: 'point', reset: true },
      { kind: 'miss', reason: 'saved' },
    ]).toContainEqual(onTarget);
    const wide = play(createDrill(config, 'shoot', 0, 1), charged({ x: goal.mouth.x, y: 9 }));
    expect(wide).toEqual({ kind: 'miss', reason: 'missed' });
  });

  it('shoot: walking into the crease with the ball is a miss', () => {
    const d = createDrill(config, 'shoot', 0, 1);
    const v = play(d, (s) => ({ move: toward(s.players[0]!.pos, goal.mouth), aim: goal.mouth }), 1200);
    expect(v).toEqual({ kind: 'miss', reason: 'crease' });
  });

  it('Bent Shot: only a goal from an armed shot counts', () => {
    const goalEvent: SimEvent = { type: 'goal', team: 0, scorer: 0 };
    const shot: SimEvent = { type: 'shot', playerId: 0, team: 0, speed: 30 };
    const flight = (spin: number) => ({
      ball: {
        pos: { x: 0, y: 0 },
        vel: { x: 30, y: 0 },
        carrier: null,
        flight: {
          kind: 'shot' as const,
          by: 0,
          team: 0 as const,
          target: null,
          ticks: 1,
          maxTicks: 84,
          from: { x: 0, y: 0 },
          spin,
        },
        lastTouch: 0,
      },
    });
    const straight = new DrillJudge('bentShot');
    expect(judgeTick(straight, [shot], flight(0))).toBeNull();
    expect(judgeTick(straight, [goalEvent], { phase: 'goalPause' })).toEqual({
      kind: 'miss',
      reason: 'notBent',
    });
    const bent = new DrillJudge('bentShot');
    expect(judgeTick(bent, [shot], flight(1.2))).toBeNull();
    expect(judgeTick(bent, [goalEvent], { phase: 'goalPause' })).toEqual({ kind: 'point', reset: true });
    // In the plain shooting drill, a straight goal counts.
    const plain = new DrillJudge('shoot');
    judgeTick(plain, [shot], flight(0));
    expect(judgeTick(plain, [goalEvent], { phase: 'goalPause' })).toEqual({ kind: 'point', reset: true });
  });

  it('check: landing a body check on the carrier scores', () => {
    const d = createDrill(config, 'check', 0, 1);
    const v = play(d, (s, t) => {
      const me = s.players[0]!;
      const them = s.players[1]!;
      const close = Math.hypot(them.pos.x - me.pos.x, them.pos.y - me.pos.y) < 2;
      return { move: toward(me.pos, them.pos), aim: them.pos, check: close && t % 10 === 0 };
    });
    expect(v).toEqual({ kind: 'point', reset: true });
  });

  it('Hex Shove: popping the ball loose scores; a cast that reaches nobody is a miss', () => {
    const near = createDrill(config, 'hexShove', 0, 1);
    const v = play(near, (s) => {
      const me = s.players[0]!;
      const them = s.players[1]!;
      const close = Math.hypot(them.pos.x - me.pos.x, them.pos.y - me.pos.y) < 2.5;
      return { move: toward(me.pos, them.pos), aim: them.pos, cast: close ? 'hexShove' : undefined };
    });
    expect(v).toEqual({ kind: 'point', reset: true });
    const far = createDrill(config, 'hexShove', 0, 1);
    expect(play(far, (_s, t) => ({ ...still(), cast: t === 0 ? 'hexShove' : undefined }))).toEqual({
      kind: 'miss',
      reason: 'tooFar',
    });
  });

  it('faceoff: jumping the whistle is a miss; pressing right after it wins', () => {
    const early = createDrill(config, 'faceoff', 0, 1);
    expect(play(early, (_s, t) => ({ ...still(), primary: t === 3 }))).toEqual({
      kind: 'miss',
      reason: 'early',
    });
    const onTime = createDrill(config, 'faceoff', 0, 1);
    let whistledAt = -1;
    const v = play(onTime, (s, t) => {
      if (whistledAt < 0 && s.faceoff?.whistled) whistledAt = t;
      return { ...still(), primary: whistledAt >= 0 && t === whistledAt + 1 };
    });
    expect(v).toEqual({ kind: 'point', reset: true });
  });
});
