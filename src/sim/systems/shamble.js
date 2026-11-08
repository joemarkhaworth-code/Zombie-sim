// Zombie brain. Zombies only chase what they can see:
//   0. A first glimpse of prey further than glimpseRange: stop and stare (?). Still in view on
//      its next look: it's spotted you (!). Gone: it goes to check the spot.
//   1. Prey in view (anything with Prey it notices): its spot becomes the goal; step toward it.
//   2. Lost sight: walk to where it last saw the prey...
//   3. ...then search: shuffle about within searchRadius of that spot for searchActions moves,
//      so it can stumble onto you nearby, then give up.
//   4. Nothing to do: stand about, now and then shuffling a random way.
//   Overriding these: a loud noise (zombie.distractLevel) distracts it for distractActions moves:
//   it heads for the noise even if it can see you, unless you're within glimpseRange.
// Steps follow the shortest 4-way route round walls (stepToward), with a small random stagger. Next to its
// prey (8 ways, like yours) a zombie bites, but never on the action it first spots you.
import { CONFIG } from '../../config.js';
import { tileBlocks, blockerAt, heightAllows } from '../world.js';
import { tryStep } from './movement.js';
import { canNotice } from './vision.js';
import { attack, inReach } from './combat.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Can it step from (fx, fy) onto (x, y)? The same rules as everything that moves.
function open(world, fx, fy, x, y) {
  return heightAllows(world, fx, fy, x, y) && !tileBlocks(world, x, y) && !blockerAt(world, x, y);
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
  const options = DIRS.filter(([dx, dy]) => open(world, x, y, x + dx, y + dy) && (!keep || keep(x + dx, y + dy)));
  if (!options.length) return false;
  const [dx, dy] = options[world.rng.int(options.length)];
  return tryStep(world, e, dx, dy) === 'moved';
}

// One 4-way step toward (tx, ty) along the shortest route round walls (a small breadth-first
// search, zombie.pathLimit tiles at most). Creatures only count as in the way right next to the
// zombie, so it doesn't plan round someone who'll have moved. The goal tile itself may be
// occupied (that's usually you). If there's no route, a plain greedy step. Returns true if it moved.
export function stepToward(world, e, tx, ty) {
  const { x, y } = e.Position;
  if (x === tx && y === ty) return false;
  const first = firstStep(world, e, tx, ty);
  if (first) return tryStep(world, e, first[0], first[1]) === 'moved';
  return greedyStep(world, e, tx, ty);
}

function firstStep(world, e, tx, ty) {
  const { w } = world, sx = e.Position.x, sy = e.Position.y;
  const start = sy * w + sx, goal = ty * w + tx;
  const from = new Map([[start, -1]]);
  const queue = [start];
  // Shuffle the direction order once (seeded), so equal routes don't always bend the same way.
  const dirs = DIRS.slice();
  for (let i = dirs.length - 1; i > 0; i--) { const j = world.rng.int(i + 1); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
  let found = false;
  for (let qi = 0; qi < queue.length && queue.length <= CONFIG.zombie.pathLimit; qi++) {
    const i = queue[qi];
    if (i === goal) { found = true; break; }
    const cx = i % w, cy = (i / w) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy, j = ny * w + nx;
      if (from.has(j) || tileBlocks(world, nx, ny) || !heightAllows(world, cx, cy, nx, ny)) continue;
      if (j !== goal && i === start && blockerAt(world, nx, ny)) continue; // someone right next to it
      from.set(j, i);
      queue.push(j);
    }
  }
  if (!found && !from.has(goal)) return null;
  // Walk back to the step after the start.
  let i = goal;
  while (from.get(i) !== start) { i = from.get(i); if (i === undefined || i === -1) return null; }
  const nx = i % w, ny = (i / w) | 0;
  if (blockerAt(world, nx, ny)) return null; // the goal is right next to it and taken (that's you)
  return [nx - sx, ny - sy];
}

// The old greedy step: the longer axis first, then the shorter one (equal: random).
function greedyStep(world, e, tx, ty) {
  const { x, y } = e.Position;
  const ox = tx - x, oy = ty - y;
  const horiz = [Math.sign(ox), 0], vert = [0, Math.sign(oy)];
  let order;
  if (ox === 0) order = [vert];
  else if (oy === 0) order = [horiz];
  else if (Math.abs(ox) > Math.abs(oy)) order = [horiz, vert];
  else if (Math.abs(oy) > Math.abs(ox)) order = [vert, horiz];
  else order = world.rng.chance(0.5) ? [horiz, vert] : [vert, horiz];
  for (const [dx, dy] of order) {
    if (open(world, x, y, x + dx, y + dy)) return tryStep(world, e, dx, dy) === 'moved';
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
  // Distracted by a loud noise: go and look for a few moves, ignoring prey it can see, unless
  // the prey is close (within glimpseRange): then it snaps back to the prey.
  if (b.distracted) {
    if (prey && manhattan(prey.Position, e.Position) <= cfg.glimpseRange) {
      b.distracted = null;
    } else {
      const d = b.distracted;
      b.tracking = 0; b.glimpsed = 0;
      b.goal = { x: d.x, y: d.y, why: 'heard' };
      if (--d.left <= 0) b.distracted = null;
      if (manhattan(e.Position, d) === 0 || !stepToward(world, e, d.x, d.y)) {
        b.distracted = null;
        startSearch(world, e, d);
      }
      return;
    }
  }
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
  if (!(prey && inReach(world, e, prey)) && world.rng.chance(cfg.stagger)) { randomStep(world, e); return; }

  if (b.goal) {
    const d = manhattan(e.Position, b.goal);
    if (prey && inReach(world, e, prey)) {
      // Next to its prey (8 ways): bite. Not on the action it first spots you (it reacts first),
      // so you always get to act.
      if (wasTracking === prey.id) attack(world, e, prey);
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
    const near = (x, y) => Math.abs(x - s.x) <= cfg.searchRadius && Math.abs(y - s.y) <= cfg.searchRadius;
    // Outside the search area (it couldn't get there): head back toward it, don't freeze.
    if (!near(e.Position.x, e.Position.y)) stepToward(world, e, s.x, s.y);
    else randomStep(world, e, near);
    if (--s.left <= 0) {
      b.search = null;
      world.events.emit('search_gave_up', { id: e.id });
    }
    return;
  }
  if (world.rng.chance(cfg.wanderChance)) randomStep(world, e);
}
