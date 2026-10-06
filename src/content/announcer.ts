/**
 * Announcer callouts (SPEC §8): short text pop-ups on goals, saves, big hits, and
 * turnovers. The witch-flavored exclamations marked [CANON] come from the Warlock books
 * (SPEC §2); everything else is plain sports-announcer filler, not lore. Edit freely.
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

/** [CANON] exclamations, SPEC §2. */
export const CANON_EXCLAMATIONS = ["Child's Tantrum!", "Crone's Corns!", 'Third-witch in!'] as const;

export const ANNOUNCER: Record<CalloutKind, readonly string[]> = {
  goal: [
    "Crone's Corns! It's in!",
    'Top shelf!',
    'Buried it!',
    'Into the twine!',
    "Child's Tantrum, what a finish!",
  ],
  save: ['Stopped cold!', 'Big save!', 'Robbed!', 'The keeper says no!'],
  wardBlock: ['Warded off!', 'The Ward holds!', 'Turned away by the Ward!'],
  bigHit: ["Child's Tantrum!", 'Into the boards!', 'Flattened!', 'What a hit!', "Crone's Corns!"],
  // A hit with a crowd around: "third-witch in" is canon (SPEC §2).
  pileup: ['Third-witch in!', 'Third-witch in, and it gets ugly!'],
  turnover: ['Stripped!', 'Coughed it up!', 'Picked clean!'],
  shotClock: ['Shot clock! That one belongs to the other side.', 'Too slow! Shot clock!'],
  crease: ['In the crease! Turnover.', 'Crease violation!'],
  overtimeWinner: ["Crone's Corns, it's over!", "Child's Tantrum! Sudden death, and that's the game!"],
};
