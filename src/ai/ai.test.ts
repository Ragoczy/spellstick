import { describe, expect, it } from 'vitest';
import {
  arenaGeometry,
  createMatch,
  makeConfig,
  practiceRoster,
  stepMatch,
  type InputCommand,
  type MatchState,
  type SimConfig,
} from '../sim';
import { createGoalieAI, DEFAULT_GOALIE_SKILL } from './goalie';
import { createTeamControllers } from './team';

const config = makeConfig();
const goal = arenaGeometry(config).goals[1];

/** A shooter (id 0) vs the AI goalie (id 1). */
function shooterVsGoalie(shooterPos: { x: number; y: number }, seed: number) {
  const state = createMatch(config, seed, [
    { team: 0, number: 7, pos: shooterPos },
    { team: 1, number: 1, pos: { x: goal.mouth.x - 1, y: 0 }, role: 'goalie' },
  ]);
  state.ball.carrier = 0;
  return { state, goalie: createGoalieAI(config) };
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
    for (let i = 0; i < DEFAULT_GOALIE_SKILL.reactionTicks + 6 && state.ball.flight; i++) {
      step(state, { move: { x: 0, y: 0 }, aim }, goalie);
    }
    // The shot is heading for +y; the goalie should have shifted that way.
    expect(state.players[1]!.pos.y).toBeGreaterThan(y0);
  });

  it('clears the ball after holding it', () => {
    const { state, goalie } = shooterVsGoalie({ x: 0, y: 0 }, 1);
    state.ball.carrier = 1;
    let released = false;
    for (let i = 0; i < DEFAULT_GOALIE_SKILL.holdTicks + 5; i++) {
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
