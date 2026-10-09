/**
 * Announcer callouts (SPEC §8): short pop-ups on goals, saves, big hits, and turnovers,
 * shown as text and, when a recording exists, spoken. The witch-flavored exclamations
 * marked [CANON] come from the Warlock books (SPEC §2); everything else is plain
 * sports-announcer filler, not lore. Edit freely.
 *
 * Each line has a stable `id`: its recording is `src/content/announcer-voice/<id>.mp3`
 * (or .ogg / .wav). Change a line's text and its id stays put, so re-record it. Add a
 * line with a new id. After editing, run `npm run announcer:script` to refresh
 * docs/ANNOUNCER_SCRIPT.md (a test fails if you forget).
 */
export type CalloutKind =
  | 'goal'
  | 'save'
  | 'wardBlock'
  | 'bigHit'
  | 'pileup'
  | 'turnover'
  | 'shotClock'
  | 'crease'
  | 'overtimeWinner';

export interface AnnouncerLine {
  /** Stable id and recording file name: lowercase letters, digits, and dashes. */
  id: string;
  text: string;
}

/** [CANON] exclamations, SPEC §2. */
export const CANON_EXCLAMATIONS = ["Child's Tantrum!", "Crone's Corns!", 'Third-witch in!'] as const;

export const ANNOUNCER: Record<CalloutKind, readonly AnnouncerLine[]> = {
  goal: [
    { id: 'goal-01', text: "Crone's Corns! It's in!" },
    { id: 'goal-02', text: 'Top shelf!' },
    { id: 'goal-03', text: 'Buried it!' },
    { id: 'goal-04', text: 'Into the twine!' },
    { id: 'goal-05', text: "Child's Tantrum, what a finish!" },
  ],
  save: [
    { id: 'save-01', text: 'Stopped cold!' },
    { id: 'save-02', text: 'Big save!' },
    { id: 'save-03', text: 'Robbed!' },
    { id: 'save-04', text: 'The keeper says no!' },
  ],
  wardBlock: [
    { id: 'ward-01', text: 'Warded off!' },
    { id: 'ward-02', text: 'The Ward holds!' },
    { id: 'ward-03', text: 'Turned away by the Ward!' },
  ],
  bigHit: [
    { id: 'hit-01', text: "Child's Tantrum!" },
    { id: 'hit-02', text: 'Into the boards!' },
    { id: 'hit-03', text: 'Flattened!' },
    { id: 'hit-04', text: 'What a hit!' },
    { id: 'hit-05', text: "Crone's Corns!" },
  ],
  // A hit with a crowd around: "third-witch in" is canon (SPEC §2).
  pileup: [
    { id: 'pileup-01', text: 'Third-witch in!' },
    { id: 'pileup-02', text: 'Third-witch in, and it gets ugly!' },
  ],
  turnover: [
    { id: 'turnover-01', text: 'Stripped!' },
    { id: 'turnover-02', text: 'Coughed it up!' },
    { id: 'turnover-03', text: 'Picked clean!' },
  ],
  shotClock: [
    { id: 'shotclock-01', text: 'Shot clock! That one belongs to the other side.' },
    { id: 'shotclock-02', text: 'Too slow! Shot clock!' },
  ],
  crease: [
    { id: 'crease-01', text: 'In the crease! Turnover.' },
    { id: 'crease-02', text: 'Crease violation!' },
  ],
  overtimeWinner: [
    { id: 'otwin-01', text: "Crone's Corns, it's over!" },
    { id: 'otwin-02', text: "Child's Tantrum! Sudden death, and that's the game!" },
  ],
};

/** When each kind of callout fires, and how it should sound: for the recording script. */
export const CALLOUT_DIRECTION: Record<CalloutKind, { when: string; delivery: string }> = {
  goal: { when: 'A goal is scored.', delivery: 'Big and loud; the top of your range. Celebrate.' },
  overtimeWinner: {
    when: 'The sudden-death overtime winner. The match is over.',
    delivery: 'The biggest call in the game. Full release, a little longer if it wants to be.',
  },
  save: { when: 'The goalie stops a shot.', delivery: 'Sharp and punchy, impressed.' },
  wardBlock: {
    when: "The goalie's magic shield blocks a shot that would have gone in.",
    delivery: 'Awed; a touch of wonder in it.',
  },
  bigHit: {
    when: 'A player is slammed into the boards, or a check knocks the ball loose.',
    delivery: 'Wincing glee: the crowd loves the violence.',
  },
  pileup: {
    when: 'A hit in a crowd of players.',
    delivery: 'Gleeful, like a fight just broke out. "Third-witch in" is a set phrase: say it as one.',
  },
  turnover: {
    when: 'A player loses the ball (stripped or intercepted).',
    delivery: 'Quick, a little scornful.',
  },
  shotClock: {
    when: 'A team runs out the 30-second shot clock.',
    delivery: 'Mock-exasperated, like a ref call.',
  },
  crease: {
    when: "An attacker carries the ball into the goalie's crease, or a goal is waved off for it.",
    delivery: 'Firm, like a ref call.',
  },
};

/** Every line, flattened (for tools and tests). */
export function allAnnouncerLines(): (AnnouncerLine & { kind: CalloutKind })[] {
  return (Object.keys(ANNOUNCER) as CalloutKind[]).flatMap((kind) =>
    ANNOUNCER[kind].map((line) => ({ ...line, kind })),
  );
}
