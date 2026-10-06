import Phaser from 'phaser';
import type { Player, SimConfig } from '../sim';
import { PALETTE } from './palette';
import type { WorldView } from './view';

export interface PlayerDrawState {
  /** Interpolated world position. */
  x: number;
  y: number;
  facing: number;
  /** Human-controlled: draw the marker. */
  controlled: boolean;
  /** 0..1 shot charge (0 = not charging). */
  charge: number;
  /** This teammate would get assist magnetism if you passed now. */
  passTarget: boolean;
}

/** Placeholder art for one player: colored disc, stick line, jersey number. Sprite-swappable later. */
export class PlayerView {
  private readonly stick: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Triangle;
  private readonly fx: Phaser.GameObjects.Graphics;
  private readonly goalie: boolean;

  constructor(
    scene: Phaser.Scene,
    private readonly view: WorldView,
    private readonly config: SimConfig,
    player: Player,
    color: number,
  ) {
    this.goalie = player.role === 'goalie';
    this.fx = scene.add.graphics();
    this.stick = scene.add.graphics();
    this.body = scene.add
      .circle(0, 0, view.len(config.player.radius), color)
      .setStrokeStyle(this.goalie ? 4 : 2, this.goalie ? 0xf2f2f2 : 0x000000, this.goalie ? 0.9 : 0.5);
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

  update(s: PlayerDrawState): void {
    const sx = this.view.x(s.x);
    const sy = this.view.y(s.y);
    const r = this.view.len(this.config.player.radius);
    const reach = this.view.len(this.config.player.stickReach);
    const hx = sx + Math.cos(s.facing) * reach;
    const hy = sy + Math.sin(s.facing) * reach;

    this.stick.clear();
    this.stick.lineStyle(3, PALETTE.stick, 1);
    this.stick.lineBetween(sx, sy, hx, hy);
    this.stick.lineStyle(2, PALETTE.stick, 1);
    this.stick.strokeCircle(hx, hy, this.view.len(this.goalie ? 0.3 : 0.16));

    // Gold-orange glow: the stick charges with mana as you wind up a shot (SPEC §2, §8).
    this.fx.clear();
    if (s.charge > 0) {
      this.fx.fillStyle(PALETTE.mana, 0.25 + 0.45 * s.charge);
      this.fx.fillCircle(hx, hy, this.view.len(0.25 + 0.35 * s.charge));
      this.fx.lineStyle(3, PALETTE.mana, 0.9);
      this.fx.beginPath();
      this.fx.arc(sx, sy, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.charge);
      this.fx.strokePath();
    }
    if (s.passTarget) {
      this.fx.lineStyle(2, PALETTE.text, 0.6);
      this.fx.strokeCircle(sx, sy, r + 6);
    }

    this.body.setPosition(sx, sy);
    this.label.setPosition(sx, sy);
    this.marker.setVisible(s.controlled);
    if (s.controlled) this.marker.setPosition(sx, sy - r - 12);
  }

  destroy(): void {
    for (const o of [this.stick, this.body, this.label, this.marker, this.fx]) o.destroy();
  }
}
