/**
 * Pixel art for the tier badges and achievements (M14, docs/BADGES.md): 16×16 grids, one
 * letter per pixel, in the 8-bit look of the match (src/render/retro.ts). `A` is the accent:
 * a tier's colour on tier badges, mana gold on achievements. [PLACEHOLDER] art, like the
 * names in badges.ts: Paul may replace it. Pure data and string building, no DOM.
 */

/** Letter → colour. `.` is transparent. */
export const BADGE_PALETTE: Record<string, string> = {
  K: '#101018', // outline
  W: '#fcfcfc', // white: balls, highlights
  G: '#bcbcbc', // light grey: stick heads, metal
  N: '#7c7c7c', // grey: netting, shade
  B: '#c89858', // wood: the stick colour in the match
  b: '#7a5230', // dark wood
  H: '#3c2a5c', // a witch's hat
  h: '#5a4486', // hat highlight
  O: '#ffa630', // mana gold (canon)
  o: '#c9761a', // deep gold
  Y: '#fce4a0', // pale glow
  R: '#d83838', // pennant red
  P: '#e8dcc0', // parchment
};

export type BadgeArtId =
  | 'tierPrep'
  | 'tierVarsity'
  | 'tierFirstLine'
  | 'tierCaptain'
  | 'tierGolden'
  | 'whistle'
  | 'ballInNet'
  | 'pennant'
  | 'hatTrick'
  | 'crackedBoard'
  | 'openHand'
  | 'wardedGoal'
  | 'hourglass'
  | 'risingArrow'
  | 'spellbook';

export const BADGE_ART: Record<BadgeArtId, readonly string[]> = {
  // A plain wooden stick; one pip.
  tierPrep: [
    '................',
    '..........KKK...',
    '.........KGGGK..',
    '........KGNGNGK.',
    '........KGGNGGK.',
    '........KGNGNK..',
    '.........KGGK...',
    '........KBK.....',
    '.......KBK......',
    '......KBK.......',
    '.....KBK........',
    '....KBK.........',
    '...KbK..........',
    '..KbK...........',
    '..KK.......KAK..',
    '............K...',
  ],
  // A stick with a ball in the pocket; two pips.
  tierVarsity: [
    '................',
    '..........KKK...',
    '.........KGGGK..',
    '........KGWWGGK.',
    '........KWWWNGK.',
    '........KGWNGK..',
    '.........KGGK...',
    '........KBK.....',
    '.......KBK......',
    '......KBK.......',
    '.....KBK........',
    '....KBK.........',
    '...KbK..........',
    '..KbK...........',
    '..KK.....KAK.KAK',
    '..........K...K.',
  ],
  // Two crossed sticks under a ball; three pips.
  tierFirstLine: [
    '......KWWK......',
    '..KK..KWNK..KK..',
    '.KGGK..KK..KGGK.',
    '.KGNGK....KGNGK.',
    '..KGGK....KGGK..',
    '...KBK....KBK...',
    '....KBK..KBK....',
    '.....KBKKBK.....',
    '......KBBK......',
    '.....KBKKBK.....',
    '....KBK..KBK....',
    '...KbK....KbK...',
    '..KbK......KbK..',
    '..KK........KK..',
    '...KAK.KAK.KAK..',
    '....K...K...K...',
  ],
  // A witch's hat with a captain's band; four pips.
  tierCaptain: [
    '.........KK.....',
    '........KhK.....',
    '.......KhHK.....',
    '.......KhHHK....',
    '......KhHHHK....',
    '......KhHHHHK...',
    '.....KAAAYAAK...',
    '.....KAAAYAAK...',
    '....KhHHHHHHHK..',
    '..KKhHHHHHHHHHKK',
    '.KhhHHHHHHHHHHHK',
    '..KKKKKKKKKKKKK.',
    '................',
    '................',
    '.KAK.KAK.KAK.KAK',
    '..K...K...K...K.',
  ],
  // A stick blazing golden-orange, the ball a star; five pips.
  tierGolden: [
    '.........Y.Y.Y..',
    '..........KKK..Y',
    '.........KOOOK..',
    '.......YKOWYWOK.',
    '........KOYWYOKY',
    '.......YKOWYWK..',
    '.........KOOK.Y.',
    '......Y.KOK.....',
    '.......KOK......',
    '.....YKOK.......',
    '.....KOK........',
    '...YKOK.........',
    '...KoK..........',
    '..KoK...........',
    '..KK.KAKKAKKAKKA',
    '.......K..K..K..',
  ],
  // A whistle on a lanyard.
  whistle: [
    '................',
    '..AA............',
    '.A..A...........',
    '.A...A..........',
    '..A...A.........',
    '...A...KKKKKKKK.',
    '....A.KGGGGGGGGK',
    '.....KGGWWGGGGGK',
    '....KGGWGGGKKKKK',
    '....KGGGGGGK....',
    '....KGGGNNGK....',
    '....KGGGNNGK....',
    '.....KGGGGK.....',
    '......KKKK......',
    '................',
    '................',
  ],
  // A ball in the back of the net.
  ballInNet: [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWWWWWWWK.',
    '.KWNKNKNKNKNKWK.',
    '.KWKNKNKNKNKNWK.',
    '.KWNKNKKKNKNKWK.',
    '.KWKNKKWWKNKNWK.',
    '.KWNKKWWWNKNKWK.',
    '.KWKNKWWNNKNKWK.',
    '.KWNKNKNNKNKNWK.',
    '.KWKNKNKKNKNKWK.',
    '.KWNKNKNKNKNKWK.',
    '.KWKNKNKNKNKNWK.',
    '.KWK........KWK.',
    '.KKK........KKK.',
    '................',
  ],
  // A stick raised high with a pennant.
  pennant: [
    '....KKK.........',
    '...KGGGK........',
    '..KGNGNGK.......',
    '..KGGNGGK.......',
    '...KGNGK........',
    '....KBKRRRRRK...',
    '....KBKRRRRRRRK.',
    '....KBKRRRRRRRRK',
    '....KBKRRRRRRK..',
    '....KBKRRRRK....',
    '....KBKKKKK.....',
    '....KBK.........',
    '....KBK.........',
    '....KbK.........',
    '....KbK.........',
    '....KKK.........',
  ],
  // A witch's hat with three balls.
  hatTrick: [
    '.........KK.....',
    '........KhK.....',
    '.......KhHK.....',
    '.......KhHHK....',
    '......KhHHHK....',
    '......KAAAAAK...',
    '.....KhHHHHHK...',
    '..KKKhHHHHHHHKK.',
    '.KhhHHHHHHHHHHHK',
    '..KKKKKKKKKKKKK.',
    '................',
    '.KKK..KKK..KKK..',
    'KWWNKKWWNKKWWNK.',
    'KWNNKKWNNKKWNNK.',
    '.KKK..KKK..KKK..',
    '................',
  ],
  // A cracked board with an impact flash.
  crackedBoard: [
    '...A.....A......',
    '....A...A.......',
    '..A..A.A..A.....',
    '...A..A..A......',
    'KKKKKKKKKKKKKKKK',
    'GGGGGGKGGGGGGGGG',
    'WWWWWKWKWWWWWWWW',
    'GGGGKGGGKGGGGGGG',
    'GGGGGKGKGGGGGGGG',
    'NNNNNNKNNNKNNNNN',
    'GGGGGKGGGKGKGGGG',
    'GGGGKGGGGGGGKGGG',
    'WWWWWWWWWWWWWWWW',
    'GGGGGGGGGGGGGGGG',
    'KKKKKKKKKKKKKKKK',
    '................',
  ],
  // An open hand and a ball knocked loose.
  openHand: [
    '..........KKK...',
    '.........KWWNK..',
    '.........KWNNK..',
    '..........KKK...',
    '....K.K.K.......',
    '...KYKYKYK......',
    '...KYKYKYK.K....',
    '...KYKYKYKKYK...',
    '...KYYYYYKYYK...',
    '...KYYYYYYYK....',
    '...KYYYYYYK.....',
    '....KYYYYYK.....',
    '....KYYYYK......',
    '.....KbbbK......',
    '.....KbbbK......',
    '.....KKKKK......',
  ],
  // A goal mouth sealed by a ward glyph.
  wardedGoal: [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWWWWWWWK.',
    '.KWN..AAAA..NWK.',
    '.KWN.A....A.NWK.',
    '.KWNA..AA..ANWK.',
    '.KWNA.A..A.ANWK.',
    '.KWNA.A..A.ANWK.',
    '.KWNA..AA..ANWK.',
    '.KWN.A....A.NWK.',
    '.KWN..AAAA..NWK.',
    '.KWN........NWK.',
    '.KWK........KWK.',
    '.KKK........KKK.',
    '................',
    '................',
  ],
  // An hourglass running out.
  hourglass: [
    '..KKKKKKKKKKKK..',
    '..KbbbbbbbbbbK..',
    '...KGGGGGGGGK...',
    '...KGYYYYYYGK...',
    '....KGYYYYGK....',
    '.....KGYYGK.....',
    '......KGGK......',
    '......KGYK......',
    '.....KGGYGK.....',
    '....KGGGYGGK....',
    '...KGGGGYGGGK...',
    '...KGGYYYYGGK...',
    '...KGYYYYYYGK...',
    '..KbbbbbbbbbbK..',
    '..KKKKKKKKKKKK..',
    '................',
  ],
  // An arrow rising out of the net: from behind to ahead.
  risingArrow: [
    '.........KKKKK..',
    '..........KAAK..',
    '.........KAAAK..',
    '........KAAKAK..',
    '.......KAAK.KK..',
    '......KAAK......',
    '.....KAAK.......',
    'K...KAAK.......K',
    'KW.KAAK.......WK',
    'KWKAAKNKNKNKNKWK',
    'KWKAKNKNKNKNKNWK',
    'KWNKNKNKNKNKNKWK',
    'KWKNKNKNKNKNKNWK',
    'KWWWWWWWWWWWWWWK',
    'KKKKKKKKKKKKKKKK',
    '................',
  ],
  // An open spellbook with a glowing page.
  spellbook: [
    '.......Y........',
    '...Y...A...Y....',
    '.....A.A.A......',
    '......AAA.......',
    '.KKKK..A..KKKK..',
    'KPPPPKK.KKPPPPK.',
    'KPNNPPPKPPPNNPK.',
    'KPPPNNPKPNNPPPK.',
    'KPNNPPPKPPPNNPK.',
    'KPPPNNPKPNNPPPK.',
    'KPNNPPPKPPPNNPK.',
    'KPPPPPPKPPPPPPK.',
    'KHKKKKPKPKKKKHK.',
    'KHHHHHKKKHHHHHK.',
    '.KKKKKK.KKKKKK..',
    '................',
  ],
};

/** The grid's size (pixels a side). */
export const BADGE_ART_SIZE = 16;

/** One colour per pixel (null: transparent), row by row. `accent` is the colour for `A`. */
export function badgePixels(id: BadgeArtId, accent: string): (string | null)[][] {
  return BADGE_ART[id].map((row) =>
    [...row].map((c) => (c === '.' ? null : c === 'A' ? accent : (BADGE_PALETTE[c] ?? null))),
  );
}

/**
 * An SVG of the art, crisp at any size (runs of one colour drawn as one rect). `size` is the
 * width and height it asks for, in CSS pixels.
 */
export function badgeSvg(id: BadgeArtId, accent: string, size = 64): string {
  const rects: string[] = [];
  badgePixels(id, accent).forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const colour = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === colour) end++;
      if (colour) rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${colour}"/>`);
      x = end;
    }
  });
  const n = BADGE_ART_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}
