import type { ArenaGeometry, Vec2 } from '../sim';

/** Screen layout of the rink inside the fixed-size game canvas. */
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;
const HUD_HEIGHT = 80;
const MARGIN = 40;

/** Maps sim world meters to canvas pixels. */
export class WorldView {
  readonly ppm: number;
  readonly originX: number;
  readonly originY: number;

  constructor(arena: ArenaGeometry) {
    const availW = CANVAS_WIDTH - MARGIN * 2;
    const availH = CANVAS_HEIGHT - HUD_HEIGHT - MARGIN;
    this.ppm = Math.min(availW / (arena.halfLength * 2), availH / (arena.halfWidth * 2));
    this.originX = CANVAS_WIDTH / 2;
    this.originY = HUD_HEIGHT + availH / 2;
  }

  x(worldX: number): number {
    return this.originX + worldX * this.ppm;
  }

  y(worldY: number): number {
    return this.originY + worldY * this.ppm;
  }

  len(meters: number): number {
    return meters * this.ppm;
  }

  toWorld(screenX: number, screenY: number): Vec2 {
    return { x: (screenX - this.originX) / this.ppm, y: (screenY - this.originY) / this.ppm };
  }
}
