import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view';

/**
 * The 8-bit look, the default since M8 (Paul, 2026-10-10). `?look=classic` in the URL brings
 * back the original smooth vector look.
 *
 * The world (rink, players, ball, spell effects) is drawn into a low-resolution texture every
 * frame and shown scaled up with nearest-neighbour filtering, so everything is chunky pixels.
 * The HUD stays at full resolution on top. With `?look=classic` nothing here runs.
 */
export const RETRO =
  typeof location === 'undefined' || new URLSearchParams(location.search).get('look') !== 'classic';

/** Screen pixels per art pixel. */
export const PIX = 3;
export const LOW_W = Math.ceil(CANVAS_WIDTH / PIX);
export const LOW_H = Math.ceil(CANVAS_HEIGHT / PIX);

/** NES-flavoured overrides for the render palette. */
export const RETRO_PALETTE = {
  background: 0x000000,
  floor: 0x1e5a32,
  floorLine: 0xfcfcfc,
  boards: 0x585858,
  boardsEdge: 0xbcbcbc,
  goalFrame: 0xfcfcfc,
  goalNet: 0xbcbcbc,
  ball: 0xfcfcfc,
  stick: 0xc89858,
} as const;

/** Snap a full-resolution coordinate to the art-pixel grid. */
export const snap = (v: number): number => Math.round(v / PIX) * PIX;

/**
 * Owns the low-res world: a scaled-down container that every world game object is moved into,
 * and the render texture it's drawn into each frame. Objects added to the scene after
 * `capture()` are treated as world objects; anything created before (the HUD) stays crisp.
 */
export class RetroWorld {
  private readonly container: Phaser.GameObjects.Container;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private pending: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.make.container({ x: 0, y: 0 }, false).setScale(1 / PIX);
    this.rt = scene.add.renderTexture(0, 0, LOW_W, LOW_H).setOrigin(0, 0).setScale(PIX).setDepth(-100);
    this.rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** From now on, newly added scene objects belong to the low-res world. */
  capture(): void {
    this.scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj: Phaser.GameObjects.GameObject) => {
      if (obj !== this.rt) this.pending.push(obj);
    });
  }

  /** Call once at the end of every scene update. */
  render(): void {
    for (const obj of this.pending) if (obj.scene && !obj.parentContainer) this.container.add(obj);
    this.pending = [];
    this.container.sort('depth');
    this.rt.clear().fill(RETRO_PALETTE.background).draw(this.container);
  }
}

/*
 * Witch sprite, three-quarter top-down, facing right (flipped for left): a young athlete, not a
 * crone. Small head under a pointed hat, long hair down her back, fitted jersey, shorts, legs.
 * K outline, H hat, h brim, G hat band, A hair, S skin, E eye, L lips, R jersey, W jersey stripe,
 * D shorts, P goalie pads, B boots.
 */
const HEAD = [
  '......KK....',
  '.....KHHK...',
  '....KHHHK...',
  '...KGGGGGK..',
  '.KKhhhhhhhKK',
  '..KAAAAAAAK.',
  '..KAASSSSK..',
  '.KAASSSESK..',
  '.KAASSSSSK..',
  '.KAAKSSLK...',
];
const RUNNER_BODY = [
  '.KAAKRWRK...',
  '..KAKRRRRK..',
  '..KKRRWRRSK.',
  '...KRRRRK...',
  '...KDDDDDK..',
  '..KDDDDDDK..',
];
const GOALIE_BODY = [
  '.KAAKRWRK...',
  '.KPKRRRRPK..',
  '.KPPRRWRPSK.',
  '..KPRRRRPK..',
  '..KPDDDDPK..',
  '..KPPDDPPK..',
];
/** Two walk frames: feet together, then mid-stride. */
const LEGS = [
  ['...KSKKSK...', '...KSKKSK...', '...KBKKBK...'],
  ['...KSK.KSK..', '..KSK...KSK.', '..KBK...KBK.'],
];

export const SPRITE_W = HEAD[0]!.length;
export const SPRITE_H = HEAD.length + RUNNER_BODY.length + LEGS[0]!.length;
/** Art pixel that sits on the sim position (the waist). */
export const SPRITE_ORIGIN = { x: 6, y: 12 };
/** Art pixels from the origin down to the soles, for the shadow. */
export const SPRITE_FEET = SPRITE_H - SPRITE_ORIGIN.y;

/** Per-player looks so a team isn't a row of clones. Purely cosmetic, picked by player id. */
const HAIR = ['#f0d070', '#5a3018', '#1c1410', '#b0401c', '#d89850', '#3a2a20'];
const SKIN = ['#f6c8a0', '#e8b088', '#c08458', '#8c5434'];
export interface WitchLook {
  hair: string;
  skin: string;
}
export const witchLook = (playerId: number): WitchLook => ({
  hair: HAIR[playerId % HAIR.length]!,
  skin: SKIN[(playerId * 3 + 1) % SKIN.length]!,
});

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const shade = (c: number, f: number): number => {
  const r = Math.round(((c >> 16) & 0xff) * f);
  const g = Math.round(((c >> 8) & 0xff) * f);
  const b = Math.round((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
};

/** Generates (once) and returns the texture key for a witch with this team color, role, look and walk frame. */
export function witchTexture(
  scene: Phaser.Scene,
  color: number,
  goalie: boolean,
  look: WitchLook,
  frame: 0 | 1,
): string {
  const key = `witch-${color}-${goalie ? 'g' : 'r'}-${look.hair}-${look.skin}-${frame}`;
  if (scene.textures.exists(key)) return key;
  // Goalies wear pads down their legs.
  const legs = LEGS[frame]!.map((row) => (goalie ? row.replaceAll('S', 'P') : row));
  const data = [...HEAD, ...(goalie ? GOALIE_BODY : RUNNER_BODY), ...legs];
  const palette: Record<string, string> = {
    K: '#101018',
    H: hex(shade(color, 0.75)),
    h: hex(shade(color, 0.5)),
    G: goalie ? '#fcfcfc' : '#ffa630',
    A: look.hair,
    S: look.skin,
    E: '#101018',
    L: '#c04860',
    R: hex(color),
    W: '#fcfcfc',
    D: hex(shade(color, 0.45)),
    P: '#d8d8d8',
    B: '#3c2410',
  };
  // Phaser types the palette as hex digits only; any single-character key works at runtime.
  scene.textures.generate(key, {
    data,
    pixelWidth: 1,
    palette: palette as unknown as Phaser.Types.Create.Palette,
  });
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
