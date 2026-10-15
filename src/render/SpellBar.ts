import Phaser from 'phaser';
import { SPELLS } from '../content/spells';
import { canCast, LOADOUT_SIZE, spellCost, type Player, type SimConfig, type SpellId } from '../sim';
import { PAD_BINDINGS, PAD_LABEL } from '../ui/gamepad';
import { PALETTE, toCss } from './palette';
import { CANVAS_HEIGHT } from './view';

const SIZE = 40;
const GAP = 6;
const LEFT = 18;
const MANA_W = SIZE * 3 + GAP * 2;
const MANA_H = 8;
const TOP = CANVAS_HEIGHT - SIZE - MANA_H - 16;
const KEYS = ['Q', 'E', 'R'] as const;

/** True while `spell`'s effect is running (or armed) on `p`: its icon glows gold. */
function active(p: Player, spell: SpellId): boolean {
  switch (spell) {
    case 'quickstep':
      return p.quickstepTicks > 0;
    case 'stoneSkin':
      return p.stoneTicks > 0;
    case 'glamourSelf':
      return p.images > 0;
    default:
      return p.armed === spell;
  }
}

/**
 * The controlled player's mana bar and their three spell icons, keyed Q/E/R (or X/Y/B on a
 * pad) in the order they were picked (SPEC §8 HUD, M10). Each icon shows its key and a short
 * name, a cooldown sweep, dims when you can't cast it, and glows gold while active or armed.
 * Sits in the empty corner below the rink.
 */
export class SpellBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private lastKey = '';
  private readonly labels: Phaser.GameObjects.Text[] = [];
  /** The key (Q/E/R) or pad button (X/Y/B) shown on each icon. */
  private readonly keyLabels: Phaser.GameObjects.Text[] = [];
  /** Each icon's short spell name. */
  private readonly nameLabels: Phaser.GameObjects.Text[] = [];
  private padLabels = false;
  private shownSpells = '';

  constructor(
    scene: Phaser.Scene,
    private readonly config: SimConfig,
  ) {
    this.g = scene.add.graphics().setDepth(150);
    for (let i = 0; i < LOADOUT_SIZE; i++) {
      const x = LEFT + i * (SIZE + GAP);
      const key = scene.add
        .text(x + SIZE / 2, TOP + SIZE / 2 - 5, KEYS[i]!, {
          fontFamily: 'Georgia, serif',
          fontSize: '18px',
          color: toCss(PALETTE.text),
        })
        .setOrigin(0.5)
        .setDepth(151);
      const name = scene.add
        .text(x + SIZE / 2, TOP + SIZE - 8, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '9px',
          color: toCss(PALETTE.text),
        })
        .setOrigin(0.5)
        .setDepth(151);
      this.labels.push(key, name);
      this.keyLabels.push(key);
      this.nameLabels.push(name);
    }
  }

  /** Show pad buttons instead of keys (when the player is on a gamepad). */
  showPadLabels(pad: boolean): void {
    if (pad === this.padLabels) return;
    this.padLabels = pad;
    this.keyLabels.forEach((label, i) => label.setText(pad ? PAD_LABEL[PAD_BINDINGS.spells[i]!] : KEYS[i]!));
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
    for (const l of this.labels) l.setVisible(visible);
  }

  update(p: Player | undefined): void {
    if (!p) return;
    const spells = p.spells;
    const names = spells.join(',');
    if (names !== this.shownSpells) {
      this.shownSpells = names;
      this.nameLabels.forEach((label, i) => label.setText(spells[i] ? SPELLS[spells[i]].short : ''));
    }
    // Redraw only when something visible changed (cheap on slow, software-rendered browsers).
    const cds = spells.map((s) => Math.ceil(p.spellCooldowns[s] / 6)).join(',');
    const lit = spells.map((s) => active(p, s)).join(',');
    const key = `${names}|${Math.floor(p.mana)}|${cds}|${lit}|${p.staggerTicks > 0}|${p.rootTicks > 0}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const g = this.g.clear();
    spells.forEach((spell, i) => {
      const x = LEFT + i * (SIZE + GAP);
      const ready = canCast(p, spell, this.config);
      const on = active(p, spell);
      g.fillStyle(0x000000, 0.6).fillRect(x, TOP, SIZE, SIZE);
      if (ready || on) g.fillStyle(PALETTE.mana, on ? 0.55 : 0.28).fillRect(x, TOP, SIZE, SIZE);
      // Cooldown sweep: a dark shutter that lowers as the spell recharges.
      const total = this.config.tickHz * this.config.spells[spell].cooldownSeconds;
      const left = p.spellCooldowns[spell] / total;
      if (left > 0) g.fillStyle(0x000000, 0.6).fillRect(x, TOP, SIZE, SIZE * left);
      g.lineStyle(2, on ? PALETTE.mana : ready ? PALETTE.text : 0x55596a, 1).strokeRect(x, TOP, SIZE, SIZE);
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
