import { describe, expect, it } from 'vitest';
import { createMatch, makeConfig, scrimmageRoster, stepMatch, type SimEvent } from '../sim';
import { captureFrame, REPLAY, ReplayPlayback, ReplayRecorder, type ReplayFrame } from './replay';

/** A bare frame at `tick`, with the ball at x = tick so frames are easy to tell apart. */
function frame(tick: number, extra: Partial<ReplayFrame> = {}): ReplayFrame {
  return {
    tick,
    players: [],
    ball: { x: tick, y: 0, vel: { x: 0, y: 0 }, flight: null },
    wards: [],
    fx: [],
    cut: false,
    ...extra,
  };
}

describe('goal replays (M9): recording', () => {
  it('keeps only the most recent frames', () => {
    const r = new ReplayRecorder(5);
    for (let t = 1; t <= 8; t++) r.record(frame(t));
    expect(r.size).toBe(5);
    expect(r.clip(0, 100).map((f) => f.tick)).toEqual([4, 5, 6, 7, 8]);
    r.clear();
    expect(r.size).toBe(0);
  });

  it('clips a window of ticks, never reaching back past a restart', () => {
    const r = new ReplayRecorder(100);
    for (let t = 1; t <= 30; t++) r.record(frame(t, { cut: t === 12 }));
    expect(r.clip(15, 20).map((f) => f.tick)).toEqual([15, 16, 17, 18, 19, 20]);
    // The window starts before the faceoff on tick 12: the clip starts at the faceoff.
    expect(r.clip(5, 14).map((f) => f.tick)).toEqual([12, 13, 14]);
    // A restart after the window doesn't matter.
    r.record(frame(31, { cut: true }));
    expect(r.clip(15, 16).map((f) => f.tick)).toEqual([15, 16]);
  });

  it('captures positions, the ball, and the effects worth flashing again', () => {
    const config = makeConfig();
    const state = createMatch(config, 1, scrimmageRoster(config, 2));
    stepMatch(state, [], config);
    const hit: SimEvent = { type: 'check', playerId: 1, targetId: 4, team: 0, loosened: false };
    state.events = [{ type: 'pass', playerId: 1, team: 0, target: null }, hit];
    const f = captureFrame(state, () => 0.5);
    expect(f.tick).toBe(state.tick);
    expect(f.players).toHaveLength(state.players.length);
    expect(f.players[2]).toMatchObject({ x: state.players[2]!.pos.x, y: state.players[2]!.pos.y });
    expect(f.fx).toEqual([hit]);
    expect(f.cut).toBe(false);
    // The frame is a copy: later ticks don't change it.
    const x = f.ball.x;
    state.ball.pos.x += 5;
    expect(f.ball.x).toBe(x);
  });
});

describe('goal replays (M9): playback', () => {
  it('plays at half speed: a second of real time covers half a second of play', () => {
    const frames = Array.from({ length: 121 }, (_, i) => frame(i));
    const p = new ReplayPlayback(frames, 60, REPLAY.speed);
    const step = p.advance(1)!;
    expect(step.from.tick + step.alpha).toBeCloseTo(30, 5);
    expect(p.done).toBe(false);
    expect(p.advance(10)).not.toBeNull(); // clamps to the last frame...
    expect(p.done).toBe(true);
    expect(p.advance(0.1)).toBeNull(); // ...and then it's over
  });

  it('fires each frame’s effects exactly once, in order', () => {
    const a: SimEvent = { type: 'cast', playerId: 1, team: 0, spell: 'quickstep' };
    const b: SimEvent = { type: 'hexShove', playerId: 2, hits: [], loosened: false };
    const frames = Array.from({ length: 20 }, (_, i) =>
      frame(i, { fx: i === 3 ? [a] : i === 10 ? [b] : [] }),
    );
    const p = new ReplayPlayback(frames, 60, 1);
    const fired: SimEvent[] = [];
    let step;
    while ((step = p.advance(1 / 120))) fired.push(...step.fired);
    expect(fired).toEqual([a, b]);
  });

  it('a clip too short to play is done at once', () => {
    expect(new ReplayPlayback([frame(1)], 60).done).toBe(true);
    expect(new ReplayPlayback([], 60).advance(1)).toBeNull();
  });
});
