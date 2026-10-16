import type { AchievementId } from '../content/badges';
import {
  SPELL_POOL,
  isLoadout,
  type InputCommand,
  type RunnerSpell,
  type SimEvent,
  type SpellId,
  type TeamIndex,
} from '../sim';
import type { OnlineWorld } from './world';

/**
 * Online play (SPEC §11): the messages between a screen and the server, as JSON over a
 * WebSocket at /api/online. Bump PROTOCOL_VERSION whenever a message changes shape, so an
 * old page open in someone's browser is told to reload rather than misbehaving.
 */
export const PROTOCOL_VERSION = 3;

/**
 * Where the game's page connects: `?room=<code>&v=<PROTOCOL_VERSION>`. The room is a browser
 * room code or `d-<Discord instance id>`; with no room, the server makes a new browser room.
 */
export const ONLINE_PATH = '/api/online';

/** One tick of one person's controls, for the witch they control on their side. */
export interface SideInput {
  /** The tick these controls are for. */
  t: number;
  move: { x: number; y: number };
  aim: { x: number; y: number };
  /** The pass/shoot button is held. */
  primary?: boolean;
  /** Edge-triggered, like InputCommand. */
  check?: boolean;
  cast?: SpellId;
  /** Space (SPEC §5): switch witch. */
  switchPlayer?: boolean;
  /** Skip the goal replay showing. */
  skipReplay?: boolean;
}

export type Seat = TeamIndex;

export type ClientMessage =
  | { type: 'seat'; seat: Seat | null }
  | { type: 'ready'; ready: boolean }
  /** Your three spells (M13), in Q / E / R order: sent on joining and when you change them in the lobby. */
  | { type: 'spells'; spells: RunnerSpell[] }
  | { type: 'input'; inputs: SideInput[] }
  | { type: 'ping'; id: number };

export interface MemberView {
  id: string;
  name: string;
  avatarUrl: string;
  ready: boolean;
  /** Connected right now (a seated player who dropped mid-match shows false). */
  online: boolean;
  /**
   * Their three spells (M13), which their team carries if they play: sent only to that person
   * (null for everyone else). Picks stay hidden until cast (Paul, 2026-10-16).
   */
  spells: RunnerSpell[] | null;
}

export interface ResultView {
  score: [number, number];
  overtime: boolean;
  /** Who sat in each seat (names). */
  players: [string | null, string | null];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'countdown' | 'match';
  members: MemberView[];
  /** User ids in the home (0) and away (1) seats. */
  seats: [string | null, string | null];
  /** Countdown: seconds left before the faceoff. */
  countdown: number;
  /** Increases with every match started in this room. */
  matchNumber: number;
  lastResult: ResultView | null;
}

/** The match as the server has it, every `config.online.snapshotEveryTicks` ticks. */
export interface Snapshot {
  world: OnlineWorld;
  /** Everything that happened since the last snapshot, oldest first (sounds, callouts, stats). */
  events: SimEvent[];
  /** What every witch was told to do on the last tick, for screens to carry forward. */
  inputs: InputCommand[];
}

export type ServerMessage =
  | { type: 'welcome'; you: { id: string; name: string }; room: string }
  | { type: 'room'; room: RoomView }
  /**
   * `slack`: how many ticks early your latest controls arrived, measured since the last
   * snapshot (null for watchers, and when none arrived since).
   */
  | { type: 'snap'; snap: Snapshot; slack: number | null }
  | { type: 'pong'; id: number }
  /**
   * Your achievements from the match that just ended (M14), once the server has saved them:
   * what's newly unlocked, your tier (0–5), and whether that's a promotion. Only sent when a
   * match counted for you. Older pages ignore it.
   */
  | { type: 'badges'; unlocked: AchievementId[]; tier: number; promoted: boolean }
  | { type: 'bye'; reason: ByeReason };

export type ByeReason = 'replaced' | 'version' | 'bad-room' | 'unauthenticated' | 'too-fast' | 'server';

/** Inputs per message, at most (a screen sends one or two per frame). */
const MAX_INPUTS = 16;
/** Coordinates beyond this (m) are nonsense; the rink is about 40 × 20. */
const MAX_COORD = 200;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, limit: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit ? v : null;

function vec(v: unknown, limit: number): { x: number; y: number } | null {
  if (!isObj(v)) return null;
  const x = num(v.x, limit);
  const y = num(v.y, limit);
  return x === null || y === null ? null : { x, y };
}

/** A SideInput from untrusted JSON, or null if it's malformed. */
export function parseSideInput(v: unknown): SideInput | null {
  if (!isObj(v)) return null;
  const t = num(v.t, Number.MAX_SAFE_INTEGER);
  const move = vec(v.move, 2);
  const aim = vec(v.aim, MAX_COORD);
  if (t === null || !Number.isInteger(t) || t < 0 || !move || !aim) return null;
  const out: SideInput = { t, move, aim };
  if (v.primary === true) out.primary = true;
  if (v.check === true) out.check = true;
  if (v.switchPlayer === true) out.switchPlayer = true;
  if (v.skipReplay === true) out.skipReplay = true;
  if (v.cast !== undefined) {
    // Any of the ten runner spells (M10); the sim only casts one the player carries.
    if (!(SPELL_POOL as readonly unknown[]).includes(v.cast)) return null;
    out.cast = v.cast as SpellId;
  }
  return out;
}

/** A message from a screen, or null if it isn't one we understand. Never throws. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'seat':
      return v.seat === 0 || v.seat === 1 || v.seat === null ? { type: 'seat', seat: v.seat } : null;
    case 'ready':
      return typeof v.ready === 'boolean' ? { type: 'ready', ready: v.ready } : null;
    case 'spells':
      return isLoadout(v.spells) ? { type: 'spells', spells: [...v.spells] } : null;
    case 'ping': {
      const id = num(v.id, Number.MAX_SAFE_INTEGER);
      return id === null ? null : { type: 'ping', id };
    }
    case 'input': {
      if (!Array.isArray(v.inputs) || v.inputs.length > MAX_INPUTS) return null;
      const inputs: SideInput[] = [];
      for (const i of v.inputs) {
        const parsed = parseSideInput(i);
        if (!parsed) return null;
        inputs.push(parsed);
      }
      return { type: 'input', inputs };
    }
    default:
      return null;
  }
}

/** A browser room code: six lowercase letters and digits. */
export const BROWSER_ROOM_RE = /^[a-z0-9]{6}$/;
/** A Discord Activity's room: `d-` and the instance id Discord gives the Activity. */
export const DISCORD_ROOM_RE = /^d-[A-Za-z0-9_-]{1,100}$/;

export function isRoomCode(code: string): boolean {
  return BROWSER_ROOM_RE.test(code) || DISCORD_ROOM_RE.test(code);
}

/** The sim command for a person's SideInput. */
export function toCommand(input: SideInput): InputCommand {
  const cmd: InputCommand = { move: input.move, aim: input.aim };
  if (input.primary) cmd.primary = true;
  if (input.check) cmd.check = true;
  if (input.cast) cmd.cast = input.cast;
  return cmd;
}

/** A command with its one-tick presses taken out: what carrying it forward to the next tick looks like. */
export function heldOnly(cmd: InputCommand): InputCommand {
  const held: InputCommand = { move: cmd.move, aim: cmd.aim };
  if (cmd.primary) held.primary = true;
  return held;
}
