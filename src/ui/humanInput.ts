import Phaser from 'phaser';
import type { InputCommand, Vec2 } from '../sim';

/** Screen-to-world mapping, supplied by the renderer. */
export interface ScreenToWorld {
  toWorld(screenX: number, screenY: number): Vec2;
}

/**
 * Turns keyboard and mouse into sim InputCommands for the controlled player.
 * Held keys are sampled every tick; button presses are queued and delivered to exactly
 * one sim tick, even when a frame runs zero or several ticks.
 */
export class HumanInput {
  private readonly keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private pendingDrop = false;
  private pendingToss = false;
  private pointerSeen = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: ScreenToWorld,
  ) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D') as HumanInput['keys'];
    kb.on('keydown-G', () => (this.pendingDrop = true));
    kb.on('keydown-T', () => (this.pendingToss = true));
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', () => (this.pointerSeen = true));
  }

  /** Builds this tick's command. `fallbackAim` is used until the mouse has moved. */
  command(fallbackAim: Vec2): InputCommand {
    const move = {
      x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
      y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
    };
    const pointer = this.scene.input.activePointer;
    const aim = this.pointerSeen ? this.view.toWorld(pointer.x, pointer.y) : fallbackAim;
    return { move, aim, debugDrop: this.pendingDrop, debugToss: this.pendingToss };
  }

  /** Call after a sim tick consumed the command, so presses fire once. */
  consumePresses(): void {
    this.pendingDrop = false;
    this.pendingToss = false;
  }
}
