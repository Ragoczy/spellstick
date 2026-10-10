import { describe, expect, it } from 'vitest';
import { arenaFor, makeConfig } from '../sim';
import {
  AIM_INSIDE_POST_M,
  GamepadReader,
  isDown,
  PAD,
  PAD_AIM_DISTANCE_M,
  PAD_BINDINGS,
  padAimPoint,
  padMove,
  radialDeadzone,
  STICK_DEADZONE,
  type PadButton,
  type PadSnapshot,
} from './gamepad';
import { nextInDirection, stickDirection } from './padMenus';

/** A fake standard-mapping pad: buttons held, trigger pulls, and stick axes. */
function pad(
  held: PadButton[] = [],
  axes: number[] = [0, 0, 0, 0],
  triggers: Partial<Record<'LT' | 'RT', number>> = {},
): PadSnapshot {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const b of held) buttons[PAD[b]] = { pressed: true, value: 1 };
  for (const [b, v] of Object.entries(triggers))
    buttons[PAD[b as 'LT' | 'RT']] = { pressed: false, value: v };
  return { axes, buttons };
}

const config = makeConfig();
/** The goal the home team attacks (+x end). */
const attack = arenaFor(config).goals[1];

describe('gamepad sticks (M8)', () => {
  it('a stick resting near center reads as centered', () => {
    expect(radialDeadzone(0.1, -0.1)).toEqual({ x: 0, y: 0 });
    expect(radialDeadzone(STICK_DEADZONE, 0)).toEqual({ x: 0, y: 0 });
  });

  it('past the deadzone, movement starts small and reaches full at the rim (a light push walks)', () => {
    const light = radialDeadzone(0.3, 0);
    expect(light.x).toBeGreaterThan(0);
    expect(light.x).toBeLessThan(0.2);
    expect(radialDeadzone(1, 0).x).toBeCloseTo(1);
    const diag = radialDeadzone(1, 1); // corners of a square gate are clamped to length 1
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1);
  });

  it('the left stick moves; the D-pad moves at full speed when the stick is idle', () => {
    expect(padMove(pad([], [1, 0, 0, 0])).x).toBeCloseTo(1);
    expect(padMove(pad(['UP']))).toEqual({ x: 0, y: -1 });
    const diag = padMove(pad(['DOWN', 'LEFT']));
    expect(diag.x).toBeCloseTo(-Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2);
    expect(padMove(pad())).toEqual({ x: 0, y: 0 });
  });

  it('triggers count as held past a light pull', () => {
    expect(isDown(pad([], undefined, { RT: 0.2 }), 'RT')).toBe(false);
    expect(isDown(pad([], undefined, { RT: 0.6 }), 'RT')).toBe(true);
    expect(isDown(pad(['A']), 'A')).toBe(true);
  });
});

describe('gamepad aim (M8)', () => {
  it('pointed at the goal, the aim lands on the goal line where the stick points', () => {
    const aim = padAimPoint({ x: 0, y: 0 }, { x: 1, y: 0.02 }, attack);
    expect(aim.x).toBe(attack.mouth.x);
    expect(aim.y).toBeCloseTo(attack.mouth.x * 0.02, 5);
  });

  it('pointed just wide of a post, the aim pulls inside the post (aim assist)', () => {
    const origin = { x: attack.mouth.x - 8, y: 0 };
    const wide = (attack.width / 2 + 0.6) / 8; // 0.6 m outside the +y post
    const aim = padAimPoint(origin, { x: 1, y: wide }, attack);
    expect(aim.x).toBe(attack.mouth.x);
    expect(aim.y).toBeCloseTo(attack.width / 2 - AIM_INSIDE_POST_M);
  });

  it('pointed away from the goal, it aims a fixed distance out along the stick', () => {
    const aim = padAimPoint({ x: 0, y: 0 }, { x: 0, y: 1 }, attack);
    expect(aim).toEqual({ x: 0, y: PAD_AIM_DISTANCE_M });
    const back = padAimPoint({ x: 0, y: 0 }, { x: -1, y: 0 }, attack);
    expect(back.x).toBeCloseTo(-PAD_AIM_DISTANCE_M);
  });

  it('behind the goal, pointing the same way does not snap back onto the goal line', () => {
    const aim = padAimPoint({ x: attack.mouth.x + 2, y: 0 }, { x: 1, y: 0 }, attack);
    expect(aim.x).toBeCloseTo(attack.mouth.x + 2 + PAD_AIM_DISTANCE_M);
  });
});

describe('gamepad reader (M8)', () => {
  const fake = () => {
    let current: PadSnapshot | null = null;
    const reader = new GamepadReader(() => [null, current]);
    return { reader, set: (p: PadSnapshot | null) => (current = p) };
  };

  it('finds the first connected pad, and reports none when it is unplugged', () => {
    const { reader, set } = fake();
    reader.poll();
    expect(reader.connected).toBe(false);
    set(pad());
    reader.poll();
    expect(reader.connected).toBe(true);
    set(null);
    reader.poll();
    expect(reader.connected).toBe(false);
  });

  it('a press fires once, on the poll the button goes down', () => {
    const { reader, set } = fake();
    set(pad(['A']));
    reader.poll();
    expect(reader.pressed('A')).toBe(true);
    reader.poll();
    expect(reader.pressed('A')).toBe(false);
    expect(reader.down('A')).toBe(true);
    set(pad());
    reader.poll();
    set(pad(['A']));
    reader.poll();
    expect(reader.pressed('A')).toBe(true);
  });

  it('latch: a button held through a menu is ignored until it is let go', () => {
    const { reader, set } = fake();
    set(pad(['A']));
    reader.poll();
    reader.latch();
    reader.poll();
    expect(reader.down('A')).toBe(false);
    set(pad());
    reader.poll();
    set(pad(['A']));
    reader.poll();
    expect(reader.pressed('A')).toBe(true);
  });

  it('is active when a button is held or a stick is pushed', () => {
    const { reader, set } = fake();
    set(pad());
    reader.poll();
    expect(reader.active).toBe(false);
    set(pad([], [0, 0, 0.9, 0]));
    reader.poll();
    expect(reader.active).toBe(true);
    expect(reader.aimStick().x).toBeGreaterThan(0.8);
  });

  it('every action has a button, and no button does two things in a match', () => {
    const inMatch = [
      ...PAD_BINDINGS.primary,
      ...PAD_BINDINGS.check,
      ...PAD_BINDINGS.spells,
      ...PAD_BINDINGS.switchPlayer,
      ...PAD_BINDINGS.pause,
      ...PAD_BINDINGS.mute,
    ];
    expect(new Set(inMatch).size).toBe(inMatch.length);
    expect(PAD_BINDINGS.spells).toHaveLength(3);
  });
});

describe('gamepad menus (M8)', () => {
  const box = (left: number, top: number) => ({ left, top, width: 100, height: 40 });

  it('the stick moves the focus only when pushed well over', () => {
    expect(stickDirection({ x: 0.3, y: 0 })).toBeNull();
    expect(stickDirection({ x: 0.9, y: 0.2 })).toBe('right');
    expect(stickDirection({ x: -0.1, y: -0.8 })).toBe('up');
  });

  it('moves to the nearest button that way, preferring one in line', () => {
    // A 2×2 grid plus a far one.
    const boxes = [box(0, 0), box(120, 0), box(0, 60), box(120, 60), box(0, 400)];
    expect(nextInDirection(boxes[0]!, boxes, 'right')).toBe(1);
    expect(nextInDirection(boxes[0]!, boxes, 'down')).toBe(2);
    expect(nextInDirection(boxes[3]!, boxes, 'up')).toBe(1);
    expect(nextInDirection(boxes[2]!, boxes, 'down')).toBe(4);
    expect(nextInDirection(boxes[0]!, boxes, 'left')).toBe(-1);
  });

  it('up from Start match goes to the difficulty row just above, not a wide row further up', () => {
    // Team select: a team row, the difficulty row, then Back and Start match.
    const team = { left: 400, top: 200, width: 200, height: 40 };
    const easy = { left: 0, top: 300, width: 190, height: 50 };
    const normal = { left: 200, top: 300, width: 190, height: 50 };
    const hard = { left: 400, top: 300, width: 190, height: 50 };
    const back = { left: 300, top: 380, width: 140, height: 40 };
    const start = { left: 460, top: 380, width: 140, height: 40 };
    const boxes = [team, easy, normal, hard, back, start];
    expect(nextInDirection(start, boxes, 'up')).toBe(3);
    expect(nextInDirection(back, boxes, 'right')).toBe(5);
    expect(nextInDirection(hard, boxes, 'down')).toBe(5);
  });
});
