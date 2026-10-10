import { ANNOUNCER, type AnnouncerLine, type CalloutKind, type CalloutSide } from '../content/announcer';
import type { MatchState, SimConfig, SimEvent, TeamIndex } from '../sim';

/** A callout to make, and whether the moment favors the player's team. */
export interface Callout {
  kind: CalloutKind;
  side: CalloutSide;
}

/** Most important first: a goal call can interrupt anything. */
const PRIORITY: Record<CalloutKind, number> = {
  overtimeWinner: 5,
  goal: 4,
  wardBlock: 3,
  crease: 3,
  shotClock: 3,
  save: 2,
  pileup: 2,
  bigHit: 1,
  turnover: 1,
};

/** How much a callout matters: higher ones interrupt lower ones (text and voice). */
export const calloutPriority = (kind: CalloutKind): number => PRIORITY[kind];

const SHOW_MS = 1600;
/** Minimum gap between callouts unless a more important one comes along. */
const GAP_MS = 1100;
/** Players this close to a hit make it a pile-up ("third-witch in"). */
const PILEUP_RADIUS = 3;

/**
 * The announcer (SPEC §8): picks a line for notable sim events and shows it in the lower
 * third. Lines rotate so the same one doesn't repeat back to back. `call` returns the
 * line it showed, so the voice (src/ui/voice.ts) can speak the same one.
 */
export class Announcer {
  private readonly el: HTMLElement;
  private next = new Map<CalloutKind, number>();
  private shownAt = -Infinity;
  private shownPriority = 0;
  private hideTimer: number | undefined;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'announcer';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    root.append(this.el);
  }

  /**
   * Which callout (if any) a tick's events deserve, and whose side it's on: `for` when the
   * moment favors `humanTeam` (the player's side), `against` when it favors the opponent.
   */
  static classify(
    events: readonly SimEvent[],
    state: MatchState,
    config: SimConfig,
    humanTeam: TeamIndex = 0,
  ): Callout | null {
    let best: Callout | null = null;
    const consider = (kind: CalloutKind, favoredTeam: TeamIndex) => {
      if (!best || PRIORITY[kind] > PRIORITY[best.kind]) {
        best = { kind, side: favoredTeam === humanTeam ? 'for' : 'against' };
      }
    };
    const other = (t: TeamIndex): TeamIndex => (t === 0 ? 1 : 0);
    for (const e of events) {
      switch (e.type) {
        case 'goal':
          consider(state.period > config.match.periods ? 'overtimeWinner' : 'goal', e.team);
          break;
        case 'save':
          consider('save', e.team); // the goalie's team
          break;
        case 'wardBlock':
          consider('wardBlock', e.team);
          break;
        case 'goalDisallowed':
        case 'creaseViolation':
          consider('crease', other(e.team)); // e.team broke the rule
          break;
        case 'shotClockViolation':
          consider('shotClock', other(e.team));
          break;
        case 'boardSlam':
          consider('bigHit', other(state.players[e.playerId]!.team)); // e.playerId got slammed
          break;
        case 'check': {
          const t = state.players[e.targetId]!;
          const crowd = state.players.filter(
            (p) => p.role === 'runner' && Math.hypot(p.pos.x - t.pos.x, p.pos.y - t.pos.y) < PILEUP_RADIUS,
          ).length;
          if (crowd >= 4) consider('pileup', e.team);
          else if (e.loosened) consider('bigHit', e.team);
          break;
        }
        case 'hexShove':
          if (e.loosened) consider('turnover', state.players[e.playerId]!.team);
          break;
        case 'catch':
          if (e.intercepted) consider('turnover', e.team);
          break;
      }
    }
    return best;
  }

  /** Shows a line for `kind` unless something as important is still up. Returns the line, or null. */
  call(kind: CalloutKind): AnnouncerLine | null {
    const now = performance.now();
    const busy = now - this.shownAt < GAP_MS;
    if (busy && PRIORITY[kind] <= this.shownPriority) return null;
    const lines = ANNOUNCER[kind];
    const i = this.next.get(kind) ?? 0;
    this.next.set(kind, (i + 1) % lines.length);
    const line = lines[i]!;
    this.el.textContent = line.text;
    this.el.classList.remove('show');
    void this.el.offsetWidth; // restart the pop animation
    this.el.classList.add('show');
    this.shownAt = now;
    this.shownPriority = PRIORITY[kind];
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.el.classList.remove('show');
      this.shownPriority = 0;
    }, SHOW_MS);
    return line;
  }

  clear(): void {
    window.clearTimeout(this.hideTimer);
    this.el.classList.remove('show');
    this.shownPriority = 0;
  }

  /** The current line, for tests. */
  get text(): string {
    return this.el.classList.contains('show') ? (this.el.textContent ?? '') : '';
  }
}
