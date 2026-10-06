import type { MatchState, SimConfig, Vec2 } from '../src/sim';

/**
 * Flags players who barely move for too long during live play (SPEC §7: that's a bug).
 * One incident per `stuckSeconds` window a player stays within `stuckRadius` of where it started.
 */
export class StuckTracker {
  incidents = 0;
  private anchors: Vec2[] = [];
  private since: number[] = [];

  constructor(private readonly config: SimConfig) {}

  observe(state: Readonly<MatchState>): void {
    const { stuckSeconds, stuckRadius } = this.config.diagnostics;
    const limit = Math.round(stuckSeconds * this.config.tickHz);
    for (const p of state.players) {
      const anchor = this.anchors[p.id];
      if (
        state.phase !== 'live' ||
        !anchor ||
        Math.hypot(p.pos.x - anchor.x, p.pos.y - anchor.y) > stuckRadius
      ) {
        this.reset(p.id, p.pos, state.tick);
      } else if (state.tick - (this.since[p.id] ?? state.tick) > limit) {
        this.incidents++;
        this.reset(p.id, p.pos, state.tick);
      }
    }
  }

  private reset(id: number, pos: Vec2, tick: number): void {
    this.anchors[id] = { x: pos.x, y: pos.y };
    this.since[id] = tick;
  }
}
