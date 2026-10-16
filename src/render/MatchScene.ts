import Phaser from 'phaser';
import { createDrillControllers, createTeamControllers, type Controller } from '../ai';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS, type TeamId, type TeamInfo } from '../content/teams';
import {
  CorrectionLog,
  NetClock,
  Predictor,
  Smoother,
  positionsOf,
  replayShowing,
  type CorrectionSummary,
  type Positions,
  type SideInput,
  type Snapshot as ServerSnapshot,
} from '../net';
import { TEXT } from '../content/text';
import {
  arenaFor,
  arenaGeometry,
  chargeFraction,
  choosePassTarget,
  createDrill,
  createMatch,
  DEFAULT_LOADOUT,
  DRILL_TARGET,
  drillConfig,
  DrillJudge,
  drawLoadout,
  loadoutRng,
  facingDir,
  FixedStepper,
  followPlay,
  makeConfig,
  matchRoster,
  secondsToTicks,
  startingControl,
  stepMatch,
  stickHead,
  switchControl,
  tickSeconds,
  type Difficulty,
  type DrillId,
  type DrillVerdict,
  type InputCommand,
  type MatchState,
  type Player,
  type RunnerSpell,
  type SimConfig,
  type SimEvent,
  type TeamIndex,
  type Vec2,
} from '../sim';
import { HumanInput } from '../ui/humanInput';
import { BallView } from './BallView';
import { Hud } from './Hud';
import { PALETTE } from './palette';
import { PlayerView } from './PlayerView';
import { captureFrame, REPLAY, ReplayPlayback, ReplayRecorder, type ReplayStep } from './replay';
import { RETRO, RetroWorld } from './retro';
import { drawRink } from './RinkView';
import { RevealedSpells } from './RevealedSpells';
import { SpellReveals } from './reveals';
import { SpellBar } from './SpellBar';
import { WorldView } from './view';

/** Ice Walls are pale ice blue under their gold edge. */
const ICE_COLOR = 0xd8f0ff;

/** The human plays for this team (the left/home side). */
const HUMAN_TEAM: TeamIndex = 0;

/**
 * What to play. `demo` is AI vs AI with no HUD callouts: the title-screen backdrop.
 * `training` runs one drill of the training ground (M9). `online` shows a match the server
 * runs (SPEC §11), as a player (`online.side`) or a watcher (side null).
 */
export interface MatchSetup {
  home: TeamId;
  away: TeamId;
  /** The opponents' AI level; your AI teammates always play at Normal. */
  difficulty: Difficulty;
  mode: 'play' | 'demo' | 'training' | 'online';
  /** The drill to run, in training. */
  drill?: DrillId;
  /** Your team's three spells (M10); the starting three if left out. Opponents get three at random. */
  spells?: readonly RunnerSpell[];
  seed?: number;
  online?: { side: TeamIndex | null; link: OnlineLink };
}

/** How an online match sends this person's controls to the server. */
export interface OnlineLink {
  sendInputs(inputs: SideInput[]): void;
}

/** An online match on this screen: predicting ahead of the server, and smoothing its corrections. */
interface OnlinePlay {
  side: TeamIndex | null;
  link: OnlineLink;
  predictor: Predictor;
  smoother: Smoother;
  clock: NetClock;
  stepper: FixedStepper;
  /** Controls made this frame, sent together. */
  outbox: SideInput[];
  pendingSwitch: boolean;
  pendingSkip: boolean;
  /** Where everyone was a tick ago, for drawing between ticks (null right after a correction). */
  prev: Positions | null;
  /** The goal whose replay has been shown. */
  replayedGoal: number | null;
  started: boolean;
  /** Corrections, for the network readout (M12). */
  corrections: CorrectionLog;
}

/** A training drill's progress, sent on SCENE_EVENTS.drill: at the start, and after every point or miss. */
export interface DrillUpdate {
  drill: DrillId;
  points: number;
  target: number;
  verdict: DrillVerdict | null;
}

/** Events the scene emits on `game.events` for the DOM layer (src/ui). */
export const SCENE_EVENTS = {
  /** (events: SimEvent[], state: MatchState, setup: MatchSetup) after every sim tick that had events. */
  simEvents: 'sim-events',
  /** (state: MatchState, setup: MatchSetup) once, at the final whistle of a played match. */
  matchOver: 'match-over',
  /** () once the scene is built and can take startMatch(). */
  ready: 'match-scene-ready',
  /** (update: DrillUpdate) in training. */
  drill: 'drill',
} as const;

/** Where a player stood (and pointed) when a visual effect fired: live, or in a replay frame. */
type Where = (playerId: number) => { x: number; y: number; facing: number };

interface Snapshot {
  players: { x: number; y: number }[];
  ball: { x: number; y: number };
}

/** Renders a match from sim state and feeds it human and AI input. Holds no game rules of its own. */
export class MatchScene extends Phaser.Scene {
  /** The match rules; `config` is this, or the drill version of it in training. */
  private baseConfig!: SimConfig;
  private config!: SimConfig;
  private state!: MatchState;
  private setup!: MatchSetup;
  private controllers: Controller[] = [];
  private stepper!: FixedStepper;
  private view!: WorldView;
  private input_!: HumanInput;
  private hud!: Hud;
  private spellBar!: SpellBar;
  /** Spells shown only once cast: the other team's (right), and home's for a watcher (left). */
  private readonly reveals = new SpellReveals();
  private revealedRight!: RevealedSpells;
  private revealedLeft!: RevealedSpells;
  private rink?: Phaser.GameObjects.Image;
  /** The 8-bit look (the default; off with `?look=classic`). */
  private retro?: RetroWorld;
  /** Gold shields across the goal mouths while a goalie's Ward is up. */
  private wardFx!: Phaser.GameObjects.Graphics;
  /** Ice Walls standing (M10). */
  private wallFx!: Phaser.GameObjects.Graphics;
  /** -1 when nobody is human-controlled (demo). */
  private controlledId = -1;
  private prev!: Snapshot;
  private playerViews: PlayerView[] = [];
  private ballView!: BallView;
  private teams!: [TeamInfo, TeamInfo];
  private demoSeed = 1000;
  private overSent = false;
  /** Goal replays (M9): recent frames, a goal waiting to be replayed, and the replay showing. */
  private recorder!: ReplayRecorder;
  private pendingReplay: { goalTick: number; startAt: number } | null = null;
  private replay: ReplayPlayback | null = null;
  private skipRequested = false;
  /** The training drill running (M9), if any. */
  private training: {
    drill: DrillId;
    judge: DrillJudge;
    points: number;
    seed: number;
    /** Set-ups so far: each one rolls fresh dice, so retrying the same shot isn't the same shot. */
    attempts: number;
    /** Sim tick to set the drill up again at, after a point or a miss. */
    resetAt: number | null;
    done: boolean;
  } | null = null;
  /** The online match on screen, if any. */
  private online: OnlinePlay | null = null;
  /**
   * While paused the sim doesn't advance (SPEC §5: Esc). Online there's no pause (SPEC §11):
   * the match goes on, and this only stops your controls while the menu is open.
   */
  paused = false;
  /** Running tally of sim events, for the debug handle (tests, console). */
  readonly eventCounts: Record<string, number> = {};

  constructor() {
    super('match');
  }

  create(): void {
    this.baseConfig = makeConfig();
    this.config = this.baseConfig;
    this.view = new WorldView(arenaGeometry(this.config));
    this.input_ = new HumanInput(this, this.view);
    // Space: switch player, or skip a replay.
    this.input_.onSwitch = () => (this.replay ? (this.skipRequested = true) : this.switchPlayer());
    this.recorder = new ReplayRecorder(
      secondsToTicks(REPLAY.leadSeconds + REPLAY.delaySeconds, this.config) + this.config.tickHz,
    );
    this.teams = [TEAMS[DEFAULT_HOME], TEAMS[DEFAULT_AWAY]];
    this.hud = new Hud(this, this.config, this.teams);
    this.spellBar = new SpellBar(this, this.config);
    this.revealedLeft = new RevealedSpells(this, 'left');
    this.revealedRight = new RevealedSpells(this, 'right');
    if (RETRO) {
      // Everything created from here on is world, drawn at low resolution; the HUD stays crisp.
      this.retro = new RetroWorld(this);
      this.retro.capture();
    }
    this.wardFx = this.add.graphics().setDepth(12);
    this.wallFx = this.add.graphics().setDepth(11);
    this.stepper = new FixedStepper(
      () => this.tick(),
      tickSeconds(this.config),
      this.config.maxStepsPerFrame,
    );
    this.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    exposeDebugHandle(this);
    this.game.events.emit(SCENE_EVENTS.ready);
  }

  /** Starts a fresh match (or demo, or training drill) with the given teams and difficulty. */
  startMatch(setup: MatchSetup): void {
    this.setup = setup;
    const training = setup.mode === 'training';
    this.config = training ? drillConfig(this.baseConfig) : this.baseConfig;
    this.paused = false;
    this.overSent = false;
    this.recorder.clear();
    this.pendingReplay = null;
    if (this.replay) this.endReplay();
    this.rink?.destroy();

    this.teams = [TEAMS[setup.home], TEAMS[setup.away]];
    this.rink = drawRink(this, arenaGeometry(this.config), this.view, [
      this.teams[0].color,
      this.teams[1].color,
    ]);
    this.rink.setDepth(-10);
    this.hud.setTeams(this.teams);
    const demo = setup.mode === 'demo';
    const watching = setup.mode === 'online' && (setup.online?.side ?? null) === null;
    this.hud.setOverlaysEnabled(!demo);
    this.hud.setScoreboardVisible(!training);
    this.spellBar.setVisible(!demo && !watching);
    this.reveals.reset();
    this.setRevealsVisible(true);

    if (setup.mode === 'online') {
      this.training = null;
      this.startOnline(setup);
      return;
    }
    this.online = null;
    const seed = setup.seed ?? (demo ? this.demoSeed++ : Math.floor(Math.random() * 1e9));
    if (training) {
      const drill = setup.drill ?? 'scoop';
      this.training = {
        drill,
        judge: new DrillJudge(drill),
        points: 0,
        seed,
        attempts: 0,
        resetAt: null,
        done: false,
      };
      this.loadDrill();
      this.emitDrill(null);
      return;
    }
    this.training = null;
    // Your three (the demo has nobody to pick, so both teams draw at random), and theirs at random.
    const home = demo ? drawLoadout(loadoutRng(seed, 0)) : [...(setup.spells ?? DEFAULT_LOADOUT)];
    const state = createMatch(this.config, seed, matchRoster(this.config), {
      start: 'faceoff',
      loadouts: [home, drawLoadout(loadoutRng(seed, 1))],
    });
    const levels: [Difficulty, Difficulty] = demo ? ['normal', 'normal'] : ['normal', setup.difficulty];
    this.loadState(
      state,
      createTeamControllers(state, this.config, seed, levels, [this.teams[0].style, this.teams[1].style]),
    );
    this.controlledId = -1;
    this.onFaceoffSet();
  }

  /** Puts a fresh match state on the floor: its controllers, and a view for every player. */
  private loadState(state: MatchState, controllers: Controller[]): void {
    for (const v of this.playerViews) v.destroy();
    this.ballView?.destroy();
    this.state = state;
    this.controllers = controllers;
    this.prev = snapshot(state);
    this.playerViews = state.players.map(
      (p) => new PlayerView(this, this.view, this.config, p, this.teams[p.team].color),
    );
    this.ballView = new BallView(this, this.view, this.config);
    this.ballView.setDepth(10);
  }

  /** Sets the current training drill up (again), for the points scored so far. */
  private loadDrill(): void {
    const t = this.training!;
    const seed = t.seed + t.attempts++ * 7919;
    const drill = createDrill(this.config, t.drill, t.points, seed);
    t.judge = new DrillJudge(t.drill);
    this.loadState(drill.state, createDrillControllers(drill, this.config, seed));
    this.controlledId = drill.humanId;
    if (drill.state.phase === 'faceoff') this.onFaceoffSet();
  }

  /** Scores the drill after a tick; after a point or a miss, sets it up again a moment later. */
  private judgeDrill(): void {
    const t = this.training!;
    if (t.resetAt !== null) {
      if (this.state.tick >= t.resetAt) {
        t.resetAt = null;
        this.loadDrill();
      }
      return;
    }
    if (t.done) return;
    const v = t.judge.observe(this.state, this.controlledId);
    if (!v) return;
    if (v.kind === 'point') t.points++;
    t.done = t.points >= DRILL_TARGET[t.drill];
    if (!t.done && (v.kind === 'miss' || v.reset)) {
      t.resetAt = this.state.tick + secondsToTicks(this.config.training.resetSeconds, this.config);
    }
    this.emitDrill(v);
  }

  private emitDrill(verdict: DrillVerdict | null): void {
    const t = this.training!;
    const update: DrillUpdate = { drill: t.drill, points: t.points, target: DRILL_TARGET[t.drill], verdict };
    this.game.events.emit(SCENE_EVENTS.drill, update);
  }

  private get playing(): boolean {
    return this.setup.mode === 'play';
  }

  /** A person is at the controls: a real match, training, or an online seat. */
  private get humanPlays(): boolean {
    if (this.setup.mode === 'online') return this.online !== null && this.online.side !== null;
    return this.setup.mode !== 'demo';
  }

  /** The team this screen's person plays (home in single-player and for watchers). */
  private get myTeam(): TeamIndex {
    return this.online?.side ?? HUMAN_TEAM;
  }

  /** The player last touched the gamepad (rather than the keyboard or mouse). */
  get usingPad(): boolean {
    return this.input_.usingPad;
  }

  /** One fixed sim tick. `autopilot` (tests only) puts the human's player on AI too. */
  private tick(autopilot = false): void {
    if (this.replay) return; // the sim waits while a goal replay shows
    if (isOver(this.state)) {
      this.input_.consumePresses();
      this.finish();
      return;
    }
    this.prev = snapshot(this.state);
    const inputs: InputCommand[] = [];
    for (const p of this.state.players) {
      if (p.id === this.controlledId && !autopilot) {
        // The goal this player attacks is the one the other team defends.
        inputs[p.id] = this.input_.command(
          p.pos,
          arenaFor(this.config).goals[p.team === 0 ? 1 : 0],
          p.spells,
        );
      } else {
        inputs[p.id] = this.controllers[p.id]!.decide(this.state, p.id);
      }
    }
    stepMatch(this.state, inputs, this.config);
    if (!autopilot) this.input_.consumePresses();
    for (const e of this.state.events) this.onEvent(e);
    if (this.playing) {
      this.recorder.record(
        captureFrame(this.state, (id) => chargeFraction(this.state.players[id]!.primaryTicks, this.config)),
      );
      if (this.pendingReplay && this.state.tick >= this.pendingReplay.startAt) this.startReplay();
    }
    if (this.state.events.length > 0) {
      this.game.events.emit(SCENE_EVENTS.simEvents, this.state.events, this.state, this.setup);
    }

    // Control follows the ball when our team gets it (SPEC §5).
    if (this.humanPlays) this.controlledId = followPlay(this.state, HUMAN_TEAM, this.controlledId);

    if (this.training) this.judgeDrill();

    // stepMatch may have just ended the match.
    if (isOver(this.state)) this.finish();
  }

  /** Final whistle: tell the UI once (it shows results); a demo just starts another match. */
  private finish(): void {
    if (this.setup.mode === 'demo') {
      this.startMatch({ ...this.setup, seed: undefined });
    } else if (!this.overSent) {
      this.overSent = true;
      this.game.events.emit(SCENE_EVENTS.matchOver, this.state, this.setup);
    }
  }

  private onEvent(e: SimEvent): void {
    this.eventCounts[e.type] = (this.eventCounts[e.type] ?? 0) + 1;
    if (e.type === 'cast') this.reveals.note(e.team, e.spell);
    const human = (team: TeamIndex | null) => team === this.myTeam;
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
        if (this.playing) {
          const t = this.state.tick;
          this.pendingReplay = { goalTick: t, startAt: t + secondsToTicks(REPLAY.delaySeconds, this.config) };
        }
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
      case 'checkBounce':
      case 'hexShove':
      case 'cast':
      case 'wardBlock':
      case 'blink':
      case 'snare':
      case 'imagePop':
      case 'stoneBlock':
        this.effect(e, (id) => {
          const p = this.state.players[id]!;
          return { x: p.pos.x, y: p.pos.y, facing: p.facing };
        });
        break;
      case 'boardSlam':
        if (this.humanPlays) this.cameras.main.shake(120, 0.004);
        break;
    }
  }

  /** The flash for a hit or a spell, live or in a replay. */
  private effect(e: SimEvent, at: Where): void {
    switch (e.type) {
      case 'check':
        this.hitFlash(at(e.targetId), e.loosened);
        break;
      case 'checkBounce':
        this.hitFlash(at(e.playerId), false);
        break;
      case 'hexShove':
        this.shoveFlash(at(e.playerId));
        break;
      case 'cast':
        if (e.spell !== 'hexShove') this.castPulse(at(e.playerId));
        break;
      case 'wardBlock':
        this.castPulse(at(e.goalieId), 2.5);
        break;
      case 'blink':
        // Gone from here, there in a flash.
        this.castPulse(e.from, 0.9);
        this.castPulse(e.to, 0.9);
        break;
      case 'snare':
        if (e.targetId !== null) this.snareFlash(at(e.playerId), at(e.targetId));
        break;
      case 'imagePop':
        this.castPulse(at(e.playerId), 0.8);
        break;
      case 'stoneBlock':
        this.hitFlash(at(e.playerId), false);
        break;
    }
  }

  /** Snare: a gold line lashes from the caster to the one it pins. */
  private snareFlash(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const g = this.add.graphics().setDepth(19);
    g.lineStyle(3, PALETTE.mana, 0.9).lineBetween(
      this.view.x(from.x),
      this.view.y(from.y),
      this.view.x(to.x),
      this.view.y(to.y),
    );
    this.tweens.add({ targets: g, alpha: 0, duration: 350, onComplete: () => g.destroy() });
  }

  /** Ice Walls: a pale band edged in gold, like the Ward. */
  private drawWalls(walls: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[]): void {
    const g = this.wallFx.clear();
    const thick = this.view.len(this.config.spells.iceWall.halfThickness * 2);
    for (const w of walls) {
      const ax = this.view.x(w.a.x);
      const ay = this.view.y(w.a.y);
      const bx = this.view.x(w.b.x);
      const by = this.view.y(w.b.y);
      g.lineStyle(thick + 14, PALETTE.mana, 0.35).lineBetween(ax, ay, bx, by);
      g.lineStyle(thick + 5, ICE_COLOR, 0.95).lineBetween(ax, ay, bx, by);
    }
  }

  /** Cuts to the replay of the goal just scored (M9). The sim waits until it ends. */
  private startReplay(): void {
    const p = this.pendingReplay!;
    this.pendingReplay = null;
    const frames = this.recorder.clip(
      p.goalTick - secondsToTicks(REPLAY.leadSeconds, this.config),
      p.goalTick + secondsToTicks(REPLAY.tailSeconds, this.config),
    );
    if (frames.length < 2) return;
    this.replay = new ReplayPlayback(frames, this.config.tickHz);
    this.skipRequested = false;
    this.hud.setReplay(true, this.input_.usingPad ? TEXT.replaySkipPad : TEXT.replaySkip);
    this.spellBar.setVisible(false);
    this.setRevealsVisible(false);
  }

  /**
   * The revealed-spells panels (hidden until used): a player sees the other team's, a watcher
   * both; none in the title demo or training, or while a replay shows.
   */
  private setRevealsVisible(on: boolean): void {
    const mode = this.setup.mode;
    const watching = mode === 'online' && (this.setup.online?.side ?? null) === null;
    const shown = on && (mode === 'play' || mode === 'online');
    const theirs: TeamIndex = this.myTeam === 0 ? 1 : 0;
    this.revealedRight.setTeam(this.teams[theirs]);
    this.revealedLeft.setTeam(this.teams[0]);
    this.revealedRight.setVisible(shown);
    this.revealedLeft.setVisible(shown && watching);
  }

  private endReplay(): void {
    this.replay = null;
    this.skipRequested = false;
    this.hud.setReplay(false);
    this.spellBar.setVisible(this.playing || (this.online !== null && this.online.side !== null));
    this.setRevealsVisible(true);
  }

  /** One rendered frame of a replay: advance it, or end it when it's done or skipped. */
  private updateReplay(dt: number): void {
    const replay = this.replay!;
    const skip = this.input_.pollReplaySkip() || this.skipRequested;
    this.skipRequested = false;
    // Paused: hold the frame (the pause menu has the input).
    if (this.paused) return;
    const step = skip ? null : replay.advance(dt);
    if (!step) {
      this.endReplay();
      return;
    }
    this.drawReplay(step);
  }

  private drawReplay(step: ReplayStep): void {
    const { from, to, alpha } = step;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    this.playerViews.forEach((view, i) => {
      const a = from.players[i];
      const b = to.players[i];
      if (!a || !b) return;
      view.update({
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        facing: alpha < 0.5 ? a.facing : b.facing,
        controlled: false,
        charge: b.charge,
        passTarget: false,
        staggered: b.staggered,
        checkReady: true,
        quickstep: b.quickstep,
        armed: b.armed,
        rooted: b.rooted,
        stone: b.stone,
        images: b.images,
      });
    });
    this.ballView.update(lerp(from.ball.x, to.ball.x), lerp(from.ball.y, to.ball.y), to.ball);
    step.fired.forEach((e, k) => this.effect(e, (id) => step.firedFrames[k]!.players[id]!));
    this.drawWards(to.wards);
    this.drawWalls(to.walls);
    this.hud.update(this.state);
    this.retro?.render();
  }

  /** At every faceoff you take the draw yourself (SPEC §4.1). */
  private onFaceoffSet(): void {
    if (!this.humanPlays) return;
    if (this.online) {
      // Online, the shared control rules hand you your taker (src/sim/control.ts).
      const hint = this.input_.usingPad ? TEXT.faceoffHintPad : TEXT.faceoffHint;
      this.hud.flash(TEXT.faceoff, 1500, PALETTE.mana, hint);
      return;
    }
    this.controlledId = startingControl(this.state, HUMAN_TEAM);
    if (this.state.faceoff) {
      this.hud.flash(
        TEXT.faceoff,
        1500,
        PALETTE.mana,
        this.input_.usingPad ? TEXT.faceoffHintPad : TEXT.faceoffHint,
      );
    }
  }

  /**
   * Space (SPEC §5): on defense, take over the teammate nearest the ball. If that's
   * already you, go to the next nearest. On offense control follows the ball anyway.
   */
  private switchPlayer(): void {
    if (!this.humanPlays || this.paused) return;
    if (this.online) {
      this.online.pendingSwitch = true; // goes with the next tick's controls
      return;
    }
    this.controlledId = switchControl(this.state, HUMAN_TEAM, this.controlledId);
  }

  /** Hex Shove: a gold cone that flares out from the caster's stick and fades. */
  private shoveFlash(caster: { x: number; y: number; facing: number }): void {
    const hs = this.config.spells.hexShove;
    const half = (hs.coneHalfAngleDeg * Math.PI) / 180;
    const g = this.add.graphics().setDepth(19);
    g.fillStyle(PALETTE.mana, 0.45);
    g.slice(
      this.view.x(caster.x),
      this.view.y(caster.y),
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
    if (this.online) {
      this.updateOnline(deltaMs / 1000);
      return;
    }
    if (this.replay) {
      this.updateReplay(deltaMs / 1000);
      return;
    }
    // Paused: keep drawing, don't advance (and drop any presses made while paused).
    this.input_.pollPad(!this.paused && this.humanPlays);
    const alpha = this.paused ? 1 : this.stepper.advance(deltaMs / 1000);
    if (this.paused) this.input_.consumePresses();
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const ball = this.state.ball.pos;
    this.drawLive(
      (i, p) => {
        const from = this.prev.players[i] ?? p.pos;
        return { x: lerp(from.x, p.pos.x), y: lerp(from.y, p.pos.y) };
      },
      { x: lerp(this.prev.ball.x, ball.x), y: lerp(this.prev.ball.y, ball.y) },
    );
  }

  /** Draws the match as it stands, with each player and the ball at the given spots. */
  private drawLive(playerAt: (i: number, p: Player) => Vec2, ballAt: Vec2): void {
    const s = this.state;
    const me = this.controlledId >= 0 ? s.players[this.controlledId] : undefined;
    let passTargetId = -1;
    if (me && s.ball.carrier === me.id) {
      passTargetId =
        choosePassTarget(s, me, stickHead(me, this.config), facingDir(me), this.config)?.id ?? -1;
    }
    s.players.forEach((p, i) => {
      const at = playerAt(i, p);
      this.playerViews[i]?.update({
        x: at.x,
        y: at.y,
        facing: p.facing,
        controlled: i === this.controlledId,
        charge: s.ball.carrier === p.id ? chargeFraction(p.primaryTicks, this.config) : 0,
        passTarget: i === passTargetId,
        staggered: p.staggerTicks > 0,
        checkReady: p.checkCooldown === 0,
        quickstep: p.quickstepTicks > 0,
        armed: p.armed !== null,
        rooted: p.rootTicks > 0,
        stone: p.stoneTicks > 0,
        images: p.images,
      });
    });
    this.ballView.update(ballAt.x, ballAt.y, s.ball);
    this.hud.update(s);
    this.spellBar.showPadLabels(this.input_.usingPad);
    this.spellBar.update(me);
    // The other team's (a watcher's myTeam is home, so this is away for them).
    this.revealedRight.update(this.reveals.of(this.myTeam === 0 ? 1 : 0));
    this.revealedLeft.update(this.reveals.of(0));
    this.drawWards(s.players.filter((p) => p.role === 'goalie' && p.wardTicks > 0).map((p) => p.id));
    this.drawWalls(s.walls);
    this.retro?.render();
  }

  // ---- Online (SPEC §11) ----

  private startOnline(setup: MatchSetup): void {
    const side = setup.online?.side ?? null;
    // Something to draw until the server's first state arrives (it replaces this at once).
    const placeholder = createMatch(this.config, 1, matchRoster(this.config), { start: 'faceoff' });
    this.loadState(placeholder, []);
    this.controlledId = -1;
    this.online = {
      side,
      link: setup.online!.link,
      predictor: new Predictor(this.config, side),
      smoother: new Smoother(this.config),
      clock: new NetClock(this.config),
      stepper: new FixedStepper(
        () => this.onlineTick(),
        tickSeconds(this.config),
        this.config.maxStepsPerFrame,
      ),
      outbox: [],
      pendingSwitch: false,
      pendingSkip: false,
      prev: null,
      replayedGoal: null,
      started: false,
      corrections: new CorrectionLog(this.config.online.snapMeters),
    };
  }

  /** The server's latest state (from src/ui/online.ts). */
  onlineSnapshot(snap: ServerSnapshot, slack: number | null): void {
    const o = this.online;
    if (!o) return;
    o.predictor.receive(snap);
    o.clock.onSnapshot(snap.world.tick, slack, o.side === null);
    const m = snap.world.match;
    // Snapshots carry the events since the last one; record them with this frame for replays.
    m.events = snap.events;
    this.recorder.record(captureFrame(m, (id) => chargeFraction(m.players[id]!.primaryTicks, this.config)));
    for (const e of snap.events) this.onEvent(e);
    if (snap.events.length > 0) this.game.events.emit(SCENE_EVENTS.simEvents, snap.events, m, this.setup);
    if (!o.started) {
      o.started = true;
      if (m.faceoff) this.onFaceoffSet();
    }
    if (m.phase === 'final' && !this.overSent) {
      this.overSent = true;
      this.game.events.emit(SCENE_EVENTS.matchOver, m, this.setup);
    }
  }

  /** One tick of this screen's clock: this person's controls for it, sent and predicted. */
  private onlineTick(): void {
    const o = this.online!;
    const t = (o.clock.tick ?? 0) + 1;
    o.clock.tick = t;
    if (o.side !== null) {
      const w = o.predictor.world;
      const me = w ? w.match.players[w.control[o.side]] : undefined;
      let input: SideInput;
      if (!me || this.paused) {
        input = { t, move: { x: 0, y: 0 }, aim: me ? { ...me.pos } : { x: 0, y: 0 } };
      } else {
        const goals = arenaFor(this.config).goals;
        const cmd = this.input_.command(me.pos, goals[o.side === 0 ? 1 : 0], me.spells);
        input = { t, move: cmd.move, aim: cmd.aim };
        if (cmd.primary) input.primary = true;
        if (cmd.check) input.check = true;
        if (cmd.cast) input.cast = cmd.cast;
      }
      if (o.pendingSwitch) input.switchPlayer = true;
      if (o.pendingSkip) input.skipReplay = true;
      o.pendingSwitch = false;
      o.pendingSkip = false;
      this.input_.consumePresses();
      o.outbox.push(input);
      o.predictor.addInput(input);
    }
    o.prev = o.predictor.world ? positionsOf(o.predictor.world) : null;
    this.applyCorrection(o.predictor.advanceTo(t));
  }

  /** A newer server state moved things: draw them where they were and ease them over. */
  private applyCorrection(fix: { before: Positions; after: Positions } | null): void {
    const o = this.online!;
    if (!fix) return;
    const w = o.predictor.world;
    o.corrections.add(this.time.now, fix.before, fix.after, o.side !== null && w ? w.control[o.side] : null);
    o.smoother.correct(fix.before, fix.after);
    o.prev = null;
  }

  private updateOnline(dt: number): void {
    const o = this.online!;
    const auth = o.predictor.server;
    // Goal replays follow the server: it holds the match while one shows.
    if (auth?.replay && replayShowing(auth) && auth.replay.goalTick !== o.replayedGoal) {
      o.replayedGoal = auth.replay.goalTick;
      this.startOnlineReplay(auth.replay.goalTick);
    }
    if (this.replay && (!auth || !replayShowing(auth))) this.endReplay();

    if (this.replay) {
      if (this.input_.pollReplaySkip() || this.skipRequested) {
        o.pendingSkip = o.side !== null;
        this.endReplay();
        if (o.side !== null) this.hud.flash(TEXT.replayWaiting, 1800, PALETTE.text);
      }
    } else {
      this.input_.pollPad(o.side !== null && !this.paused);
      if (this.paused) this.input_.consumePresses();
    }

    let alpha = 1;
    if (o.clock.tick !== null) alpha = o.stepper.advance(dt * o.clock.rate);
    if (o.outbox.length > 0) {
      o.link.sendInputs(o.outbox);
      o.outbox = [];
    }
    if (o.clock.tick !== null) this.applyCorrection(o.predictor.advanceTo(o.clock.tick));
    const w = o.predictor.world;
    if (!w) return;
    o.smoother.decay(dt);
    this.state = w.match;
    this.controlledId = o.side === null ? -1 : w.control[o.side];

    if (this.replay) {
      const step = this.replay.advance(dt);
      if (step) this.drawReplay(step);
      else this.endReplay();
      return;
    }
    const prev = o.prev;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const playerAt = (i: number, p: Player): Vec2 => {
      const from = prev?.players[i] ?? p.pos;
      const off = o.smoother.player(i);
      return { x: lerp(from.x, p.pos.x) + off.x, y: lerp(from.y, p.pos.y) + off.y };
    };
    const ball = w.match.ball;
    // A carried ball goes where its carrier is drawn; a loose one eases on its own.
    const ballOff = ball.carrier !== null ? o.smoother.player(ball.carrier) : o.smoother.ball;
    const from = prev?.ball ?? ball.pos;
    this.drawLive(playerAt, {
      x: lerp(from.x, ball.pos.x) + ballOff.x,
      y: lerp(from.y, ball.pos.y) + ballOff.y,
    });
  }

  /** The replay of the goal the server is holding the match for (one frame per snapshot). */
  private startOnlineReplay(goalTick: number): void {
    const frames = this.recorder.clip(
      goalTick - secondsToTicks(REPLAY.leadSeconds, this.config),
      goalTick + secondsToTicks(REPLAY.tailSeconds, this.config),
    );
    if (frames.length < 2) return;
    this.replay = new ReplayPlayback(frames, this.config.tickHz / this.config.online.snapshotEveryTicks);
    this.skipRequested = false;
    const seated = this.online !== null && this.online.side !== null;
    this.hud.setReplay(
      true,
      seated ? (this.input_.usingPad ? TEXT.replaySkipPad : TEXT.replaySkip) : undefined,
    );
    this.spellBar.setVisible(false);
    this.setRevealsVisible(false);
  }

  /** Each team's spells seen cast so far this match. */
  get revealedSpells(): [readonly RunnerSpell[], readonly RunnerSpell[]] {
    return [this.reveals.of(0), this.reveals.of(1)];
  }

  /**
   * Online: this screen's side and clock, the server's latest tick, and how much the
   * prediction is being corrected (the network readout, tests, and the console).
   */
  get onlineStatus(): {
    side: TeamIndex | null;
    tick: number | null;
    serverTick: number | null;
    slack: number | null;
    rate: number;
    corrections: CorrectionSummary;
  } | null {
    const o = this.online;
    if (!o) return null;
    const serverTick = o.predictor.server?.tick ?? null;
    return {
      side: o.side,
      tick: o.clock.tick,
      serverTick,
      slack: o.clock.lastSlack,
      rate: o.clock.rate,
      corrections: o.corrections.summary(this.time.now),
    };
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

  /**
   * Debug/test only: play on with every player on AI, through the normal tick (so goals
   * are recorded), until a goal replay starts. Lets the screenshot test see a replay.
   */
  fastForwardToReplay(maxTicks = 200_000): boolean {
    for (let i = 0; i < maxTicks && !this.replay && !isOver(this.state); i++) this.tick(true);
    return this.replay !== null;
  }

  get replaying(): boolean {
    return this.replay !== null;
  }

  /** Debug/test only: the training drill's progress. */
  get trainingStatus(): { drill: DrillId; points: number; done: boolean } | null {
    const t = this.training;
    return t ? { drill: t.drill, points: t.points, done: t.done } : null;
  }

  /** Gold shields across the goal mouths of these goalies (their Ward is up). */
  private drawWards(goalieIds: readonly number[]): void {
    const g = this.wardFx.clear();
    for (const id of goalieIds) {
      const p = this.state.players[id]!;
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

  get matchSetup(): Readonly<MatchSetup> {
    return this.setup;
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
    get setup() {
      return scene.matchSetup;
    },
    get replaying() {
      return scene.replaying;
    },
    get training() {
      return scene.trainingStatus;
    },
    get online() {
      return scene.onlineStatus;
    },
    /** Each team's spells seen cast so far (hidden until used). */
    get revealed() {
      return scene.revealedSpells;
    },
    fastForwardTo: (phase: MatchState['phase']) => scene.fastForwardTo(phase),
    fastForwardToReplay: () => scene.fastForwardToReplay(),
  };
}

/** True once the final whistle has blown. (A function, so TypeScript re-reads the phase.) */
function isOver(state: MatchState): boolean {
  return state.phase === 'final';
}
