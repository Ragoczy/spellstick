import { describe, expect, it } from 'vitest';
import { createTeamControllers } from '../ai';
import { hashState, makeConfig, secondsToTicks, type InputCommand } from '../sim';
import type { SideInput } from './protocol';
import { createWorld, replayShowing, stepWorld, type OnlineWorld } from './world';

const config = makeConfig();

/** Plays with the AI on every witch until `until` says stop (or `max` ticks). */
function playAi(world: OnlineWorld, seed: number, until: (w: OnlineWorld) => boolean, max = 60_000): void {
  const ai = createTeamControllers(world.match, config, seed);
  for (let i = 0; i < max && !until(world); i++) {
    stepWorld(world, [null, null], (id) => ai[id]!.decide(world.match, id), config);
  }
}

describe('online world', () => {
  it('starts at a faceoff with each side controlling its taker', () => {
    const w = createWorld(config, 3, [true, true]);
    expect(w.match.phase).toBe('faceoff');
    expect(w.control).toEqual(w.match.faceoff!.takers);
  });

  it('puts a person on their controlled witch and the AI on everyone else', () => {
    const w = createWorld(config, 3, [true, true]);
    const mine: SideInput = { t: 1, move: { x: 0, y: 1 }, aim: { x: 0, y: 0 } };
    const told: number[] = [];
    const step = stepWorld(
      w,
      [mine, null],
      (id) => (told.push(id), { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }),
      config,
    );
    expect(told).not.toContain(w.control[0]);
    expect(told).toContain(w.control[1]);
    expect(step.inputs[w.control[0]]!.move).toEqual({ x: 0, y: 1 });
    expect(w.tick).toBe(1);
  });

  it('is deterministic', () => {
    const run = () => {
      const w = createWorld(config, 11, [false, false]);
      playAi(w, 11, (x) => x.tick >= 3000);
      return hashState(w);
    };
    expect(run()).toBe(run());
  });

  it('holds the match for a goal replay, then carries on', () => {
    const w = createWorld(config, 5, [false, false]);
    playAi(w, 5, (x) => x.replay !== null);
    expect(w.replay).not.toBeNull();
    const goalTick = w.replay!.goalTick;
    // The goal plays out live first...
    playAi(w, 5, (x) => replayShowing(x));
    const held = w.match.tick;
    expect(held - goalTick).toBe(secondsToTicks(config.online.replayDelaySeconds, config));
    // ...then the match waits while the replay shows.
    const startedAt = w.tick;
    playAi(w, 5, (x) => x.replay === null);
    expect(w.tick - startedAt).toBe(secondsToTicks(config.online.replayHoldSeconds, config));
    expect(w.match.tick).toBe(held);
  });

  it('ends the replay early once every person has skipped it', () => {
    const w = createWorld(config, 5, [true, true]);
    playAi(w, 5, (x) => replayShowing(x));
    w.humans = [true, true];
    const idle = (): InputCommand => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } });
    const skip: SideInput = { t: 0, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, skipReplay: true };
    const still: SideInput = { t: 0, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } };
    stepWorld(w, [skip, still], idle, config);
    expect(replayShowing(w)).toBe(true);
    stepWorld(w, [still, skip], idle, config);
    expect(w.replay).toBeNull();
  });

  it("doesn't wait for a side with no person on it", () => {
    const w = createWorld(config, 5, [true, false]);
    playAi(w, 5, (x) => replayShowing(x));
    w.humans = [true, false];
    const skip: SideInput = { t: 0, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, skipReplay: true };
    stepWorld(w, [skip, null], () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }), config);
    expect(w.replay).toBeNull();
  });
});
