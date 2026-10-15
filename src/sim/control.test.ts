import { describe, expect, it } from 'vitest';
import { makeConfig } from './config';
import { followPlay, startingControl, switchControl } from './control';
import { createMatch } from './match';
import { matchRoster } from './roster';

const config = makeConfig();

function freshMatch(start: 'faceoff' | 'live' = 'live') {
  return createMatch(config, 1, matchRoster(config), { start });
}

describe('control switching (SPEC §5)', () => {
  it('starts on the faceoff taker, or the first runner when there is no faceoff', () => {
    const f = freshMatch('faceoff');
    expect(startingControl(f, 0)).toBe(f.faceoff!.takers[0]);
    expect(startingControl(f, 1)).toBe(f.faceoff!.takers[1]);
    const live = freshMatch();
    const first = live.players.find((p) => p.team === 1 && p.role === 'runner')!;
    expect(startingControl(live, 1)).toBe(first.id);
  });

  it('follows the ball to a teammate who picks it up, but not to an opponent', () => {
    const s = freshMatch();
    const mates = s.players.filter((p) => p.team === 0 && p.role === 'runner');
    const foe = s.players.find((p) => p.team === 1 && p.role === 'runner')!;
    s.ball.carrier = mates[1]!.id;
    expect(followPlay(s, 0, mates[0]!.id)).toBe(mates[1]!.id);
    s.ball.carrier = foe.id;
    expect(followPlay(s, 0, mates[0]!.id)).toBe(mates[0]!.id);
  });

  it('hands you your taker when a faceoff is set', () => {
    const s = freshMatch();
    s.events = [{ type: 'faceoffSet', takers: [3, 7] }];
    expect(followPlay(s, 0, 1)).toBe(3);
    expect(followPlay(s, 1, 6)).toBe(7);
  });

  it('switches to the teammate nearest the ball, then the next nearest', () => {
    const s = freshMatch();
    const mates = s.players.filter((p) => p.team === 0 && p.role === 'runner');
    s.ball.carrier = null;
    s.ball.pos = { ...mates[2]!.pos };
    const nearest = switchControl(s, 0, mates[0]!.id);
    expect(nearest).toBe(mates[2]!.id);
    expect(switchControl(s, 0, nearest)).not.toBe(nearest);
  });

  it("won't switch during a faceoff or while your team has the ball", () => {
    const f = freshMatch('faceoff');
    expect(switchControl(f, 0, 2)).toBe(2);
    const s = freshMatch();
    const mates = s.players.filter((p) => p.team === 0 && p.role === 'runner');
    s.ball.carrier = mates[1]!.id;
    expect(switchControl(s, 0, mates[1]!.id)).toBe(mates[1]!.id);
  });
});
