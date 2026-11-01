// Shamble: a slow, clumsy hunter. Works for anything with Brain { type: 'shamble' }.
// - Sometimes staggers in a random direction.
// - If it can see any Prey: remember where, and lurch toward the nearest one.
// - If it can't, but saw prey recently: head to the last place it saw them.
// - Otherwise: shuffle about aimlessly.
import { CONFIG } from '../../config.js';
import { query, isPassable, tryMove } from '../world.js';
import { canSee } from './vision.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function shamble(world, e) {
  const { rng } = world;
  const brain = e.Brain;

  if (rng.chance(CONFIG.zombie.staggerChance)) {
    world.events.emit('entity_staggered', { id: e.id });
    randomStep(world, e);
    return;
  }

  const prey = nearestVisiblePrey(world, e);
  if (prey) {
    if (!brain.lastSeen) world.events.emit('prey_spotted', { id: e.id, preyId: prey.id });
    brain.lastSeen = { x: prey.Position.x, y: prey.Position.y };
    stepToward(world, e, brain.lastSeen);
    return;
  }

  if (brain.lastSeen) {
    const arrived = e.Position.x === brain.lastSeen.x && e.Position.y === brain.lastSeen.y;
    if (arrived || !stepToward(world, e, brain.lastSeen)) {
      brain.lastSeen = null;
      world.events.emit('prey_lost', { id: e.id });
    }
    return;
  }

  if (rng.chance(CONFIG.zombie.wanderChance)) randomStep(world, e);
}

function randomStep(world, e) {
  const [dx, dy] = DIRS[world.rng.int(DIRS.length)];
  if (isPassable(world, e.Position.x + dx, e.Position.y + dy)) tryMove(world, e, dx, dy);
}

// Greedy step to the open neighbour closest to `goal`; ties broken by the seeded RNG.
// Returns false if no step gets closer (stuck, or already next to it).
function stepToward(world, e, goal) {
  const pos = e.Position;
  const dist2 = (x, y) => (x - goal.x) ** 2 + (y - goal.y) ** 2;
  let best = [];
  let bestD = dist2(pos.x, pos.y);
  for (const [dx, dy] of DIRS) {
    const nx = pos.x + dx, ny = pos.y + dy;
    if (!isPassable(world, nx, ny)) continue;
    const d = dist2(nx, ny);
    if (d < bestD) { bestD = d; best = [[dx, dy]]; }
    else if (d === bestD && best.length) best.push([dx, dy]);
  }
  if (!best.length) return false;
  const [dx, dy] = best[world.rng.int(best.length)];
  return tryMove(world, e, dx, dy);
}

function nearestVisiblePrey(world, e) {
  let best = null, bestD = Infinity;
  for (const p of query(world, 'Prey', 'Position')) {
    if (p.id === e.id || !canSee(world, e, p)) continue;
    const d = cheb(p.Position, e.Position);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
