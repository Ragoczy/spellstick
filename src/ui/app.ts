import type Phaser from 'phaser';
import { DEFAULT_AWAY, DEFAULT_HOME, TEAMS, type TeamId } from '../content/teams';
import { MatchScene, SCENE_EVENTS, type MatchSetup } from '../render/MatchScene';
import { makeConfig, type Difficulty, type MatchState, type SimEvent } from '../sim';
import { Announcer } from './announcer';
import { Sfx, type SoundName } from './audio';
import { emptyTally, tallyEvents, type TeamTally } from './matchStats';
import {
  controlsScreen,
  pauseScreen,
  resultsScreen,
  teamSelectScreen,
  titleScreen,
  type TeamSelection,
} from './screens';

const SELECTION_KEY = 'spellstick.selection';

/**
 * The menu flow (SPEC §9): title → team select → (controls card, first time) → match →
 * results → title. The title screen plays an AI-vs-AI match behind it. Also owns the
 * announcer, sound, pause (Esc), and mute (M).
 */
export class App {
  private readonly root: HTMLElement;
  private readonly sfx = new Sfx();
  private readonly announcer: Announcer;
  private readonly muteButton: HTMLButtonElement;
  private readonly config = makeConfig();
  private scene!: MatchScene;
  private current: HTMLElement | null = null;
  private selection: TeamSelection;
  private tally: [TeamTally, TeamTally] = emptyTally();
  private inMatch = false;
  private seenControls = false;

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

    window.addEventListener('keydown', (e) => this.onKey(e));
    // Any click is a user gesture: wake the audio context.
    window.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    game.events.once(SCENE_EVENTS.ready, () => this.onSceneReady());
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

  private show(node: HTMLElement | null): void {
    this.current?.remove();
    this.current = node;
    if (node) {
      this.root.append(node);
      node.querySelector<HTMLButtonElement>('.btn.primary, button')?.focus();
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
    if (this.scene.matchSetup.mode !== 'demo') {
      this.scene.startMatch({ home: DEFAULT_HOME, away: DEFAULT_AWAY, difficulty: 'normal', mode: 'demo' });
    }
    this.show(
      titleScreen({
        play: this.click(() => this.showTeamSelect()),
        controls: this.click(() =>
          this.show(
            controlsScreen(
              this.click(() => this.showTitle()),
              'Back',
            ),
          ),
        ),
      }),
    );
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
            );
          }
        },
      }),
    );
  }

  private startMatch(): void {
    this.show(null);
    this.tally = emptyTally();
    this.inMatch = true;
    this.announcer.clear();
    this.scene.startMatch({ ...this.selection, mode: 'play' });
  }

  private pause(): void {
    if (!this.inMatch || this.scene.paused) return;
    this.scene.paused = true;
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
          ),
        ),
        quit: this.click(() => this.showTitle()),
      }),
    );
  }

  private resume(): void {
    this.show(null);
    this.scene.paused = false;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.inMatch && !this.scene.paused) this.pause();
      else if (this.inMatch && this.scene.paused) this.resume();
    } else if (e.key === 'm' || e.key === 'M') {
      this.toggleMute();
    }
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
    const kind = Announcer.classify(events, state, this.config);
    if (kind) this.announcer.call(kind);
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
