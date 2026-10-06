import Phaser from 'phaser';
import type { Ball, SimConfig } from '../sim';
import { PALETTE } from './palette';
import type { WorldView } from './view';

/** Drawn larger than the sim ball so it reads at this zoom. */
const VISUAL_RADIUS_M = 0.22;

export class BallView {
  /** Soft outer halo and a brighter inner ring. Normal blending: additive orange turns olive on the green floor. */
  private readonly halo: Phaser.GameObjects.Arc;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly dot: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    private readonly view: WorldView,
    private readonly config: SimConfig,
  ) {
    const r = view.len(VISUAL_RADIUS_M);
    this.halo = scene.add.circle(0, 0, r * 3, PALETTE.mana, 0.25).setVisible(false);
    this.ring = scene.add.circle(0, 0, r * 1.8, PALETTE.mana, 0.75).setVisible(false);
    this.dot = scene.add.circle(0, 0, r, PALETTE.ball).setStrokeStyle(1, 0x000000, 0.4);
  }

  /** Gold glow while in flight (SPEC §8); hard shots glow bigger and brighter. */
  update(x: number, y: number, ball: Ball): void {
    const sx = this.view.x(x);
    const sy = this.view.y(y);
    this.dot.setPosition(sx, sy);
    const flight = ball.flight;
    this.halo.setVisible(flight !== null).setPosition(sx, sy);
    this.ring.setVisible(flight !== null).setPosition(sx, sy);
    if (flight) {
      const speed = Math.hypot(ball.vel.x, ball.vel.y);
      const power = flight.kind === 'shot' ? Math.min(1, speed / this.config.shot.maxSpeed) : 0.3;
      this.halo.setScale(0.8 + 0.7 * power).setAlpha(0.15 + 0.25 * power);
      this.ring.setScale(0.9 + 0.3 * power).setAlpha(0.55 + 0.4 * power);
    }
  }

  setDepth(depth: number): void {
    this.halo.setDepth(depth);
    this.ring.setDepth(depth);
    this.dot.setDepth(depth + 1);
  }

  destroy(): void {
    this.halo.destroy();
    this.ring.destroy();
    this.dot.destroy();
  }
}
