import type { Vec2 } from '../sim';
import {
  GamepadReader,
  MENU_REPEAT_DELAY_MS,
  MENU_REPEAT_INTERVAL_MS,
  MENU_STICK_THRESHOLD,
  PAD_BINDINGS,
  type PadButton,
} from './gamepad';

export type MenuDirection = 'up' | 'down' | 'left' | 'right';

const DIR_BUTTON: Record<MenuDirection, PadButton> = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' };

/** What the menus need from the app. */
export interface PadMenuHost {
  /** The menu screen showing, or null during play. */
  screen(): HTMLElement | null;
  /** B on a menu: what "back" means on this screen (null if nothing). */
  back(): (() => void) | null;
  /** Start / Menu button: pause or resume. */
  togglePause(): void;
  /** View / Back button: sound on or off. */
  toggleMute(): void;
  /** A pad was first seen (browsers only reveal one once a button is pressed). */
  connected(): void;
}

/** A rectangle, for picking the next button in a direction. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Of `boxes`, the one to move to from `from` in `dir`. Prefers buttons in line with this one
 * (overlapping it across the direction of travel), nearest first; if none are, the nearest
 * one that way with a sideways step counting double. -1 if there's nothing that way.
 */
export function nextInDirection(from: Box, boxes: readonly Box[], dir: MenuDirection): number {
  const vertical = dir === 'up' || dir === 'down';
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  const inLine = (b: Box) =>
    vertical
      ? b.left < from.left + from.width && b.left + b.width > from.left
      : b.top < from.top + from.height && b.top + b.height > from.top;
  let best = -1;
  let bestKey: [number, number] = [Infinity, Infinity];
  boxes.forEach((b, i) => {
    const dx = b.left + b.width / 2 - cx;
    const dy = b.top + b.height / 2 - cy;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const across = vertical ? Math.abs(dx) : Math.abs(dy);
    if (along <= 1) return;
    // In-line buttons always beat the rest; then nearest, then least sideways.
    const key: [number, number] = inLine(b) ? [along, across] : [1e6 + along + 2 * across, 0];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      bestKey = key;
      best = i;
    }
  });
  return best;
}

/** Which way the stick points, if it's pushed past the menu threshold. */
export function stickDirection(stick: Vec2): MenuDirection | null {
  if (Math.hypot(stick.x, stick.y) < MENU_STICK_THRESHOLD) return null;
  if (Math.abs(stick.x) > Math.abs(stick.y)) return stick.x > 0 ? 'right' : 'left';
  return stick.y > 0 ? 'down' : 'up';
}

/**
 * Drives the DOM menus from a gamepad: D-pad or left stick moves between buttons, A picks,
 * B goes back. Start pauses and View mutes at any time. Polls on its own animation frame,
 * with its own reader, so it never takes presses away from the match.
 */
export class PadMenus {
  private readonly pad: GamepadReader;
  private wasConnected = false;
  private heldDir: MenuDirection | null = null;
  private nextRepeat = 0;

  constructor(
    private readonly host: PadMenuHost,
    pad = new GamepadReader(),
  ) {
    this.pad = pad;
  }

  start(): void {
    const frame = (t: number) => {
      this.update(t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** One poll (exposed for tests). */
  update(now: number): void {
    this.pad.poll();
    if (this.pad.connected && !this.wasConnected) this.host.connected();
    this.wasConnected = this.pad.connected;
    if (!this.pad.connected) return;

    if (this.pad.anyPressed(PAD_BINDINGS.pause)) this.host.togglePause();
    if (this.pad.anyPressed(PAD_BINDINGS.mute)) this.host.toggleMute();

    const screen = this.host.screen();
    if (!screen) {
      this.heldDir = null;
      return;
    }
    if (this.pad.active) screen.ownerDocument.body.classList.add('pad-nav');

    const dir = this.direction();
    if (dir !== this.heldDir) {
      this.heldDir = dir;
      this.nextRepeat = now + MENU_REPEAT_DELAY_MS;
      if (dir) this.move(screen, dir);
    } else if (dir && now >= this.nextRepeat) {
      this.nextRepeat = now + MENU_REPEAT_INTERVAL_MS;
      this.move(screen, dir);
    }

    if (this.pad.anyPressed(PAD_BINDINGS.menuSelect)) {
      const focused = screen.ownerDocument.activeElement;
      if (focused instanceof HTMLElement && screen.contains(focused)) focused.click();
      else this.focusables(screen)[0]?.focus();
    } else if (this.pad.anyPressed(PAD_BINDINGS.menuBack)) {
      this.host.back()?.();
    }
  }

  private direction(): MenuDirection | null {
    for (const [dir, b] of Object.entries(DIR_BUTTON) as [MenuDirection, PadButton][]) {
      if (this.pad.down(b)) return dir;
    }
    return stickDirection(this.pad.rawLeftStick());
  }

  private focusables(screen: HTMLElement): HTMLElement[] {
    return Array.from(screen.querySelectorAll<HTMLElement>('button:not([disabled])'));
  }

  private move(screen: HTMLElement, dir: MenuDirection): void {
    const items = this.focusables(screen);
    if (items.length === 0) return;
    const focused = screen.ownerDocument.activeElement;
    const current = items.findIndex((e) => e === focused);
    if (current < 0) {
      items[0]!.focus();
      return;
    }
    const i = nextInDirection(
      items[current]!.getBoundingClientRect(),
      items.map((e) => e.getBoundingClientRect()),
      dir,
    );
    if (i >= 0) items[i]!.focus();
  }
}
