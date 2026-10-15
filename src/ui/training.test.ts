import { describe, expect, it } from 'vitest';
import { SPELLS } from '../content/spells';
import { TEAMS } from '../content/teams';
import { LESSONS, MISS_TEXT } from '../content/training';
import { DRILLS, makeConfig } from '../sim';
import {
  fillControls,
  loadTrainingProgress,
  nextUnfinished,
  saveTrainingProgress,
  TRAINING_KEY,
} from './training';

describe('training text (M9)', () => {
  it('names keyboard-and-mouse or controller buttons, whichever is in use', () => {
    expect(fillControls('Press {q} or {check}', false)).toBe('Press Q or the right mouse button');
    expect(fillControls('Press {q} or {check}', true)).toBe('Press X or LT or LB');
    expect(fillControls('{shoot} to shoot', true)).toBe('Hold RT or A, then release it to shoot');
    expect(fillControls('Cast {bentShot}', false)).toBe(`Cast ${SPELLS.bentShot.name}`);
    expect(fillControls('{nope}', false)).toBe('{nope}');
  });

  it('every lesson and miss message fills in completely, on both devices', () => {
    const texts = [
      ...DRILLS.flatMap((d) => [LESSONS[d].title, LESSONS[d].goal, ...LESSONS[d].lines]),
      ...Object.values(MISS_TEXT),
    ];
    for (const pad of [false, true]) {
      for (const t of texts) expect(fillControls(t, pad)).not.toMatch(/[{}]/);
    }
  });

  it('there is a lesson for every drill', () => {
    expect(Object.keys(LESSONS).sort()).toEqual([...DRILLS].sort());
  });
});

describe('training progress (M9)', () => {
  /** A Storage stand-in backed by a Map. */
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    };
  };

  it('saves finished lessons and reads them back, in lesson order', () => {
    const s = memory();
    saveTrainingProgress(s, new Set(['shoot', 'scoop'] as const));
    expect(s.m.get(TRAINING_KEY)).toBe('["scoop","shoot"]');
    expect([...loadTrainingProgress(s)]).toEqual(['scoop', 'shoot']);
  });

  it('nothing saved, junk, unknown lessons, or blocked storage: no progress', () => {
    expect(loadTrainingProgress(memory()).size).toBe(0);
    const junk = memory();
    junk.setItem(TRAINING_KEY, '{nope');
    expect(loadTrainingProgress(junk).size).toBe(0);
    const odd = memory();
    odd.setItem(TRAINING_KEY, '["scoop","flying"]');
    expect([...loadTrainingProgress(odd)]).toEqual(['scoop']);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadTrainingProgress(blocked).size).toBe(0);
    expect(() => saveTrainingProgress(blocked, new Set(['scoop'] as const))).not.toThrow();
  });

  it('training picks up at the first unfinished lesson, or the top once all are done', () => {
    expect(nextUnfinished(new Set())).toBe(0);
    expect(nextUnfinished(new Set(['scoop', 'pass'] as const))).toBe(2);
    expect(nextUnfinished(new Set(['scoop', 'shoot'] as const))).toBe(1);
    expect(nextUnfinished(new Set(DRILLS))).toBe(0);
  });
});

describe('team styles (M9)', () => {
  it('every team plays a real style, and no two teams share one', () => {
    const styles = makeConfig().ai.styles;
    const used = Object.values(TEAMS).map((t) => t.style);
    for (const s of used) {
      expect(styles).toHaveProperty(s);
      expect(s).not.toBe('balanced');
    }
    expect(new Set(used).size).toBe(used.length);
    for (const t of Object.values(TEAMS)) expect(t.styleBlurb.length).toBeGreaterThan(0);
  });
});
