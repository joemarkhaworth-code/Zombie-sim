// Zombie brain: a greedy 4-way step toward the nearest Prey, with a small random stagger.
// No line of sight yet (step 4): zombies always know where prey is. No biting yet (step 8):
// next to its prey a zombie just stands there.
import { CONFIG } from '../../config.js';
import { tileBlocks, blockerAt } from '../world.js';
import { tryStep } from './movement.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function nearestPrey(world, e) {
  let best = null, bestD = Infinity;
  for (const o of world.entities.values()) {
    if (!o.Prey || !o.Position || o === e) continue;
    const d = Math.abs(o.Position.x - e.Position.x) + Math.abs(o.Position.y - e.Position.y);
    if (d < bestD || (d === bestD && o.id < best.id)) { bestD = d; best = o; }
  }
  return best;
}

function open(world, x, y) {
  return !tileBlocks(world, x, y) && !blockerAt(world, x, y);
}

export function shamble(world, e) {
  const rng = world.rng;
  const { x, y } = e.Position;
  if (rng.chance(CONFIG.zombie.stagger)) {
    const options = DIRS.filter(([dx, dy]) => open(world, x + dx, y + dy));
    if (options.length) { const [dx, dy] = options[rng.int(options.length)]; tryStep(world, e, dx, dy); }
    return;
  }
  const prey = nearestPrey(world, e);
  if (!prey) return;
  const ox = prey.Position.x - x, oy = prey.Position.y - y;
  if (Math.abs(ox) + Math.abs(oy) <= 1) return; // next to it: nothing to do until combat
  // Try the longer axis first, then the shorter one. Ties pick an axis at random.
  const horiz = [Math.sign(ox), 0], vert = [0, Math.sign(oy)];
  let order;
  if (ox === 0) order = [vert];
  else if (oy === 0) order = [horiz];
  else if (Math.abs(ox) > Math.abs(oy)) order = [horiz, vert];
  else if (Math.abs(oy) > Math.abs(ox)) order = [vert, horiz];
  else order = rng.chance(0.5) ? [horiz, vert] : [vert, horiz];
  for (const [dx, dy] of order) {
    if (open(world, x + dx, y + dy)) { tryStep(world, e, dx, dy); return; }
  }
  // Stuck behind something: stand there groaning (stagger will shake it loose).
}
