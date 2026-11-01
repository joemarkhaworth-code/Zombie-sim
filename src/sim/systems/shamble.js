// Shamble: lurch one tile toward the nearest Prey. Sometimes staggers randomly.
// Works for anything with Brain { type: 'shamble' }, chasing anything with Prey.
import { CONFIG } from '../../config.js';
import { query, isPassable, tryMove } from '../world.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function shamble(world, e) {
  const { rng } = world;
  const pos = e.Position;

  if (rng.chance(CONFIG.zombie.staggerChance)) {
    const [dx, dy] = DIRS[rng.int(DIRS.length)];
    world.events.emit('entity_staggered', { id: e.id });
    if (isPassable(world, pos.x + dx, pos.y + dy)) tryMove(world, e, dx, dy);
    return;
  }

  const target = nearestPrey(world, e);
  if (!target) return;
  const dist2 = (x, y) => (x - target.Position.x) ** 2 + (y - target.Position.y) ** 2;

  // Pick the open neighbour that gets closest; ties broken by the seeded RNG.
  let best = [];
  let bestD = dist2(pos.x, pos.y); // only move if it actually gets closer
  for (const [dx, dy] of DIRS) {
    const nx = pos.x + dx, ny = pos.y + dy;
    if (!isPassable(world, nx, ny)) continue;
    const d = dist2(nx, ny);
    if (d < bestD) { bestD = d; best = [[nx, ny]]; }
    else if (d === bestD && best.length) best.push([nx, ny]);
  }
  if (!best.length) return; // stuck or already adjacent: just stand there groaning
  const [nx, ny] = best[rng.int(best.length)];
  tryMove(world, e, nx - pos.x, ny - pos.y);
}

function nearestPrey(world, e) {
  let best = null, bestD = Infinity;
  for (const p of query(world, 'Prey', 'Position')) {
    if (p.id === e.id) continue;
    const d = Math.max(Math.abs(p.Position.x - e.Position.x), Math.abs(p.Position.y - e.Position.y));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
