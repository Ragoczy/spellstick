import type Phaser from 'phaser';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS, type TeamId } from '../content/teams';
import { MatchScene, SCENE_EVENTS, type MatchSetup } from '../render/MatchScene';
import { makeConfig, type Difficulty, type MatchState, type SimEvent } from '../sim';
import { clipId } from '../content/announcer';
import { VOICE_CLIPS } from '../content/announcerVoice';
import { Announcer, calloutPriority } from './announcer';
import { LOGIN_URL, checkSession, logOut, takeLoginMessage, unlinkAccount, type AuthState } from './auth';
import { Sfx, type SoundName } from './audio';
import { emptyTally, tallyEvents, type TeamTally } from './matchStats';
import { PadMenus } from './padMenus';
import { reportMailto } from './report';
import { AnnouncerVoice } from './voice';
import {
  controlsScreen,
  pauseScreen,
  reportScreen,
  resultsScreen,
  settingsScreen,
  teamSelectScreen,
  titleScreen,
  unlinkScreen,
  type TeamSelection,
} from './screens';

const SELECTION_KEY = 'spellstick.selection';

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

  constructor(private readonly game: Phaser.Game) {
    this.root = document.createElement('div');
    this.root.id = 'ui';
    document.body.append(this.root);
    this.announcer = new Announcer(this.root);
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
    this.inMatch = false;
    this.announcer.clear();
    this.voice.stop();
    if (this.scene.matchSetup.mode !== 'demo') {
      this.scene.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    }
    this.show(
      titleScreen(
        {
          play: this.click(() => this.showTeamSelect()),
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
      ),
    );
  }

  private showSettings(): void {
    const back = this.click(() => this.showTitle());
    this.show(
      settingsScreen(this.auth, {
        report: this.click(() => this.showReport(() => this.showSettings())),
        unlink: this.click(() => this.showUnlink()),
        back,
      }),
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
          window.location.href = reportMailto(category, reporter);
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

  /** Asks the auth API who's logged in, then redraws the title if it's showing. */
  private async refreshAuth(message?: string): Promise<void> {
    this.auth = await checkSession(import.meta.env.DEV);
    if (message && this.auth.status === 'out') this.auth = { status: 'out', message };
    if (this.onTitle) this.showTitle();
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
          if (this.seenControls) this.startMatch();
          else {
            this.seenControls = true;
            this.show(
              controlsScreen(
                this.click(() => this.startMatch()),
                'Face off!',
              ),
              this.click(() => this.showTeamSelect()),
            );
          }
        },
      }),
      this.click(() => this.showTitle()),
    );
  }

  private startMatch(): void {
    this.show(null);
    this.tally = emptyTally();
    this.inMatch = true;
    this.announcer.clear();
    this.voice.stop();
    void this.voice.preload(); // starting a match is a user gesture: audio is unlocked
    this.scene.startMatch({ ...this.selection, mode: 'play' });
  }

  private pause(): void {
    if (!this.inMatch || this.scene.paused) return;
    this.scene.paused = true;
    this.voice.stop();
    this.showPause();
  }

  private showPause(): void {
    this.show(
      pauseScreen({
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
      }),
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
  }

  /** Esc, or Start / Menu on a gamepad. */
  private togglePause(): void {
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
    if (setup.mode !== 'play') return;
    tallyEvents(this.tally, events);
    for (const e of events) {
      const sound = SOUND_FOR[e.type];
      if (sound) this.sfx.play(sound);
    }
    // The player is always the home side (team 0).
    const callout = Announcer.classify(events, state, this.config, 0);
    if (callout) {
      const line = this.announcer.call(callout.kind);
      // The angry take when the moment favors the opponent; the regular take if there's no angry one.
      if (line) this.voice.speak([clipId(line.id, callout.side), line.id], calloutPriority(callout.kind));
    }
  }

  private onMatchOver(state: MatchState, setup: MatchSetup): void {
    this.inMatch = false;
    this.sfx.play('whistle');
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

function loadSelection(): TeamSelection {
  const fallback: TeamSelection = { home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal' };
  try {
    const raw = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null') as Partial<TeamSelection> | null;
    const isTeam = (t: unknown): t is TeamId => typeof t === 'string' && t in TEAMS;
    const isDiff = (d: unknown): d is Difficulty => d === 'easy' || d === 'normal' || d === 'hard';
    if (raw && isTeam(raw.home) && isTeam(raw.away) && raw.home !== raw.away && isDiff(raw.difficulty)) {
      return { home: raw.home, away: raw.away, difficulty: raw.difficulty };
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
