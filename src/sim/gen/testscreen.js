// The phase-1 test room: a walled screen of seeded rocks and short walls (kept for the tests).
// Any floor sealed off from the start is filled in, so everything open is reachable. The town
// is gen/town.js.
import { TILE, TILE_INFO } from '../tiles.js';
export { TILE, TILE_INFO };

// Rocks and short walls inside one screen at (ox, oy), kept 2 tiles off its edges (so you can
// always get round them and between screens) and clear of `keepClear` (x, y) if given.
export function decorateScreen(world, rng, ox, oy, sw, sh, cfg, keepClear) {
  const { w } = world;
  const clear = (x, y) => keepClear && Math.abs(x - keepClear.x) <= 1 && Math.abs(y - keepClear.y) <= 1;
  for (let r = 0; r < cfg.wallRuns; r++) {
    const [lo, hi] = cfg.wallLength;
    const len = lo + rng.int(hi - lo + 1);
    const horiz = rng.chance(0.5);
    const x0 = ox + 2 + rng.int(sw - 4 - (horiz ? len - 1 : 0));
    const y0 = oy + 2 + rng.int(sh - 4 - (horiz ? 0 : len - 1));
    for (let k = 0; k < len; k++) {
      const x = x0 + (horiz ? k : 0), y = y0 + (horiz ? 0 : k);
      if (!clear(x, y)) world.tiles[y * w + x] = TILE.WALL;
    }
  }
  let placed = 0, tries = 0;
  while (placed < cfg.rocks && tries++ < 500) {
    const x = ox + 2 + rng.int(sw - 4), y = oy + 2 + rng.int(sh - 4);
    if (clear(x, y)) continue;
    const i = y * w + x;
    if (world.tiles[i] === TILE.WALL) continue;
    world.tiles[i] = TILE.WALL;
    placed++;
  }
}

// The whole map floored with a wall round its outside edge.
function walledFloor(world) {
  const { w, h } = world;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      world.tiles[y * w + x] = edge ? TILE.WALL : TILE.FLOOR;
    }
  }
}

// The phase-1 test room: one walled screen. Returns the player start.
export function generateTestScreen(world, cfg) {
  walledFloor(world);
  const start = { x: world.w >> 1, y: world.h >> 1 };
  decorateScreen(world, world.rng, 0, 0, world.w, world.h, cfg, start);
  fillSealedPockets(world, start.x, start.y);
  return start;
}

// Flood fill (4-way) from the start; floor it can't reach becomes wall.
export function fillSealedPockets(world, sx, sy) {
  const { w, h } = world;
  const seen = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[j] || world.tiles[j] === TILE.WALL) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen[i]) world.tiles[i] = TILE.WALL;
}
