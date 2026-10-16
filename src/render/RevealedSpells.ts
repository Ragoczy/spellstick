import Phaser from 'phaser';
import { SPELLS } from '../content/spells';
import type { TeamInfo } from '../content/teams';
import { TEXT } from '../content/text';
import { LOADOUT_SIZE, type RunnerSpell } from '../sim';
import { PALETTE, toCss } from './palette';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view';

const SIZE = 40;
const GAP = 6;
const EDGE = 18;
const WIDTH = SIZE * LOADOUT_SIZE + GAP * (LOADOUT_SIZE - 1);
/** Level with the spell bar's icons, in the corners below the rink. */
const TOP = CANVAS_HEIGHT - SIZE - 8 - 16;

/**
 * A team's three spells as far as anyone has seen them: a "?" until a spell is first cast,
 * then its short name (Paul, 2026-10-16: "hidden until used"). The other team's sits in the
 * bottom-right corner; a watcher sees both teams', home's in the bottom-left.
 */
export class RevealedSpells {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly names: Phaser.GameObjects.Text[] = [];
  private readonly left: number;
  private color: number = PALETTE.text;
  /** What's drawn now (null: nothing yet, so the first update draws the "?"s). */
  private shown: string | null = null;
  private visible = true;

  constructor(scene: Phaser.Scene, corner: 'left' | 'right') {
    this.left = corner === 'left' ? EDGE : CANVAS_WIDTH - EDGE - WIDTH;
    this.g = scene.add.graphics().setDepth(150);
    // The title sits beside the boxes, toward the middle, clear of the boards above.
    const titleX = corner === 'left' ? this.left + WIDTH + 8 : this.left - 8;
    this.title = scene.add
      .text(titleX, TOP + SIZE / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(corner === 'left' ? 0 : 1, 0.5)
      .setDepth(151);
    for (let i = 0; i < LOADOUT_SIZE; i++) {
      this.names.push(
        scene.add
          .text(this.left + i * (SIZE + GAP) + SIZE / 2, TOP + SIZE / 2, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '10px',
            color: toCss(PALETTE.text),
            align: 'center',
            wordWrap: { width: SIZE - 4 },
          })
          .setOrigin(0.5)
          .setDepth(151),
      );
    }
  }

  /** Whose spells these are. */
  setTeam(team: TeamInfo): void {
    this.color = team.color;
    this.title.setText(TEXT.theirSpells(team.name)).setColor(toCss(team.color));
    this.shown = null;
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.g.setVisible(on);
    this.title.setVisible(on);
    for (const n of this.names) n.setVisible(on);
  }

  update(revealed: readonly RunnerSpell[]): void {
    if (!this.visible) return;
    const key = revealed.join(',');
    if (key === this.shown) return;
    this.shown = key;
    const g = this.g.clear();
    for (let i = 0; i < LOADOUT_SIZE; i++) {
      const x = this.left + i * (SIZE + GAP);
      const spell = revealed[i];
      g.fillStyle(0x000000, 0.6).fillRect(x, TOP, SIZE, SIZE);
      g.lineStyle(2, spell ? this.color : 0x55596a, 1).strokeRect(x, TOP, SIZE, SIZE);
      this.names[i]!.setText(spell ? SPELLS[spell].short : '?').setFontSize(spell ? 10 : 18);
    }
  }
}
