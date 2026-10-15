import { describe, expect, it } from 'vitest';
import type { RoomView } from '../net';
import { lobbyStatus } from './screens';

const member = (id: string, ready = false) => ({ id, name: id, avatarUrl: '', ready, online: true });
const room = (over: Partial<RoomView>): RoomView => ({
  code: 'abc123',
  phase: 'lobby',
  members: [member('ann'), member('bea')],
  seats: [null, null],
  countdown: 0,
  matchNumber: 0,
  lastResult: null,
  ...over,
});

describe('lobby status line', () => {
  it('asks for two players until both seats are taken', () => {
    expect(lobbyStatus(room({ seats: ['ann', null] }), 'ann')).toMatch(/Two players/);
  });

  it('says whose move it is once both are seated', () => {
    const annReady = room({ seats: ['ann', 'bea'], members: [member('ann', true), member('bea')] });
    expect(lobbyStatus(annReady, 'bea')).toBe("ann is ready. Press I'm ready to start.");
    expect(lobbyStatus(annReady, 'ann')).toBe('Waiting for bea to get ready…');
    expect(lobbyStatus(annReady, 'cat')).toBe('Waiting for bea to get ready…');
  });

  it('counts down, then says a match is on', () => {
    expect(lobbyStatus(room({ phase: 'countdown', countdown: 2 }), 'ann')).toBe('Face-off in 2…');
    expect(lobbyStatus(room({ phase: 'match' }), 'ann')).toBe('A match is on.');
  });
});
