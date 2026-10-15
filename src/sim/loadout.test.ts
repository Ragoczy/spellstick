import { describe, expect, it } from 'vitest';
import { arenaGeometry } from './arena';
import { makeConfig, secondsToTicks, type SimConfig } from './config';
import { createMatch, stepMatch } from './match';
import { drawLoadout, isLoadout, loadoutRng } from './loadout';
import { canCast, wallPlacement } from './spells';
import {
  DEFAULT_LOADOUT,
  SPELL_POOL,
  type InputCommand,
  type MatchState,
  type RosterEntry,
  type RunnerSpell,
  type SimEvent,
  type SpellId,
} from './types';
import type { Vec2 } from './vec';

const AIM_RIGHT = { x: 100, y: 0 };
const idle = (aim: Vec2 = AIM_RIGHT): InputCommand => ({ move: { x: 0, y: 0 }, aim });
const cast = (spell: SpellId, aim: Vec2 = AIM_RIGHT, move = { x: 0, y: 0 }): InputCommand => ({
  move,
  aim,
  cast: spell,
});

function run(state: MatchState, config: SimConfig, ticks: number, inputs: InputCommand[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    stepMatch(state, inputs, config);
    events.push(...state.events);
  }
  return events;
}

/** Home runner (id 0) carrying `spells`, plus whoever else; the ball parked out of the way. */
function setup(
  spells: RunnerSpell[],
  others: RosterEntry[] = [],
  config: SimConfig = makeConfig(),
  at = { x: 0, y: 0 },
) {
  const roster: RosterEntry[] = [{ team: 0, number: 7, pos: at }, ...others];
  const state = createMatch(config, 1, roster, { loadouts: [spells, DEFAULT_LOADOUT] });
  state.ball.pos = { x: -20, y: 10 };
  return { state, config, me: state.players[0]! };
}

const away = (pos: Vec2): RosterEntry => ({ team: 1, number: 9, pos });
const casts = (events: SimEvent[], spell: SpellId) =>
  events.filter((e) => e.type === 'cast' && e.spell === spell);

describe('loadouts (M10)', () => {
  it("runners carry their team's three; goalies carry none", () => {
    const config = makeConfig();
    const state = createMatch(
      config,
      1,
      [
        { team: 0, number: 7, pos: { x: 0, y: 0 } },
        { team: 1, number: 9, pos: { x: 5, y: 0 } },
        { team: 1, number: 1, pos: { x: 20, y: 0 }, role: 'goalie' },
      ],
      {
        loadouts: [
          ['blink', 'snare', 'iceWall'],
          ['tailwind', 'pinpoint', 'stoneSkin'],
        ],
      },
    );
    expect(state.players[0]!.spells).toEqual(['blink', 'snare', 'iceWall']);
    expect(state.players[1]!.spells).toEqual(['tailwind', 'pinpoint', 'stoneSkin']);
    expect(state.players[2]!.spells).toEqual([]);
    expect(createMatch(config, 1, [{ team: 0, number: 7, pos: { x: 0, y: 0 } }]).players[0]!.spells).toEqual([
      ...DEFAULT_LOADOUT,
    ]);
  });

  it('you can only cast your own three', () => {
    const { state, config, me } = setup(['blink', 'snare', 'stoneSkin']);
    expect(canCast(me, 'stoneSkin', config)).toBe(true);
    expect(canCast(me, 'hexShove', config)).toBe(false);
    expect(casts(run(state, config, 1, [cast('quickstep')]), 'quickstep')).toHaveLength(0);
  });

  it('one armed spell at a time: Misdirection, Pinpoint, and Tailwind wait for each other', () => {
    const { state, config, me } = setup(['bentShot', 'pinpoint', 'tailwind']);
    run(state, config, 1, [cast('pinpoint')]);
    expect(me.armed).toBe('pinpoint');
    expect(canCast(me, 'bentShot', config)).toBe(false);
    expect(canCast(me, 'tailwind', config)).toBe(false);
  });

  it('every new spell costs its mana and starts its cooldown', () => {
    const fresh: RunnerSpell[] = [
      'pinpoint',
      'blink',
      'snare',
      'iceWall',
      'stoneSkin',
      'tailwind',
      'glamourSelf',
    ];
    for (const spell of fresh) {
      const { state, config, me } = setup([spell], [away({ x: 3, y: 0 })]);
      const cd = secondsToTicks(config.spells[spell].cooldownSeconds, config);
      const events = run(state, config, 1, [cast(spell), idle()]);
      expect(casts(events, spell), spell).toHaveLength(1);
      expect(me.mana, spell).toBe(config.mana.max - config.spells[spell].cost);
      expect(me.spellCooldowns[spell], spell).toBe(cd);
      run(state, config, cd - 1, [idle(), idle()]);
      expect(canCast(me, spell, config), spell).toBe(false); // still one tick left
    }
  });

  it('random loadouts: three different spells, with an always or a never, the same for the same seed', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const l = drawLoadout(loadoutRng(seed, 0));
      expect(isLoadout(l)).toBe(true);
      expect(drawLoadout(loadoutRng(seed, 0))).toEqual(l);
      expect(drawLoadout(loadoutRng(seed, 1), { include: 'snare' })).toContain('snare');
      expect(drawLoadout(loadoutRng(seed, 2), { exclude: 'snare' })).not.toContain('snare');
    }
    expect(isLoadout(['blink', 'blink', 'snare'])).toBe(false);
    expect(isLoadout(['blink', 'snare'])).toBe(false);
    expect(isLoadout(['blink', 'snare', 'ward'])).toBe(false);
  });

  it('the pool is the ten spells, and the starting three are in it', () => {
    expect(SPELL_POOL).toHaveLength(10);
    for (const s of DEFAULT_LOADOUT) expect(SPELL_POOL).toContain(s);
  });
});

describe('Pinpoint', () => {
  it('the next shot goes exactly where the stick points and is harder to save; then it is used up', () => {
    // A huge aim error, so a straight shot proves Pinpoint took it away.
    const config = makeConfig({ shot: { spreadStandingDeg: 25 } });
    const goal = arenaGeometry(config).goals[1];
    const { state, me } = setup(['pinpoint'], [], config, { x: goal.mouth.x - 12, y: 0 });
    state.ball.carrier = 0;
    const aim = { x: goal.mouth.x, y: 0.5 };
    run(state, config, 1, [cast('pinpoint', aim)]);
    run(state, config, 20, [{ ...idle(aim), primary: true }]);
    run(state, config, 1, [idle(aim)]);
    const f = state.ball.flight!;
    expect(f.kind).toBe('shot');
    expect(f.savePenalty).toBe(config.spells.pinpoint.savePenalty);
    const v = state.ball.vel;
    const want = Math.atan2(aim.y - me.pos.y, aim.x - me.pos.x);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(want, 1);
    expect(me.armed).toBeNull();
  });
});

describe('Blink', () => {
  it('teleports the way you move, ball and all', () => {
    const { state, config, me } = setup(['blink']);
    state.ball.carrier = 0;
    const events = run(state, config, 1, [cast('blink', AIM_RIGHT, { x: 0, y: 1 })]);
    const b = events.find((e) => e.type === 'blink');
    expect(b).toBeTruthy();
    expect(me.pos.y).toBeGreaterThan(config.spells.blink.distance - 0.3);
    expect(state.ball.carrier).toBe(0);
    run(state, config, 1, [idle()]);
    expect(Math.hypot(state.ball.pos.x - me.pos.x, state.ball.pos.y - me.pos.y)).toBeLessThan(1.2);
  });

  it('stops short of the boards and of the crease you attack', () => {
    const config = makeConfig();
    const arena = arenaGeometry(config);
    const nearBoard = setup(['blink'], [], config, { x: 0, y: arena.halfWidth - 2 });
    run(nearBoard.state, config, 1, [cast('blink', AIM_RIGHT, { x: 0, y: 1 })]);
    expect(nearBoard.me.pos.y).toBeLessThanOrEqual(arena.halfWidth - config.player.radius);

    const goal = arena.goals[1];
    const nearCrease = setup(['blink'], [], config, { x: goal.mouth.x - goal.creaseRadius - 2, y: 0 });
    run(nearCrease.state, config, 1, [cast('blink', AIM_RIGHT, { x: 1, y: 0 })]);
    const d = Math.hypot(nearCrease.me.pos.x - goal.mouth.x, nearCrease.me.pos.y - goal.mouth.y);
    expect(d).toBeGreaterThanOrEqual(goal.creaseRadius + config.player.radius - 1e-9);
  });

  it("with nowhere to go, it isn't cast and costs nothing", () => {
    const config = makeConfig();
    const arena = arenaGeometry(config);
    const { state, me } = setup(['blink'], [], config, { x: 0, y: arena.halfWidth - config.player.radius });
    const events = run(state, config, 1, [cast('blink', AIM_RIGHT, { x: 0, y: 1 })]);
    expect(casts(events, 'blink')).toHaveLength(0);
    expect(me.mana).toBe(config.mana.max);
  });
});

describe('Snare', () => {
  it('pins the nearest opponent in the cone in place, then lets them go', () => {
    const { state, config } = setup(
      ['snare'],
      [away({ x: 4, y: 0 }), { ...away({ x: 6, y: 0 }), number: 11 }],
    );
    const events = run(state, config, 1, [cast('snare'), idle(), idle()]);
    expect(events.find((e) => e.type === 'snare')).toMatchObject({ targetId: 1 });
    const them = state.players[1]!;
    const start = { ...them.pos };
    const runAway: InputCommand = { move: { x: 1, y: 0 }, aim: AIM_RIGHT };
    run(state, config, secondsToTicks(config.spells.snare.rootSeconds, config) - 2, [
      idle(),
      runAway,
      idle(),
    ]);
    expect(Math.hypot(them.pos.x - start.x, them.pos.y - start.y)).toBeLessThan(0.01);
    run(state, config, 30, [idle(), runAway, idle()]);
    expect(them.pos.x).toBeGreaterThan(start.x + 0.3);
  });

  it('misses when nobody is in the cone (the mana is spent); never catches a goalie', () => {
    const { state, config, me } = setup(['snare'], [away({ x: 0, y: 5 })]);
    const events = run(state, config, 1, [cast('snare'), idle()]);
    expect(events.find((e) => e.type === 'snare')).toMatchObject({ targetId: null });
    expect(me.mana).toBeLessThan(config.mana.max);
    const keeper = setup(['snare'], [{ team: 1, number: 1, pos: { x: 4, y: 0 }, role: 'goalie' }]);
    const e2 = run(keeper.state, keeper.config, 1, [cast('snare'), idle()]);
    expect(e2.find((e) => e.type === 'snare')).toMatchObject({ targetId: null });
  });

  it("binds the stick: a snared carrier's charged shot comes to nothing, but a pass still goes", () => {
    const { state, config } = setup(['snare'], [away({ x: 4, y: 0 })]);
    run(state, config, 1, [cast('snare'), idle()]);
    const them = state.players[1]!;
    state.ball.carrier = 1;
    const aimLeft = { x: -100, y: 0 };
    const shotTry = run(state, config, 20, [idle(), { ...idle(aimLeft), primary: true }]);
    shotTry.push(...run(state, config, 1, [idle(), idle(aimLeft)]));
    expect(shotTry.some((e) => e.type === 'shot')).toBe(false);
    expect(state.ball.carrier).toBe(1);
    expect(them.rootTicks).toBeGreaterThan(0);
    const passTry = run(state, config, 1, [idle(), { ...idle(aimLeft), primary: true }]);
    passTry.push(...run(state, config, 1, [idle(), idle(aimLeft)]));
    expect(passTry.some((e) => e.type === 'pass')).toBe(true);
  });

  it('may yank the ball loose from a carrier, toward the caster; they cannot scoop it back', () => {
    const sure = makeConfig();
    sure.spells.snare.yankChance = 1;
    const { state, config } = setup(['snare'], [away({ x: 4, y: 0 })], sure);
    state.ball.carrier = 1;
    const events = run(state, config, 1, [cast('snare'), idle({ x: -100, y: 0 })]);
    expect(events.find((e) => e.type === 'snare')).toMatchObject({ targetId: 1, loosened: true });
    expect(state.ball.carrier).toBeNull();
    expect(state.ball.vel.x).toBeLessThan(0); // toward the caster, who is to the left
    expect(state.players[1]!.stickCooldown).toBeGreaterThan(0);
  });

  it("can't chain: a player just snared can't be snared again until a while after it breaks", () => {
    const { state, config } = setup(['snare'], [away({ x: 4, y: 0 })]);
    const me = state.players[0]!;
    run(state, config, 1, [cast('snare'), idle()]);
    const them = state.players[1]!;
    const root = secondsToTicks(config.spells.snare.rootSeconds, config);
    const grace = secondsToTicks(config.spells.snare.immuneSeconds, config);
    run(state, config, root + 5, [idle(), idle()]);
    me.spellCooldowns.snare = 0;
    me.mana = config.mana.max;
    const again = run(state, config, 1, [cast('snare'), idle()]);
    expect(again.find((e) => e.type === 'snare')).toMatchObject({ targetId: null });
    run(state, config, grace, [idle(), idle()]);
    me.spellCooldowns.snare = 0;
    me.mana = config.mana.max;
    const later = run(state, config, 1, [cast('snare'), idle()]);
    expect(later.find((e) => e.type === 'snare')).toMatchObject({ targetId: them.id });
  });

  it('a hit knocks a snared player free', () => {
    const { state, config } = setup(['snare'], [away({ x: 4, y: 0 })]);
    run(state, config, 1, [cast('snare'), idle()]);
    const them = state.players[1]!;
    expect(them.rootTicks).toBeGreaterThan(0);
    const check: InputCommand = { move: { x: 1, y: 0 }, aim: AIM_RIGHT, check: true };
    them.pos = { x: 1.3, y: 0 };
    run(state, config, 10, [check, idle()]);
    expect(them.rootTicks).toBe(0);
  });
});

describe('Ice Wall', () => {
  it('stands square to the stick, in front of you, and melts after its time', () => {
    const { state, config, me } = setup(['iceWall']);
    const events = run(state, config, 1, [cast('iceWall')]);
    const w = events.find((e) => e.type === 'iceWall');
    expect(w).toBeTruthy();
    expect(state.walls).toHaveLength(1);
    const wall = state.walls[0]!;
    expect((wall.a.x + wall.b.x) / 2).toBeCloseTo(me.pos.x + config.spells.iceWall.distance, 5);
    expect(Math.abs(wall.a.y - wall.b.y)).toBeCloseTo(config.spells.iceWall.length, 5);
    run(state, config, secondsToTicks(config.spells.iceWall.durationSeconds, config));
    expect(state.walls).toHaveLength(0);
  });

  it('the ball bounces off it, and so do players', () => {
    const { state, config } = setup(['iceWall'], [away({ x: 6, y: 0 })]);
    run(state, config, 1, [cast('iceWall'), idle()]);
    const wallX = state.walls[0]!.a.x;
    // A ball rolled hard at the wall comes back.
    state.ball = {
      pos: { x: wallX - 2, y: 0 },
      vel: { x: 12, y: 0 },
      carrier: null,
      flight: null,
      lastTouch: null,
    };
    run(state, config, 20, [idle(), idle()]);
    expect(state.ball.pos.x).toBeLessThan(wallX);
    expect(state.ball.vel.x).toBeLessThan(0);
    // The opponent running at it from the far side stays on their side.
    run(state, config, 60, [idle(), { move: { x: -1, y: 0 }, aim: AIM_RIGHT }]);
    expect(state.players[1]!.pos.x).toBeGreaterThan(wallX);
  });

  it("can't be raised touching a crease (it would wall off a goal)", () => {
    const config = makeConfig();
    const goal = arenaGeometry(config).goals[1];
    const { state, me } = setup(['iceWall'], [], config, { x: goal.mouth.x - 5, y: 0 });
    expect(wallPlacement(me, arenaGeometry(config), config)).toBeNull();
    const events = run(state, config, 1, [cast('iceWall', { x: goal.mouth.x, y: 0 })]);
    expect(casts(events, 'iceWall')).toHaveLength(0);
    expect(me.mana).toBe(config.mana.max);
  });
});

describe('Stone Skin', () => {
  it('a check bounces off: no knockback, no daze, and the ball stays', () => {
    const { state, config, me } = setup(['stoneSkin'], [away({ x: 1.3, y: 0 })]);
    state.ball.carrier = 0;
    run(state, config, 1, [cast('stoneSkin'), idle()]);
    // A strip chance of 1, so only Stone Skin can keep the ball.
    config.check.looseChance = 1;
    const check: InputCommand = { move: { x: -1, y: 0 }, aim: { x: -100, y: 0 }, check: true };
    const events = run(state, config, 10, [idle(), check]);
    expect(events.some((e) => e.type === 'stoneBlock')).toBe(true);
    expect(events.some((e) => e.type === 'check')).toBe(false);
    expect(me.staggerTicks).toBe(0);
    expect(state.ball.carrier).toBe(0);
  });

  it('Thunderclap does nothing to it either; when it wears off, hits land again', () => {
    const { state, config, me } = setup(['stoneSkin'], [away({ x: 2, y: 0 })]);
    state.players[1]!.spells = ['hexShove'];
    state.players[1]!.facing = Math.PI;
    run(state, config, 1, [cast('stoneSkin'), idle({ x: -100, y: 0 })]);
    run(state, config, 1, [idle(), cast('hexShove', { x: -100, y: 0 })]);
    expect(me.staggerTicks).toBe(0);
    run(state, config, secondsToTicks(config.spells.stoneSkin.durationSeconds, config));
    expect(me.stoneTicks).toBe(0);
  });
});

describe('Tailwind', () => {
  it('the next pass flies faster, nobody on the other side can pick it off, and it is caught', () => {
    const { state, config, me } = setup(
      ['tailwind'],
      [
        { team: 0, number: 12, pos: { x: 14, y: 0 } },
        away({ x: 6, y: 0 }), // right in the lane
      ],
    );
    state.ball.carrier = 0;
    run(state, config, 1, [cast('tailwind'), idle(), idle()]);
    expect(me.armed).toBe('tailwind');
    run(state, config, 1, [{ ...idle(), primary: true }, idle(), idle()]);
    run(state, config, 1, [idle(), idle({ x: -100, y: 0 }), idle()]);
    const f = state.ball.flight!;
    expect(f.tailwind).toBe(true);
    expect(Math.hypot(state.ball.vel.x, state.ball.vel.y)).toBeGreaterThan(config.pass.speed * 1.2);
    expect(me.armed).toBeNull();
    const events = run(state, config, 60, [idle(), idle({ x: -100, y: 0 }), idle({ x: -100, y: 0 })]);
    expect(events.find((e) => e.type === 'catch')).toMatchObject({ playerId: 1, intercepted: false });
  });
});

describe('Glamour Self', () => {
  it('an illusion takes the hit (one fades each time); with none left, hits land', () => {
    const config = makeConfig();
    config.spells.glamourSelf.imageHitChance = 1;
    const { state, me } = setup(['glamourSelf'], [away({ x: 1.3, y: 0 })], config);
    run(state, config, 1, [cast('glamourSelf'), idle()]);
    expect(me.images).toBe(config.spells.glamourSelf.images);
    const them = state.players[1]!;
    const check: InputCommand = { move: { x: -1, y: 0 }, aim: { x: -100, y: 0 }, check: true };
    for (let i = 0; i < config.spells.glamourSelf.images; i++) {
      them.pos = { x: me.pos.x + 1.3, y: me.pos.y };
      them.checkCooldown = 0;
      const events = run(state, config, 10, [idle(), check]);
      expect(events.some((e) => e.type === 'imagePop')).toBe(true);
      expect(me.staggerTicks).toBe(0);
    }
    expect(me.images).toBe(0);
    them.pos = { x: me.pos.x + 1.3, y: me.pos.y };
    them.checkCooldown = 0;
    const events = run(state, config, 10, [idle(), check]);
    expect(events.some((e) => e.type === 'check')).toBe(true);
  });

  it('the illusions fade after their time', () => {
    const { state, config, me } = setup(['glamourSelf']);
    run(state, config, 1, [cast('glamourSelf')]);
    run(state, config, secondsToTicks(config.spells.glamourSelf.durationSeconds, config));
    expect(me.images).toBe(0);
  });
});
