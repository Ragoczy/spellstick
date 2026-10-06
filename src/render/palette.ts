/** Render-only colors. Team colors live in src/content/teams.ts. */
export const PALETTE = {
  background: 0x0b0c14,
  floor: 0x22352d,
  floorLine: 0xe8e6dc,
  boards: 0x3b4150,
  boardsEdge: 0x8a91a3,
  goalFrame: 0xf2f2f2,
  goalNet: 0xcfd6e0,
  ball: 0xffffff,
  /** Canon mana glow (SPEC §2): golden orange. */
  mana: 0xffa630,
  text: 0xf2efe6,
} as const;

export const toCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
