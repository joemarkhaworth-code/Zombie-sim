// Test screen: floor walled round the edge, a few short walls and single-tile rocks, all seeded.
// Any floor sealed off from the start is filled in, so everything open is reachable.
export const TILE = { FLOOR: 0, WALL: 1, BUSH: 2 };

// Tiles are properties, not special cases.
export const TILE_INFO = {
  [TILE.FLOOR]: { name: 'floor', blocks: false, opaque: false },
  [TILE.WALL]: { name: 'wall', blocks: true, opaque: true },
  // A hiding spot: walkable and see-through, but anything in it can only be noticed from next to it.
  [TILE.BUSH]: { name: 'bush', blocks: false, opaque: false, cover: true },
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
  const nearStart = (x, y) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
  // Short straight walls, kept off the outer wall so you can always get round them.
  for (let r = 0; r < cfg.wallRuns; r++) {
    const [lo, hi] = cfg.wallLength;
    const len = lo + world.rng.int(hi - lo + 1);
    const horiz = world.rng.chance(0.5);
    const x0 = 2 + world.rng.int(w - 4 - (horiz ? len - 1 : 0));
    const y0 = 2 + world.rng.int(h - 4 - (horiz ? 0 : len - 1));
    for (let k = 0; k < len; k++) {
      const x = x0 + (horiz ? k : 0), y = y0 + (horiz ? 0 : k);
      if (!nearStart(x, y)) world.tiles[y * w + x] = TILE.WALL;
    }
  }
  let placed = 0, tries = 0;
  while (placed < cfg.rocks && tries++ < 500) {
    const x = 2 + world.rng.int(w - 4), y = 2 + world.rng.int(h - 4);
    if (nearStart(x, y)) continue; // keep the start clear
    const i = y * w + x;
    if (world.tiles[i] === TILE.WALL) continue;
    world.tiles[i] = TILE.WALL;
    placed++;
  }
  fillSealedPockets(world, cx, cy);
  // Bush clumps on open floor (walkable, so they never cut anything off).
  for (let c = 0; c < cfg.bushClumps; c++) {
    const [lo, hi] = cfg.bushClumpSize;
    let n = lo + world.rng.int(hi - lo + 1);
    let x = 1 + world.rng.int(w - 2), y = 1 + world.rng.int(h - 2), tries = 0;
    while (n > 0 && tries++ < 40) {
      if (world.tiles[y * w + x] === TILE.FLOOR && !nearStart(x, y)) { world.tiles[y * w + x] = TILE.BUSH; n--; }
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][world.rng.int(4)];
      if (x + dx > 0 && x + dx < w - 1 && y + dy > 0 && y + dy < h - 1) { x += dx; y += dy; }
    }
  }
  return { x: cx, y: cy }; // player start
}

// Flood fill (4-way) from the start; floor it can't reach becomes wall.
function fillSealedPockets(world, sx, sy) {
  const { w, h } = world;
  const seen = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] || TILE_INFO[world.tiles[j]].blocks) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen[i] && world.tiles[i] !== TILE.WALL) world.tiles[i] = TILE.WALL;
}
