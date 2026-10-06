/**
 * Team names are canon (SPEC §2). Colors are a [DEFAULT] choice (SPEC §8).
 * Keep all display content here so Paul can rename or recolor in one place.
 */
export interface TeamInfo {
  id: string;
  name: string;
  /** Primary color as 0xRRGGBB. */
  color: number;
}

export const TEAMS = {
  wyverns: { id: 'wyverns', name: 'Wyverns', color: 0xb3203a },
  ichthyocentaurs: { id: 'ichthyocentaurs', name: 'Ichthyocentaurs', color: 0x1f9e93 },
  willowmere: { id: 'willowmere', name: 'Willowmere Witches', color: 0x7b4bc4 },
} as const satisfies Record<string, TeamInfo>;

export type TeamId = keyof typeof TEAMS;

export const DEFAULT_HOME: TeamId = 'wyverns';
export const DEFAULT_AWAY: TeamId = 'ichthyocentaurs';
