import Phaser from 'phaser';
import { SPELLS } from '../content/spells';
import { canCast, RUNNER_SPELLS, spellCost, type Player, type SimConfig } from '../sim';
import { PAD_BINDINGS, PAD_LABEL } from '../ui/gamepad';
import { PALETTE, toCss } from './palette';
import { CANVAS_HEIGHT } from './view';

const SIZE = 40;
const GAP = 6;
const LEFT = 18;
const MANA_W = SIZE * 3 + GAP * 2;
const MANA_H = 8;
const TOP = CANVAS_HEIGHT - SIZE - MANA_H - 16;

/**
 * The controlled player's mana bar and Q/E/R (or X/Y/B on a pad) spell icons (SPEC §8 HUD). Each icon shows
 * its key, a cooldown sweep, dims when you can't afford it, and glows gold while active
 * or armed. Sits in the empty corner below the rink.
 */
export class SpellBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private lastKey = '';
  private readonly labels: Phaser.GameObjects.Text[] = [];
  /** The key (Q/E/R) or pad button (X/Y/B) shown on each icon. */
  private readonly keyLabels: Phaser.GameObjects.Text[] = [];
  private padLabels = false;

  constructor(
    scene: Phaser.Scene,
    private readonly config: SimConfig,
  ) {
    this.g = scene.add.graphics().setDepth(150);
    RUNNER_SPELLS.forEach((spell, i) => {
      const x = LEFT + i * (SIZE + GAP);
      const key = scene.add
        .text(x + SIZE / 2, TOP + SIZE / 2 - 5, SPELLS[spell].key ?? '', {
          fontFamily: 'Georgia, serif',
          fontSize: '18px',
          color: toCss(PALETTE.text),
        })
        .setOrigin(0.5)
        .setDepth(151);
      const name = scene.add
        .text(x + SIZE / 2, TOP + SIZE - 8, SPELLS[spell].name.split(' ')[0]!, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '9px',
          color: toCss(PALETTE.text),
        })
        .setOrigin(0.5)
        .setDepth(151);
      this.labels.push(key, name);
      this.keyLabels.push(key);
    });
  }

  /** Show pad buttons instead of keys (when the player is on a gamepad). */
  showPadLabels(pad: boolean): void {
    if (pad === this.padLabels) return;
    this.padLabels = pad;
    RUNNER_SPELLS.forEach((spell, i) =>
      this.keyLabels[i]!.setText(pad ? PAD_LABEL[PAD_BINDINGS.spells[i]!] : (SPELLS[spell].key ?? '')),
    );
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
    for (const l of this.labels) l.setVisible(visible);
  }

  update(p: Player | undefined): void {
    if (!p) return;
    // Redraw only when something visible changed (cheap on slow, software-rendered browsers).
    const cds = RUNNER_SPELLS.map((s) => Math.ceil(p.spellCooldowns[s] / 6)).join(',');
    const key = `${Math.floor(p.mana)}|${cds}|${p.quickstepTicks > 0}|${p.bentArmed}|${p.staggerTicks > 0}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const g = this.g.clear();
    RUNNER_SPELLS.forEach((spell, i) => {
      const x = LEFT + i * (SIZE + GAP);
      const ready = canCast(p, spell, this.config);
      const active = (spell === 'quickstep' && p.quickstepTicks > 0) || (spell === 'bentShot' && p.bentArmed);
      g.fillStyle(0x000000, 0.6).fillRect(x, TOP, SIZE, SIZE);
      if (ready || active) g.fillStyle(PALETTE.mana, active ? 0.55 : 0.28).fillRect(x, TOP, SIZE, SIZE);
      // Cooldown sweep: a dark shutter that lowers as the spell recharges.
      const total = this.config.tickHz * this.config.spells[spell].cooldownSeconds;
      const left = p.spellCooldowns[spell] / total;
      if (left > 0) g.fillStyle(0x000000, 0.6).fillRect(x, TOP, SIZE, SIZE * left);
      g.lineStyle(2, active ? PALETTE.mana : ready ? PALETTE.text : 0x55596a, 1).strokeRect(
        x,
        TOP,
        SIZE,
        SIZE,
      );
      // A tick on the mana bar showing what this spell costs.
      const costX = LEFT + (spellCost(spell, this.config) / this.config.mana.max) * MANA_W;
      g.lineStyle(1, PALETTE.text, 0.35).lineBetween(costX, TOP + SIZE + 4, costX, TOP + SIZE + 6 + MANA_H);
    });
    const manaY = TOP + SIZE + 5;
    g.fillStyle(0x000000, 0.6).fillRect(LEFT, manaY, MANA_W, MANA_H);
    g.fillStyle(PALETTE.mana, 1).fillRect(LEFT, manaY, MANA_W * (p.mana / this.config.mana.max), MANA_H);
    g.lineStyle(1, PALETTE.text, 0.5).strokeRect(LEFT, manaY, MANA_W, MANA_H);
  }
}
