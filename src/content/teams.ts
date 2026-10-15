import type { AiStyle } from '../sim';

/**
 * Team names are canon (SPEC §2). Colors are a [DEFAULT] choice (SPEC §8).
 * Playing styles and their blurbs are [PLACEHOLDER] gameplay, not canon (M9): they only
 * change how the team's AI plays (the numbers are `config.ai.styles`).
 * Keep all display content here so Paul can rename, recolor, or restyle in one place.
 */
export interface TeamInfo {
  id: string;
  name: string;
  /** Primary color as 0xRRGGBB. */
  color: number;
  /** How the team's AI plays. */
  style: AiStyle;
  /** One line for team select. */
  styleBlurb: string;
}

export const TEAMS = {
  wyverns: {
    id: 'wyverns',
    name: 'Wyverns',
    color: 0xb3203a,
    style: 'physical',
    styleBlurb: 'Hit hard and carry the ball',
  },
  ichthyocentaurs: {
    id: 'ichthyocentaurs',
    name: 'Ichthyocentaurs',
    color: 0x1f9e93,
    style: 'passing',
    styleBlurb: 'Move the ball and wait for a clean look',
  },
  willowmere: {
    id: 'willowmere',
    name: 'Willowmere Witches',
    color: 0x7b4bc4,
    style: 'spellcraft',
    styleBlurb: 'Cast more spells than anyone',
  },
} as const satisfies Record<string, TeamInfo>;

export type TeamId = keyof typeof TEAMS;

export const DEFAULT_HOME: TeamId = 'wyverns';
export const DEFAULT_AWAY: TeamId = 'ichthyocentaurs';
