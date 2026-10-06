import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { makeConfig, secondsToTicks, type SimConfig } from './config';
import { createMatch, stepMatch } from './match';
import { bentLaunch } from './spells';
import type { InputCommand, MatchState, RosterEntry, SimEvent, SpellId } from './types';

const idle = (aim = { x: 100, y: 0 }): InputCommand => ({ move: { x: 0, y: 0 }, aim });
const cast = (spell: SpellId, aim = { x: 100, y: 0 }): InputCommand => ({ ...idle(aim), cast: spell });

function run(state: MatchState, config: SimConfig, ticks: number, inputs: InputCommand[] = []) {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepMatch(state, inputs, config);
    events.push(...state.events);
  }
  return events;
}

const me: RosterEntry = { team: 0, number: 7, pos: { x: 0, y: 0 } };
function setup(roster: RosterEntry[] = [me], config: SimConfig = makeConfig()) {
  const state = createMatch(config, 1, roster);
  state.ball.pos = { x: 0, y: 12 };
  return { state, config };
}

describe('mana (SPEC §6)', () => {
  it('runners start full; regen is faster without the ball', () => {
    const { state, config } = setup();
    const p = state.players[0]!;
    expect(p.mana).toBe(config.mana.max);
    p.mana = 0;
    run(state, config, 60);
    expect(p.mana).toBeCloseTo(config.mana.regenFree, 5);
    p.mana = 0;
    state.ball.carrier = 0;
    run(state, config, 60);
    expect(p.mana).toBeCloseTo(config.mana.regenCarrying, 5);
    expect(config.mana.regenFree).toBeGreaterThan(config.mana.regenCarrying);
  });

  it('never goes above max', () => {
    const { state, config } = setup();
    run(state, config, 600);
    expect(state.players[0]!.mana).toBe(config.mana.max);
  });

  it('a spell needs enough mana', () => {
    const { state, config } = setup();
    state.players[0]!.mana = config.spells.quickstep.cost - 1;
    const events = run(state, config, 1, [cast('quickstep')]);
    expect(events.some((e) => e.type === 'cast')).toBe(false);
    expect(state.players[0]!.quickstepTicks).toBe(0);
  });

  it("can't cast while dazed, or outside live play", () => {
    const { state, config } = setup();
    state.players[0]!.staggerTicks = 10;
    expect(run(state, config, 1, [cast('quickstep')]).some((e) => e.type === 'cast')).toBe(false);
    const full = createMatch(config, 1, [me, { team: 1, number: 9, pos: { x: 5, y: 0 } }], {
      start: 'faceoff',
    });
    expect(run(full, config, 1, [cast('quickstep')]).some((e) => e.type === 'cast')).toBe(false);
  });

  it('runners cast runner spells only; the goalie casts only Ward', () => {
    const { state, config } = setup([me, { team: 0, number: 1, pos: { x: -23, y: 0 }, role: 'goalie' }]);
    expect(run(state, config, 1, [cast('ward')]).some((e) => e.type === 'cast')).toBe(false);
    expect(run(state, config, 1, [idle(), cast('quickstep')]).some((e) => e.type === 'cast')).toBe(false);
    expect(run(state, config, 1, [idle(), cast('ward')]).some((e) => e.type === 'cast')).toBe(true);
  });
});

describe('Hex Shove (Q)', () => {
  const victim = (x: number, y = 0): RosterEntry => ({ team: 1, number: 9, pos: { x, y } });

  it('costs mana, goes on cooldown, and can be cast again after it', () => {
    const { state, config } = setup([me, victim(2)]);
    const p = state.players[0]!;
    const events = run(state, config, 1, [cast('hexShove'), idle()]);
    expect(events.find((e) => e.type === 'cast')).toMatchObject({ spell: 'hexShove', playerId: 0 });
    expect(p.mana).toBeCloseTo(config.mana.max - config.spells.hexShove.cost, 5); // was full, so no regen this tick
    expect(p.spellCooldowns.hexShove).toBe(secondsToTicks(config.spells.hexShove.cooldownSeconds, config));
    expect(run(state, config, 1, [cast('hexShove'), idle()]).some((e) => e.type === 'cast')).toBe(false);
    run(state, config, secondsToTicks(config.spells.hexShove.cooldownSeconds, config));
    expect(run(state, config, 1, [cast('hexShove'), idle()]).some((e) => e.type === 'cast')).toBe(true);
  });

  it('knocks back and staggers opponents in the cone', () => {
    const { state, config } = setup([me, victim(2), victim(2, 3), victim(-2)]);
    const events = run(state, config, 1, [cast('hexShove')]);
    const shove = events.find((e) => e.type === 'hexShove');
    expect(shove).toMatchObject({ hits: [1] }); // not the one off to the side or behind
    expect(state.players[1]!.vel.x).toBeGreaterThan(config.spells.hexShove.knockbackSpeed * 0.9);
    expect(state.players[1]!.staggerTicks).toBeGreaterThan(0);
    expect(state.players[2]!.staggerTicks).toBe(0);
    expect(state.players[3]!.staggerTicks).toBe(0);
  });

  it('out of range does nothing', () => {
    const { state, config } = setup([me, victim(config0().spells.hexShove.range + 0.5)]);
    const shove = run(state, config, 1, [cast('hexShove')]).find((e) => e.type === 'hexShove');
    expect(shove).toMatchObject({ hits: [] });
  });

  it('always knocks the ball loose from a carrier it hits', () => {
    const { state, config } = setup([me, victim(2)]);
    state.ball.carrier = 1;
    const shove = run(state, config, 1, [cast('hexShove'), idle()]).find((e) => e.type === 'hexShove');
    expect(shove).toMatchObject({ loosened: true });
    expect(state.ball.carrier).not.toBe(1);
  });

  it("doesn't move a goalie standing in their crease", () => {
    const config = makeConfig();
    const goal = arenaGeometry(config).goals[1];
    const { state } = setup(
      [
        { team: 0, number: 7, pos: { x: goal.mouth.x - 4, y: 0 } },
        { team: 1, number: 1, pos: { x: goal.mouth.x - 1.5, y: 0 }, role: 'goalie' },
      ],
      config,
    );
    const shove = run(state, config, 1, [cast('hexShove', { x: 30, y: 0 }), idle()]).find(
      (e) => e.type === 'hexShove',
    );
    expect(shove).toMatchObject({ hits: [] });
  });
});

describe('Quickstep (E)', () => {
  it('+40% top speed for 2.5 s, then back to normal; costs mana and has a cooldown', () => {
    const { state, config } = setup([{ team: 0, number: 7, pos: { x: -27, y: 8 } }]); // a long open lane
    const p = state.players[0]!;
    const run1 = { move: { x: 1, y: 0 }, aim: { x: 100, y: 0 } };
    run(state, config, 1, [{ ...run1, cast: 'quickstep' }]);
    expect(p.mana).toBeLessThan(config.mana.max - config.spells.quickstep.cost + 1);
    expect(p.spellCooldowns.quickstep).toBeGreaterThan(0);
    run(state, config, 60, [run1]);
    expect(Math.hypot(p.vel.x, p.vel.y)).toBeCloseTo(
      config.player.maxSpeed * config.spells.quickstep.speedMultiplier,
      3,
    );
    run(state, config, secondsToTicks(config.spells.quickstep.durationSeconds, config), [run1]);
    expect(p.quickstepTicks).toBe(0);
    run(state, config, 60, [run1]);
    expect(Math.hypot(p.vel.x, p.vel.y)).toBeCloseTo(config.player.maxSpeed, 3);
  });
});

describe('Bent Shot (R)', () => {
  it('arms the next shot; costs mana, has a cooldown, and can’t be stacked', () => {
    const { state, config } = setup();
    const p = state.players[0]!;
    run(state, config, 1, [cast('bentShot')]);
    expect(p.bentArmed).toBe(true);
    expect(p.mana).toBeLessThan(config.mana.max - config.spells.bentShot.cost + 1);
    expect(p.spellCooldowns.bentShot).toBe(
      secondsToTicks(config.spells.bentShot.cooldownSeconds, config) - 0,
    );
    run(state, config, secondsToTicks(config.spells.bentShot.cooldownSeconds, config));
    expect(run(state, config, 1, [cast('bentShot')]).some((e) => e.type === 'cast')).toBe(false); // already armed
  });

  it('launches wide outside the aimed post and curves back onto the target', () => {
    const config = makeConfig();
    const goal = arenaGeometry(config).goals[1];
    const from = { x: goal.mouth.x - 10, y: 0 };
    const aim = { x: goal.mouth.x, y: 0.6 };
    const { dir, spin } = bentLaunch(from, aim, 30, goal, config);
    // Aiming at the +y post, it starts out even wider to +y (it looks like a miss)...
    const straightY = aim.y / Math.hypot(10, aim.y);
    expect(dir.y).toBeGreaterThan(straightY + 0.1);
    expect(spin).not.toBe(0);
    // ...and integrating the spin brings it back near the aim point at the goal line.
    let pos = { ...from };
    let v = { x: dir.x * 30, y: dir.y * 30 };
    const dt = 1 / 600;
    for (let i = 0; i < 2000 && pos.x < goal.mouth.x; i++) {
      const a = spin * dt;
      v = { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
      pos = { x: pos.x + v.x * dt, y: pos.y + v.y * dt };
    }
    expect(pos.y).toBeCloseTo(aim.y, 0);
  });

  it('the shot is used up: the one after it flies straight', () => {
    const config = makeConfig({ shot: { spreadStandingDeg: 0, spreadRunningDeg: 0 } });
    const goal = arenaGeometry(config).goals[1];
    const { state } = setup([{ team: 0, number: 7, pos: { x: goal.mouth.x - 12, y: 0 } }], config);
    state.ball.carrier = 0;
    const aim = { x: goal.mouth.x, y: 0.6 };
    run(state, config, 1, [cast('bentShot', aim)]);
    run(state, config, 20, [{ ...idle(aim), primary: true }]);
    run(state, config, 1, [idle(aim)]);
    expect(state.ball.flight?.spin).not.toBe(0);
    expect(state.players[0]!.bentArmed).toBe(false);
  });
});

describe('Ward (goalie)', () => {
  const config = makeConfig();
  const goal = arenaGeometry(config).goals[1];

  function wardSetup() {
    const state = createMatch(config, 1, [
      { team: 0, number: 7, pos: { x: 0, y: 0 } },
      { team: 1, number: 1, pos: { x: goal.mouth.x - 1, y: 6 }, role: 'goalie' }, // well out of position
    ]);
    return state;
  }
  const shotAtGoal = (state: MatchState) => {
    state.ball = {
      pos: { x: goal.mouth.x - 3, y: 0 },
      vel: { x: 25, y: 0 },
      carrier: null,
      lastTouch: 0,
      flight: {
        kind: 'shot',
        by: 0,
        team: 0,
        target: null,
        ticks: 0,
        maxTicks: 80,
        from: { x: 0, y: 0 },
        spin: 0,
      },
    };
  };

  it('blocks one shot completely, then is used up', () => {
    const state = wardSetup();
    const events = run(state, config, 1, [idle(), cast('ward')]);
    expect(events.find((e) => e.type === 'cast')).toMatchObject({ spell: 'ward', playerId: 1 });
    shotAtGoal(state);
    const after = run(state, config, 20, [idle(), idle()]);
    expect(after.some((e) => e.type === 'wardBlock')).toBe(true);
    expect(state.score).toEqual([0, 0]);
    expect(state.ball.vel.x).toBeLessThan(0);
    expect(state.players[1]!.wardTicks).toBe(0);
    shotAtGoal(state);
    run(state, config, 20, [idle(), idle()]);
    expect(state.score).toEqual([1, 0]);
  });

  it('has a long cooldown and no mana cost', () => {
    const state = wardSetup();
    run(state, config, 1, [idle(), cast('ward')]);
    const g = state.players[1]!;
    expect(g.spellCooldowns.ward).toBe(secondsToTicks(config.spells.ward.cooldownSeconds, config));
    expect(run(state, config, 1, [idle(), cast('ward')]).some((e) => e.type === 'cast')).toBe(false);
  });

  it('wears off after its duration', () => {
    const state = wardSetup();
    run(state, config, 1, [idle(), cast('ward')]);
    run(state, config, secondsToTicks(config.spells.ward.durationSeconds, config) + 1);
    shotAtGoal(state);
    run(state, config, 20);
    expect(state.score).toEqual([1, 0]);
  });
});

function config0() {
  return makeConfig();
}
