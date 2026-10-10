import type { GoalGeometry, Vec2 } from '../sim';

/**
 * Gamepad support (M8). Reads the browser Gamepad API's "standard" layout, which Chrome,
 * Firefox, and Safari give Xbox, PlayStation, Switch Pro, and most PC pads. Buttons are named
 * by their Xbox labels; on a PlayStation pad A/B/X/Y are Cross/Circle/Square/Triangle.
 *
 * The mapping, stick, and aim logic are pure functions so they can be tested without a browser.
 */

/** Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping). */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;
export type PadButton = keyof typeof PAD;

/** What each pad button does. Labels on the HUD and the controls card come from here too. */
export const PAD_BINDINGS = {
  /** Tap to pass, hold and release to shoot; also the faceoff. */
  primary: ['RT', 'A'],
  check: ['LT', 'LB'],
  /** Spells 1–3, in the same order as Q / E / R. */
  spells: ['X', 'Y', 'B'],
  switchPlayer: ['RB'],
  pause: ['START'],
  mute: ['BACK'],
  menuSelect: ['A'],
  menuBack: ['B'],
} as const satisfies Record<string, readonly PadButton[]>;

/** How a button is shown to the player. */
export const PAD_LABEL: Record<PadButton, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LT: 'LT',
  RT: 'RT',
  BACK: 'View',
  START: 'Menu',
  LS: 'LS',
  RS: 'RS',
  UP: 'D-pad',
  DOWN: 'D-pad',
  LEFT: 'D-pad',
  RIGHT: 'D-pad',
};

/** Stick deflection below this reads as centered (sticks rarely rest at exactly 0). */
export const STICK_DEADZONE = 0.2;
/** A trigger counts as pressed past this much pull. */
export const TRIGGER_THRESHOLD = 0.35;
/** Menus: the left stick past this moves the focus, like a D-pad press. */
export const MENU_STICK_THRESHOLD = 0.6;
/** Menus: holding a direction repeats after this delay, then every interval (ms). */
export const MENU_REPEAT_DELAY_MS = 400;
export const MENU_REPEAT_INTERVAL_MS = 150;
/** Stick aim that isn't at the goal: aim at a point this far out (m). */
export const PAD_AIM_DISTANCE_M = 12;
/**
 * Aim assist: a stick pointed at the goal line within this far outside a post (m) aims just
 * inside that post instead, so shots go on net without mouse precision.
 */
export const AIM_ASSIST_MARGIN_M = 1;
/** ...this far inside the post (m). */
export const AIM_INSIDE_POST_M = 0.25;

/** The parts of a browser `Gamepad` the game reads. */
export interface PadSnapshot {
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

const ZERO: Vec2 = { x: 0, y: 0 };

/** Radial deadzone, rescaled so movement starts smoothly at the edge of the deadzone. */
export function radialDeadzone(x: number, y: number, deadzone = STICK_DEADZONE): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return ZERO;
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

/** Is a button held? Triggers are analog, so they count past a threshold. */
export function isDown(pad: PadSnapshot, button: PadButton): boolean {
  const b = pad.buttons[PAD[button]];
  if (!b) return false;
  return b.pressed || ((button === 'LT' || button === 'RT') && b.value > TRIGGER_THRESHOLD);
}

export const leftStick = (pad: PadSnapshot): Vec2 => radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
export const rightStick = (pad: PadSnapshot): Vec2 => radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);

/** Movement: the left stick (analog, so a light push walks), or the D-pad. Screen y is down, as in the sim. */
export function padMove(pad: PadSnapshot): Vec2 {
  const stick = leftStick(pad);
  if (stick.x !== 0 || stick.y !== 0) return stick;
  const x = (isDown(pad, 'RIGHT') ? 1 : 0) - (isDown(pad, 'LEFT') ? 1 : 0);
  const y = (isDown(pad, 'DOWN') ? 1 : 0) - (isDown(pad, 'UP') ? 1 : 0);
  if (x === 0 && y === 0) return ZERO;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

/**
 * Turns an aim direction into the world point the sim wants. Pointed at the goal (or just
 * wide of a post), the aim lands on the goal line, inside the posts; that's where shots and
 * Bent Shot go. Otherwise it's a point a fixed distance out along the stick.
 */
export function padAimPoint(origin: Vec2, dir: Vec2, goal: GoalGeometry): Vec2 {
  const len = Math.hypot(dir.x, dir.y);
  if (len === 0) return { x: origin.x + PAD_AIM_DISTANCE_M * goal.backDir, y: origin.y };
  const dx = dir.x / len;
  const dy = dir.y / len;
  const t = Math.abs(dx) > 1e-6 ? (goal.mouth.x - origin.x) / dx : -1;
  if (t > 0) {
    const y = origin.y + dy * t;
    const half = goal.width / 2;
    if (Math.abs(y - goal.mouth.y) <= half + AIM_ASSIST_MARGIN_M) {
      const limit = half - AIM_INSIDE_POST_M;
      return { x: goal.mouth.x, y: goal.mouth.y + Math.max(-limit, Math.min(limit, y - goal.mouth.y)) };
    }
  }
  return { x: origin.x + dx * PAD_AIM_DISTANCE_M, y: origin.y + dy * PAD_AIM_DISTANCE_M };
}

/** Where pads come from: the browser's list, or a fake one in tests. */
export type PadSource = () => readonly (PadSnapshot | null)[];

const browserPads: PadSource = () =>
  typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
    ? Array.from(navigator.getGamepads())
    : [];

const BUTTONS = Object.keys(PAD) as PadButton[];

/**
 * Polls the first connected gamepad once per frame and tracks presses (a button that went
 * down since the last poll). Each part of the game that reads the pad owns its own reader,
 * so one reader's polling never eats another's presses.
 */
export class GamepadReader {
  private pad: PadSnapshot | null = null;
  private now = new Set<PadButton>();
  private prev = new Set<PadButton>();
  /** Held when `latch()` was called: ignored until let go. */
  private latched = new Set<PadButton>();

  constructor(private readonly source: PadSource = browserPads) {}

  poll(): void {
    this.pad = this.source().find((p) => p !== null) ?? null;
    this.prev = this.now;
    this.now = new Set(this.pad ? BUTTONS.filter((b) => isDown(this.pad!, b)) : []);
    for (const b of this.latched) if (!this.now.has(b)) this.latched.delete(b);
  }

  get connected(): boolean {
    return this.pad !== null;
  }

  /** Any button held or stick pushed this poll: the player is using the pad. */
  get active(): boolean {
    if (!this.pad) return false;
    const l = leftStick(this.pad);
    const r = rightStick(this.pad);
    return this.now.size > 0 || l.x !== 0 || l.y !== 0 || r.x !== 0 || r.y !== 0;
  }

  down(button: PadButton): boolean {
    return this.now.has(button) && !this.latched.has(button);
  }

  /** Went down since the last poll. */
  pressed(button: PadButton): boolean {
    return this.down(button) && !this.prev.has(button);
  }

  anyDown(buttons: readonly PadButton[]): boolean {
    return buttons.some((b) => this.down(b));
  }

  anyPressed(buttons: readonly PadButton[]): boolean {
    return buttons.some((b) => this.pressed(b));
  }

  /** Ignore everything held right now until it's let go (e.g. the A that picked "Resume"). */
  latch(): void {
    for (const b of this.now) this.latched.add(b);
  }

  move(): Vec2 {
    return this.pad ? padMove(this.pad) : ZERO;
  }

  aimStick(): Vec2 {
    return this.pad ? rightStick(this.pad) : ZERO;
  }

  /** Raw left stick, for menu navigation. */
  rawLeftStick(): Vec2 {
    return this.pad ? { x: this.pad.axes[0] ?? 0, y: this.pad.axes[1] ?? 0 } : ZERO;
  }
}
