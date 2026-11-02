// Scent (step 18): you leave a trail; zombies can smell it and follow.
//
// Anything with Scent lays it on its tile every tick. A tile's scent is a level 0-3 that
// fades with age: 3 when fresh, one less every CONFIG.scent.fadeTicks. Stored as a
// stamp per tile (world.scentLaid: the clock when last laid, +1; 0 = never), so nothing
// has to be updated every tick:
//   - indoor tiles age by world.tick;
//   - outdoor tiles age by world.scentClock, which runs faster in rain and snow
//     (1 + the weather's scentWash per tick), so weather washes trails away.
// Water and void never hold scent: wading the beck breaks your trail.
//
// Smell is a 0-3 sense (Smell component), like hearing: CONFIG.scent.minLevelBySmell sets
// the faintest scent noticed. A zombie with nothing better to do (not chasing what it sees
// or hears) that smells a fresh enough trail on or next to its tile steps to the freshest
// neighbour that's fresher than where it stands. Where the trail ends it searches.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from '../gen/testgrid.js';
import { weatherOf } from './weather.js';

const NO_SCENT = new Set([TILE.STREAM, TILE.LAKE, TILE.POND, TILE.VOID]);

export function installScent(world) {
  world.scentLaid = new Uint32Array(world.width * world.height);
  world.scentClock = 0;
}

const isIndoor = (world, i) => !!TILE_INFO[world.tiles[i]].indoor;
const clockFor = (world, i) => (isIndoor(world, i) ? world.tick : world.scentClock);

// Age (in its clock's ticks) of the scent at tile i; Infinity if none.
function ageAt(world, i) {
  const stamp = world.scentLaid[i];
  return stamp ? clockFor(world, i) - (stamp - 1) : Infinity;
}

export function scentLevel(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  const age = ageAt(world, y * world.width + x);
  return age === Infinity ? 0 : Math.max(0, 3 - Math.floor(age / CONFIG.scent.fadeTicks));
}

export function layScent(world, x, y) {
  const i = y * world.width + x;
  if (NO_SCENT.has(world.tiles[i])) return;
  world.scentLaid[i] = clockFor(world, i) + 1;
}

// Every tick: the outdoor clock runs on (faster in rain), scented things lay scent.
export function tickScent(world) {
  world.scentClock += 1 + (weatherOf(world).scentWash || 0);
  for (const e of world.entities.values()) if (e.Scent && e.Position) layScent(world, e.Position.x, e.Position.y);
}

// The freshest neighbouring tile e can smell and walk to that's fresher than its own;
// null if none. (Used by the zombie brain.)
export function scentStep(world, e, canStep) {
  if (!e.Smell) return null;
  const min = CONFIG.scent.minLevelBySmell[e.Smell.level];
  const { x: ox, y: oy } = e.Position;
  const here = ageAt(world, oy * world.width + ox);
  let best = null, bestAge = here;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = ox + dx, y = oy + dy;
    if (scentLevel(world, x, y) < min || !canStep(x, y)) continue;
    const age = ageAt(world, y * world.width + x);
    if (age < bestAge) { bestAge = age; best = { x, y, dx, dy }; }
  }
  return best;
}
