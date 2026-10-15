import type { DrillId, DrillMiss } from '../sim';

/**
 * Training-ground text (M9): one lesson per drill, in the order of DRILLS (src/sim/drills.ts).
 * Words in braces name a control and are filled in for keyboard and mouse or a controller,
 * whichever the player is using: {move} {aim} {pass} {shoot} {check} {q} {e} {r}.
 * Spell names come from src/content/spells.ts as {hexShove} {quickstep} {bentShot}.
 */
export interface Lesson {
  title: string;
  /** What to do, in a sentence or two. */
  lines: string[];
  /** The goal, with the count: "Scoop up 2 loose balls". */
  goal: string;
}

export const LESSONS: Record<DrillId, Lesson> = {
  scoop: {
    title: 'Run and scoop',
    lines: [
      'Move with {move}. Run over the loose ball to scoop it up.',
      'In a hurry? {e} casts {quickstep} for a few seconds of extra speed.',
    ],
    goal: 'Scoop up 2 loose balls',
  },
  pass: {
    title: 'Pass',
    lines: [
      'Point your stick at a teammate with {aim}, then tap {pass} to pass.',
      'You take over whoever catches it, so keep it moving.',
    ],
    goal: 'Complete 3 passes',
  },
  shoot: {
    title: 'Shoot',
    lines: [
      'Aim at a corner of the goal with {aim}.',
      '{shoot} to shoot. The longer you hold, the harder the shot.',
    ],
    goal: 'Score 2 goals',
  },
  bentShot: {
    title: '{bentShot}',
    lines: [
      'Press {r} to arm {bentShot}: your stick head glows gold.',
      'Then shoot. The ball sets off wide and curls back in, and goalies misread it.',
    ],
    goal: 'Score with a {bentShot}',
  },
  check: {
    title: 'Body check',
    lines: [
      'Run at the carrier and press {check}: a short dash the way you are moving.',
      'Hits are legal from any direction, and sometimes the ball pops loose.',
    ],
    goal: 'Land 2 checks',
  },
  hexShove: {
    title: '{hexShove}',
    lines: [
      'Get close to the carrier, point your stick at them, and press {q}.',
      '{hexShove} blasts everyone in a short cone and always pops the ball loose. It costs half your mana.',
    ],
    goal: 'Pop the ball loose with {hexShove}',
  },
  faceoff: {
    title: 'Faceoff',
    lines: [
      'Every period and every goal starts with a faceoff. Wait for the whistle, then press {pass} at once.',
      'Go early and you lose it.',
    ],
    goal: 'Win 2 faceoffs',
  },
};

/** What went wrong, shown under the lesson after a miss. */
export const MISS_TEXT: Record<DrillMiss, string> = {
  saved: 'Saved! Aim for a corner, away from the goalie.',
  missed: 'Missed the net. Aim inside the posts.',
  crease: 'In the crease! Shoot from outside the circle in front of the goal.',
  notBent: "That went in, but it wasn't a {bentShot}. Press {r} before you shoot.",
  tooFar: 'Too far away: {hexShove} only reaches a few steps.',
  early: 'Too early! Wait for the whistle.',
  slow: 'Too slow: they beat you to it.',
};

export const TRAINING_TEXT = {
  menuTitle: 'Training',
  menuIntro: 'Seven short lessons, one skill each. Start at the top, or pick one.',
  startAll: 'Start training',
  resume: 'Continue training',
  /** Under the title screen's Training button until a lesson is finished. */
  nudge: 'New? Start here: seven short lessons.',
  /** Marks a finished lesson in the list. */
  doneMark: '✓',
  doneLabel: 'done',
  point: 'Nice!',
  lessonDone: 'Lesson complete!',
  lessonOf: (n: number, total: number) => `Lesson ${n} of ${total}`,
  doneTitle: 'Training complete',
  doneText: "That's everything. Time to play a real match.",
  playMatch: 'Play a match',
  skip: 'Skip lesson',
  quit: 'Quit training',
} as const;
