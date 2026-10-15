import type { SpellId } from '../sim';

/**
 * Spell names and descriptions (SPEC §6). Since M10 the names come from the Spellstick card
 * game's spell library (Paul's game content, not from the books); gameplay only uses the ids,
 * so rename freely. The first three kept the ids they had as Hex Shove, Quickstep, and Bent Shot.
 */
export interface SpellInfo {
  name: string;
  /** A word or two for the spell bar's small icons. */
  short: string;
  blurb: string;
}

export const SPELLS: Record<SpellId, SpellInfo> = {
  hexShove: {
    name: 'Thunderclap',
    short: 'Thunder',
    blurb: 'A cone of thunder knocks foes back and pops the ball loose',
  },
  quickstep: { name: 'Burst of Speed', short: 'Burst', blurb: '+50% speed for 3 seconds' },
  bentShot: {
    name: 'Misdirection',
    short: 'Misdirect',
    blurb: 'Your next shot sets off wide and curls in; goalies misread it',
  },
  pinpoint: {
    name: 'Pinpoint',
    short: 'Pinpoint',
    blurb: 'Your next shot goes exactly where you aim, and is harder to save',
  },
  blink: { name: 'Blink', short: 'Blink', blurb: "Teleport a few steps the way you're moving, ball and all" },
  snare: {
    name: 'Snare',
    short: 'Snare',
    blurb: 'Pins the nearest foe in front of you and binds their stick; a carrier may lose the ball',
  },
  iceWall: {
    name: 'Ice Wall',
    short: 'Ice Wall',
    blurb: 'A short wall in front of you: balls and witches bounce off',
  },
  stoneSkin: {
    name: 'Stone Skin',
    short: 'Stone',
    blurb: "For a few seconds, hits can't knock you down or strip the ball",
  },
  tailwind: {
    name: 'Tailwind',
    short: 'Tailwind',
    blurb: "Your next pass flies fast and far, and can't be picked off",
  },
  glamourSelf: {
    name: 'Glamour Self',
    short: 'Glamour',
    blurb: 'Two illusions run beside you and take hits meant for you',
  },
  ward: { name: 'Ward', short: 'Ward', blurb: "The goalie's shield: blocks one shot" },
};
