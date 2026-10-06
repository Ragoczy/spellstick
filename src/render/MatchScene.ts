import Phaser from 'phaser';
import { createTeamControllers, type Controller } from '../ai';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS, type TeamInfo } from '../content/teams';
import { TEXT } from '../content/text';
import {
  arenaGeometry,
  chargeFraction,
  choosePassTarget,
  createMatch,
  facingDir,
  FixedStepper,
  makeConfig,
  matchRoster,
  stepMatch,
  stickHead,
  tickSeconds,
  type InputCommand,
  type MatchState,
  type SimConfig,
  type SimEvent,
  type TeamIndex,
} from '../sim';
import { HumanInput } from '../ui/humanInput';
import { BallView } from './BallView';
import { Hud } from './Hud';
import { PALETTE } from './palette';
import { PlayerView } from './PlayerView';
import { SpellBar } from './SpellBar';
import { drawRink } from './RinkView';
import { WorldView } from './view';

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
  private hud!: Hud;
  private spellBar!: SpellBar;
  /** Gold shields across the goal mouths while a goalie's Ward is up. */
  private wardFx!: Phaser.GameObjects.Graphics;
  private controlledId = 0;
  private prev!: Snapshot;
  private playerViews: PlayerView[] = [];
  private ballView!: BallView;
  private teams!: [TeamInfo, TeamInfo];
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
    this.input_.onSwitch = () => this.switchPlayer();
    this.teams = [TEAMS[DEFAULT_HOME], TEAMS[DEFAULT_AWAY]];
    drawRink(this, arena, this.view, [this.teams[0].color, this.teams[1].color]);
    this.hud = new Hud(this, this.config, this.teams);
    this.spellBar = new SpellBar(this, this.config);
    this.wardFx = this.add.graphics().setDepth(12);
    this.input.on('pointerdown', () => {
      if (this.state.phase === 'final') this.startMatch();
    });
    this.startMatch();
    exposeDebugHandle(this);
  }

  private startMatch(): void {
    for (const v of this.playerViews) v.destroy();
    this.ballView?.destroy();
    this.state = createMatch(this.config, this.matchSeed, matchRoster(this.config), { start: 'faceoff' });
    this.controllers = createTeamControllers(this.state, this.config, this.matchSeed);
    this.matchSeed++;
    this.prev = snapshot(this.state);
    this.stepper = new FixedStepper(
      () => this.tick(),
      tickSeconds(this.config),
      this.config.maxStepsPerFrame,
    );
    this.playerViews = this.state.players.map(
      (p) => new PlayerView(this, this.view, this.config, p, this.teams[p.team].color),
    );
    this.ballView = new BallView(this, this.view, this.config);
    this.ballView.setDepth(10);
    this.onFaceoffSet();
  }

  /** One fixed sim tick. */
  private tick(): void {
    if (this.state.phase === 'final') return;
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
    for (const e of this.state.events) this.onEvent(e);

    // Control follows the ball when our team gets it (SPEC §5).
    const carrier =
      this.state.ball.carrier !== null ? this.state.players[this.state.ball.carrier] : undefined;
    if (carrier && carrier.team === HUMAN_TEAM && carrier.role === 'runner') this.controlledId = carrier.id;
  }

  private onEvent(e: SimEvent): void {
    this.eventCounts[e.type] = (this.eventCounts[e.type] ?? 0) + 1;
    const human = (team: TeamIndex | null) => team === HUMAN_TEAM;
    switch (e.type) {
      case 'faceoffSet':
        this.onFaceoffSet();
        break;
      case 'whistle':
        this.hud.flash(TEXT.whistle, 700, PALETTE.text);
        break;
      case 'faceoffWin':
        if (e.reason === 'misfire')
          this.hud.flash(TEXT.misfire, 1000, human(e.team) ? PALETTE.mana : 0xff5a4f);
        break;
      case 'goal':
        this.hud.flash(TEXT.goal, 2000, this.teams[e.team].color);
        break;
      case 'goalDisallowed':
        this.hud.flash(TEXT.goalDisallowed, 1600, PALETTE.text);
        break;
      case 'creaseViolation':
        this.hud.flash(TEXT.creaseViolation, 1400, PALETTE.text);
        break;
      case 'shotClockViolation':
        this.hud.flash(TEXT.shotClockViolation, 1400, PALETTE.text);
        break;
      case 'periodStart':
        if (e.overtime) this.hud.flash(TEXT.overtime, 2200);
        break;
      case 'check':
        this.hitFlash(this.state.players[e.targetId]!.pos, e.loosened);
        break;
      case 'checkBounce':
        this.hitFlash(this.state.players[e.playerId]!.pos, false);
        break;
      case 'hexShove':
        this.shoveFlash(this.state.players[e.playerId]!);
        break;
      case 'cast':
        if (e.spell !== 'hexShove') this.castPulse(this.state.players[e.playerId]!.pos);
        break;
      case 'wardBlock':
        this.castPulse(this.state.players[e.goalieId]!.pos, 2.5);
        break;
      case 'boardSlam':
        this.cameras.main.shake(120, 0.004);
        break;
    }
  }

  /** At every faceoff you take the draw yourself (SPEC §4.1). */
  private onFaceoffSet(): void {
    const f = this.state.faceoff;
    if (f) {
      this.controlledId = f.takers[HUMAN_TEAM];
      this.hud.flash(TEXT.faceoff, 1500, PALETTE.mana, TEXT.faceoffHint);
    } else {
      this.controlledId = this.state.players.findIndex((p) => p.team === HUMAN_TEAM && p.role === 'runner');
    }
  }

  /**
   * Space (SPEC §5): on defense, take over the teammate nearest the ball. If that's
   * already you, go to the next nearest. On offense control follows the ball anyway.
   */
  private switchPlayer(): void {
    const s = this.state;
    if (s.phase === 'faceoff') return;
    const carrier = s.ball.carrier !== null ? s.players[s.ball.carrier] : undefined;
    if (carrier && carrier.team === HUMAN_TEAM) return;
    const mates = s.players
      .filter((p) => p.team === HUMAN_TEAM && p.role === 'runner')
      .sort(
        (a, b) =>
          Math.hypot(a.pos.x - s.ball.pos.x, a.pos.y - s.ball.pos.y) -
            Math.hypot(b.pos.x - s.ball.pos.x, b.pos.y - s.ball.pos.y) || a.id - b.id,
      );
    const next = mates[0]?.id === this.controlledId ? mates[1] : mates[0];
    if (next) this.controlledId = next.id;
  }

  /** Hex Shove: a gold cone that flares out from the caster's stick and fades. */
  private shoveFlash(caster: { pos: { x: number; y: number }; facing: number }): void {
    const hs = this.config.spells.hexShove;
    const half = (hs.coneHalfAngleDeg * Math.PI) / 180;
    const g = this.add.graphics().setDepth(19);
    g.fillStyle(PALETTE.mana, 0.45);
    g.slice(
      this.view.x(caster.pos.x),
      this.view.y(caster.pos.y),
      this.view.len(hs.range),
      caster.facing - half,
      caster.facing + half,
    );
    g.fillPath();
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  /** A gold ring pulse for a spell cast (or a Ward block). */
  private castPulse(pos: { x: number; y: number }, size = 1.2): void {
    const ring = this.add
      .circle(this.view.x(pos.x), this.view.y(pos.y), this.view.len(size))
      .setStrokeStyle(3, PALETTE.mana, 0.9)
      .setDepth(20);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
  }

  /** A quick expanding ring where a check lands; gold if it knocked the ball loose. */
  private hitFlash(pos: { x: number; y: number }, loosened: boolean): void {
    const ring = this.add
      .circle(this.view.x(pos.x), this.view.y(pos.y), this.view.len(0.7))
      .setStrokeStyle(3, loosened ? PALETTE.mana : PALETTE.text, 0.9)
      .setDepth(20);
    this.tweens.add({ targets: ring, scale: 2, alpha: 0, duration: 250, onComplete: () => ring.destroy() });
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
        staggered: p.staggerTicks > 0,
        checkReady: p.checkCooldown === 0,
        quickstep: p.quickstepTicks > 0,
        bentArmed: p.bentArmed,
      });
    });
    this.ballView.update(lerp(this.prev.ball.x, s.ball.pos.x), lerp(this.prev.ball.y, s.ball.pos.y), s.ball);
    this.hud.update(s);
    this.spellBar.update(s.players[this.controlledId]);
    this.drawWards(s);
  }

  /**
   * Debug/test only: run the sim with every player on AI until `phase` (or `maxTicks`).
   * Lets screenshot tests reach the period break and final screens quickly.
   */
  fastForwardTo(phase: MatchState['phase'], maxTicks = 200_000): void {
    for (let i = 0; i < maxTicks && this.state.phase !== phase && this.state.phase !== 'final'; i++) {
      const inputs = this.state.players.map((p) => this.controllers[p.id]!.decide(this.state, p.id));
      stepMatch(this.state, inputs, this.config);
    }
    this.prev = snapshot(this.state);
  }

  private drawWards(s: Readonly<MatchState>): void {
    const g = this.wardFx.clear();
    for (const p of s.players) {
      if (p.role !== 'goalie' || p.wardTicks <= 0) continue;
      const goal = arenaGeometry(this.config).goals[p.team];
      const x = this.view.x(goal.mouth.x);
      const half = this.view.len(goal.width / 2 + 0.2);
      const y = this.view.y(goal.mouth.y);
      g.lineStyle(10, PALETTE.mana, 0.35).lineBetween(x, y - half, x, y + half);
      g.lineStyle(4, PALETTE.mana, 0.95).lineBetween(x, y - half, x, y + half);
    }
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
    fastForwardTo: (phase: MatchState['phase']) => scene.fastForwardTo(phase),
  };
}
