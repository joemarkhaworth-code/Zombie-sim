// Phase 1 plain test grid: border walls, scattered wall blocks and bush clumps.
import { CONFIG } from '../../config.js';

export const TILE = { FLOOR: 0, WALL: 1, BUSH: 2 };
// blocks: stops movement. opaque: stops sight (and muffles noise).
// cover: anything standing here can only be noticed from an adjacent tile.
export const TILE_INFO = {
  [TILE.FLOOR]: { name: 'floor', blocks: false, opaque: false, cover: false },
  [TILE.WALL]: { name: 'wall', blocks: true, opaque: true, cover: false }, // material: CONFIG.build.wall
  [TILE.BUSH]: { name: 'bush', blocks: false, opaque: false, cover: true },
};
// Short description for long-press inspect (render side picks the wording).
export const TILE_DESC = {
  [TILE.FLOOR]: 'Open ground.',
  [TILE.WALL]: 'A wall.',
  [TILE.BUSH]: 'A bush.',
};

export function generateTestGrid(rng, width, height) {
  const { wallChance, bushClumps, bushClumpSize } = CONFIG.testGrid;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles[y * width + x] = edge || rng.chance(wallChance) ? TILE.WALL : TILE.FLOOR;
    }
  }
  // Bush clumps: a short random walk of bushes from a random floor tile.
  for (let i = 0; i < bushClumps; i++) {
    let x = 1 + rng.int(width - 2), y = 1 + rng.int(height - 2);
    for (let j = 0; j < bushClumpSize; j++) {
      if (tiles[y * width + x] === TILE.FLOOR) tiles[y * width + x] = TILE.BUSH;
      x = Math.min(width - 2, Math.max(1, x + rng.int(3) - 1));
      y = Math.min(height - 2, Math.max(1, y + rng.int(3) - 1));
    }
  }
  return tiles;
}
