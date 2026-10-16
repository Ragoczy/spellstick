import { DEFAULT_CONFIG, type SimConfig } from '../sim';
import type { BadgeArtId } from './badgeArt';

/**
 * Tier roles and achievements for online play (M14, docs/BADGES.md). Every name, line, and
 * colour here is [PLACEHOLDER], not canon: "prep" and "varsity" are the spec's own flavour
 * words (SPEC §2), and nothing else adds lore. Keep them all here so Paul can rename them in
 * one place. The numbers that decide them (thresholds, how many goals make a hat trick)
 * are tuning, in `config.badges`.
 */

export const ACHIEVEMENT_IDS = [
  'firstWhistle',
  'offTheMark',
  'firstWin',
  'hatTrick',
  'intoTheBoards',
  'lightFingers',
  'shutout',
  'suddenDeath',
  'comeback',
  'fullLibrary',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementInfo {
  name: string;
  /** How to earn it, shown on locked tiles too: nothing is secret. Numbers come from `config.badges`. */
  howTo: (b: SimConfig['badges']) => string;
  art: BadgeArtId;
}

export const ACHIEVEMENTS: Record<AchievementId, AchievementInfo> = {
  firstWhistle: {
    name: 'First Whistle',
    howTo: () => 'Play an online match to the final whistle.',
    art: 'whistle',
  },
  offTheMark: { name: 'Off the Mark', howTo: () => 'Score a goal yourself.', art: 'ballInNet' },
  firstWin: { name: 'First Win', howTo: () => 'Win an online match.', art: 'pennant' },
  hatTrick: {
    name: "Witch's Hat Trick",
    howTo: (b) => `Score ${b.hatTrickGoals} goals yourself in one match.`,
    art: 'hatTrick',
  },
  intoTheBoards: {
    name: 'Into the Boards',
    howTo: (b) => `Slam opponents into the boards ${b.boardSlams} times in one match.`,
    art: 'crackedBoard',
  },
  lightFingers: {
    name: 'Light Fingers',
    howTo: (b) => `Knock the ball loose ${b.loosens} times in one match: a check, Thunderclap, or Snare.`,
    art: 'openHand',
  },
  shutout: { name: 'Shutout', howTo: () => 'Win without conceding a goal.', art: 'wardedGoal' },
  suddenDeath: { name: 'Sudden Death', howTo: () => 'Win in overtime.', art: 'hourglass' },
  comeback: {
    name: 'Comeback',
    howTo: (b) => `Win after trailing by ${b.comebackDeficit} or more goals.`,
    art: 'risingArrow',
  },
  fullLibrary: {
    name: 'Full Library',
    howTo: () => 'Cast all ten spells at least once across your online matches.',
    art: 'spellbook',
  },
};

/** How to earn an achievement, with the game's own numbers. */
export const howToEarn = (id: AchievementId, config: SimConfig = DEFAULT_CONFIG): string =>
  ACHIEVEMENTS[id].howTo(config.badges);

/** The colour achievement art uses for its accent: mana gold (SPEC §2). */
export const ACHIEVEMENT_ACCENT = '#ffa630';

export interface TierInfo {
  /** 1 (lowest) to 5. */
  tier: number;
  /** Also the Discord role's name. */
  name: string;
  /** The role colour, and the badge art's accent. */
  colour: string;
  art: BadgeArtId;
}

/** Lowest first. Colours avoid both team colours and climb to the canon mana gold. */
export const TIERS: readonly TierInfo[] = [
  { tier: 1, name: 'Prep Witch', colour: '#c89858', art: 'tierPrep' },
  { tier: 2, name: 'Varsity Witch', colour: '#bcbcbc', art: 'tierVarsity' },
  { tier: 3, name: 'First Line', colour: '#8e6cd8', art: 'tierFirstLine' },
  { tier: 4, name: 'Captain', colour: '#c9761a', art: 'tierCaptain' },
  { tier: 5, name: 'Golden Stick', colour: '#ffa630', art: 'tierGolden' },
];

/** Words on the profile page and results screen. */
export const BADGE_TEXT = {
  profileTitle: 'Profile',
  achievements: 'Achievements',
  noTier: 'No rank yet',
  noTierHint: 'Play an online match to the final whistle to earn your first achievement.',
  toNext: (n: number, tier: string) => `${n} more achievement${n === 1 ? '' : 's'} to ${tier}`,
  topTier: 'Top rank',
  earned: (date: string) => `Earned ${date}`,
  locked: 'Locked',
  libraryProgress: (cast: number, all: number) => `${cast} / ${all} spells cast`,
  career: (matches: number, wins: number, goals: number) =>
    `${matches} online match${matches === 1 ? '' : 'es'} · ${wins} win${wins === 1 ? '' : 's'} · ${goals} goal${goals === 1 ? '' : 's'}`,
  onlineOnly: 'Achievements come from online matches only.',
  notFound: 'No Spellstick record for this player yet.',
  unavailable: 'Profiles are not available right now.',
  deleteRecord: 'Delete my record',
  deleteConfirm: 'Delete your achievements, rank, and match counts? Your tier role in Discord goes too.',
  deleted: 'Your record is deleted.',
  back: 'Back',
  viewProfile: 'Profile',
  unlocked: 'Unlocked',
  newRank: (tier: string) => `New rank: ${tier}`,
};
