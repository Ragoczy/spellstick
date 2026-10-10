import { SPELLS } from '../content/spells';
import { TEAMS, type TeamId } from '../content/teams';
import type { Difficulty } from '../sim';
import { PAD_BINDINGS, PAD_LABEL, type PadButton } from './gamepad';
import type { TeamTally } from './matchStats';

/** Tiny DOM helper: element with attributes and children. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** A full-screen layer holding one centered panel. */
function screen(id: string, ...content: (Node | string)[]): HTMLElement {
  return el('section', { class: 'screen', id }, el('div', { class: 'panel' }, ...content));
}

export interface TitleActions {
  play(): void;
  controls(): void;
}

export function titleScreen(a: TitleActions): HTMLElement {
  return screen(
    'title',
    el('h1', { class: 'title-logo' }, 'SPELLSTICK'),
    el('p', { class: 'tagline' }, 'Full-contact magical box lacrosse. Witches, sticks, and spells.'),
    el('div', { class: 'stack' }, button('Play', a.play, 'btn primary'), button('Controls', a.controls)),
    el(
      'p',
      { class: 'credit' },
      "Set in the world of Daniel Kensington's Warlock series (Darkspace Press). A free fan game.",
    ),
  );
}

export interface TeamSelection {
  home: TeamId;
  away: TeamId;
  difficulty: Difficulty;
}

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Slow to react, wild shooters' },
  { id: 'normal', label: 'Normal', blurb: 'A fair fight' },
  { id: 'hard', label: 'Hard', blurb: 'Quick, sharp, and mean' },
];

/** Team select (SPEC §9): your team, the opponent, and difficulty. */
export function teamSelectScreen(
  initial: TeamSelection,
  actions: { start(sel: TeamSelection): void; back(): void },
): HTMLElement {
  const sel = { ...initial };
  const ids = Object.keys(TEAMS) as TeamId[];
  const homeButtons = new Map<TeamId, HTMLButtonElement>();
  const awayButtons = new Map<TeamId, HTMLButtonElement>();
  const diffButtons = new Map<Difficulty, HTMLButtonElement>();

  const refresh = () => {
    if (sel.away === sel.home) sel.away = ids.find((t) => t !== sel.home)!;
    for (const [id, b] of homeButtons) b.setAttribute('aria-pressed', String(id === sel.home));
    for (const [id, b] of awayButtons) {
      b.setAttribute('aria-pressed', String(id === sel.away));
      b.disabled = id === sel.home;
    }
    for (const [id, b] of diffButtons) b.setAttribute('aria-pressed', String(id === sel.difficulty));
  };

  const teamChoice = (id: TeamId, side: 'home' | 'away') => {
    const t = TEAMS[id];
    const b = el(
      'button',
      { class: 'choice', type: 'button', 'aria-pressed': 'false', 'data-team': id, 'data-side': side },
      el('span', { class: 'swatch', style: `background:${hex(t.color)}` }),
      el('span', {}, t.name),
    );
    b.addEventListener('click', () => {
      sel[side] = id;
      refresh();
    });
    (side === 'home' ? homeButtons : awayButtons).set(id, b);
    return b;
  };

  const diffChoice = (d: (typeof DIFFICULTIES)[number]) => {
    const b = el(
      'button',
      { class: 'choice', type: 'button', 'aria-pressed': 'false', 'data-difficulty': d.id },
      el('span', {}, d.label, el('small', {}, d.blurb)),
    );
    b.addEventListener('click', () => {
      sel.difficulty = d.id;
      refresh();
    });
    diffButtons.set(d.id, b);
    return b;
  };

  const node = screen(
    'team-select',
    el('h2', {}, 'Choose your match'),
    el('h3', {}, 'Your team'),
    el('div', { class: 'choices' }, ...ids.map((id) => teamChoice(id, 'home'))),
    el('h3', {}, 'Opponent'),
    el('div', { class: 'choices' }, ...ids.map((id) => teamChoice(id, 'away'))),
    el('h3', {}, 'Difficulty'),
    el('div', { class: 'choices' }, ...DIFFICULTIES.map(diffChoice)),
    el(
      'div',
      { class: 'actions' },
      button('Back', actions.back),
      button('Start match', () => actions.start({ ...sel }), 'btn primary'),
    ),
  );
  refresh();
  return node;
}

const padKeys = (buttons: readonly PadButton[], sep = ' or ') => buttons.map((b) => PAD_LABEL[b]).join(sep);

/** The one-screen controls card (SPEC §5, M6 done-when), for keyboard and mouse and for a gamepad (M8). */
export function controlsScreen(onDone: () => void, doneLabel = 'Got it'): HTMLElement {
  const rows: [string, string, string][] = [
    ['W A S D', 'Left stick or D-pad', 'Move'],
    ['Mouse', 'Right stick', 'Aim your stick (passes, shots, and spells go where you point)'],
    ['Left click', padKeys(PAD_BINDINGS.primary), 'Pass to the teammate you aim at'],
    [
      'Hold left click, release',
      `Hold ${padKeys(PAD_BINDINGS.primary)}, release`,
      'Shoot (hold longer for a harder shot)',
    ],
    ['Right click', padKeys(PAD_BINDINGS.check), 'Body check (a short dash the way you move)'],
    [
      'Q / E / R',
      padKeys(PAD_BINDINGS.spells, ' / '),
      `${SPELLS.hexShove.name} / ${SPELLS.quickstep.name} / ${SPELLS.bentShot.name}`,
    ],
    ['Space', padKeys(PAD_BINDINGS.switchPlayer), 'On defense: switch to the teammate nearest the ball'],
    ['Esc', padKeys(PAD_BINDINGS.pause), 'Pause'],
    ['M', padKeys(PAD_BINDINGS.mute), 'Sound on/off'],
  ];
  return screen(
    'controls',
    el('h2', {}, 'How to play'),
    el(
      'table',
      { class: 'controls' },
      el('tr', {}, el('th', {}, 'Keyboard & mouse'), el('th', {}, 'Controller'), el('th', {}, '')),
      ...rows.map(([k, p, v]) => el('tr', {}, el('td', {}, k), el('td', {}, p), el('td', {}, v))),
    ),
    el(
      'ul',
      { class: 'tips' },
      el(
        'li',
        {},
        `Faceoffs: click (or pull ${PAD_LABEL[PAD_BINDINGS.primary[0]]}) the moment the whistle blows. Go early and you lose it.`,
      ),
      el(
        'li',
        {},
        'On a controller, let go of the right stick and you aim where you run. Point at the goal and the shot goes on net.',
      ),
      el(
        'li',
        {},
        "Don't carry the ball into the other team's crease circle, and shoot before the 30 s shot clock runs out.",
      ),
      el(
        'li',
        {},
        `Spells cost mana (the gold bar, bottom left). ${SPELLS.hexShove.name} pops the ball loose; ${SPELLS.bentShot.name} curls your next shot.`,
      ),
      el(
        'li',
        {},
        'You control whoever has the ball. Hits are legal from any direction, but not on a goalie in their crease.',
      ),
    ),
    el('div', { class: 'actions' }, button(doneLabel, onDone, 'btn primary')),
  );
}

export function pauseScreen(a: { resume(): void; controls(): void; quit(): void }): HTMLElement {
  return screen(
    'pause',
    el('h2', {}, 'Paused'),
    el(
      'div',
      { class: 'stack' },
      button('Resume', a.resume, 'btn primary'),
      button('Controls', a.controls),
      button('Quit to title', a.quit),
    ),
  );
}

export interface ResultsData {
  home: TeamId;
  away: TeamId;
  score: [number, number];
  overtime: boolean;
  tally: [TeamTally, TeamTally];
}

/** Results (SPEC §9): score and simple stats, then rematch or back to title. */
export function resultsScreen(r: ResultsData, a: { rematch(): void; menu(): void }): HTMLElement {
  const home = TEAMS[r.home];
  const away = TEAMS[r.away];
  const won = r.score[0] > r.score[1];
  const verdict = won ? `${home.name} win!` : `${away.name} win.`;
  const stat = (label: string, h: number, w: number) =>
    el('tr', {}, el('td', {}, label), el('td', {}, String(h)), el('td', {}, String(w)));
  return screen(
    'results',
    el('h2', {}, r.overtime ? 'Final (OT)' : 'Final'),
    el(
      'div',
      { class: 'final-score' },
      el('span', { style: `color:${hex(home.color)}` }, home.name),
      el('span', { class: 'num' }, `${r.score[0]} – ${r.score[1]}`),
      el('span', { style: `color:${hex(away.color)}` }, away.name),
    ),
    el('p', { class: 'verdict' }, verdict),
    el(
      'table',
      { class: 'stats' },
      el(
        'tr',
        {},
        el('th', {}, ''),
        el('th', { style: `color:${hex(home.color)}` }, home.name),
        el('th', { style: `color:${hex(away.color)}` }, away.name),
      ),
      stat('Shots', r.tally[0].shots, r.tally[1].shots),
      stat('Saves', r.tally[0].saves, r.tally[1].saves),
      stat('Hits', r.tally[0].hits, r.tally[1].hits),
      stat('Spells cast', r.tally[0].spells, r.tally[1].spells),
    ),
    el('div', { class: 'actions' }, button('Rematch', a.rematch, 'btn primary'), button('Main menu', a.menu)),
  );
}
