import Phaser from 'phaser';
import type { Player, SimConfig } from '../sim';
import { PALETTE } from './palette';
import type { WorldView } from './view';

/** Placeholder art for one player: colored disc, stick line, jersey number. Sprite-swappable later. */
export class PlayerView {
  private readonly stick: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Triangle;

  constructor(
    scene: Phaser.Scene,
    private readonly view: WorldView,
    private readonly config: SimConfig,
    player: Player,
    color: number,
  ) {
    this.stick = scene.add.graphics();
    this.body = scene.add
      .circle(0, 0, view.len(config.player.radius), color)
      .setStrokeStyle(2, 0x000000, 0.5);
    this.label = scene.add
      .text(0, 0, String(player.number), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    // Marker over the controlled player: a small downward chevron.
    this.marker = scene.add.triangle(0, 0, 0, 0, 14, 0, 7, 9, PALETTE.text).setVisible(false);
  }

  /** `x`, `y` are the (interpolated) world position. */
  update(x: number, y: number, facing: number, controlled: boolean): void {
    const sx = this.view.x(x);
    const sy = this.view.y(y);
    const reach = this.view.len(this.config.player.stickReach);
    const hx = sx + Math.cos(facing) * reach;
    const hy = sy + Math.sin(facing) * reach;

    this.stick.clear();
    this.stick.lineStyle(3, PALETTE.stick, 1);
    this.stick.lineBetween(sx, sy, hx, hy);
    this.stick.lineStyle(2, PALETTE.stick, 1);
    this.stick.strokeCircle(hx, hy, this.view.len(0.16));

    this.body.setPosition(sx, sy);
    this.label.setPosition(sx, sy);
    this.marker.setVisible(controlled);
    if (controlled) this.marker.setPosition(sx, sy - this.view.len(this.config.player.radius) - 12);
  }
}
