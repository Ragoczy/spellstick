import { SPELLS } from '../content/spells';
import { LESSONS, MISS_TEXT, TRAINING_TEXT } from '../content/training';
import { DRILLS, type DrillId, type DrillVerdict, type SpellId } from '../sim';
import { PAD_BINDINGS, PAD_LABEL, type PadButton } from './gamepad';

const padKeys = (buttons: readonly PadButton[]) => buttons.map((b) => PAD_LABEL[b]).join(' or ');

/** Control words for the lesson text (src/content/training.ts), per input device. */
function controlWords(pad: boolean): Record<string, string> {
  const spellKey = (i: number) => (pad ? PAD_LABEL[PAD_BINDINGS.spells[i]!] : (['Q', 'E', 'R'] as const)[i]!);
  const spells = Object.fromEntries(
    (Object.keys(SPELLS) as SpellId[]).map((id) => [id, SPELLS[id].name]),
  ) as Record<SpellId, string>;
  return {
    ...spells,
    move: pad ? 'the left stick' : 'W A S D',
    aim: pad ? 'the right stick' : 'the mouse',
    pass: pad ? padKeys(PAD_BINDINGS.primary) : 'the left mouse button',
    shoot: pad
      ? `Hold ${padKeys(PAD_BINDINGS.primary)}, then release it`
      : 'Hold the left mouse button, then release it',
    check: pad ? padKeys(PAD_BINDINGS.check) : 'the right mouse button',
    q: spellKey(0),
    e: spellKey(1),
    r: spellKey(2),
    pause: pad ? PAD_LABEL[PAD_BINDINGS.pause[0]!] : 'Esc',
  };
}

/** Fills the {words} in lesson text for keyboard and mouse, or a controller. Unknown words stay. */
export function fillControls(text: string, pad: boolean): string {
  const words = controlWords(pad);
  return text.replace(/\{(\w+)\}/g, (all, key: string) => words[key] ?? all);
}

/** What the lesson card shows. */
export interface LessonCardState {
  drill: DrillId;
  points: number;
  target: number;
  /** The last thing that happened: a point or a miss (null at the start of a lesson). */
  verdict: DrillVerdict | null;
}

/**
 * The lesson card over the top of the rink during training: which lesson, what to do, the
 * goal with progress pips, and what just happened. It never takes clicks (they're passes).
 */
export class LessonCard {
  private readonly node: HTMLElement;
  private last: { state: LessonCardState; pad: boolean } | null = null;

  constructor(root: HTMLElement) {
    this.node = document.createElement('section');
    this.node.id = 'lesson';
    this.node.setAttribute('aria-live', 'polite');
    this.node.hidden = true;
    root.append(this.node);
  }

  show(state: LessonCardState, pad: boolean): void {
    this.last = { state, pad };
    const lesson = LESSONS[state.drill];
    const fill = (t: string) => fillControls(t, pad);
    const index = DRILLS.indexOf(state.drill);
    const done = state.points >= state.target;
    const v = state.verdict;
    const feedback = done
      ? TRAINING_TEXT.lessonDone
      : v?.kind === 'point'
        ? TRAINING_TEXT.point
        : v?.kind === 'miss'
          ? fill(MISS_TEXT[v.reason])
          : '';
    const pips = Array.from({ length: state.target }, (_, i) => (i < state.points ? '●' : '○')).join(' ');

    const p = (cls: string, text: string) => {
      const e = document.createElement('p');
      e.className = cls;
      e.textContent = text;
      return e;
    };
    const title = document.createElement('h2');
    title.textContent = fill(lesson.title);
    const goal = p('lesson-goal', `${fill(lesson.goal)}  `);
    const pipSpan = document.createElement('span');
    pipSpan.className = 'pips';
    pipSpan.setAttribute('aria-label', `${state.points} of ${state.target}`);
    pipSpan.textContent = pips;
    goal.append(pipSpan);
    const fb = p(`lesson-feedback ${done || v?.kind === 'point' ? 'good' : 'bad'}`, feedback);
    this.node.replaceChildren(
      p('lesson-step', TRAINING_TEXT.lessonOf(index + 1, DRILLS.length)),
      title,
      ...lesson.lines.map((l) => p('lesson-line', fill(l))),
      goal,
      fb,
      p('lesson-hint', fill('{pause}: pause, skip the lesson, or quit')),
    );
    this.node.hidden = false;
  }

  /** Redraws with the other device's button names if the player switched. */
  setPad(pad: boolean): void {
    if (this.last && this.last.pad !== pad && !this.node.hidden) this.show(this.last.state, pad);
  }

  hide(): void {
    this.node.hidden = true;
    this.last = null;
  }
}
