// Step 1 test screen: floor walled round the edge, plus a few seeded single-tile rocks.
export const TILE = { FLOOR: 0, WALL: 1 };

// Tiles are properties, not special cases.
export const TILE_INFO = {
  [TILE.FLOOR]: { name: 'floor', blocks: false },
  [TILE.WALL]: { name: 'wall', blocks: true },
};

export function generateTestScreen(world, cfg) {
  const { w, h } = world;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      world.tiles[y * w + x] = edge ? TILE.WALL : TILE.FLOOR;
    }
  }
  const cx = w >> 1, cy = h >> 1;
  let placed = 0, tries = 0;
  while (placed < cfg.rocks && tries++ < 500) {
    const x = 2 + world.rng.int(w - 4), y = 2 + world.rng.int(h - 4);
    if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) continue; // keep the start clear
    const i = y * w + x;
    if (world.tiles[i] === TILE.WALL) continue;
    world.tiles[i] = TILE.WALL;
    placed++;
  }
  return { x: cx, y: cy }; // player start
}
