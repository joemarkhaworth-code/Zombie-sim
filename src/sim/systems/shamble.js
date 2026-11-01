// Shamble: a slow, clumsy hunter. Works for anything with Brain { type: 'shamble' }.
// - Sometimes staggers in a random direction.
// - If it can see any Prey: remember where, and lurch toward the nearest one.
// - Else if it has a goal (where it last saw prey, or a noise it heard): go there,
//   then give up when it arrives or gets stuck.
// - Otherwise: shuffle about aimlessly.
// Hearing a noise (noise_heard) sets the goal to the noise's source; the newest
// noise wins. Seeing prey always takes priority.
import { CONFIG } from '../../config.js';
import { query, isPassable, tryMove } from '../world.js';
import { canSee } from './vision.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function installShamble(world) {
  world.events.on('noise_heard', (d) => {
    const e = world.entities.get(d.id);
    if (!e || !e.Brain || e.Brain.type !== 'shamble') return;
    e.Brain.goal = { x: d.x, y: d.y, why: 'heard' };
  });
}

export function shamble(world, e) {
  const { rng } = world;
  const brain = e.Brain;

  if (rng.chance(CONFIG.zombie.staggerChance)) {
    world.events.emit('entity_staggered', { id: e.id });
    randomStep(world, e);
    return;
  }

  const prey = nearestVisiblePrey(world, e);
  const sawPreyLastTime = brain.seesPrey;
  brain.seesPrey = !!prey;
  brain.trackingId = prey ? prey.id : null;
  if (prey) {
    if (!sawPreyLastTime) world.events.emit('prey_spotted', { id: e.id, preyId: prey.id });
    brain.goal = { x: prey.Position.x, y: prey.Position.y, why: 'seen' };
    stepToward(world, e, brain.goal);
    return;
  }

  if (brain.goal) {
    const g = brain.goal;
    const arrived = e.Position.x === g.x && e.Position.y === g.y;
    if (arrived || !stepToward(world, e, g)) {
      brain.goal = null;
      world.events.emit(g.why === 'seen' ? 'prey_lost' : 'noise_investigated', { id: e.id, x: g.x, y: g.y });
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
    if (p.id === e.id || !canSee(world, e, p, { tracking: e.Brain.trackingId === p.id })) continue;
    const d = cheb(p.Position, e.Position);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
