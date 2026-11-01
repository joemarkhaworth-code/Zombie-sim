// Phase 1 plain test grid: border walls plus scattered wall blocks.
import { CONFIG } from '../../config.js';

export const TILE = { FLOOR: 0, WALL: 1 };
export const TILE_INFO = {
  [TILE.FLOOR]: { name: 'floor', blocks: false, opaque: false },
  [TILE.WALL]: { name: 'wall', blocks: true, opaque: true },
};
// Short description for long-press inspect (render side picks the wording).
export const TILE_DESC = {
  [TILE.FLOOR]: 'Open ground.',
  [TILE.WALL]: 'A wall.',
};

export function generateTestGrid(rng, width, height) {
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles[y * width + x] = edge || rng.chance(CONFIG.testGrid.wallChance) ? TILE.WALL : TILE.FLOOR;
    }
  }
  return tiles;
}
