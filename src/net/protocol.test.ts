import { describe, expect, it } from 'vitest';
import { heldOnly, isRoomCode, parseClientMessage, toCommand } from './protocol';

const input = { t: 5, move: { x: 1, y: 0 }, aim: { x: 3, y: -2 } };

describe('protocol', () => {
  it('reads the messages a screen sends', () => {
    expect(parseClientMessage('{"type":"seat","seat":1}')).toEqual({ type: 'seat', seat: 1 });
    expect(parseClientMessage('{"type":"seat","seat":null}')).toEqual({ type: 'seat', seat: null });
    expect(parseClientMessage('{"type":"ready","ready":true}')).toEqual({ type: 'ready', ready: true });
    expect(parseClientMessage('{"type":"ping","id":7}')).toEqual({ type: 'ping', id: 7 });
    expect(
      parseClientMessage(
        JSON.stringify({ type: 'input', inputs: [{ ...input, cast: 'bentShot', check: true }] }),
      ),
    ).toEqual({ type: 'input', inputs: [{ ...input, cast: 'bentShot', check: true }] });
  });

  it('turns away anything malformed', () => {
    for (const raw of [
      'nope',
      'null',
      '{"type":"seat","seat":2}',
      '{"type":"ready","ready":"yes"}',
      '{"type":"teleport"}',
      JSON.stringify({ type: 'input', inputs: [{ ...input, cast: 'ward' }] }),
      JSON.stringify({ type: 'input', inputs: [{ ...input, move: { x: 1e9, y: 0 } }] }),
      JSON.stringify({ type: 'input', inputs: [{ ...input, t: 1.5 }] }),
      JSON.stringify({ type: 'input', inputs: [{ ...input, aim: { x: 'a', y: 0 } }] }),
      JSON.stringify({ type: 'input', inputs: Array(17).fill(input) }),
    ]) {
      expect(parseClientMessage(raw), raw).toBeNull();
    }
  });

  it('keeps only true flags, and never passes debug actions to the sim', () => {
    const parsed = parseClientMessage(
      JSON.stringify({ type: 'input', inputs: [{ ...input, primary: false, debugDrop: true }] }),
    );
    expect(parsed).toEqual({ type: 'input', inputs: [input] });
    expect(toCommand({ ...input, primary: true, switchPlayer: true })).toEqual({
      move: input.move,
      aim: input.aim,
      primary: true,
    });
    expect(
      heldOnly({ move: input.move, aim: input.aim, primary: true, check: true, cast: 'quickstep' }),
    ).toEqual({
      move: input.move,
      aim: input.aim,
      primary: true,
    });
  });

  it('knows a room code', () => {
    expect(isRoomCode('ab12cd')).toBe(true);
    expect(isRoomCode('d-i-1234567890-gc-123')).toBe(true);
    expect(isRoomCode('AB12CD')).toBe(false);
    expect(isRoomCode('ab12c')).toBe(false);
    expect(isRoomCode('d-../x')).toBe(false);
  });
});
