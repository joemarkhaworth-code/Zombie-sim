// Shamble: a slow, clumsy hunter. Works for anything with Brain { type: 'shamble' }.
// - Sometimes staggers in a random direction.
// - If it can see any Prey: remember where, and lurch toward the nearest one;
//   if it's adjacent, attack it. The first time it notices (or after being hit by
//   something it hadn't noticed) it spends an action reacting - a groan, which is
//   noise - so it can never strike on the same action it notices you.
// - Else if it has a goal (where it last saw prey, or a noise it heard): go there,
//   search around it for a few moves (it may spot you again), then give up.
// - Otherwise: shuffle about aimlessly.
// Hearing a noise (noise_heard) sets the goal to the noise's source; the newest
// noise wins. Seeing prey always takes priority.
import { CONFIG } from '../../config.js';
import { query, isPassable, tryMove } from '../world.js';
import { canSee } from './vision.js';
import { attack } from './combat.js';
import { structureAt, isObstacle, damageStructure } from './structures.js';
import { meleeStats } from './items.js';
import { makeNoise } from './noise.js';
import { stairsAt, climb } from './floors.js';

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
    brain.goal = { x: prey.Position.x, y: prey.Position.y, why: 'seen' };
    if (!sawPreyLastTime) {
      // Just noticed it: react (turn, groan) instead of acting this time.
      world.events.emit('prey_spotted', { id: e.id, preyId: prey.id });
      brain.reacting = CONFIG.zombie.reactActions;
    }
    if (brain.reacting > 0) {
      brain.reacting--;
      makeNoise(world, e.Position.x, e.Position.y, CONFIG.zombie.groanNoise, e.id);
      world.events.emit('entity_reacted', { id: e.id, preyId: prey.id });
      return;
    }
    if (cheb(prey.Position, e.Position) <= 1 && e.Melee) attack(world, e, prey);
    else stepToward(world, e, brain.goal);
    return;
  }

  if (brain.goal) {
    const g = brain.goal;
    if (g.search === undefined) {
      // Head for the spot. On arrival (or if stuck), search around it for a while.
      // At stairs or a ladder (it saw you go up, or heard you through them): follow, if it
      // can, and search the other side. A pulled-up ladder stops it: it searches here.
      const arrived = e.Position.x === g.x && e.Position.y === g.y;
      if (arrived && stairsAt(world, g.x, g.y) && climb(world, e)) {
        brain.goal = { x: e.Position.x, y: e.Position.y, why: g.why, search: CONFIG.zombie.searchActions };
        return;
      }
      if (arrived || !stepToward(world, e, g)) g.search = CONFIG.zombie.searchActions;
      return;
    }
    if (g.search > 0) {
      g.search--;
      searchStep(world, e, g);
      return;
    }
    brain.goal = null;
    world.events.emit(g.why === 'seen' ? 'prey_lost' : 'noise_investigated', { id: e.id, x: g.x, y: g.y });
    return;
  }

  if (rng.chance(CONFIG.zombie.wanderChance)) randomStep(world, e);
}

// Shuffle about near the goal: a random step that stays within searchRadius of it.
function searchStep(world, e, g) {
  const r = CONFIG.zombie.searchRadius;
  const options = DIRS.filter(([dx, dy]) => {
    const nx = e.Position.x + dx, ny = e.Position.y + dy;
    return Math.max(Math.abs(nx - g.x), Math.abs(ny - g.y)) <= r && isPassable(world, nx, ny);
  });
  if (!options.length) return;
  const [dx, dy] = options[world.rng.int(options.length)];
  tryMove(world, e, dx, dy);
}

function randomStep(world, e) {
  const [dx, dy] = DIRS[world.rng.int(DIRS.length)];
  if (isPassable(world, e.Position.x + dx, e.Position.y + dy)) tryMove(world, e, dx, dy);
}

// Greedy step to the open neighbour closest to `goal`; ties broken by the seeded RNG.
// Zombies can't use handles: if the best way is through a closed door, window or
// barricade, they bash it instead (noisy). Returns false if no step gets closer.
function stepToward(world, e, goal) {
  const pos = e.Position;
  const dist2 = (x, y) => (x - goal.x) ** 2 + (y - goal.y) ** 2;
  let best = [];
  let bestD = dist2(pos.x, pos.y);
  for (const [dx, dy] of DIRS) {
    const nx = pos.x + dx, ny = pos.y + dy;
    if (!isPassable(world, nx, ny) && !isObstacle(structureAt(world, nx, ny))) continue;
    const d = dist2(nx, ny);
    if (d < bestD) { bestD = d; best = [[dx, dy]]; }
    else if (d === bestD && best.length) best.push([dx, dy]);
  }
  if (!best.length) return false;
  const [dx, dy] = best[world.rng.int(best.length)];
  const obstacle = structureAt(world, pos.x + dx, pos.y + dy);
  if (isObstacle(obstacle)) return damageStructure(world, obstacle, meleeStats(world, e).damage, e.id);
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
