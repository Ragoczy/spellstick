import Phaser from 'phaser';
import type { Player, SimConfig } from '../sim';
import { PALETTE } from './palette';
import { PIX, RETRO, RETRO_PALETTE, snap, SPRITE_ORIGIN, witchTexture } from './retro';
import type { WorldView } from './view';

/** Retro look: meters walked per walk-cycle frame. */
const STRIDE_M = 0.35;

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
  /** Knocked silly by a check: no control for a moment. */
  staggered: boolean;
  /** Body check is off cooldown (shown on the controlled player's marker). */
  checkReady: boolean;
  /** Quickstep is running. */
  quickstep: boolean;
  /** Bent Shot is armed. */
  bentArmed: boolean;
}

/**
 * Placeholder art for one player: colored disc, stick line, jersey number. Sprite-swappable later.
 * Uses persistent shapes that are only moved each frame; the effects layer is redrawn only
 * while something is showing, which keeps slow (software-rendered) browsers usable.
 */
export class PlayerView {
  private readonly stick: Phaser.GameObjects.Line;
  private readonly head: Phaser.GameObjects.Arc;
  private readonly body: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Triangle;
  private readonly fx: Phaser.GameObjects.Graphics;
  private fxDrawn = false;
  /** Retro look only: the witch sprite, its shadow, and walk-cycle state. */
  private readonly sprite?: Phaser.GameObjects.Image;
  private readonly shadow?: Phaser.GameObjects.Ellipse;
  private readonly frames: [string, string] = ['', ''];
  private walked = 0;
  private lastX = NaN;
  private lastY = NaN;

  constructor(
    scene: Phaser.Scene,
    private readonly view: WorldView,
    private readonly config: SimConfig,
    player: Player,
    color: number,
  ) {
    const goalie = player.role === 'goalie';
    this.fx = scene.add.graphics();
    this.stick = scene.add.line(0, 0, 0, 0, 0, 0, PALETTE.stick).setOrigin(0, 0).setLineWidth(1.5);
    this.head = scene.add.circle(0, 0, view.len(goalie ? 0.3 : 0.16)).setStrokeStyle(2, PALETTE.stick, 1);
    this.body = scene.add
      .circle(0, 0, view.len(config.player.radius), color)
      .setStrokeStyle(goalie ? 4 : 2, goalie ? 0xf2f2f2 : 0x000000, goalie ? 0.9 : 0.5);
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

    if (RETRO) {
      this.frames = [witchTexture(scene, color, goalie, 0), witchTexture(scene, color, goalie, 1)];
      this.shadow = scene.add.ellipse(0, 0, PIX * 8, PIX * 3, 0x000000, 0.35);
      this.sprite = scene.add
        .image(0, 0, this.frames[0])
        .setScale(PIX)
        .setDisplayOrigin(SPRITE_ORIGIN.x, SPRITE_ORIGIN.y);
      this.body.setVisible(false);
      this.label.setVisible(false);
      this.stick.setLineWidth(PIX).setStrokeStyle(PIX, RETRO_PALETTE.stick);
      this.head
        .setRadius(PIX * 1.5)
        .setFillStyle(RETRO_PALETTE.stick)
        .setStrokeStyle();
    }
  }

  update(s: PlayerDrawState): void {
    const sx = this.view.x(s.x);
    const sy = this.view.y(s.y);
    const r = this.view.len(this.config.player.radius);
    const reach = this.view.len(this.config.player.stickReach);
    const hx = sx + Math.cos(s.facing) * reach;
    const hy = sy + Math.sin(s.facing) * reach;

    this.stick.setTo(sx, sy, hx, hy);
    this.head.setPosition(hx, hy);

    const needFx = s.charge > 0 || s.passTarget || s.staggered || s.quickstep || s.bentArmed;
    if (needFx || this.fxDrawn) this.fx.clear();
    this.fxDrawn = needFx;
    if (s.charge > 0) {
      // Gold-orange glow: the stick charges with mana as you wind up a shot (SPEC §2, §8).
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
    if (s.quickstep) {
      // Quickstep: a gold aura with a flicker.
      const t = this.body.scene.time.now / 90;
      this.fx.lineStyle(3, PALETTE.mana, 0.6 + 0.3 * Math.sin(t));
      this.fx.strokeCircle(sx, sy, r + 4);
      this.fx.fillStyle(PALETTE.mana, 0.18);
      this.fx.fillCircle(sx, sy, r + 7);
    }
    if (s.bentArmed) {
      // Bent Shot armed: the stick head pulses gold.
      const pulse = 0.5 + 0.5 * Math.sin(this.body.scene.time.now / 110);
      this.fx.fillStyle(PALETTE.mana, 0.35 + 0.4 * pulse);
      this.fx.fillCircle(hx, hy, this.view.len(0.28 + 0.12 * pulse));
    }
    if (s.staggered) {
      // Little orbiting stars: dazed.
      const t = this.body.scene.time.now / 120;
      this.fx.fillStyle(0xfff3b0, 0.95);
      for (let k = 0; k < 3; k++) {
        const a = t + (k * 2 * Math.PI) / 3;
        this.fx.fillCircle(sx + Math.cos(a) * (r + 4), sy - r * 0.6 + Math.sin(a) * 4, 2.5);
      }
    }

    if (this.sprite && this.shadow) this.updateSprite(s, sx, sy);
    this.body.setPosition(sx, sy).setAlpha(s.staggered ? 0.65 : 1);
    this.label.setPosition(sx, sy);
    this.marker.setVisible(s.controlled);
    if (s.controlled) {
      this.marker.setPosition(sx, sy - r - 12).setFillStyle(s.checkReady ? PALETTE.text : 0x6b6f7a);
      // Retro: sit the marker above the hat.
      if (this.sprite) this.marker.setY(snap(sy) - PIX * (SPRITE_ORIGIN.y + 4));
    }
  }

  /** Retro look: place the pixel witch on the art grid, face her, step the walk cycle, sort by y. */
  private updateSprite(s: PlayerDrawState, sx: number, sy: number): void {
    const sprite = this.sprite!;
    if (!Number.isNaN(this.lastX)) this.walked += Math.hypot(s.x - this.lastX, s.y - this.lastY);
    this.lastX = s.x;
    this.lastY = s.y;
    const frame = Math.floor(this.walked / STRIDE_M) % 2;
    const depth = 1 + sy / 1000;
    sprite
      .setTexture(this.frames[frame]!)
      .setPosition(snap(sx), snap(sy))
      .setFlipX(Math.cos(s.facing) < 0)
      .setDepth(depth)
      .setAlpha(s.staggered ? 0.6 : 1);
    this.shadow!.setPosition(snap(sx), snap(sy + PIX * 4)).setDepth(depth - 0.0005);
    // Stick in front when it points down the screen, behind when it points up.
    const front = Math.sin(s.facing) >= 0 ? 0.0002 : -0.0002;
    this.stick.setDepth(depth + front);
    this.head.setDepth(depth + front);
    this.fx.setDepth(depth + 0.0003);
    this.marker.setDepth(depth + 0.0004);
  }

  destroy(): void {
    for (const o of [this.stick, this.head, this.body, this.label, this.marker, this.fx]) o.destroy();
    this.sprite?.destroy();
    this.shadow?.destroy();
  }
}
