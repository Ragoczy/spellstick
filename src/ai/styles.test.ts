import { describe, expect, it } from 'vitest';
import {
  createDrill,
  createMatch,
  drillConfig,
  DrillJudge,
  makeConfig,
  matchRoster,
  stepMatch,
  type AiStyle,
  type Drill,
  type DrillVerdict,
  type InputCommand,
} from '../sim';
import { createDrillControllers } from './drills';
import { createTeamControllers, styledAi } from './team';

describe('team playing styles (M9)', () => {
  const config = makeConfig();

  it('the balanced style changes nothing', () => {
    const { config: c, level } = styledAi(config, 'normal', 'balanced');
    expect(level).toEqual(config.ai.levels.normal);
    expect(c.ai.runner).toEqual(config.ai.runner);
  });

  it('a style scales the AI numbers and leaves the game rules and the original config alone', () => {
    const s = config.ai.styles.physical;
    const { config: c, level } = styledAi(config, 'hard', 'physical');
    const base = config.ai.levels.hard;
    expect(level.checkChancePerTick).toBeCloseTo(base.checkChancePerTick * s.checkChance);
    expect(level.spellEagerness).toBeCloseTo(base.spellEagerness * s.spellEagerness);
    expect(level.shootRange).toBe(base.shootRange + s.shootRange);
    expect(c.ai.runner.minHoldSeconds).toBeCloseTo(config.ai.runner.minHoldSeconds * s.holdSeconds);
    expect(c.ai.runner.passAdvance).toBeCloseTo(config.ai.runner.passAdvance * s.passAdvance);
    expect(c.ai.runner.forceShotChancePerTick).toBeCloseTo(
      config.ai.runner.forceShotChancePerTick * s.forceShot,
    );
    // Rules are shared, not copied or changed.
    expect(c.player).toBe(config.player);
    expect(c.spells).toBe(config.spells);
    expect(config.ai.levels.hard).toEqual(makeConfig().ai.levels.hard);
    expect(config.ai.runner).toEqual(makeConfig().ai.runner);
  });

  it('styles play differently: the physical side hits more, the passing side passes more', () => {
    const cfg = makeConfig({ match: { periods: 1, periodSeconds: 150 } });
    const count = (styles: [AiStyle, AiStyle]) => {
      const checks = [0, 0];
      const passes = [0, 0];
      for (let seed = 1; seed <= 6; seed++) {
        const state = createMatch(cfg, seed, matchRoster(cfg), { start: 'faceoff' });
        const ais = createTeamControllers(state, cfg, seed, ['normal', 'normal'], styles);
        while (state.phase !== 'final') {
          stepMatch(
            state,
            state.players.map((p) => ais[p.id]!.decide(state, p.id)),
            cfg,
          );
          for (const e of state.events) {
            if (e.type === 'check') checks[e.team]!++;
            if (e.type === 'pass') passes[e.team]!++;
          }
        }
      }
      return { checks, passes };
    };
    const r = count(['physical', 'passing']);
    expect(r.checks[0]!).toBeGreaterThan(r.checks[1]!);
    expect(r.passes[1]!).toBeGreaterThan(r.passes[0]!);
  }, 30_000);
});

describe('training drill AI (M9)', () => {
  const config = drillConfig(makeConfig());

  /** Plays a drill with AI everywhere except the human, who sends `human`. */
  function play(drill: Drill, human: (tick: number) => InputCommand, ticks: number) {
    const ais = createDrillControllers(drill, config, 1);
    const judge = new DrillJudge(drill.id);
    const verdicts: DrillVerdict[] = [];
    const s = drill.state;
    for (let t = 0; t < ticks; t++) {
      stepMatch(
        s,
        s.players.map((p) => (p.id === drill.humanId ? human(t) : ais[p.id]!.decide(s, p.id))),
        config,
      );
      const v = judge.observe(s, drill.humanId);
      if (v) verdicts.push(v);
    }
    return verdicts;
  }

  const still = (): InputCommand => ({ move: { x: 0, y: 0 }, aim: { x: 100, y: 0 } });

  it('every part has a controller', () => {
    for (const id of ['scoop', 'pass', 'shoot', 'check', 'faceoff'] as const) {
      const d = createDrill(config, id, 0, 1);
      expect(createDrillControllers(d, config, 1)).toHaveLength(d.state.players.length);
    }
  });

  it('the jogger keeps the ball and keeps moving around its lap', () => {
    const d = createDrill(config, 'check', 0, 1);
    const start = { ...d.state.players[1]!.pos };
    let farthest = 0;
    const ais = createDrillControllers(d, config, 1);
    for (let t = 0; t < 600; t++) {
      stepMatch(d.state, [still(), ais[1]!.decide(d.state, 1)], config);
      const p = d.state.players[1]!.pos;
      farthest = Math.max(farthest, Math.hypot(p.x - start.x, p.y - start.y));
    }
    expect(d.state.ball.carrier).toBe(1);
    expect(farthest).toBeGreaterThan(config.training.joggerRadius);
  });

  it('a receiver steps in and catches a pass meant for them', () => {
    const d = createDrill(config, 'pass', 0, 1);
    const mate = d.state.players[2]!.pos;
    const verdicts = play(d, (t) => ({ move: { x: 0, y: 0 }, aim: mate, primary: t < 2 }), 180);
    expect(verdicts).toContainEqual({ kind: 'point', reset: false });
    expect(d.state.ball.carrier).toBe(2);
  });

  it('the faceoff taker (Easy) wins when the human never presses', () => {
    const d = createDrill(config, 'faceoff', 0, 1);
    expect(play(d, still, 400)[0]).toMatchObject({ kind: 'miss' });
  });
});
