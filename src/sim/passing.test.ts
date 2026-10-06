import { describe, expect, it } from 'vitest';
import { choosePassTarget, leadPoint, tapTicks } from './actions';
import { makeConfig, type SimConfig } from './config';
import { createMatch, facingDir, stepMatch, stickHead } from './match';
import type { InputCommand, MatchState, RosterEntry } from './types';

const hold = (aim: { x: number; y: number }, primary: boolean, move = { x: 0, y: 0 }): InputCommand => ({
  move,
  aim,
  primary,
});

function setup(roster: RosterEntry[], config: SimConfig = makeConfig(), seed = 1) {
  const state = createMatch(config, seed, roster);
  state.ball.carrier = 0;
  return { state, config };
}

/** Taps the button: down for one tick, then up (the pass fires on release). */
function tapPass(
  state: MatchState,
  config: SimConfig,
  aim: { x: number; y: number },
  others: InputCommand[] = [],
) {
  stepMatch(state, [hold(aim, true), ...others], config);
  stepMatch(state, [hold(aim, false), ...others], config);
}

function runUntilSettled(state: MatchState, config: SimConfig, ticks: number, inputs: InputCommand[] = []) {
  const events: MatchState['events'] = [];
  for (let i = 0; i < ticks; i++) {
    stepMatch(state, inputs, config);
    events.push(...state.events);
  }
  return events;
}

const passer: RosterEntry = { team: 0, number: 7, pos: { x: -10, y: 0 } };

describe('passing (SPEC §5)', () => {
  it('a tap passes toward the cursor at pass speed', () => {
    const { state, config } = setup([passer]);
    tapPass(state, config, { x: 0, y: 0 });
    expect(state.ball.carrier).toBeNull();
    expect(state.ball.flight?.kind).toBe('pass');
    expect(state.ball.vel.x).toBeGreaterThan(config.pass.speed * 0.95);
    expect(Math.abs(state.ball.vel.y)).toBeLessThan(0.01);
    expect(state.events.some((e) => e.type === 'pass')).toBe(true);
  });

  it('the pass fires on release, not on press', () => {
    const { state, config } = setup([passer]);
    stepMatch(state, [hold({ x: 0, y: 0 }, true)], config);
    expect(state.ball.carrier).toBe(0);
  });

  it('a teammate in the aim cone is caught by assist magnetism, even with a sloppy aim', () => {
    const config = makeConfig({ catch: { chanceSlow: 1, chanceFast: 1 } });
    const { state } = setup([passer, { team: 0, number: 12, pos: { x: 2, y: 3 } }], config);
    // Aim ~10° off the teammate.
    tapPass(state, config, { x: 2, y: 5 }, [hold({ x: -10, y: 0 }, false)]);
    expect(state.ball.flight?.target).toBe(1);
    const events = runUntilSettled(state, config, 90, [
      hold({ x: 2, y: 5 }, false),
      hold({ x: -10, y: 0 }, false),
    ]);
    expect(events.some((e) => e.type === 'catch' && e.playerId === 1 && !e.intercepted)).toBe(true);
    expect(state.ball.carrier).toBe(1);
  });

  it('a teammate outside the cone gets no help', () => {
    const { state, config } = setup([passer, { team: 0, number: 12, pos: { x: 0, y: 10 } }]);
    const me = state.players[0]!;
    me.facing = 0;
    expect(choosePassTarget(state, me, stickHead(me, config), facingDir(me), config)).toBeNull();
  });

  it('picks the teammate closest to the aim line', () => {
    const { state, config } = setup([
      passer,
      { team: 0, number: 12, pos: { x: 0, y: 3 } },
      { team: 0, number: 18, pos: { x: 5, y: 0.5 } },
    ]);
    const me = state.players[0]!;
    me.facing = 0;
    expect(choosePassTarget(state, me, stickHead(me, config), facingDir(me), config)?.id).toBe(2);
  });

  it('opponents never get assist magnetism', () => {
    const { state, config } = setup([passer, { team: 1, number: 9, pos: { x: 0, y: 0 } }]);
    const me = state.players[0]!;
    me.facing = 0;
    expect(choosePassTarget(state, me, stickHead(me, config), facingDir(me), config)).toBeNull();
  });

  it('leads a moving receiver', () => {
    const lead = leadPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, 17, 2);
    expect(lead.y).toBeGreaterThan(2);
    const t = Math.hypot(lead.x, lead.y) / 17;
    expect(lead.y).toBeCloseTo(5 * t, 5);
  });

  it('a pass lands and rolls if nobody catches it', () => {
    const { state, config } = setup([passer]);
    tapPass(state, config, { x: 0, y: 5 });
    runUntilSettled(state, config, Math.round(config.pass.airSeconds * config.tickHz) + 2, [
      hold({ x: 0, y: 5 }, false),
    ]);
    expect(state.ball.flight).toBeNull();
    expect(state.ball.carrier).toBeNull();
  });

  it('the passer cannot catch their own pass', () => {
    const { state, config } = setup([passer]);
    tapPass(state, config, { x: 0, y: 0 });
    const events = runUntilSettled(state, config, 5, [hold({ x: 0, y: 0 }, false, { x: 1, y: 0 })]);
    expect(events.some((e) => e.type === 'catch')).toBe(false);
  });

  it('a failed catch drops the ball loose', () => {
    const config = makeConfig({ catch: { chanceSlow: 0, chanceFast: 0 } });
    const { state } = setup([passer, { team: 0, number: 12, pos: { x: 0, y: 0 } }], config);
    tapPass(state, config, { x: 0, y: 0 }, [hold({ x: -10, y: 0 }, false)]);
    const events = runUntilSettled(state, config, 60, [
      hold({ x: 0, y: 0 }, false),
      hold({ x: -10, y: 0 }, false),
    ]);
    expect(events.some((e) => e.type === 'dropPass' && e.playerId === 1)).toBe(true);
  });

  it('an opponent in the lane can intercept', () => {
    const config = makeConfig({ catch: { interceptSlow: 1, interceptFast: 1 } });
    const { state } = setup(
      [passer, { team: 0, number: 12, pos: { x: 5, y: 0 } }, { team: 1, number: 9, pos: { x: -3, y: 0.5 } }],
      config,
    );
    tapPass(state, config, { x: 5, y: 0 });
    const events = runUntilSettled(state, config, 60);
    expect(events.some((e) => e.type === 'catch' && e.playerId === 2 && e.intercepted)).toBe(true);
    expect(state.ball.carrier).toBe(2);
  });

  it('catch is likelier for slow passes than fast ones (relative speed)', () => {
    const rate = (receiverVelX: number) => {
      let caught = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const { state, config } = setup(
          [passer, { team: 0, number: 12, pos: { x: 0, y: 0 } }],
          makeConfig(),
          seed,
        );
        state.players[1]!.vel = { x: receiverVelX, y: 0 };
        tapPass(state, config, { x: 0, y: 0 }, [hold({ x: -10, y: 0 }, false)]);
        const events = runUntilSettled(state, config, 60, [
          hold({ x: 0, y: 0 }, false),
          hold({ x: -10, y: 0 }, false),
        ]);
        if (events.some((e) => e.type === 'catch' && e.playerId === 1)) caught++;
      }
      return caught / 300;
    };
    // Running away from the pass vs running into it.
    expect(rate(7)).toBeGreaterThan(rate(-7));
  });

  it('holding the button through a catch does not fire a pass or shot', () => {
    const config = makeConfig({ catch: { chanceSlow: 1, chanceFast: 1 } });
    const { state } = setup([passer, { team: 0, number: 12, pos: { x: 0, y: 0 } }], config);
    tapPass(state, config, { x: 0, y: 0 }, [hold({ x: -10, y: 0 }, true)]);
    runUntilSettled(state, config, 60, [hold({ x: 0, y: 0 }, false), hold({ x: -10, y: 0 }, true)]);
    expect(state.ball.carrier).toBe(1);
    // Releasing now must not throw: the press started before the catch.
    stepMatch(state, [hold({ x: 0, y: 0 }, false), hold({ x: -10, y: 0 }, false)], config);
    expect(state.ball.carrier).toBe(1);
  });

  it('tap window matches config', () => {
    const config = makeConfig();
    expect(tapTicks(config)).toBe(Math.round(config.pass.tapSeconds * config.tickHz));
  });
});
