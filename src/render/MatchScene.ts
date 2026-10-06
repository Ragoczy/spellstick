import Phaser from 'phaser';
import { createTeamControllers, type Controller } from '../ai';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS } from '../content/teams';
import {
  arenaGeometry,
  chargeFraction,
  choosePassTarget,
  createMatch,
  facingDir,
  FixedStepper,
  makeConfig,
  periodSecondsLeft,
  practiceRoster,
  stepMatch,
  stickHead,
  tickSeconds,
  type InputCommand,
  type MatchState,
  type SimConfig,
  type TeamIndex,
} from '../sim';
import { HumanInput } from '../ui/humanInput';
import { BallView } from './BallView';
import { PALETTE, toCss } from './palette';
import { PlayerView } from './PlayerView';
import { drawRink } from './RinkView';
import { CANVAS_WIDTH, WorldView } from './view';

/** The human plays for this team. */
const HUMAN_TEAM: TeamIndex = 0;

interface Snapshot {
  players: { x: number; y: number }[];
  ball: { x: number; y: number };
}

/** Renders a match from sim state and feeds it human and AI input. Holds no game rules of its own. */
export class MatchScene extends Phaser.Scene {
  private config!: SimConfig;
  private state!: MatchState;
  private controllers: Controller[] = [];
  private stepper!: FixedStepper;
  private view!: WorldView;
  private input_!: HumanInput;
  private controlledId = 0;
  private prev!: Snapshot;
  private playerViews: PlayerView[] = [];
  private ballView!: BallView;
  private clockText!: Phaser.GameObjects.Text;
  private scoreText!: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private bannerText!: Phaser.GameObjects.Text;
  private colors!: [number, number];
  private matchSeed = 1;
  /** Running tally of sim events, for the debug handle (tests, console). */
  readonly eventCounts: Record<string, number> = {};

  constructor() {
    super('match');
  }

  create(): void {
    this.config = makeConfig();
    const arena = arenaGeometry(this.config);
    this.view = new WorldView(arena);
    this.input_ = new HumanInput(this, this.view);
    const home = TEAMS[DEFAULT_HOME];
    const away = TEAMS[DEFAULT_AWAY];
    this.colors = [home.color, away.color];
    drawRink(this, arena, this.view, this.colors);
    this.startMatch();

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
    const scoreStyle = { fontFamily: 'Georgia, serif', fontSize: '34px', color: toCss(PALETTE.text) };
    this.scoreText = [
      this.add.text(CANVAS_WIDTH / 2 - 150, 40, '0', scoreStyle).setOrigin(0.5),
      this.add.text(CANVAS_WIDTH / 2 + 150, 40, '0', scoreStyle).setOrigin(0.5),
    ];
    this.bannerText = this.add
      .text(CANVAS_WIDTH / 2, 250, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        color: toCss(PALETTE.mana),
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(100);

    exposeDebugHandle(this);
  }

  private startMatch(): void {
    for (const v of this.playerViews) v.destroy();
    this.ballView?.destroy();
    this.state = createMatch(this.config, this.matchSeed, practiceRoster(this.config));
    this.controllers = createTeamControllers(this.state, this.config, this.matchSeed);
    this.matchSeed++;
    this.controlledId = this.state.players.findIndex((p) => p.team === HUMAN_TEAM && p.role === 'runner');
    this.prev = snapshot(this.state);
    this.stepper = new FixedStepper(
      () => this.tick(),
      tickSeconds(this.config),
      this.config.maxStepsPerFrame,
    );
    this.playerViews = this.state.players.map(
      (p) => new PlayerView(this, this.view, this.config, p, this.colors[p.team]),
    );
    this.ballView = new BallView(this, this.view, this.config);
    this.ballView.setDepth(10);
  }

  /** One fixed sim tick. */
  private tick(): void {
    this.prev = snapshot(this.state);
    const inputs: InputCommand[] = [];
    for (const p of this.state.players) {
      if (p.id === this.controlledId) {
        // Until the mouse moves, aim the stick toward the goal we attack.
        const fallbackAim = { x: p.team === 0 ? 100 : -100, y: p.pos.y };
        inputs[p.id] = this.input_.command(fallbackAim);
      } else {
        inputs[p.id] = this.controllers[p.id]!.decide(this.state, p.id);
      }
    }
    stepMatch(this.state, inputs, this.config);
    this.input_.consumePresses();
    for (const e of this.state.events) this.eventCounts[e.type] = (this.eventCounts[e.type] ?? 0) + 1;

    // Control follows the ball when our team gets it (SPEC §5).
    const carrier =
      this.state.ball.carrier !== null ? this.state.players[this.state.ball.carrier] : undefined;
    if (carrier && carrier.team === HUMAN_TEAM && carrier.role === 'runner') this.controlledId = carrier.id;

    if (this.state.phase === 'final') this.startMatch(); // practice: go again
  }

  override update(_time: number, deltaMs: number): void {
    const alpha = this.stepper.advance(deltaMs / 1000);
    const s = this.state;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;

    const me = s.players[this.controlledId];
    let passTargetId = -1;
    if (me && s.ball.carrier === me.id) {
      passTargetId =
        choosePassTarget(s, me, stickHead(me, this.config), facingDir(me), this.config)?.id ?? -1;
    }
    s.players.forEach((p, i) => {
      const from = this.prev.players[i] ?? p.pos;
      this.playerViews[i]?.update({
        x: lerp(from.x, p.pos.x),
        y: lerp(from.y, p.pos.y),
        facing: p.facing,
        controlled: i === this.controlledId,
        charge: s.ball.carrier === p.id ? chargeFraction(p.primaryTicks, this.config) : 0,
        passTarget: i === passTargetId,
      });
    });
    this.ballView.update(lerp(this.prev.ball.x, s.ball.pos.x), lerp(this.prev.ball.y, s.ball.pos.y), s.ball);
    this.clockText.setText(`P${s.period}  ${formatClock(periodSecondsLeft(s, this.config))}`);
    this.scoreText[0].setText(String(s.score[0]));
    this.scoreText[1].setText(String(s.score[1]));
    this.bannerText.setText(s.phase === 'goalPause' ? 'GOAL!' : '');
  }

  get matchState(): Readonly<MatchState> {
    return this.state;
  }

  get controlled(): number {
    return this.controlledId;
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
    get controlledId() {
      return scene.controlled;
    },
    get eventCounts() {
      return scene.eventCounts;
    },
  };
}

function formatClock(seconds: number): string {
  const whole = Math.ceil(seconds);
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
