import Phaser from 'phaser';
import type { ArenaGeometry } from '../sim';
import { PALETTE as BASE_PALETTE } from './palette';
import { LOW_H, LOW_W, PIX, RETRO, RETRO_PALETTE } from './retro';
import { CANVAS_HEIGHT, CANVAS_WIDTH, type WorldView } from './view';

const BOARD_THICKNESS_M = 0.6;

/**
 * Draws the static rink (floor, boards, lines, creases, goals) once into a texture and shows
 * it as an image, so it isn't re-tessellated every frame.
 */
export function drawRink(
  scene: Phaser.Scene,
  arena: ArenaGeometry,
  view: WorldView,
  teamColors: [number, number],
): Phaser.GameObjects.Image {
  const PALETTE = RETRO ? { ...BASE_PALETTE, ...RETRO_PALETTE } : BASE_PALETTE;
  // Retro: no line thinner than one art pixel, or it breaks up at low resolution.
  const lw = (n: number) => (RETRO ? Math.max(n, PIX * 1.5) : n);
  const g = scene.make.graphics({}, false);
  const w = view.len(arena.halfLength * 2);
  const h = view.len(arena.halfWidth * 2);
  const left = view.x(-arena.halfLength);
  const top = view.y(-arena.halfWidth);
  const radius = view.len(arena.cornerRadius);
  const board = view.len(BOARD_THICKNESS_M);

  // Boards: a larger rounded rect behind the floor.
  g.fillStyle(PALETTE.boards, 1);
  g.fillRoundedRect(left - board, top - board, w + board * 2, h + board * 2, radius + board);
  g.lineStyle(lw(2), PALETTE.boardsEdge, 1);
  g.strokeRoundedRect(left - board, top - board, w + board * 2, h + board * 2, radius + board);

  // Floor.
  g.fillStyle(PALETTE.floor, 1);
  g.fillRoundedRect(left, top, w, h, radius);
  g.lineStyle(lw(2), PALETTE.boardsEdge, 0.8);
  g.strokeRoundedRect(left, top, w, h, radius);

  // Center line and faceoff circle.
  g.lineStyle(lw(2), PALETTE.floorLine, 0.35);
  g.lineBetween(view.x(0), top, view.x(0), top + h);
  g.strokeCircle(view.x(0), view.y(0), view.len(arena.centerCircleRadius));
  g.fillStyle(PALETTE.floorLine, 0.5);
  g.fillCircle(view.x(0), view.y(0), 3);

  for (const goal of arena.goals) {
    const color = teamColors[goal.defendedBy];
    const cx = view.x(goal.mouth.x);
    const cy = view.y(goal.mouth.y);

    // Crease: tinted fill plus outline in the defending team's color.
    g.fillStyle(color, 0.18);
    g.fillCircle(cx, cy, view.len(goal.creaseRadius));
    g.lineStyle(lw(3), color, 0.9);
    g.strokeCircle(cx, cy, view.len(goal.creaseRadius));

    // Goal: open toward center, net extends behind the goal line.
    const depth = view.len(goal.depth);
    const topY = cy - view.len(goal.width / 2);
    const botY = cy + view.len(goal.width / 2);
    const backX = cx + goal.backDir * depth;
    g.fillStyle(PALETTE.goalNet, 0.25);
    g.fillRect(Math.min(cx, backX), topY, depth, botY - topY);
    g.lineStyle(lw(3), PALETTE.goalFrame, 1);
    g.beginPath();
    g.moveTo(cx, topY);
    g.lineTo(backX, topY);
    g.lineTo(backX, botY);
    g.lineTo(cx, botY);
    g.strokePath();
    // Goal line across the mouth.
    g.lineStyle(lw(2), PALETTE.floorLine, 0.6);
    g.lineBetween(cx, topY, cx, botY);
  }

  if (RETRO) {
    // Rasterize once at the low art resolution; shown 1:1 inside the retro world.
    const key = `rink8-${teamColors[0]}-${teamColors[1]}`;
    if (!scene.textures.exists(key)) {
      const dt = scene.textures.addDynamicTexture(key, LOW_W, LOW_H)!;
      dt.draw(g.setScale(1 / PIX));
      dt.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    g.destroy();
    return scene.add.image(0, 0, key).setOrigin(0, 0).setScale(PIX);
  }

  const key = `rink-${teamColors[0]}-${teamColors[1]}`;
  if (!scene.textures.exists(key)) g.generateTexture(key, CANVAS_WIDTH, CANVAS_HEIGHT);
  g.destroy();
  return scene.add.image(0, 0, key).setOrigin(0, 0);
}
