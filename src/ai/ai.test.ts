import { describe, expect, it } from 'vitest';
import {
  arenaGeometry,
  createMatch,
  makeConfig,
  matchRoster,
  practiceRoster,
  stepMatch,
  type InputCommand,
  type MatchState,
  type SimConfig,
} from '../sim';
import { createGoalieAI } from './goalie';
import { defensiveAssignments } from './tactics';
import { createTeamControllers } from './team';

const config = makeConfig();
const goal = arenaGeometry(config).goals[1];
const level = config.ai.levels.normal;
const secs = (s: number) => Math.round(s * config.tickHz);

/** A shooter (id 0) vs the AI goalie (id 1). */
/** A shooter vs the AI goalie. Ward is on cooldown unless `ward`, to measure plain saves. */
function shooterVsGoalie(shooterPos: { x: number; y: number }, seed: number, ward = false) {
  const state = createMatch(config, seed, [
    { team: 0, number: 7, pos: shooterPos },
    { team: 1, number: 1, pos: { x: goal.mouth.x - 1, y: 0 }, role: 'goalie' },
  ]);
  state.ball.carrier = 0;
  if (!ward) state.players[1]!.spellCooldowns.ward = 1e9;
  return { state, goalie: createGoalieAI(config, level) };
}

function step(state: MatchState, shooter: InputCommand, goalieAI: ReturnType<typeof createGoalieAI>) {
  stepMatch(state, [shooter, goalieAI.decide(state, 1)], config);
}

/**
 * Scripted "human" shot: settle for half a second so the goalie sets, then wind up and
 * fire at `aim`. Returns true on a goal.
 */
function attempt(
  shooterPos: { x: number; y: number },
  aim: { x: number; y: number },
  holdTicks: number,
  seed: number,
) {
  const { state, goalie } = shooterVsGoalie(shooterPos, seed);
  for (let i = 0; i < 30; i++) step(state, { move: { x: 0, y: 0 }, aim }, goalie);
  for (let i = 0; i < holdTicks; i++) step(state, { move: { x: 0, y: 0 }, aim, primary: true }, goalie);
  for (let i = 0; i < 90 && state.phase === 'live'; i++) step(state, { move: { x: 0, y: 0 }, aim }, goalie);
  return state.score[0] > 0;
}

const rate = (f: (seed: number) => boolean, n = 300) => {
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) if (f(seed)) hits++;
  return hits / n;
};

describe('AI goalie', () => {
  it('moves toward the line of an incoming shot after its reaction time', () => {
    const { state, goalie } = shooterVsGoalie({ x: 12, y: 0 }, 1);
    const aim = { x: goal.mouth.x, y: goal.width / 2 - 0.2 };
    for (let i = 0; i < 30; i++) step(state, { move: { x: 0, y: 0 }, aim }, goalie);
    const y0 = state.players[1]!.pos.y;
    for (let i = 0; i < 50; i++) step(state, { move: { x: 0, y: 0 }, aim, primary: true }, goalie);
    step(state, { move: { x: 0, y: 0 }, aim }, goalie);
    for (let i = 0; i < secs(level.goalieReactionSeconds) + 6 && state.ball.flight; i++) {
      step(state, { move: { x: 0, y: 0 }, aim }, goalie);
    }
    // The shot is heading for +y; the goalie should have shifted that way.
    expect(state.players[1]!.pos.y).toBeGreaterThan(y0);
  });

  it('raises the Ward against a hard, close, on-target shot', () => {
    const { state, goalie } = shooterVsGoalie({ x: goal.mouth.x - 6, y: 0 }, 1, true);
    const aim = { x: goal.mouth.x, y: goal.width / 2 - 0.25 };
    let warded = false;
    for (let i = 0; i < 70; i++) step(state, { move: { x: 0, y: 0 }, aim, primary: true }, goalie);
    for (let i = 0; i < 40 && state.phase === 'live'; i++) {
      step(state, { move: { x: 0, y: 0 }, aim }, goalie);
      if (state.events.some((e) => e.type === 'cast' && e.spell === 'ward')) warded = true;
    }
    expect(warded).toBe(true);
  });

  it('clears the ball after holding it', () => {
    const { state, goalie } = shooterVsGoalie({ x: 0, y: 0 }, 1);
    state.ball.carrier = 1;
    let released = false;
    for (let i = 0; i < secs(config.ai.goalie.holdSeconds) + 5; i++) {
      step(state, { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }, goalie);
      if (state.ball.carrier !== 1) released = true;
    }
    expect(released).toBe(true);
  });

  it('a well-placed hard shot from ~9 m scores at a sensible rate', () => {
    const corner = { x: goal.mouth.x, y: goal.width / 2 - 0.25 };
    const shooting = rate((seed) => attempt({ x: goal.mouth.x - 9, y: -2 }, corner, 70, seed));
    expect(shooting).toBeGreaterThan(0.15);
    expect(shooting).toBeLessThan(0.6);
  });

  it('shooting straight at the goalie is much worse than picking a corner', () => {
    const corner = { x: goal.mouth.x, y: goal.width / 2 - 0.25 };
    const atKeeper = rate((seed) =>
      attempt({ x: goal.mouth.x - 9, y: 0 }, { x: goal.mouth.x, y: 0 }, 70, seed),
    );
    const toCorner = rate((seed) => attempt({ x: goal.mouth.x - 9, y: 0 }, corner, 70, seed));
    expect(toCorner).toBeGreaterThan(atKeeper + 0.1);
  });
});

describe('practice drill (2v0 + goalie)', () => {
  it('AI attackers pass and score against the AI goalie, and nobody stands still', () => {
    let goals = 0;
    let passes = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const cfg: SimConfig = makeConfig({ match: { periods: 1, periodSeconds: 90 } });
      const state = createMatch(cfg, seed, practiceRoster(cfg));
      const ais = createTeamControllers(state, cfg, seed);
      while (state.phase !== 'final') {
        stepMatch(
          state,
          state.players.map((p) => ais[p.id]!.decide(state, p.id)),
          cfg,
        );
        for (const e of state.events) {
          if (e.type === 'goal') goals++;
          if (e.type === 'pass') passes++;
        }
      }
    }
    expect(goals).toBeGreaterThan(3);
    expect(passes).toBeGreaterThan(0);
  });
});

describe('team AI (5v5)', () => {
  it('the defender nearest the carrier picks them up, and marks stay one-to-one', () => {
    const cfg = makeConfig();
    const state = createMatch(cfg, 1, matchRoster(cfg));
    // Hand the ball to an away runner standing right next to a home attacker.
    const carrier = state.players.find((p) => p.team === 1 && p.role === 'runner')!;
    const nearest = state.players.find((p) => p.team === 0 && p.role === 'runner' && p.lean === 'attack')!;
    carrier.pos = { x: nearest.pos.x + 1, y: nearest.pos.y };
    state.ball.carrier = carrier.id;
    const marks = defensiveAssignments(state, 0);
    expect(marks.get(nearest.id)).toBe(carrier.id);
    expect(new Set(marks.values()).size).toBe(marks.size);
  });

  it('difficulty matters: hard beats easy most of the time', () => {
    const cfg = makeConfig({ match: { periods: 1, periodSeconds: 150 } });
    let hardWins = 0;
    let easyWins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = createMatch(cfg, seed, matchRoster(cfg));
      const ais = createTeamControllers(state, cfg, seed, ['hard', 'easy']);
      while (state.phase !== 'final') {
        stepMatch(
          state,
          state.players.map((p) => ais[p.id]!.decide(state, p.id)),
          cfg,
        );
      }
      if (state.score[0] > state.score[1]) hardWins++;
      if (state.score[1] > state.score[0]) easyWins++;
    }
    expect(hardWins).toBeGreaterThan(easyWins * 2);
    // 20 full matches: about 6 s on a slow CI runner, past Vitest's 5 s default.
  }, 30_000);
});
