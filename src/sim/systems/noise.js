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
import { hearingMask } from './weather.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function installNoise(world) {
  world.noise = new Uint8Array(world.width * world.height);
  world.events.on('entity_moved', (d) => {
    const e = world.entities.get(d.id);
    if (e && e.Noisy && e.Noisy.move > 0) makeNoise(world, d.to.x, d.to.y, e.Noisy.move, e.id);
    // Ground that makes noise when stepped on (stream splash, hedge rustle); sneaking: one less.
    const step = TILE_INFO[tileAt(world, d.to.x, d.to.y)].stepNoise - (e && e.Stealth && e.Stealth.sneaking ? 1 : 0);
    if (step > 0) {
      world.events.emit('ground_noise', { id: d.id, x: d.to.x, y: d.to.y, tile: tileAt(world, d.to.x, d.to.y), fromTile: tileAt(world, d.from.x, d.from.y) });
      makeNoise(world, d.to.x, d.to.y, step, d.id);
    }
  });
}

// Clear the heatmap; called at the start of each player turn.
export function clearNoise(world) {
  world.noise.fill(0);
}

// Strength of a noise at every tile it reaches: Map of tile index -> strength (>= 1).
// Sound also goes up and down stairs and ladders (world.links), losing
// CONFIG.floors.linkNoiseCost, and never into void. origins (optional Map) is filled
// with where each tile hears it coming from: the source, or the stairs it came up/down.
export function spreadNoise(world, x, y, level, origins = null) {
  const radius = CONFIG.noise.radiusByLevel[level] || 0;
  const out = new Map();
  if (radius <= 0 || !inBounds(world, x, y)) return out;
  // Dijkstra with small integer costs, as a bucket queue.
  const cost = new Map([[y * world.width + x, 0]]);
  const from = new Map([[y * world.width + x, y * world.width + x]]); // tile -> where it's heard from
  const buckets = [[[x, y]]];
  const links = world.links || new Map();
  for (let c = 0; c < radius; c++) {
    for (const [cx, cy] of buckets[c] || []) {
      const idx = cy * world.width + cx;
      if (cost.get(idx) !== c) continue; // stale entry
      out.set(idx, radius - c);
      if (origins) origins.set(idx, from.get(idx));
      const link = links.get(idx);
      if (link !== undefined) { // up or down the stairs: heard on the other floor as coming from them
        const nc = c + CONFIG.floors.linkNoiseCost;
        if (nc < radius && !(cost.has(link) && cost.get(link) <= nc)) {
          cost.set(link, nc); from.set(link, link);
          (buckets[nc] ||= []).push([link % world.width, Math.floor(link / world.width)]);
        }
      }
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(world, nx, ny) || TILE_INFO[tileAt(world, nx, ny)].silent) continue;
        const sid = world.structures && world.structures.get(ny * world.width + nx);
        const solid = TILE_INFO[tileAt(world, nx, ny)].opaque || (sid !== undefined && !!world.entities.get(sid)?.Blocks);
        const step = solid ? CONFIG.noise.wallCost : 1; // walls, closed doors and windows muffle
        const nc = c + step;
        const nidx = ny * world.width + nx;
        if (nc >= radius || (cost.has(nidx) && cost.get(nidx) <= nc)) continue;
        cost.set(nidx, nc);
        from.set(nidx, from.get(idx));
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
  const origins = new Map();
  const field = spreadNoise(world, x, y, level, origins);
  for (const [idx, s] of field) if (s > world.noise[idx]) world.noise[idx] = s;
  world.events.emit('noise_made', { x, y, level, sourceId });
  for (const e of world.entities.values()) {
    if (!e.Hearing || !e.Position || e.id === sourceId) continue;
    const at = e.Position.y * world.width + e.Position.x;
    const s = (field.get(at) || 0) - hearingMask(world, e); // rain drowns sound outdoors
    if (s >= CONFIG.noise.minStrengthToHear[e.Hearing.level] && s > 0) {
      const o = origins.get(at); // the source, or the stairs it came through
      world.events.emit('noise_heard', { id: e.id, x: o % world.width, y: Math.floor(o / world.width), strength: s, sourceId, sourceX: x, sourceY: y });
    }
  }
}
