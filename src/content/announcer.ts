/**
 * Announcer callouts (SPEC §8): short pop-ups on goals, saves, big hits, and turnovers,
 * shown as text and, when a recording exists, spoken. The witch-flavored exclamations
 * marked [CANON] come from the Warlock books (SPEC §2); everything else is plain
 * sports-announcer filler, not lore. Edit freely.
 *
 * Each line has a stable `id`: its recordings are `src/content/announcer-voice/<id>.mp3`
 * and `<id>-against.mp3` (or .ogg / .wav), see CalloutSide below. Change a line's text and its id stays put, so re-record it. Add a
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

/**
 * The announcer is a home announcer for the player's team. Every line has two takes:
 * `for` (the moment favors the player's team) and `against` (it favors the opponent:
 * they score, their goalie robs you, they flatten one of yours, you blow the shot clock).
 * Same words, different read. The `against` take is `<id>-against.mp3`.
 */
export type CalloutSide = 'for' | 'against';

export const AGAINST_SUFFIX = '-against';

/** The recording id for a line on a given side. */
export const clipId = (lineId: string, side: CalloutSide): string =>
  side === 'against' ? `${lineId}${AGAINST_SUFFIX}` : lineId;

/** When each kind of callout fires, and how each take should sound: for the recording script. */
export const CALLOUT_DIRECTION: Record<CalloutKind, { when: string; delivery: string; against: string }> = {
  goal: {
    when: 'A goal is scored. Against: the opponent scored.',
    delivery: 'Big and loud; the top of your range. Celebrate.',
    against: 'Furious and disgusted, like the home team just got burned.',
  },
  overtimeWinner: {
    when: 'The sudden-death overtime winner; the match is over. Against: the opponent won it.',
    delivery: 'The biggest call in the game. Full release, a little longer if it wants to be.',
    against: 'Outraged disbelief: the home side just lost it all.',
  },
  save: {
    when: "The goalie stops a shot. Against: the opponent's goalie robbed the player's team.",
    delivery: 'Sharp and punchy, impressed.',
    against: 'Angry and bitter, like a robbery.',
  },
  wardBlock: {
    when: "The goalie's magic shield blocks a shot that would have gone in. Against: the opponent's goalie did it.",
    delivery: 'Awed; a touch of wonder in it.',
    against: 'Angry: the shield cheated the home side.',
  },
  bigHit: {
    when: "A player is slammed into the boards, or a check knocks the ball loose. Against: it's one of the player's team getting flattened.",
    delivery: 'Excited: the crowd loves the violence. No laughing.',
    against: 'Angry, protective of your own.',
  },
  pileup: {
    when: 'A hit in a crowd of players. Against: the opponent threw it.',
    delivery: 'Excited, like a fight just broke out. "Third-witch in" is a set phrase: say it as one.',
    against: 'Angry, like the other side started it.',
  },
  turnover: {
    when: "A player loses the ball (stripped or intercepted). Against: the player's team lost it.",
    delivery: 'Quick, a little scornful of the other side.',
    against: 'Angry and exasperated at the home side.',
  },
  shotClock: {
    when: "A team runs out the 30-second shot clock. Against: the player's team ran it out.",
    delivery: 'Mock-exasperated, like a ref call.',
    against: 'Angry and frustrated with the home side.',
  },
  crease: {
    when: "An attacker carries the ball into the goalie's crease, or a goal is waved off for it. Against: the player's team did it.",
    delivery: 'Firm, like a ref call.',
    against: 'Angry, like it cost the home side.',
  },
};

/** Every line, flattened (for tools and tests). */
export function allAnnouncerLines(): (AnnouncerLine & { kind: CalloutKind })[] {
  return (Object.keys(ANNOUNCER) as CalloutKind[]).flatMap((kind) =>
    ANNOUNCER[kind].map((line) => ({ ...line, kind })),
  );
}
