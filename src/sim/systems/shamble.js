// Zombie brain. Zombies only chase what they can see:
//   0. A first glimpse of prey further than glimpseRange: stop and stare (?). Still in view on
//      its next look: it's spotted you (!). Gone: it goes to check the spot.
//   1. Prey in view (anything with Prey it notices): its spot becomes the goal; step toward it.
//   2. Lost sight: walk to where it last saw the prey...
//   3. ...then search: shuffle about within searchRadius of that spot for searchActions moves,
//      so it can stumble onto you nearby, then give up.
//   4. Nothing to do: stand about, now and then shuffling a random way.
// Steps are greedy and 4-way, with a small random stagger. Next to its
// prey (4 ways) a zombie bites, but never on the action it first spots you.
import { CONFIG } from '../../config.js';
import { tileBlocks, blockerAt } from '../world.js';
import { tryStep } from './movement.js';
import { canNotice } from './vision.js';
import { attack } from './combat.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function open(world, x, y) {
  return !tileBlocks(world, x, y) && !blockerAt(world, x, y);
}

// The nearest prey this zombie can see (ties: lowest id), or null.
export function visiblePrey(world, e) {
  let best = null, bestD = Infinity;
  for (const o of world.entities.values()) {
    if (!o.Prey || !o.Position || o === e) continue;
    if (!canNotice(world, e, o)) continue;
    const d = manhattan(o.Position, e.Position);
    if (d < bestD || (d === bestD && o.id < best.id)) { bestD = d; best = o; }
  }
  return best;
}

function randomStep(world, e, keep) {
  const { x, y } = e.Position;
  const options = DIRS.filter(([dx, dy]) => open(world, x + dx, y + dy) && (!keep || keep(x + dx, y + dy)));
  if (!options.length) return false;
  const [dx, dy] = options[world.rng.int(options.length)];
  return tryStep(world, e, dx, dy) === 'moved';
}

// One greedy 4-way step toward (tx, ty): the longer axis first, then the shorter one
// (equal: random). Returns true if it moved.
export function stepToward(world, e, tx, ty) {
  const { x, y } = e.Position;
  const ox = tx - x, oy = ty - y;
  const horiz = [Math.sign(ox), 0], vert = [0, Math.sign(oy)];
  let order;
  if (ox === 0 && oy === 0) return false;
  if (ox === 0) order = [vert];
  else if (oy === 0) order = [horiz];
  else if (Math.abs(ox) > Math.abs(oy)) order = [horiz, vert];
  else if (Math.abs(oy) > Math.abs(ox)) order = [vert, horiz];
  else order = world.rng.chance(0.5) ? [horiz, vert] : [vert, horiz];
  for (const [dx, dy] of order) {
    if (open(world, x + dx, y + dy)) return tryStep(world, e, dx, dy) === 'moved';
  }
  return false;
}

function startSearch(world, e, spot) {
  const b = e.Brain;
  b.goal = null;
  b.search = { x: spot.x, y: spot.y, left: CONFIG.zombie.searchActions };
}

export function shamble(world, e) {
  const b = e.Brain, cfg = CONFIG.zombie;
  const prey = visiblePrey(world, e);
  if (prey && !b.tracking && b.glimpsed !== prey.id && manhattan(prey.Position, e.Position) > cfg.glimpseRange) {
    // A glimpse at a distance: stop and stare (spends this action). It only comes for you if it
    // still sees you on its next look; if you've gone, it shuffles over to check the spot.
    b.glimpsed = prey.id;
    b.goal = { x: prey.Position.x, y: prey.Position.y, why: 'glimpsed' };
    b.search = null;
    world.events.emit('prey_glimpsed', { id: e.id, preyId: prey.id });
    // A stare is quicker than a step: refund the rest of the action.
    if (e.Actor) e.Actor.energy += CONFIG.scheduler.actionCost - cfg.glimpseCost;
    return;
  }
  b.glimpsed = 0;
  const wasTracking = b.tracking;
  if (prey) {
    if (!b.tracking) world.events.emit('prey_spotted', { id: e.id, preyId: prey.id });
    b.tracking = prey.id;
    b.goal = { x: prey.Position.x, y: prey.Position.y, why: 'seen' };
    b.search = null;
  } else if (b.tracking) {
    b.tracking = 0; // lost sight: head for where it was last seen
    world.events.emit('prey_lost', { id: e.id });
  }

  // Stagger (a random lurch) never interrupts a zombie that's next to its prey.
  if (!(prey && manhattan(prey.Position, e.Position) === 1) && world.rng.chance(cfg.stagger)) { randomStep(world, e); return; }

  if (b.goal) {
    const d = manhattan(e.Position, b.goal);
    if (prey && d <= 1) {
      // Next to its prey (4 ways): bite. Not on the action it first spots you (it reacts first),
      // so you always get to act.
      if (d === 1 && wasTracking === prey.id) attack(world, e, prey);
      return;
    }
    if (d === 0 || !stepToward(world, e, b.goal.x, b.goal.y)) {
      // Arrived (or can't get any closer): search around the spot.
      if (!prey) startSearch(world, e, b.goal);
    }
    return;
  }
  if (b.search) {
    const s = b.search;
    randomStep(world, e, (x, y) => Math.abs(x - s.x) <= cfg.searchRadius && Math.abs(y - s.y) <= cfg.searchRadius);
    if (--s.left <= 0) {
      b.search = null;
      world.events.emit('search_gave_up', { id: e.id });
    }
    return;
  }
  if (world.rng.chance(cfg.wanderChance)) randomStep(world, e);
}
