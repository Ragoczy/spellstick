import Phaser from 'phaser';
import { periodLabel, TEXT } from '../content/text';
import type { TeamInfo } from '../content/teams';
import type { MatchState, SimConfig } from '../sim';
import { PALETTE, toCss } from './palette';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view';

const CX = CANVAS_WIDTH / 2;
/** The shot clock turns red at or under this many seconds. */
const SHOT_CLOCK_WARN_SECONDS = 10;

/**
 * Scoreboard (team names, scores, period, game clock, shot clock), short callout banners,
 * and the period-break / final overlays. Reads sim state only.
 */
export class Hud {
  private readonly scores: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly period: Phaser.GameObjects.Text;
  private readonly shotBox: Phaser.GameObjects.Rectangle;
  private readonly shotText: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly overlayTitle: Phaser.GameObjects.Text;
  private readonly overlayScore: Phaser.GameObjects.Text;
  private readonly overlayHint: Phaser.GameObjects.Text;
  private bannerUntil = 0;
  private subUntil = 0;
  private shotKey = '';
  private overlaysEnabled = true;
  private readonly names: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: SimConfig,
    private teams: [TeamInfo, TeamInfo],
  ) {
    const serif = 'Georgia, serif';
    scene.add
      .text(24, 30, 'SPELLSTICK', { fontFamily: serif, fontSize: '20px', color: toCss(PALETTE.mana) })
      .setOrigin(0, 0.5);
    const name = (t: TeamInfo) => ({ fontFamily: serif, fontSize: '22px', color: toCss(t.color) });
    this.names = [
      scene.add.text(CX - 170, 30, teams[0].name, name(teams[0])).setOrigin(1, 0.5),
      scene.add.text(CX + 170, 30, teams[1].name, name(teams[1])).setOrigin(0, 0.5),
    ];
    const big = { fontFamily: serif, fontSize: '36px', color: toCss(PALETTE.text) };
    this.scores = [
      scene.add.text(CX - 120, 30, '0', big).setOrigin(0.5),
      scene.add.text(CX + 120, 30, '0', big).setOrigin(0.5),
    ];
    this.period = scene.add
      .text(CX, 30, '', { fontFamily: 'monospace', fontSize: '22px', color: toCss(PALETTE.text) })
      .setOrigin(0.5);
    this.shotBox = scene.add.rectangle(CX, 62, 92, 22, 0x000000, 0.5).setStrokeStyle(2, PALETTE.text, 0.6);
    this.shotText = scene.add
      .text(CX, 62, '', { fontFamily: 'monospace', fontSize: '15px', color: toCss(PALETTE.text) })
      .setOrigin(0.5);

    const shout = {
      fontFamily: serif,
      fontSize: '56px',
      color: toCss(PALETTE.mana),
      stroke: '#000000',
      strokeThickness: 6,
    };
    this.banner = scene.add.text(CX, 230, '', shout).setOrigin(0.5).setDepth(100);
    this.sub = scene.add
      .text(CX, 280, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: toCss(PALETTE.text),
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100);

    const panel = scene.add
      .rectangle(CX, CANVAS_HEIGHT / 2 + 20, 560, 220, 0x0b0c14, 0.88)
      .setStrokeStyle(2, PALETTE.mana, 0.8);
    this.overlayTitle = scene.add
      .text(CX, CANVAS_HEIGHT / 2 - 40, '', { ...shout, fontSize: '44px' })
      .setOrigin(0.5);
    this.overlayScore = scene.add
      .text(CX, CANVAS_HEIGHT / 2 + 20, '', {
        fontFamily: serif,
        fontSize: '28px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(0.5);
    this.overlayHint = scene.add
      .text(CX, CANVAS_HEIGHT / 2 + 80, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(0.5);
    this.overlay = scene.add
      .container(0, 0, [panel, this.overlayTitle, this.overlayScore, this.overlayHint])
      .setDepth(200)
      .setVisible(false);
  }

  /** Switches the scoreboard to a new pair of teams. */
  setTeams(teams: [TeamInfo, TeamInfo]): void {
    this.teams = teams;
    teams.forEach((t, i) => this.names[i]!.setText(t.name).setColor(toCss(t.color)));
    this.shotKey = '';
  }

  /** Turns banners and the break/final overlays on or off (off for the title-screen demo). */
  setOverlaysEnabled(on: boolean): void {
    this.overlaysEnabled = on;
  }

  /** Shows a callout for `ms`, with an optional smaller line under it. */
  flash(text: string, ms: number, color: number = PALETTE.mana, sub = ''): void {
    const now = this.scene.time.now;
    this.banner.setText(text).setColor(toCss(color));
    this.bannerUntil = now + ms;
    this.sub.setText(sub);
    this.subUntil = sub ? now + ms : 0;
  }

  update(s: Readonly<MatchState>): void {
    const now = this.scene.time.now;
    if (now > this.bannerUntil) this.banner.setText('');
    if (now > this.subUntil) this.sub.setText('');

    this.scores[0].setText(String(s.score[0]));
    this.scores[1].setText(String(s.score[1]));
    const label = periodLabel(s.period, this.config.match.periods);
    this.period.setText(`${label}  ${formatClock(s.periodTicksLeft / this.config.tickHz)}`);

    const sc = s.shotClock;
    const showShot = sc.team !== null && (s.phase === 'live' || s.phase === 'goalPause');
    this.shotBox.setVisible(showShot);
    this.shotText.setVisible(showShot);
    if (showShot && sc.team !== null) {
      const secs = Math.ceil(sc.ticksLeft / this.config.tickHz);
      // Only touch the text when it changes: restyling a Text re-rasterizes it, which is
      // costly every frame on software-rendered browsers.
      const key = `${secs}|${sc.team}`;
      if (key !== this.shotKey) {
        this.shotKey = key;
        this.shotText
          .setText(`${TEXT.shotClock} ${secs}`)
          .setColor(secs <= SHOT_CLOCK_WARN_SECONDS ? '#ff5a4f' : toCss(PALETTE.text));
        this.shotBox.setStrokeStyle(2, this.teams[sc.team].color, 1);
      }
    }

    const scoreLine = `${this.teams[0].name} ${s.score[0]}  –  ${s.score[1]} ${this.teams[1].name}`;
    if (!this.overlaysEnabled) {
      this.overlay.setVisible(false);
      this.banner.setText('');
      this.sub.setText('');
    } else if (s.phase === 'periodBreak') {
      const next = s.period + 1;
      const overtime = next > this.config.match.periods;
      this.showOverlay(TEXT.endOfPeriod(s.period), scoreLine, TEXT.nextUp(next, overtime));
    } else {
      // The final whistle hands over to the results screen (src/ui).
      this.overlay.setVisible(false);
    }
  }

  private showOverlay(title: string, score: string, hint: string): void {
    this.overlay.setVisible(true);
    // The overlay owns the screen: clear any callout still showing.
    this.banner.setText('');
    this.sub.setText('');
    this.overlayTitle.setText(title);
    this.overlayScore.setText(score);
    this.overlayHint.setText(hint);
  }
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
