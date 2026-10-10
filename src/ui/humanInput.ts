import Phaser from 'phaser';
import { RUNNER_SPELLS, type GoalGeometry, type InputCommand, type SpellId, type Vec2 } from '../sim';
import { GamepadReader, PAD_BINDINGS, padAimPoint } from './gamepad';

/** Screen-to-world mapping, supplied by the renderer. */
export interface ScreenToWorld {
  toWorld(screenX: number, screenY: number): Vec2;
}

/**
 * Turns keyboard and mouse, or a gamepad, into sim InputCommands for the controlled player.
 * Held inputs are sampled every tick. Presses are queued so that a click shorter than
 * a frame still reaches the sim as at least one "button down" tick.
 */
export class HumanInput {
  private readonly keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private pendingDrop = false;
  private pendingPrimary = false;
  private pendingCheck = false;
  /** Spell presses waiting for a tick, oldest first: one cast per tick, none dropped. */
  private castQueue: SpellId[] = [];
  /** Called when the player presses the switch key (Space). Control switching is a UI concern, not a sim rule. */
  onSwitch: () => void = () => {};
  private pointerSeen = false;
  /** The last device the player touched: the pad, or keyboard and mouse. Picks the aim and the HUD labels. */
  usingPad = false;
  /** Last stick aim direction, kept when both sticks are let go. */
  private padAimDir: Vec2 | null = null;
  private padLive = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: ScreenToWorld,
    private readonly pad = new GamepadReader(),
  ) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as HumanInput['keys'];
    kb.on('keydown', () => (this.usingPad = false));
    kb.on('keydown-G', () => (this.pendingDrop = true));
    // Q / E / R: spells 1-3 (SPEC §5).
    (['Q', 'E', 'R'] as const).forEach((key, i) =>
      kb.on(`keydown-${key}`, () => this.castQueue.push(RUNNER_SPELLS[i]!)),
    );
    kb.on('keydown-SPACE', () => this.onSwitch());
    kb.addCapture('SPACE');
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', () => {
      this.pointerSeen = true;
      this.usingPad = false;
    });
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = true;
      this.usingPad = false;
      if (pointer.leftButtonDown()) this.pendingPrimary = true;
      if (pointer.rightButtonDown()) this.pendingCheck = true;
    });
  }

  /**
   * Reads the gamepad; call once per frame. While `live` is false (paused, menus) its presses
   * are ignored, and anything held stays ignored until let go, so the A that picked "Resume"
   * doesn't start a shot.
   */
  pollPad(live: boolean): void {
    this.pad.poll();
    if (this.pad.active) this.usingPad = true;
    // Just went live (match started, resumed): the menus may have used this same press.
    if (!live || !this.padLive) this.pad.latch();
    this.padLive = live;
    if (!live) return;
    if (this.pad.anyPressed(PAD_BINDINGS.primary)) this.pendingPrimary = true;
    if (this.pad.anyPressed(PAD_BINDINGS.check)) this.pendingCheck = true;
    PAD_BINDINGS.spells.forEach((b, i) => {
      if (this.pad.pressed(b)) this.castQueue.push(RUNNER_SPELLS[i]!);
    });
    if (this.pad.anyPressed(PAD_BINDINGS.switchPlayer)) this.onSwitch();
  }

  /** Builds this tick's command for the player at `origin`, attacking `attack`. */
  command(origin: Vec2, attack: GoalGeometry): InputCommand {
    let move = {
      x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
      y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
    };
    const padMove = this.pad.move();
    if (move.x === 0 && move.y === 0) move = padMove;

    const pointer = this.scene.input.activePointer;
    let aim: Vec2;
    if (this.usingPad) {
      // Twin-stick: the right stick aims; let go of it and you aim where you're running.
      const stick = this.pad.aimStick();
      if (stick.x !== 0 || stick.y !== 0) this.padAimDir = stick;
      else if (padMove.x !== 0 || padMove.y !== 0) this.padAimDir = padMove;
      aim = padAimPoint(origin, this.padAimDir ?? { x: attack.backDir, y: 0 }, attack);
    } else if (this.pointerSeen) {
      aim = this.view.toWorld(pointer.x, pointer.y);
    } else {
      // Until the mouse moves, aim the stick toward the goal we attack.
      aim = { x: origin.x + 100 * attack.backDir, y: origin.y };
    }
    const primary = this.pendingPrimary || pointer.leftButtonDown() || this.pad.anyDown(PAD_BINDINGS.primary);
    return {
      move,
      aim,
      primary,
      check: this.pendingCheck,
      cast: this.castQueue[0],
      debugDrop: this.pendingDrop,
    };
  }

  /** Call after a sim tick consumed the command, so presses fire once. */
  consumePresses(): void {
    this.pendingDrop = false;
    this.pendingPrimary = false;
    this.pendingCheck = false;
    this.castQueue.shift();
  }
}
