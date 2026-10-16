/**
 * Writes the tier badges as PNGs for Discord role icons (M14):
 *
 *   npx tsx tools/badge-png.ts
 *
 * `assets/discord/tier-<n>-<64|128>.png`, transparent, nearest-neighbour scaled from the
 * 16×16 art in src/content/badgeArt.ts. Also writes `test-results/badges-sheet.png`, every
 * badge and achievement on the game's dark background, to look over. No image library: a
 * small PNG encoder on node:zlib.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ACHIEVEMENT_ACCENT, ACHIEVEMENT_IDS, ACHIEVEMENTS, TIERS } from '../src/content/badges';
import { BADGE_ART_SIZE, badgePixels, type BadgeArtId } from '../src/content/badgeArt';

type Rgba = [number, number, number, number];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGBA PNG from `pixel(x, y)`. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // no filter
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rgba(hex: string | null): Rgba {
  if (!hex) return [0, 0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** One badge scaled up to `size` (a multiple of 16). */
export function badgePng(art: BadgeArtId, accent: string, size: number): Buffer {
  const px = badgePixels(art, accent);
  const scale = size / BADGE_ART_SIZE;
  return encodePng(size, size, (x, y) => rgba(px[Math.floor(y / scale)]![Math.floor(x / scale)]!));
}

function writeSheet(path: string): void {
  const items: [BadgeArtId, string][] = [
    ...TIERS.map((t): [BadgeArtId, string] => [t.art, t.colour]),
    ...ACHIEVEMENT_IDS.map((id): [BadgeArtId, string] => [ACHIEVEMENTS[id].art, ACHIEVEMENT_ACCENT]),
  ];
  const cell = 96;
  const scale = 5;
  const cols = 5;
  const rows = Math.ceil(items.length / cols);
  const bg: Rgba = [0x0b, 0x0c, 0x14, 255];
  const grids = items.map(([art, accent]) => badgePixels(art, accent));
  const png = encodePng(cols * cell, rows * cell, (x, y) => {
    const i = Math.floor(y / cell) * cols + Math.floor(x / cell);
    const g = grids[i];
    if (!g) return bg;
    const off = (cell - BADGE_ART_SIZE * scale) / 2;
    const gx = Math.floor(((x % cell) - off) / scale);
    const gy = Math.floor(((y % cell) - off) / scale);
    if (gx < 0 || gy < 0 || gx >= BADGE_ART_SIZE || gy >= BADGE_ART_SIZE) return bg;
    const c = g[gy]![gx]!;
    return c ? rgba(c) : bg;
  });
  writeFileSync(path, png);
}

if (
  import.meta.url === `file:///${process.argv[1]!.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('badge-png.ts')
) {
  mkdirSync('assets/discord', { recursive: true });
  for (const t of TIERS) {
    for (const size of [64, 128]) {
      writeFileSync(`assets/discord/tier-${t.tier}-${size}.png`, badgePng(t.art, t.colour, size));
    }
  }
  mkdirSync('test-results', { recursive: true });
  writeSheet('test-results/badges-sheet.png');
  console.log(`Wrote ${TIERS.length * 2} role icons to assets/discord/ and test-results/badges-sheet.png`);
}
