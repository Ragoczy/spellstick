import Phaser from 'phaser';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS } from '../content/teams';
import {
  arenaGeometry,
  createMatch,
  FixedStepper,
  makeConfig,
  periodSecondsLeft,
  stepMatch,
  tickSeconds,
  type MatchState,
  type SimConfig,
} from '../sim';
import { PALETTE, toCss } from './palette';
import { drawRink } from './RinkView';
import { CANVAS_WIDTH, WorldView } from './view';

/** Renders a match from sim state. Holds no game rules of its own. */
export class MatchScene extends Phaser.Scene {
  private config!: SimConfig;
  private state!: MatchState;
  private stepper!: FixedStepper;
  private view!: WorldView;
  private ball!: Phaser.GameObjects.Arc;
  private clockText!: Phaser.GameObjects.Text;

  constructor() {
    super('match');
  }

  create(): void {
    this.config = makeConfig();
    this.state = createMatch(this.config, 1);
    this.stepper = new FixedStepper(
      () => stepMatch(this.state, [], this.config),
      tickSeconds(this.config),
      this.config.maxStepsPerFrame,
    );

    const arena = arenaGeometry(this.config);
    this.view = new WorldView(arena);
    const home = TEAMS[DEFAULT_HOME];
    const away = TEAMS[DEFAULT_AWAY];
    drawRink(this, arena, this.view, [home.color, away.color]);

    this.ball = this.add.circle(0, 0, this.view.len(0.25), PALETTE.ball);

    this.add
      .text(CANVAS_WIDTH / 2, 14, 'SPELLSTICK', {
        fontFamily: 'Georgia, serif',
        fontSize: '30px',
        color: toCss(PALETTE.mana),
      })
      .setOrigin(0.5, 0);
    this.clockText = this.add
      .text(CANVAS_WIDTH / 2, 52, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: toCss(PALETTE.text),
      })
      .setOrigin(0.5, 0);
    const teamStyle = (color: number) => ({
      fontFamily: 'Georgia, serif',
      fontSize: '22px',
      color: toCss(color),
    });
    this.add.text(40, 40, home.name, teamStyle(home.color)).setOrigin(0, 0.5);
    this.add.text(CANVAS_WIDTH - 40, 40, away.name, teamStyle(away.color)).setOrigin(1, 0.5);

    exposeDebugHandle(this);
  }

  override update(_time: number, deltaMs: number): void {
    this.stepper.advance(deltaMs / 1000);
    const s = this.state;
    this.ball.setPosition(this.view.x(s.ball.pos.x), this.view.y(s.ball.pos.y));
    this.clockText.setText(`P${s.period}  ${formatClock(periodSecondsLeft(s, this.config))}`);
  }

  get matchState(): Readonly<MatchState> {
    return this.state;
  }
}

/** Read-only handle for Playwright and the browser console. */
function exposeDebugHandle(scene: MatchScene): void {
  (window as unknown as { __spellstick: unknown }).__spellstick = {
    get state() {
      return scene.matchState;
    },
  };
}

function formatClock(seconds: number): string {
  const whole = Math.ceil(seconds);
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
