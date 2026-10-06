import Phaser from 'phaser';
import { RUNNER_SPELLS, type InputCommand, type SpellId, type Vec2 } from '../sim';

/** Screen-to-world mapping, supplied by the renderer. */
export interface ScreenToWorld {
  toWorld(screenX: number, screenY: number): Vec2;
}

/**
 * Turns keyboard and mouse into sim InputCommands for the controlled player.
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: ScreenToWorld,
  ) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as HumanInput['keys'];
    kb.on('keydown-G', () => (this.pendingDrop = true));
    // Q / E / R: spells 1-3 (SPEC §5).
    (['Q', 'E', 'R'] as const).forEach((key, i) =>
      kb.on(`keydown-${key}`, () => this.castQueue.push(RUNNER_SPELLS[i]!)),
    );
    kb.on('keydown-SPACE', () => this.onSwitch());
    kb.addCapture('SPACE');
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', () => (this.pointerSeen = true));
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = true;
      if (pointer.leftButtonDown()) this.pendingPrimary = true;
      if (pointer.rightButtonDown()) this.pendingCheck = true;
    });
  }

  /** Builds this tick's command. `fallbackAim` is used until the mouse has moved. */
  command(fallbackAim: Vec2): InputCommand {
    const move = {
      x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
      y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
    };
    const pointer = this.scene.input.activePointer;
    const aim = this.pointerSeen ? this.view.toWorld(pointer.x, pointer.y) : fallbackAim;
    const primary = this.pendingPrimary || pointer.leftButtonDown();
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
