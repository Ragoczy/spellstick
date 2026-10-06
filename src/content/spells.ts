import type { SpellId } from '../sim';

/**
 * [PLACEHOLDER] Spell names and descriptions (SPEC §6). These are not canon: Paul will
 * supply the real spells. Rename freely; gameplay only uses the ids.
 */
export interface SpellInfo {
  name: string;
  /** Keyboard key for runner spells (the goalie's Ward is AI-only). */
  key?: 'Q' | 'E' | 'R';
  blurb: string;
}

export const SPELLS: Record<SpellId, SpellInfo> = {
  hexShove: { name: 'Hex Shove', key: 'Q', blurb: 'Cone blast: knocks foes back and pops the ball loose' },
  quickstep: { name: 'Quickstep', key: 'E', blurb: '+40% speed for 2.5 seconds' },
  bentShot: { name: 'Bent Shot', key: 'R', blurb: 'Your next shot curves in from wide' },
  ward: { name: 'Ward', blurb: "The goalie's shield: blocks one shot" },
};
