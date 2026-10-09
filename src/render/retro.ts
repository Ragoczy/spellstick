import Phaser from 'phaser';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view';

/**
 * EXPERIMENT: an 8-bit look, switched on with `?look=8bit` in the URL.
 *
 * The world (rink, players, ball, spell effects) is drawn into a low-resolution texture every
 * frame and shown scaled up with nearest-neighbour filtering, so everything is chunky pixels.
 * The HUD stays at full resolution on top. Without the URL flag nothing here runs.
 */
export const RETRO =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('look') === '8bit';

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
 * Witch sprite, three-quarter top-down, facing right (flipped for left).
 * K outline, H hat, h brim, G hat band, S skin, R robe, r robe shade, W sash, P goalie pads, B boots.
 */
const WITCH_TOP = [
  '......KK..',
  '.....KHK..',
  '....KHHK..',
  '...KHHHK..',
  '...KGGGGK.',
  '.KKHHHHHKK',
  'KhhhhhhhhK',
  '.KSSSSSSK.',
  '.KSSSSKSK.',
  '..KSSSSK..',
];
const RUNNER_BODY = ['.KRRWWRRK.', 'KRRRWWRRRK', 'KrRRRRRRrK', '.KrrrrrrK.'];
const GOALIE_BODY = ['.KPRWWRPK.', 'KPPRWWRPPK', 'KPPRRRRPPK', '.KPrrrrPK.'];
const LEGS = [['.KBK..KBK.'], ['..KBKKBK..']];

export const SPRITE_W = 10;
export const SPRITE_H = WITCH_TOP.length + RUNNER_BODY.length + 1;
/** Art pixel that sits on the sim position (roughly the body's middle). */
export const SPRITE_ORIGIN = { x: 5, y: 10 };

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const shade = (c: number, f: number): number => {
  const r = Math.round(((c >> 16) & 0xff) * f);
  const g = Math.round(((c >> 8) & 0xff) * f);
  const b = Math.round((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
};

/** Generates (once) and returns the texture key for a witch in this team color, role and walk frame. */
export function witchTexture(scene: Phaser.Scene, color: number, goalie: boolean, frame: 0 | 1): string {
  const key = `witch-${color}-${goalie ? 'g' : 'r'}-${frame}`;
  if (scene.textures.exists(key)) return key;
  const data = [...WITCH_TOP, ...(goalie ? GOALIE_BODY : RUNNER_BODY), ...LEGS[frame]!];
  const palette: Record<string, string> = {
    K: '#101018',
    H: hex(shade(color, 0.75)),
    h: hex(shade(color, 0.5)),
    G: goalie ? '#fcfcfc' : '#ffa630',
    S: '#f0bc8c',
    R: hex(color),
    r: hex(shade(color, 0.7)),
    W: '#fcfcfc',
    P: '#d8d8d8',
    B: '#503000',
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
