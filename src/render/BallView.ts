import Phaser from 'phaser';
import type { Ball } from '../sim';
import { PALETTE } from './palette';
import type { WorldView } from './view';

/** Drawn larger than the sim ball so it reads at this zoom. */
const VISUAL_RADIUS_M = 0.22;
/** A loose ball faster than this counts as "in flight" and glows gold (SPEC §8). */
const GLOW_SPEED = 6;

export class BallView {
  private readonly glow: Phaser.GameObjects.Arc;
  private readonly dot: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    private readonly view: WorldView,
  ) {
    this.glow = scene.add
      .circle(0, 0, view.len(VISUAL_RADIUS_M * 2.6), PALETTE.mana, 0.55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.dot = scene.add
      .circle(0, 0, view.len(VISUAL_RADIUS_M), PALETTE.ball)
      .setStrokeStyle(1, 0x000000, 0.4);
  }

  update(x: number, y: number, ball: Ball): void {
    const sx = this.view.x(x);
    const sy = this.view.y(y);
    this.dot.setPosition(sx, sy);
    const inFlight = ball.carrier === null && Math.hypot(ball.vel.x, ball.vel.y) > GLOW_SPEED;
    this.glow.setVisible(inFlight).setPosition(sx, sy);
  }

  setDepth(depth: number): void {
    this.glow.setDepth(depth);
    this.dot.setDepth(depth + 1);
  }
}
