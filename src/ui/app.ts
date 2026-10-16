import type Phaser from 'phaser';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS, type TeamId } from '../content/teams';
import { MatchScene, SCENE_EVENTS, type DrillUpdate, type MatchSetup } from '../render/MatchScene';
import {
  DEFAULT_LOADOUT,
  DRILLS,
  isLoadout,
  makeConfig,
  type Difficulty,
  type MatchState,
  type SimEvent,
} from '../sim';
import { clipId } from '../content/announcer';
import { ONLINE_TEXT } from '../content/online';
import type { RoomView, Seat } from '../net';
import { LESSONS, TRAINING_TEXT } from '../content/training';
import { VOICE_CLIPS } from '../content/announcerVoice';
import { Announcer, calloutPriority } from './announcer';
import {
  DISCORD_SIGN_IN_MESSAGES,
  LOGIN_URL,
  checkSession,
  logOut,
  takeLoginMessage,
  unlinkAccount,
  type AuthState,
} from './auth';
import { Sfx, type SoundName } from './audio';
import {
  IN_DISCORD,
  MENU_PRESENCE,
  discordInstanceId,
  discordSignIn,
  matchPresence,
  openExternal,
  resultPresence,
  setDiscordPresence,
  trainingPresence,
} from './discord';
import { emptyTally, tallyEvents, type TeamTally } from './matchStats';
import { NetReadout, RateMeter } from './netReadout';
import { BYE_MESSAGES, OnlineSession, discordRoom, roomFromAddress, roomLink } from './online';
import { PadMenus } from './padMenus';
import { reportMailto } from './report';
import { AnnouncerVoice } from './voice';
import {
  controlsScreen,
  lobbyScreen,
  messageScreen,
  onlineMenuScreen,
  pauseScreen,
  reportScreen,
  resultsScreen,
  settingsScreen,
  spellsScreen,
  teamSelectScreen,
  titleScreen,
  trainingDoneScreen,
  trainingScreen,
  unlinkScreen,
  type TeamSelection,
} from './screens';
import { LessonCard, loadTrainingProgress, saveTrainingProgress } from './training';

const SELECTION_KEY = 'spellstick.selection';
/** Training: a finished lesson stays on screen this long before the next one starts (ms). */
const NEXT_LESSON_DELAY_MS = 1800;
/** How often the network readout refreshes (ms). */
const NET_READOUT_MS = 500;

/** Training: how often the lesson card checks which device you're on, for its button names (ms). */
const LESSON_DEVICE_CHECK_MS = 300;

/**
 * The menu flow (SPEC §9): title → team select → (controls card, first time) → match →
 * results → title. The title screen plays an AI-vs-AI match behind it. Also owns the
 * announcer, sound, pause (Esc), and mute (M). Menus also work on a gamepad (M8).
 */
export class App {
  private readonly root: HTMLElement;
  private readonly sfx = new Sfx();
  private readonly announcer: Announcer;
  private readonly voice = new AnnouncerVoice(this.sfx, VOICE_CLIPS);
  private readonly muteButton: HTMLButtonElement;
  private readonly config = makeConfig();
  private scene!: MatchScene;
  private current: HTMLElement | null = null;
  /** What B on a gamepad does on the current screen. */
  private backAction: (() => void) | null = null;
  private readonly padToast: HTMLElement;
  private padToastTimer = 0;
  private selection: TeamSelection;
  private tally: [TeamTally, TeamTally] = emptyTally();
  private inMatch = false;
  private seenControls = false;
  private auth: AuthState = { status: 'checking' };
  private onTitle = false;
  /** Training (M9): the lesson card, and the lesson running (an index into DRILLS), if any. */
  private readonly lessonCard: LessonCard;
  private lesson: number | null = null;
  /** Lessons finished in this browser. */
  private trainingDone = loadTrainingProgress(localStorageOrNull());
  private lessonTimer = 0;
  private lessonDeviceTimer = 0;
  /** When the current match started (ms since 1970), for the elapsed time on a Discord profile. */
  private matchStartedAt = 0;
  /** Online play (SPEC §11): the connection to a room, and what this screen is showing of it. */
  private online: OnlineSession | null = null;
  private onlineShowing: 'connecting' | 'lobby' | 'spells' | 'match' | 'menu' | 'results' | null = null;
  /** The room's match on screen (its number), and our side in it (null: watching). */
  private onlineMatch: { number: number; side: Seat | null } | null = null;
  private linkCopied = false;
  /** A `?room=` link opens the lobby once, right after login. */
  private roomLinkHandled = false;
  private lastRoomPhase: RoomView['phase'] | null = null;
  private reconnectNotice = false;
  /** The network readout (M12): N toggles it; it shows only in an online match. */
  private readonly netReadout: NetReadout;
  private readonly netRates = new RateMeter();
  private netOn = false;
  private netTimer = 0;

  constructor(private readonly game: Phaser.Game) {
    this.root = document.createElement('div');
    this.root.id = 'ui';
    document.body.append(this.root);
    this.announcer = new Announcer(this.root);
    this.lessonCard = new LessonCard(this.root);
    this.muteButton = document.createElement('button');
    this.muteButton.id = 'mute';
    this.muteButton.type = 'button';
    this.muteButton.addEventListener('click', () => this.toggleMute());
    this.root.append(this.muteButton);
    this.updateMuteLabel();
    this.selection = loadSelection();
    this.padToast = document.createElement('div');
    this.padToast.id = 'pad-toast';
    this.padToast.setAttribute('role', 'status');
    this.root.append(this.padToast);
    this.netReadout = new NetReadout(this.root);

    window.addEventListener('keydown', (e) => this.onKey(e));
    // The focus ring for pad navigation goes away once the mouse or keyboard is back.
    const offPad = () => document.body.classList.remove('pad-nav');
    window.addEventListener('pointermove', offPad);
    window.addEventListener('keydown', offPad);
    new PadMenus({
      screen: () => this.current,
      back: () => this.backAction,
      togglePause: () => this.togglePause(),
      toggleMute: () => this.toggleMute(),
      connected: () => this.notifyPad(),
    }).start();
    // Any click is a user gesture: wake the audio context.
    window.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    game.events.once(SCENE_EVENTS.ready, () => this.onSceneReady());
    void this.refreshAuth(takeLoginMessage());
    // Read-only handle for tests and the console: which announcer lines have recordings.
    (window as unknown as { __spellstickUi: unknown }).__spellstickUi = {
      voice: {
        recorded: this.voice.recordedIds,
        spoken: this.voice.spoken,
        speak: (id: string) => this.voice.speak(id, 99),
        preload: () => this.voice.preload(),
        shape: (id: string) => this.voice.shapeOf(id),
      },
    };
  }

  private onSceneReady(): void {
    this.scene = this.game.scene.getScene('match') as MatchScene;
    this.game.events.on(SCENE_EVENTS.simEvents, (events: SimEvent[], state: MatchState, setup: MatchSetup) =>
      this.onSimEvents(events, state, setup),
    );
    this.game.events.on(SCENE_EVENTS.matchOver, (state: MatchState, setup: MatchSetup) =>
      this.onMatchOver(state, setup),
    );
    this.game.events.on(SCENE_EVENTS.drill, (u: DrillUpdate) => this.onDrill(u));
    this.showTitle();
  }

  /** Shows a menu screen (or none). `back` is what B on a gamepad does there. */
  private show(node: HTMLElement | null, back: (() => void) | null = null): void {
    this.onTitle = node?.id === 'title';
    this.current?.remove();
    this.current = node;
    this.backAction = back;
    if (node) {
      this.root.append(node);
      // The main action first (Play, Start match, Resume), so A or Enter does the obvious thing.
      (node.querySelector<HTMLButtonElement>('.btn.primary') ?? node.querySelector('button'))?.focus();
    }
  }

  private click(fn: () => void): () => void {
    return () => {
      this.sfx.unlock();
      this.sfx.play('click');
      fn();
    };
  }

  showTitle(): void {
    this.leaveTraining();
    this.closeOnline();
    this.inMatch = false;
    this.announcer.clear();
    this.voice.stop();
    setDiscordPresence(MENU_PRESENCE);
    if (this.scene.matchSetup.mode !== 'demo') {
      this.scene.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    }
    this.show(
      titleScreen(
        {
          play: this.click(() => this.showTeamSelect()),
          online: this.click(() => this.openOnline()),
          training: this.click(() => this.showTraining()),
          login: this.click(() => window.location.assign(LOGIN_URL)),
          logout: this.click(() => void this.logout()),
          controls: this.click(() =>
            this.show(
              controlsScreen(
                this.click(() => this.showTitle()),
                'Back',
              ),
              this.click(() => this.showTitle()),
            ),
          ),
          settings: this.click(() => this.showSettings()),
          report: this.click(() => this.showReport(() => this.showTitle())),
        },
        this.auth,
        this.trainingDone.size === 0,
        IN_DISCORD,
      ),
    );
  }

  private showSettings(): void {
    const back = this.click(() => this.showTitle());
    this.show(
      settingsScreen(
        this.auth,
        {
          report: this.click(() => this.showReport(() => this.showSettings())),
          unlink: this.click(() => this.showUnlink()),
          back,
        },
        IN_DISCORD,
      ),
      back,
    );
  }

  /** Report a problem; `back` returns to wherever it was opened from. */
  private showReport(back: () => void): void {
    const reporter = this.auth.status === 'in' ? this.auth.user : null;
    this.show(
      reportScreen(reporter, {
        send: (category) => {
          this.sfx.play('click');
          openExternal(reportMailto(category, reporter));
        },
        back: this.click(back),
      }),
      this.click(back),
    );
  }

  private showUnlink(): void {
    const cancel = this.click(() => this.showSettings());
    this.show(
      unlinkScreen({
        confirm: async () => {
          if (!(await unlinkAccount())) return false;
          // A fresh load: nothing of the old session or settings stays in memory.
          window.location.assign('/?login=unlinked');
          return true;
        },
        cancel,
      }),
      cancel,
    );
  }

  /**
   * Asks the auth API who's logged in, then redraws the title if it's showing. Inside Discord,
   * waits for the sign-in at launch first (its cookie is what /api/auth/me then reads).
   */
  private async refreshAuth(message?: string): Promise<void> {
    const viaDiscord = await discordSignIn();
    if (viaDiscord && !viaDiscord.signedIn) {
      this.auth = { status: 'out', message: DISCORD_SIGN_IN_MESSAGES[viaDiscord.reason] };
      if (this.onTitle) this.showTitle();
      return;
    }
    this.auth = await checkSession(import.meta.env.DEV);
    if (message && this.auth.status === 'out') this.auth = { status: 'out', message };
    if (this.onTitle) this.showTitle();
    // Opened from a friend's room link: straight to that room's lobby.
    const canPlay = this.auth.status === 'in' || this.auth.status === 'dev';
    if (!this.roomLinkHandled && canPlay && roomFromAddress(window.location.search)) {
      this.roomLinkHandled = true;
      if (this.onTitle) this.openOnline();
    }
  }

  private async logout(): Promise<void> {
    await logOut();
    this.auth = { status: 'out' };
    if (this.onTitle) this.showTitle();
  }

  private showTeamSelect(): void {
    this.show(
      teamSelectScreen(this.selection, {
        back: this.click(() => this.showTitle()),
        start: (sel) => {
          this.sfx.unlock();
          this.sfx.play('click');
          this.selection = sel;
          saveSelection(sel);
          this.showSpells();
        },
      }),
      this.click(() => this.showTitle()),
    );
  }

  /** Choose your spells (M10), then the controls card before your first match, then the match. */
  private showSpells(): void {
    const back = this.click(() => this.showTeamSelect());
    this.show(
      spellsScreen(this.selection.spells, {
        back,
        start: (spells) => {
          this.sfx.unlock();
          this.sfx.play('click');
          this.selection = { ...this.selection, spells };
          saveSelection(this.selection);
          if (this.seenControls) this.startMatch();
          else {
            this.seenControls = true;
            this.show(
              controlsScreen(
                this.click(() => this.startMatch()),
                'Face off!',
              ),
              this.click(() => this.showSpells()),
            );
          }
        },
      }),
      back,
    );
  }

  private showTraining(): void {
    const back = this.click(() => this.showTitle());
    this.show(
      trainingScreen(
        {
          start: (lesson) => this.click(() => this.startLesson(lesson))(),
          back,
        },
        this.trainingDone,
      ),
      back,
    );
  }

  /** Training (M9): runs one lesson's drill; the next starts when it's done. */
  private startLesson(lesson: number): void {
    this.show(null);
    this.inMatch = true;
    this.lesson = lesson;
    window.clearTimeout(this.lessonTimer);
    this.announcer.clear();
    this.voice.stop();
    window.clearInterval(this.lessonDeviceTimer);
    this.lessonDeviceTimer = window.setInterval(
      () => this.lessonCard.setPad(this.scene.usingPad),
      LESSON_DEVICE_CHECK_MS,
    );
    // The drill reports its progress (and the card appears) as it starts.
    this.scene.startMatch({ ...this.selection, mode: 'training', drill: DRILLS[lesson] });
    setDiscordPresence(trainingPresence(LESSONS[DRILLS[lesson]!].title));
  }

  private onDrill(u: DrillUpdate): void {
    if (this.lesson === null) return;
    this.lessonCard.show(u, this.scene.usingPad);
    if (u.verdict?.kind === 'point') this.sfx.play('spell');
    if (u.points >= u.target) {
      this.trainingDone.add(u.drill);
      saveTrainingProgress(localStorageOrNull(), this.trainingDone);
      window.clearTimeout(this.lessonTimer);
      this.lessonTimer = window.setTimeout(() => this.nextLesson(), NEXT_LESSON_DELAY_MS);
    }
  }

  private nextLesson(): void {
    if (this.lesson === null) return;
    if (this.lesson + 1 < DRILLS.length) {
      this.startLesson(this.lesson + 1);
      return;
    }
    this.leaveTraining();
    this.inMatch = false;
    this.scene.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    setDiscordPresence(MENU_PRESENCE);
    this.show(
      trainingDoneScreen({
        play: this.click(() => this.showTeamSelect()),
        menu: this.click(() => this.showTitle()),
      }),
      this.click(() => this.showTitle()),
    );
  }

  private leaveTraining(): void {
    this.lesson = null;
    window.clearTimeout(this.lessonTimer);
    window.clearInterval(this.lessonDeviceTimer);
    this.lessonCard.hide();
  }

  private startMatch(): void {
    this.show(null);
    this.tally = emptyTally();
    this.inMatch = true;
    this.announcer.clear();
    this.voice.stop();
    void this.voice.preload(); // starting a match is a user gesture: audio is unlocked
    this.scene.startMatch({ ...this.selection, mode: 'play' });
    this.matchStartedAt = Date.now();
  }

  private pause(): void {
    if (!this.inMatch || this.scene.paused) return;
    this.scene.paused = true;
    this.voice.stop();
    this.showPause();
  }

  private showPause(): void {
    const training = this.lesson !== null;
    this.show(
      pauseScreen(
        {
          resume: this.click(() => this.resume()),
          controls: this.click(() =>
            this.show(
              controlsScreen(
                this.click(() => this.showPause()),
                'Back',
              ),
              this.click(() => this.showPause()),
            ),
          ),
          quit: this.click(() => this.showTitle()),
          skip: training
            ? this.click(() => {
                this.resume();
                this.nextLesson();
              })
            : undefined,
        },
        training ? TRAINING_TEXT.quit : undefined,
      ),
      this.click(() => this.resume()),
    );
  }

  private resume(): void {
    this.show(null);
    this.scene.paused = false;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.togglePause();
    else if (e.key === 'm' || e.key === 'M') this.toggleMute();
    else if (e.key === 'n' || e.key === 'N') this.toggleNetReadout();
  }

  /** N: the network readout on or off (M12). Kept until a reload; it shows in online matches only. */
  private toggleNetReadout(): void {
    this.netOn = !this.netOn;
    window.clearInterval(this.netTimer);
    this.netRates.reset();
    if (this.netOn) {
      this.refreshNetReadout();
      this.netTimer = window.setInterval(() => this.refreshNetReadout(), NET_READOUT_MS);
    } else {
      this.netReadout.show(false);
    }
  }

  private refreshNetReadout(): void {
    const o = this.online;
    const status = this.scene.onlineStatus;
    const inMatch = this.onlineShowing === 'match' || this.onlineShowing === 'menu';
    if (!o || !status || !inMatch) {
      this.netReadout.show(false);
      this.netRates.reset();
      return;
    }
    this.netRates.sample(performance.now(), o.snapsIn, o.bytesIn);
    this.netReadout.update({
      watching: status.side === null,
      rttMs: o.rttMs,
      rttAvgMs: o.rttAvgMs,
      aheadTicks: status.tick !== null && status.serverTick !== null ? status.tick - status.serverTick : null,
      slack: status.slack,
      targetSlack: this.config.online.inputSlackTicks,
      snapsPerSecond: this.netRates.snapsPerSecond,
      kbPerSecond: this.netRates.kbPerSecond,
      corrections: status.corrections,
      tickHz: this.config.tickHz,
    });
    this.netReadout.show(true);
  }

  /** Esc, or Start / Menu on a gamepad. Online there's no pause, only a menu (SPEC §11). */
  private togglePause(): void {
    if (this.onlineShowing === 'match') return this.showOnlineMenu();
    if (this.onlineShowing === 'menu') return this.resumeOnline();
    if (this.inMatch && !this.scene.paused) this.pause();
    else if (this.inMatch && this.scene.paused) this.resume();
  }

  /** Browsers only reveal a gamepad once a button is pressed; say we've got it. */
  private notifyPad(): void {
    this.padToast.textContent = 'Controller connected';
    this.padToast.classList.add('show');
    window.clearTimeout(this.padToastTimer);
    this.padToastTimer = window.setTimeout(() => this.padToast.classList.remove('show'), 2500);
  }

  private toggleMute(): void {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.isMuted);
    this.updateMuteLabel();
  }

  private updateMuteLabel(): void {
    const muted = this.sfx.isMuted;
    this.muteButton.textContent = muted ? 'Sound: off (M)' : 'Sound: on (M)';
    this.muteButton.setAttribute('aria-pressed', String(muted));
  }

  private onSimEvents(events: SimEvent[], state: MatchState, setup: MatchSetup): void {
    if (setup.mode === 'demo') return;
    for (const e of events) {
      const sound = SOUND_FOR[e.type];
      if (sound) this.sfx.play(sound);
    }
    // Training has sound (the faceoff whistle matters) but no stats or announcer.
    if (setup.mode !== 'play' && setup.mode !== 'online') return;
    if (IN_DISCORD) {
      const periods = this.config.match.periods;
      setDiscordPresence(
        matchPresence({ ...setup, score: state.score, period: state.period, periods }, this.matchStartedAt),
      );
    }
    tallyEvents(this.tally, events);
    // The player's side: home in single-player; online, their seat (watchers hear it from home).
    const callout = Announcer.classify(events, state, this.config, setup.online?.side ?? 0);
    if (callout) {
      const line = this.announcer.call(callout.kind);
      // The angry take when the moment favors the opponent; the regular take if there's no angry one.
      if (line) this.voice.speak([clipId(line.id, callout.side), line.id], calloutPriority(callout.kind));
    }
  }

  private onMatchOver(state: MatchState, setup: MatchSetup): void {
    this.inMatch = false;
    this.sfx.play('whistle');
    if (setup.mode === 'online') return this.onOnlineMatchOver(state);
    if (setup.mode === 'play') setDiscordPresence(resultPresence({ ...setup, score: state.score }));
    // Let the final goal/whistle land before the results come up.
    window.setTimeout(() => {
      this.show(
        resultsScreen(
          {
            home: setup.home,
            away: setup.away,
            score: [state.score[0], state.score[1]],
            overtime: state.period > this.config.match.periods,
            tally: this.tally,
          },
          {
            rematch: this.click(() => this.startMatch()),
            menu: this.click(() => this.showTitle()),
          },
        ),
      );
    }, 1200);
  }

  // ---- Online (SPEC §11) ----

  /**
   * Play online: inside Discord, the room everyone in this Activity shares; in a browser, the
   * room in the address (a friend's link), or a new one.
   */
  private openOnline(): void {
    this.closeOnline();
    const instance = IN_DISCORD ? discordInstanceId() : null;
    if (IN_DISCORD && !instance) return this.showOnlineEnded('lost');
    const room = instance ? discordRoom(instance) : roomFromAddress(window.location.search);
    this.linkCopied = false;
    this.online = new OnlineSession(room, {
      welcome: (_you, code) => {
        // The address becomes the room's link, so a reload comes back to it.
        if (!IN_DISCORD) window.history.replaceState(null, '', `/?room=${code}`);
        // Your saved spells (M13) go with you into the room; change them in the lobby.
        this.online?.send({ type: 'spells', spells: this.selection.spells });
      },
      room: (view) => this.onRoom(view),
      snapshot: (snap, slack) => {
        if (this.onlineMatch) this.scene.onlineSnapshot(snap, slack);
      },
      ended: (reason) => this.showOnlineEnded(reason),
      reconnecting: (on) => {
        this.reconnectNotice = on;
        this.toast(on ? ONLINE_TEXT.reconnecting : '', on ? 0 : 1);
      },
    });
    this.onlineShowing = 'connecting';
    const leave = this.click(() => this.leaveOnline());
    this.show(
      messageScreen(ONLINE_TEXT.title, ONLINE_TEXT.connecting, [
        { label: ONLINE_TEXT.leave, onClick: leave },
      ]),
      leave,
    );
  }

  /** The room changed: redraw the lobby, or go into a match that just started with us in a seat. */
  private onRoom(view: RoomView): void {
    const me = this.online?.you?.id;
    if (!me) return;
    const seat: Seat | null = view.seats[0] === me ? 0 : view.seats[1] === me ? 1 : null;
    const fresh = view.phase === 'match' && this.onlineMatch?.number !== view.matchNumber;
    const justStarted = fresh && this.lastRoomPhase === 'countdown';
    this.lastRoomPhase = view.phase;
    if (fresh && seat !== null && this.onlineShowing !== 'results') return this.startOnlineMatch(view, seat);
    // Watchers in the lobby go along when a match starts; joining mid-match, they choose.
    if (justStarted && this.onlineShowing === 'lobby') return this.startOnlineMatch(view, null);
    if (this.onlineShowing === 'connecting' || this.onlineShowing === 'lobby') this.showLobby();
  }

  private showLobby(): void {
    const o = this.online;
    if (!o?.view || !o.you) return;
    if (this.scene.matchSetup.mode !== 'demo') {
      this.scene.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    }
    this.inMatch = false;
    this.onlineShowing = 'lobby';
    this.onlineMatch = null;
    setDiscordPresence(MENU_PRESENCE);
    const link = IN_DISCORD ? null : roomLink(window.location.origin, o.view.code);
    const leave = this.click(() => this.leaveOnline());
    this.show(
      lobbyScreen(
        o.view,
        o.you.id,
        {
          seat: (seat) => this.click(() => o.send({ type: 'seat', seat }))(),
          ready: (ready) => this.click(() => o.send({ type: 'ready', ready }))(),
          spells: this.click(() => this.showOnlineSpells()),
          watch: this.click(() => o.view && this.startOnlineMatch(o.view, null)),
          copyLink: this.click(() => {
            if (!link) return;
            void navigator.clipboard?.writeText(link).then(
              () => {
                this.linkCopied = true;
                if (this.onlineShowing === 'lobby') this.showLobby();
              },
              () => {},
            );
          }),
          leave,
        },
        { link, copied: this.linkCopied },
      ),
      leave,
    );
  }

  /**
   * Pick your three spells in the lobby (M13): the same screen as single-player, saved with
   * your team choice so both modes remember the same three. The room keeps going meanwhile.
   */
  private showOnlineSpells(): void {
    const o = this.online;
    if (!o) return;
    this.onlineShowing = 'spells';
    const back = this.click(() => this.showLobby());
    this.show(
      spellsScreen(
        this.selection.spells,
        {
          back,
          start: (spells) => {
            this.sfx.play('click');
            this.selection = { ...this.selection, spells };
            saveSelection(this.selection);
            o.send({ type: 'spells', spells });
            this.showLobby();
          },
        },
        { note: ONLINE_TEXT.spellsNote, start: ONLINE_TEXT.spellsDone },
      ),
      back,
    );
  }

  /** Into the room's match: playing our seat, or watching (seat null). */
  private startOnlineMatch(view: RoomView, side: Seat | null): void {
    this.onlineMatch = { number: view.matchNumber, side };
    this.onlineShowing = 'match';
    this.show(null);
    this.tally = emptyTally();
    this.inMatch = true;
    this.announcer.clear();
    this.voice.stop();
    void this.voice.preload();
    this.scene.startMatch({
      home: DEFAULT_HOME,
      away: DEFAULT_AWAY,
      difficulty: 'normal',
      mode: 'online',
      online: { side, link: { sendInputs: (inputs) => this.online?.sendInputs(inputs) } },
    });
    this.matchStartedAt = Date.now();
  }

  private showOnlineMenu(): void {
    this.onlineShowing = 'menu';
    this.scene.paused = true; // online this only stops our controls; the match goes on
    const resume = this.click(() => this.resumeOnline());
    this.show(
      onlineMenuScreen({
        resume,
        controls: this.click(() =>
          this.show(
            controlsScreen(
              this.click(() => this.showOnlineMenu()),
              'Back',
            ),
            this.click(() => this.showOnlineMenu()),
          ),
        ),
        leave: this.click(() => this.leaveOnline()),
      }),
      resume,
    );
  }

  private resumeOnline(): void {
    this.onlineShowing = 'match';
    this.scene.paused = false;
    this.show(null);
  }

  private onOnlineMatchOver(state: MatchState): void {
    const o = this.online;
    const view = o?.view;
    const name = (id: string | null) => view?.members.find((m) => m.id === id)?.name ?? null;
    const players: [string | null, string | null] = view
      ? [name(view.seats[0]), name(view.seats[1])]
      : [null, null];
    const mySide = this.onlineMatch?.side ?? null;
    window.setTimeout(() => {
      if (this.online !== o || this.onlineShowing !== 'match') return;
      this.scene.paused = false;
      this.onlineShowing = 'results';
      this.show(
        resultsScreen(
          {
            home: DEFAULT_HOME,
            away: DEFAULT_AWAY,
            score: [state.score[0], state.score[1]],
            overtime: state.period > this.config.match.periods,
            tally: this.tally,
          },
          { rematch: this.click(() => this.showLobby()), menu: this.click(() => this.leaveOnline()) },
          { mySide, players },
        ),
      );
    }, 1200);
  }

  private showOnlineEnded(reason: keyof typeof BYE_MESSAGES): void {
    this.closeOnline();
    if (this.scene.matchSetup.mode !== 'demo') {
      this.scene.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    }
    this.inMatch = false;
    const back = this.click(() => this.showTitle());
    const buttons: { label: string; onClick(): void; primary: boolean }[] = [
      { label: ONLINE_TEXT.backToTitle, onClick: back, primary: true },
    ];
    if (reason === 'lost' || reason === 'server') {
      buttons.push({
        label: ONLINE_TEXT.tryAgain,
        onClick: this.click(() => this.openOnline()),
        primary: false,
      });
    }
    this.show(messageScreen(ONLINE_TEXT.ended, BYE_MESSAGES[reason], buttons), back);
  }

  /** Leaves the room for good and goes back to the title. */
  private leaveOnline(): void {
    this.closeOnline();
    if (!IN_DISCORD && roomFromAddress(window.location.search)) window.history.replaceState(null, '', '/');
    this.showTitle();
  }

  private closeOnline(): void {
    this.online?.close();
    this.online = null;
    this.onlineShowing = null;
    this.onlineMatch = null;
    this.lastRoomPhase = null;
    this.scene.paused = false;
    if (this.reconnectNotice) this.toast('', 1);
    this.reconnectNotice = false;
  }

  /** A short notice at the bottom (shared with "Controller connected"); `ms` 0 keeps it up. */
  private toast(text: string, ms: number): void {
    window.clearTimeout(this.padToastTimer);
    if (text) {
      this.padToast.textContent = text;
      this.padToast.classList.add('show');
    }
    if (ms > 0) this.padToastTimer = window.setTimeout(() => this.padToast.classList.remove('show'), ms);
  }
}

const SOUND_FOR: Partial<Record<SimEvent['type'], SoundName>> = {
  check: 'hit',
  boardSlam: 'hit',
  hexShove: 'hit',
  pass: 'pass',
  shot: 'shot',
  goal: 'goal',
  whistle: 'whistle',
  periodEnd: 'whistle',
  cast: 'spell',
};

/** The browser's localStorage, or a stand-in that remembers nothing if storage is blocked. */
function localStorageOrNull(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
}

function loadSelection(): TeamSelection {
  const fallback: TeamSelection = {
    home: DEFAULT_HOME,
    away: DEFAULT_AWAY,
    difficulty: 'normal',
    spells: [...DEFAULT_LOADOUT],
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null') as Partial<TeamSelection> | null;
    const isTeam = (t: unknown): t is TeamId => typeof t === 'string' && t in TEAMS;
    const isDiff = (d: unknown): d is Difficulty => d === 'easy' || d === 'normal' || d === 'hard';
    if (raw && isTeam(raw.home) && isTeam(raw.away) && raw.home !== raw.away && isDiff(raw.difficulty)) {
      // Spells came in M10: a choice saved before then keeps its teams and gets the starting three.
      const spells = isLoadout(raw.spells) ? raw.spells : fallback.spells;
      return { home: raw.home, away: raw.away, difficulty: raw.difficulty, spells };
    }
  } catch {
    // No storage, or junk in it: use the defaults.
  }
  return fallback;
}

function saveSelection(sel: TeamSelection): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(sel));
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}
