import { CHANGELOG, changelogDate, type ChangelogEntry } from '../content/changelog';
import { SPELLS } from '../content/spells';
import { TEAMS, type TeamId } from '../content/teams';
import { LESSONS, TRAINING_TEXT } from '../content/training';
import { DRILLS, type Difficulty, type DrillId } from '../sim';
import { DISCORD_SIGN_IN_MESSAGES, type AuthState } from './auth';
import { PAD_BINDINGS, PAD_LABEL, type PadButton } from './gamepad';
import { PRIVACY_URL, TERMS_URL } from './links';
import type { TeamTally } from './matchStats';
import { REPORT_CATEGORIES, REPORT_EMAIL, type ReportCategory, type Reporter } from './report';
import { fillControls, nextUnfinished } from './training';

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
  training(): void;
  controls(): void;
  settings(): void;
  report(): void;
  login(): void;
  logout(): void;
}

/**
 * Play (and Training) only once logged in with Discord; until then the main button is the login.
 * `nudgeTraining` (no lesson finished yet) points new players at Training; Play stays the main button.
 * `inDiscord`: launched as a Discord Activity, where sign-in happens at launch and there is no
 * login or log out button (the page can't leave Discord's frame).
 */
export function titleScreen(
  a: TitleActions,
  auth: AuthState,
  nudgeTraining = false,
  inDiscord = false,
): HTMLElement {
  const canPlay = auth.status === 'in' || auth.status === 'dev';
  const main = canPlay
    ? button('Play', a.play, 'btn primary')
    : auth.status === 'checking'
      ? el(
          'button',
          { class: 'btn', type: 'button', disabled: '' },
          inDiscord ? 'Signing in through Discord…' : 'Checking login…',
        )
      : inDiscord
        ? null
        : button('Log in with Discord', a.login, 'btn primary discord');
  return screen(
    'title',
    el('h1', { class: 'title-logo' }, 'SPELLSTICK'),
    el('p', { class: 'tagline' }, 'Full-contact magical box lacrosse. Witches, sticks, and spells.'),
    accountLine(auth, a.logout, inDiscord),
    el(
      'div',
      { class: 'stack' },
      ...(main ? [main] : []),
      ...(canPlay ? trainingButton(a.training, nudgeTraining) : []),
      button('Controls', a.controls),
      button('Settings', a.settings),
    ),
    whatsNew(CHANGELOG.slice(0, TITLE_CHANGELOG_ENTRIES)),
    el(
      'footer',
      { class: 'site-footer' },
      el(
        'p',
        { class: 'credit' },
        "Set in the world of Daniel Kensington's Warlock series (Darkspace Press). A free fan game.",
      ),
      button('Report a problem', a.report, 'link-btn'),
      ...policyLinks(),
    ),
  );
}

/** The title screen's Training button; with `nudge`, it glows and has a line for new players under it. */
function trainingButton(onClick: () => void, nudge: boolean): HTMLElement[] {
  if (!nudge) return [button(TRAINING_TEXT.menuTitle, onClick)];
  const b = button(TRAINING_TEXT.menuTitle, onClick, 'btn nudge');
  b.setAttribute('aria-describedby', 'training-nudge');
  return [b, el('p', { class: 'training-nudge', id: 'training-nudge' }, TRAINING_TEXT.nudge)];
}

/** Terms of Service and Privacy Policy, opened in a new tab so a match in progress isn't lost. */
function policyLinks(): HTMLAnchorElement[] {
  const link = (label: string, href: string) =>
    el('a', { class: 'link-btn', href, target: '_blank', rel: 'noopener noreferrer' }, label);
  return [link('Terms of Service', TERMS_URL), link('Privacy Policy', PRIVACY_URL)];
}

/** Who's logged in (avatar, name, log out), or why to log in. */
function accountLine(auth: AuthState, logout: () => void, inDiscord: boolean): HTMLElement {
  if (auth.status === 'in') {
    const avatar = el('img', {
      class: 'avatar',
      src: auth.user.avatarUrl,
      alt: '',
      width: '28',
      height: '28',
    });
    avatar.referrerPolicy = 'no-referrer';
    return el(
      'div',
      { class: 'account', 'aria-label': 'Logged in' },
      avatar,
      el('span', { class: 'account-name' }, auth.user.username),
      ...(inDiscord ? [] : [button('Log out', logout, 'btn small')]),
    );
  }
  if (auth.status === 'out') {
    const fallback = inDiscord
      ? DISCORD_SIGN_IN_MESSAGES.failed
      : 'Log in with Discord to play. Open to Players in the Darkspace Discord server.';
    return el(
      'div',
      { class: 'account' },
      el(
        'p',
        { class: 'login-note', role: auth.message || inDiscord ? 'alert' : 'note' },
        auth.message ?? fallback,
      ),
    );
  }
  if (auth.status === 'dev') {
    return el('div', { class: 'account' }, el('p', { class: 'login-note' }, 'Dev server: login skipped.'));
  }
  return el('div', { class: 'account' });
}

/**
 * Settings: help (Report a problem) and, when logged in, "Unlink my Discord account" at the bottom.
 * Inside Discord the player is their Discord account and every launch signs in again, so unlinking
 * there would undo itself; Settings points to the browser version instead.
 */
export function settingsScreen(
  auth: AuthState,
  a: { report(): void; unlink(): void; back(): void },
  inDiscord = false,
): HTMLElement {
  const account =
    auth.status === 'in'
      ? [
          el(
            'section',
            { class: 'danger-zone', 'aria-label': 'Discord account' },
            el('h3', {}, 'Discord account'),
            el(
              'p',
              { class: 'settings-note' },
              inDiscord
                ? `Signed in through Discord as ${auth.user.username}.`
                : `Logged in as ${auth.user.username}.`,
            ),
            inDiscord
              ? el(
                  'p',
                  { class: 'settings-note' },
                  'To unlink your Discord account, open Spellstick in your web browser and use Settings there.',
                )
              : button('Unlink my Discord account', a.unlink, 'btn danger'),
          ),
        ]
      : [];
  return screen(
    'settings',
    el('h2', {}, 'Settings'),
    el('h3', {}, 'Help'),
    el(
      'p',
      { class: 'settings-note' },
      `To report a problem or request help with your data, contact ${REPORT_EMAIL}.`,
    ),
    el('p', { class: 'settings-note policy-links' }, ...policyLinks()),
    el(
      'div',
      { class: 'stack' },
      button('Report a problem', a.report),
      button('Back', a.back, 'btn primary'),
    ),
    ...account,
  );
}

/** Report a problem: pick a category, and the player's email app opens with a prefilled message. */
export function reportScreen(
  reporter: Reporter | null,
  a: { send(category: ReportCategory): void; back(): void },
): HTMLElement {
  const included = reporter
    ? `So we can act on it, the email includes your player name (${reporter.username}) and Discord user ID (${reporter.id}).`
    : "You're not logged in. If it's about your account, add your Discord username to the email.";
  return screen(
    'report',
    el('h2', {}, 'Report a problem'),
    el(
      'p',
      { class: 'settings-note' },
      `Pick what it's about. Your email app opens a message to ${REPORT_EMAIL}; add the details and send it.`,
    ),
    el('p', { class: 'settings-note' }, included),
    el(
      'div',
      { class: 'stack' },
      ...REPORT_CATEGORIES.map((c) => button(c, () => a.send(c))),
      button('Back', a.back, 'btn primary'),
    ),
  );
}

/** The word typed to confirm an unlink. */
export const UNLINK_CONFIRM_WORD = 'UNLINK';

/**
 * "Unlink your Discord account from Spellstick?": the button stays disabled until UNLINK is typed.
 * `confirm` resolves false if the server didn't confirm (the screen says so and stays put).
 */
export function unlinkScreen(a: { confirm(): Promise<boolean>; cancel(): void }): HTMLElement {
  const input = el('input', {
    id: 'unlink-confirm',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
  });
  const error = el('p', { class: 'login-note', role: 'alert' });
  const go = el(
    'button',
    { class: 'btn danger', type: 'button', disabled: '' },
    'Unlink and delete my game data',
  );
  const ready = () => input.value.trim().toUpperCase() === UNLINK_CONFIRM_WORD;
  input.addEventListener('input', () => (go.disabled = !ready()));
  go.addEventListener('click', () => {
    if (!ready()) return;
    go.disabled = true;
    input.disabled = true;
    error.textContent = '';
    void a.confirm().then((ok) => {
      if (ok) return;
      error.textContent = "Couldn't unlink right now. Nothing was deleted. Try again in a moment.";
      input.disabled = false;
      go.disabled = !ready();
    });
  });
  const node = screen(
    'unlink',
    el('h2', { id: 'unlink-title' }, 'Unlink your Discord account from Spellstick?'),
    el(
      'p',
      {},
      'This removes your Spellstick game data and disconnects the game from your Discord account. It only affects this game. Your Discord account, your messages, your server membership, and your roles are not changed in any way.',
    ),
    el('p', {}, 'You will lose:'),
    el(
      'ul',
      { class: 'lose-list' },
      el('li', {}, 'your login to Spellstick on this device'),
      el(
        'li',
        {},
        'your saved team, opponent, difficulty, sound setting, and training progress in this browser',
      ),
    ),
    el(
      'p',
      { class: 'settings-note' },
      "That's everything: Spellstick keeps no stats, match history, or profile on its server, and never kept your Discord login token. If you're logged in on another device, log out there too.",
    ),
    el('p', {}, "This can't be undone. You can play again later by reconnecting, but you'll start fresh."),
    el('label', { for: 'unlink-confirm', class: 'confirm-label' }, `Type ${UNLINK_CONFIRM_WORD} to confirm`),
    input,
    error,
    el('div', { class: 'row' }, button('Cancel', a.cancel, 'btn primary'), go),
  );
  node.setAttribute('role', 'alertdialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-labelledby', 'unlink-title');
  return node;
}

/** How many of the latest changelog entries the title screen shows. */
export const TITLE_CHANGELOG_ENTRIES = 3;

/** The "What's new" box on the title screen. */
function whatsNew(entries: readonly ChangelogEntry[]): HTMLElement {
  return el(
    'section',
    { class: 'whats-new', 'aria-label': "What's new" },
    el('h3', {}, "What's new"),
    ...entries.map((e) =>
      el(
        'div',
        { class: 'change' },
        el(
          'p',
          { class: 'change-head' },
          el('strong', {}, e.title),
          el('time', { datetime: e.date }, changelogDate(e.date)),
        ),
        el('ul', {}, ...e.items.map((i) => el('li', {}, i))),
      ),
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
      el('span', {}, t.name, el('small', {}, t.styleBlurb)),
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

/** Pause (Esc). In training it also offers to skip the lesson, and quitting leaves training. */
export function pauseScreen(
  a: { resume(): void; controls(): void; quit(): void; skip?: () => void },
  quitLabel = 'Quit to title',
): HTMLElement {
  return screen(
    'pause',
    el('h2', {}, 'Paused'),
    el(
      'div',
      { class: 'stack' },
      button('Resume', a.resume, 'btn primary'),
      ...(a.skip ? [button(TRAINING_TEXT.skip, a.skip)] : []),
      button('Controls', a.controls),
      button(quitLabel, a.quit),
    ),
  );
}

/**
 * The training ground's lessons (M9): continue from the first unfinished one, or pick one.
 * Lessons finished in this browser (`done`) get a check mark.
 */
export function trainingScreen(
  a: { start(lesson: number): void; back(): void },
  done: ReadonlySet<DrillId>,
): HTMLElement {
  // Lesson titles name spells, never buttons, so the device doesn't matter here.
  const title = (i: number) => `${i + 1}. ${fillControls(LESSONS[DRILLS[i]!].title, false)}`;
  const lesson = (d: DrillId, i: number) => {
    const b = button(title(i), () => a.start(i), done.has(d) ? 'btn lesson-pick done' : 'btn lesson-pick');
    if (done.has(d)) {
      b.append(el('span', { class: 'done-mark', 'aria-hidden': 'true' }, ` ${TRAINING_TEXT.doneMark}`));
      b.setAttribute('aria-label', `${title(i)} (${TRAINING_TEXT.doneLabel})`);
    }
    return b;
  };
  // Part-way through: pick up where you left off. None or all done: from the top.
  const resume = done.size > 0 && done.size < DRILLS.length;
  return screen(
    'training',
    el('h2', {}, TRAINING_TEXT.menuTitle),
    el('p', { class: 'settings-note' }, TRAINING_TEXT.menuIntro),
    el(
      'div',
      { class: 'stack' },
      button(
        resume ? TRAINING_TEXT.resume : TRAINING_TEXT.startAll,
        () => a.start(resume ? nextUnfinished(done) : 0),
        'btn primary',
      ),
      ...DRILLS.map(lesson),
      button('Back', a.back),
    ),
  );
}

/** After the last lesson. */
export function trainingDoneScreen(a: { play(): void; menu(): void }): HTMLElement {
  return screen(
    'training-done',
    el('h2', {}, TRAINING_TEXT.doneTitle),
    el('p', {}, TRAINING_TEXT.doneText),
    el(
      'div',
      { class: 'actions' },
      button(TRAINING_TEXT.playMatch, a.play, 'btn primary'),
      button('Main menu', a.menu),
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
