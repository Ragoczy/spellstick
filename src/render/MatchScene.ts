import Phaser from 'phaser';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS } from '../content/teams';
import {
  arenaGeometry,
  createMatch,
  FixedStepper,
  makeConfig,
  periodSecondsLeft,
  practiceRoster,
  stepMatch,
  tickSeconds,
  type InputCommand,
  type MatchState,
  type SimConfig,
} from '../sim';
import { HumanInput } from '../ui/humanInput';
import { BallView } from './BallView';
import { PALETTE, toCss } from './palette';
import { PlayerView } from './PlayerView';
import { drawRink } from './RinkView';
import { CANVAS_WIDTH, WorldView } from './view';

interface Snapshot {
  players: { x: number; y: number }[];
  ball: { x: number; y: number };
}

/** Renders a match from sim state and feeds it human input. Holds no game rules of its own. */
export class MatchScene extends Phaser.Scene {
  private config!: SimConfig;
  private state!: MatchState;
  private stepper!: FixedStepper;
  private view!: WorldView;
  private input_!: HumanInput;
  private controlledId = 0;
  private prev!: Snapshot;
  private playerViews: PlayerView[] = [];
  private ballView!: BallView;
  private clockText!: Phaser.GameObjects.Text;

  constructor() {
    super('match');
  }

  create(): void {
    this.config = makeConfig();
    this.state = createMatch(this.config, 1, practiceRoster());
    this.prev = snapshot(this.state);
    this.stepper = new FixedStepper(
      () => this.tick(),
      tickSeconds(this.config),
      this.config.maxStepsPerFrame,
    );

    const arena = arenaGeometry(this.config);
    this.view = new WorldView(arena);
    this.input_ = new HumanInput(this, this.view);
    const home = TEAMS[DEFAULT_HOME];
    const away = TEAMS[DEFAULT_AWAY];
    const colors: [number, number] = [home.color, away.color];
    drawRink(this, arena, this.view, colors);

    this.playerViews = this.state.players.map(
      (p) => new PlayerView(this, this.view, this.config, p, colors[p.team]),
    );
    this.ballView = new BallView(this, this.view);
    this.ballView.setDepth(10);

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

  /** One fixed sim tick. */
  private tick(): void {
    this.prev = snapshot(this.state);
    const me = this.state.players[this.controlledId];
    const inputs: InputCommand[] = [];
    if (me) {
      // Until the mouse moves, aim the stick toward the goal we attack.
      const fallbackAim = { x: me.team === 0 ? 100 : -100, y: me.pos.y };
      inputs[me.id] = this.input_.command(fallbackAim);
    }
    stepMatch(this.state, inputs, this.config);
    this.input_.consumePresses();
    if (this.state.phase === 'final') {
      // Practice mode: start over when the clock runs out.
      this.state = createMatch(this.config, this.state.tick, practiceRoster());
      this.prev = snapshot(this.state);
    }
  }

  override update(_time: number, deltaMs: number): void {
    const alpha = this.stepper.advance(deltaMs / 1000);
    const s = this.state;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    s.players.forEach((p, i) => {
      const from = this.prev.players[i] ?? p.pos;
      this.playerViews[i]?.update(
        lerp(from.x, p.pos.x),
        lerp(from.y, p.pos.y),
        p.facing,
        i === this.controlledId,
      );
    });
    this.ballView.update(lerp(this.prev.ball.x, s.ball.pos.x), lerp(this.prev.ball.y, s.ball.pos.y), s.ball);
    this.clockText.setText(`P${s.period}  ${formatClock(periodSecondsLeft(s, this.config))}`);
  }

  get matchState(): Readonly<MatchState> {
    return this.state;
  }
}

function snapshot(state: MatchState): Snapshot {
  return {
    players: state.players.map((p) => ({ x: p.pos.x, y: p.pos.y })),
    ball: { x: state.ball.pos.x, y: state.ball.pos.y },
  };
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
