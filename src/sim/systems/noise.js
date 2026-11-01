// Noise: actions make noise at a level 0-3. It spreads outward from the source,
// losing strength with distance, and walls muffle it. Anything with a Hearing
// component that it reaches strongly enough hears it (noise_heard), and other
// systems decide what to do about that (zombies investigate).
//
// Spread: strength starts at CONFIG.noise.radiusByLevel[level] at the source and
// drops by 1 per step (8 directions). Stepping into an opaque tile (wall) costs
// CONFIG.noise.wallCost instead, so a wall muffles sound rather than stopping it.
// The map edge blocks it.
//
// world.noise holds the loudest strength at each tile since the start of the
// current player turn: the debug heatmap reads it.
//
// Sources: anything with Noisy { move } makes that much noise when it moves.
// Other systems (fights, gunshots, doors...) call makeNoise() directly.
import { CONFIG } from '../../config.js';
import { inBounds, tileAt } from '../world.js';
import { TILE_INFO } from '../gen/testgrid.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function installNoise(world) {
  world.noise = new Uint8Array(world.width * world.height);
  world.events.on('entity_moved', (d) => {
    const e = world.entities.get(d.id);
    if (e && e.Noisy && e.Noisy.move > 0) makeNoise(world, d.to.x, d.to.y, e.Noisy.move, e.id);
  });
}

// Clear the heatmap; called at the start of each player turn.
export function clearNoise(world) {
  world.noise.fill(0);
}

// Strength of a noise at every tile it reaches: Map of tile index -> strength (>= 1).
export function spreadNoise(world, x, y, level) {
  const radius = CONFIG.noise.radiusByLevel[level] || 0;
  const out = new Map();
  if (radius <= 0 || !inBounds(world, x, y)) return out;
  // Dijkstra with small integer costs, as a bucket queue.
  const cost = new Map([[y * world.width + x, 0]]);
  const buckets = [[[x, y]]];
  for (let c = 0; c < radius; c++) {
    for (const [cx, cy] of buckets[c] || []) {
      const idx = cy * world.width + cx;
      if (cost.get(idx) !== c) continue; // stale entry
      out.set(idx, radius - c);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(world, nx, ny)) continue;
        const step = TILE_INFO[tileAt(world, nx, ny)].opaque ? CONFIG.noise.wallCost : 1;
        const nc = c + step;
        const nidx = ny * world.width + nx;
        if (nc >= radius || (cost.has(nidx) && cost.get(nidx) <= nc)) continue;
        cost.set(nidx, nc);
        (buckets[nc] ||= []).push([nx, ny]);
      }
    }
  }
  return out;
}

// Make a noise. Emits noise_made, updates the heatmap, and emits noise_heard for
// every listener (other than the source) it reaches loudly enough.
export function makeNoise(world, x, y, level, sourceId = null) {
  if (level <= 0) return;
  const field = spreadNoise(world, x, y, level);
  for (const [idx, s] of field) if (s > world.noise[idx]) world.noise[idx] = s;
  world.events.emit('noise_made', { x, y, level, sourceId });
  for (const e of world.entities.values()) {
    if (!e.Hearing || !e.Position || e.id === sourceId) continue;
    const s = field.get(e.Position.y * world.width + e.Position.x) || 0;
    if (s >= CONFIG.noise.minStrengthToHear[e.Hearing.level]) {
      world.events.emit('noise_heard', { id: e.id, x, y, strength: s, sourceId });
    }
  }
}
