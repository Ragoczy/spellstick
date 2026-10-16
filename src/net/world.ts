import {
  createMatch,
  followPlay,
  matchRoster,
  secondsToTicks,
  startingControl,
  stepMatch,
  switchControl,
  type InputCommand,
  type MatchState,
  type RunnerSpell,
  type SimConfig,
  type SimEvent,
} from '../sim';
import { toCommand, type SideInput } from './protocol';

const SIDES = [0, 1] as const;

/**
 * An online match (SPEC §11): the sim's match plus what online play adds around it. The
 * server and every screen step this with the same function, so a screen that knows the
 * server's inputs arrives at the server's state exactly. JSON-serializable.
 */
export interface OnlineWorld {
  /** Network ticks: one per server step, including the ticks a goal replay holds the match. */
  tick: number;
  match: MatchState;
  /** The witch each side's person controls (SPEC §5), kept even while the AI has that side. */
  control: [number, number];
  /** Whether a connected person has each side; otherwise the AI plays it all. */
  humans: [boolean, boolean];
  /** A goal replay coming up or showing; the match waits while it shows. */
  replay: ReplayHold | null;
}

export interface ReplayHold {
  /** The match tick of the goal. */
  goalTick: number;
  /** Ticks until the replay cuts in (the goal plays out live first). */
  startsIn: number;
  /** Ticks the match still waits, once it's showing. */
  ticksLeft: number;
  /** Which sides' people have asked to skip it. */
  skipped: [boolean, boolean];
}

/** `loadouts`: each side's three spells (M13); the starting three if left out. */
export function createWorld(
  config: SimConfig,
  seed: number,
  humans: [boolean, boolean],
  loadouts?: readonly [readonly RunnerSpell[], readonly RunnerSpell[]],
): OnlineWorld {
  const match = createMatch(config, seed, matchRoster(config), { start: 'faceoff', loadouts });
  return {
    tick: 0,
    match,
    control: [startingControl(match, 0), startingControl(match, 1)],
    humans: [humans[0], humans[1]],
    replay: null,
  };
}

/** True while a goal replay is on screen and the match is waiting. */
export function replayShowing(world: Readonly<OnlineWorld>): boolean {
  return world.replay !== null && world.replay.startsIn <= 0;
}

export interface WorldStep {
  /** What happened this tick. */
  events: SimEvent[];
  /** The command every witch got (empty while a replay holds the match). */
  inputs: InputCommand[];
}

/**
 * Advances the world one network tick. `sides[team]` is that side's person's controls this
 * tick, or undefined for no person (the AI plays the side). `other(id)` gives the command for
 * every witch no person is controlling. Mutates `world`.
 */
export function stepWorld(
  world: OnlineWorld,
  sides: readonly (SideInput | null | undefined)[],
  other: (playerId: number) => InputCommand,
  config: SimConfig,
): WorldStep {
  world.tick++;
  const r = world.replay;
  if (r) {
    if (r.startsIn > 0) {
      r.startsIn--; // the goal plays out live first
    } else {
      for (const t of SIDES) if (sides[t]?.skipReplay) r.skipped[t] = true;
      r.ticksLeft--;
      // Skipped by every person playing (with nobody playing, it runs out for the watchers).
      const people = SIDES.filter((t) => world.humans[t]);
      const skipped = people.length > 0 && people.every((t) => r.skipped[t]);
      if (r.ticksLeft <= 0 || skipped) world.replay = null;
      world.match.events = [];
      return { events: [], inputs: [] };
    }
  }

  const m = world.match;
  for (const t of SIDES) {
    if (sides[t]?.switchPlayer) world.control[t] = switchControl(m, t, world.control[t]);
  }
  const inputs = m.players.map((p) => {
    const side = sides[p.team];
    return side && p.id === world.control[p.team] ? toCommand(side) : other(p.id);
  });
  stepMatch(m, inputs, config);
  for (const t of SIDES) world.control[t] = followPlay(m, t, world.control[t]);
  for (const e of m.events) {
    if (e.type === 'goal') {
      world.replay = {
        goalTick: m.tick,
        startsIn: secondsToTicks(config.online.replayDelaySeconds, config),
        ticksLeft: secondsToTicks(config.online.replayHoldSeconds, config),
        skipped: [false, false],
      };
    }
  }
  return { events: m.events, inputs };
}
