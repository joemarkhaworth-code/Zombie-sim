// Animals (step 23): sheep, deer, geese, foxes, dogs and crows. One brain runs every
// species; what each does comes from its data (CONFIG.animals.species):
//   - Fear: an animal that notices something it fears (you, a zombie, a dog...), fire, or a
//     loud enough noise, runs from it. Its herd runs with it (panic spreads). A fleeing
//     herd that stampedes knocks over whatever's in its way (pushed or staggered, no harm).
//     Geese and dogs give the alarm (honk, bark: noise that zombies hear).
//   - Hunting: dog packs and foxes go after the species they hunt when they're not fed;
//     the pack shares one target. A kill feeds the whole pack for a while.
//   - Fighting back: geese and dogs hit back when hit; the rest run.
//   - Scavenging: crows and foxes go to bodies they can see; crows circle them, so a ring
//     of crows on the map marks the dead.
//   - Otherwise they keep near their herd and home spot, wander a little, and call now and
//     then (sheep bleat, crows caw, foxes scream at night). Each rests outside its hours.
//   - Prey animals have Prey, so zombies go after them too (and leave the player be).
// Crows fly: over walls and water, never indoors, and they block nobody.
import { CONFIG } from '../../config.js';
import { TILE_INFO } from '../gen/testgrid.js';
import { addEntity, tryMove, blockerAt, inBounds } from '../world.js';
import { lineClear } from './vision.js';
import { makeNoise } from './noise.js';
import { attack } from './combat.js';
import { pushEntity, stagger } from './shove.js';
import { indoorAt } from './weather.js';
import { ambientAt } from './light.js';

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const speciesOf = (e) => (e && e.Animal ? CONFIG.animals.species[e.Animal.species] : null);
// What kind of creature something is, for fears and hunting: 'player', 'zombie' or a species.
export const kindOf = (e) => (e.Player ? 'player' : e.Animal ? e.Animal.species : e.Brain && e.Brain.type === 'shamble' ? 'zombie' : null);

export function makeAnimal(world, species, x, y, herd = null) {
  const S = CONFIG.animals.species[species];
  return addEntity(world, {
    Position: { x, y },
    Glyph: { char: S.char, fg: S.fg, bg: S.bg },
    Name: { name: S.name },
    Actor: { speed: S.speed, energy: 0, actions: 0 },
    Health: { hp: S.health, max: S.health },
    ...(S.melee ? { Melee: { ...S.melee } } : {}),
    Hearing: { level: S.hearing },
    ...(S.prey ? { Prey: {} } : {}),
    ...(S.flies ? { Flies: {} } : { Blocks: {} }),
    ...(S.tracks ? { Tracks: { mark: S.tracks } } : {}),
    Brain: { type: 'animal' },
    Animal: { species, herd, home: { x, y }, flee: null, target: null, fedUntil: 0, calledAt: -999 },
  });
}

export function installAnimals(world) {
  // A loud enough noise scares it (animals' own calls don't).
  world.events.on('noise_heard', (d) => {
    const e = world.entities.get(d.id), S = speciesOf(e);
    if (!S || !S.startle || d.strength < S.startle) return;
    const src = d.sourceId != null && world.entities.get(d.sourceId);
    if (src && src.Animal) return;
    scare(world, e, { x: d.sourceX ?? d.x, y: d.sourceY ?? d.y });
  });
  // Hit: fight back, or run.
  const hit = (d) => {
    const e = world.entities.get(d.targetId), S = speciesOf(e), by = world.entities.get(d.id);
    if (!S || !by || !by.Position) return;
    if (S.fightsBack && e.Melee) e.Animal.target = by.id;
    else scare(world, e, by.Position);
  };
  world.events.on('attack_hit', hit);
  world.events.on('attack_missed', hit);
  // A kill feeds the hunter's pack.
  world.events.on('entity_died', (d) => {
    const k = d.killerId != null && world.entities.get(d.killerId), S = speciesOf(k);
    if (!S || !S.hunts) return;
    for (const m of herdOf(world, k)) { m.Animal.fedUntil = world.tick + S.fed; m.Animal.target = null; }
    world.events.emit('animal_fed', { id: k.id, x: d.x, y: d.y });
  });
}

// Creatures and bodies, gathered once a tick (animals look through them every action).
function around(world) {
  if (world.animalCache && world.animalCache.tick === world.tick && world.animalCache.n === world.entities.size) return world.animalCache;
  const c = { tick: world.tick, n: world.entities.size, living: [], bodies: [], animals: [] };
  for (const o of world.entities.values()) {
    if (!o.Position) continue;
    if (o.Health) c.living.push(o);
    if (o.Corpse) c.bodies.push(o);
    if (o.Animal) c.animals.push(o);
  }
  return (world.animalCache = c);
}

function herdOf(world, e) {
  if (!e.Animal.herd) return [e];
  return around(world).animals.filter((o) => o.Animal.herd === e.Animal.herd && world.entities.has(o.id));
}

// Run from `from`; the herd nearby runs too.
export function scare(world, e, from) {
  const S = speciesOf(e);
  const was = e.Animal.flee;
  for (const m of herdOf(world, e)) {
    if (m !== e && cheb(m.Position, e.Position) > (S.herd || 0) * 3) continue;
    m.Animal.flee = { x: from.x, y: from.y, left: S.flee };
    m.Animal.target = m.Animal.target && S.fightsBack ? m.Animal.target : null;
  }
  if (!was) world.events.emit('animal_fled', { id: e.id, x: e.Position.x, y: e.Position.y, species: e.Animal.species, stampede: !!S.stampede && herdOf(world, e).length > 2 });
}

// Does animal e notice t? Line of sight, the light on t, cover, sneaking; next to it always.
function notices(world, e, t, radius) {
  const d = cheb(e.Position, t.Position);
  if (d > radius) return false;
  if (d <= 1) return true;
  const i = t.Position.y * world.width + t.Position.x;
  const lv = world.light ? world.light[i] : 3;
  let r = radius * CONFIG.vision.noticeByLight[lv];
  if (TILE_INFO[world.tiles[i]].cover) return false; // in a bush: only from next to it
  if (t.Stealth && t.Stealth.sneaking) r *= CONFIG.stealth.sneakNoticeFactor;
  if (d > r) return false;
  return speciesOf(e).flies || lineClear(world, e.Position.x, e.Position.y, t.Position.x, t.Position.y);
}

const fireNear = (world, p, r) => {
  if (!world.fire) return null;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = p.x + dx, y = p.y + dy;
    if (inBounds(world, x, y) && world.fire[y * world.width + x]) return { x, y };
  }
  return null;
};

// Can e step onto (x, y)? Fliers: anywhere outdoors but the void. Walkers: the usual rule.
function canEnter(world, e, x, y) {
  if (!inBounds(world, x, y)) return false;
  const i = y * world.width + x;
  if (world.fire && world.fire[i]) return false; // never into flames
  if (e.Flies) return !TILE_INFO[world.tiles[i]].silent && !indoorAt(world, i);
  return !blockerAt(world, x, y);
}

function stepTo(world, e, dx, dy) {
  const nx = e.Position.x + dx, ny = e.Position.y + dy;
  if (e.Flies) {
    const from = { ...e.Position };
    e.Position = { x: nx, y: ny };
    world.events.emit('entity_moved', { id: e.id, from, to: { x: nx, y: ny } });
    return true;
  }
  return tryMove(world, e, dx, dy);
}

// The best step toward (sign +1) or away from (sign -1) a point; null if none helps.
function bestStep(world, e, to, sign) {
  const here = cheb(e.Position, to);
  let best = null, bestScore = sign > 0 ? here : -here;
  const order = DIRS.slice(world.rng.int(8)).concat(DIRS); // start somewhere random: no favourite direction
  for (const [dx, dy] of order.slice(0, 8)) {
    const x = e.Position.x + dx, y = e.Position.y + dy;
    if (!canEnter(world, e, x, y)) continue;
    const d = Math.max(Math.abs(x - to.x), Math.abs(y - to.y)) + (Math.abs(x - to.x) + Math.abs(y - to.y)) * 0.01;
    const score = sign > 0 ? d : -d;
    if (score < bestScore) { bestScore = score; best = [dx, dy]; }
  }
  return best;
}

// Toward a point: the greedy step, or if that's stuck (a wall in the way), the first step of
// the shortest way round within `R` tiles.
function stepToward(world, e, to, R = 14) {
  let s = bestStep(world, e, to, 1);
  if (!s && world.tick >= (e.Animal.stuckUntil || 0)) { // look for a way round (not every action: it costs)
    s = pathStep(world, e, to, R);
    if (!s) e.Animal.stuckUntil = world.tick + CONFIG.animals.stuckTicks;
  }
  if (s) stepTo(world, e, s[0], s[1]);
  return !!s;
}
function pathStep(world, e, to, R) {
  const W = world.width, ox = e.Position.x, oy = e.Position.y, start = oy * W + ox;
  const taken = new Set(); // where everyone stands, once (nobody moves during the search)
  for (const o of world.entities.values()) if (o.Blocks && o.Position) taken.add(o.Position.y * W + o.Position.x);
  const open = (x, y) => {
    if (!inBounds(world, x, y)) return false;
    const i = y * W + x, info = TILE_INFO[world.tiles[i]];
    if (world.fire && world.fire[i]) return false;
    if (e.Flies) return !info.silent && !indoorAt(world, i);
    return !info.blocks && !taken.has(i);
  };
  const first = new Map([[start, null]]);
  let ring = [start];
  for (let d = 0; d < R * 2 && ring.length; d++) {
    const next = [];
    for (const i of ring) {
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (first.has(j) || Math.abs(nx - ox) > R || Math.abs(ny - oy) > R) continue;
        const step = first.get(i) || [dx, dy];
        if (cheb({ x: nx, y: ny }, to) <= 1) return step;
        if (!open(nx, ny)) continue;
        first.set(j, step); next.push(j);
      }
    }
    ring = next;
  }
  return null;
}

// Running away. A stampede barges through: whoever's in the way is shoved or knocked flat.
function flee(world, e, S) {
  const F = e.Animal.flee;
  let step = bestStep(world, e, F, -1);
  if (!step && S.stampede) { // hemmed in by someone: barge them
    for (const [dx, dy] of DIRS) {
      const x = e.Position.x + dx, y = e.Position.y + dy;
      if (cheb({ x, y }, F) <= cheb(e.Position, F)) continue;
      const b = blockerAt(world, x, y);
      if (!b || !b.entity || !b.entity.Actor || (b.entity.Animal && b.entity.Animal.herd === e.Animal.herd)) continue;
      if (!pushEntity(world, b.entity, dx, dy, e.id)) stagger(world, b.entity, 1);
      world.events.emit('trampled', { id: b.entity.id, by: e.id });
      step = [dx, dy];
      break;
    }
  }
  if (step) stepTo(world, e, step[0], step[1]);
  if (S.fleeCost && e.Actor) e.Actor.nextCost = CONFIG.scheduler.actionCost * S.fleeCost; // bolting: quick steps
  if (--F.left <= 0 || !step) e.Animal.flee = null;
}

// Every action.
export function animal(world, e) {
  const A = e.Animal, S = CONFIG.animals.species[A.species], AN = CONFIG.animals;
  const awake = S.active === 'any' || (S.active === 'day') === (ambientAt(world.tick) >= 2);
  // 1. Danger: fire, or something it fears close by.
  const fire = fireNear(world, e.Position, AN.fireFear);
  if (fire) scare(world, e, fire);
  let feared = null, fd = Infinity;
  const alarmRange = Math.max(AN.alarmRange, S.fearRange || AN.fearRange);
  for (const o of around(world).living) {
    if (o === e || !world.entities.has(o.id)) continue;
    const k = kindOf(o);
    if (!k || !S.fears.includes(k)) continue;
    const d = cheb(o.Position, e.Position);
    if (d < fd && d <= alarmRange && notices(world, e, o, S.sight)) { fd = d; feared = o; }
  }
  if (feared) {
    if (S.alarm && world.tick - A.calledAt > AN.callCooldown) { // honk / bark
      A.calledAt = world.tick;
      world.events.emit('animal_alarm', { id: e.id, x: e.Position.x, y: e.Position.y, species: A.species });
      makeNoise(world, e.Position.x, e.Position.y, S.alarm, e.id);
    }
    if (fd <= (S.fearRange || AN.fearRange) && A.target !== feared.id) scare(world, e, feared.Position);
  }
  if (A.flee) return flee(world, e, S);
  // 2. A target (fighting back, or the hunt).
  if (A.target != null) {
    const t = world.entities.get(A.target);
    if (!t || !t.Position || cheb(t.Position, e.Position) > S.sight * 1.5) A.target = null;
    else if (cheb(t.Position, e.Position) <= 1) { attack(world, e, t); return; }
    else { stepToward(world, e, t.Position); return; }
  }
  if (S.hunts && awake && world.tick >= A.fedUntil) {
    const pack = herdOf(world, e);
    const shared = pack.map((m) => m.Animal.target).find((id) => id != null && world.entities.has(id));
    let prey = shared != null ? world.entities.get(shared) : null, pd = Infinity;
    if (!prey) for (const o of around(world).animals) {
      if (!S.hunts.includes(o.Animal.species) || !world.entities.has(o.id)) continue;
      const d = cheb(o.Position, e.Position);
      if (d < pd && (notices(world, e, o, S.sight) || d <= (S.nose || 0))) { pd = d; prey = o; } // seen, or smelt through walls
    }
    if (prey) {
      for (const m of pack) m.Animal.target = prey.id;
      if (world.tick - A.calledAt > AN.callCooldown) { // the pack gives tongue (not every time it picks the scent up again)
        A.calledAt = world.tick;
        world.events.emit('hunt_started', { id: e.id, preyId: prey.id });
        if (S.alarm) makeNoise(world, e.Position.x, e.Position.y, S.alarm, e.id);
      }
      return;
    }
  }
  // 3. Bodies: crows and foxes go to the dead; crows circle them.
  if (S.scavenges && awake) {
    let body = null, bd = Infinity;
    for (const o of around(world).bodies) {
      if (!world.entities.has(o.id)) continue;
      const d = cheb(o.Position, e.Position);
      if (d < bd && d <= S.sight && (S.flies || d <= (S.nose || 0) || notices(world, e, o, S.sight))) { bd = d; body = o; }
    }
    if (body) {
      if (bd > (S.circles ? 2 : 1)) stepToward(world, e, body.Position);
      else if (S.circles) { // round and round, a tile or two off
        const ring = DIRS.filter(([dx, dy]) => { const x = e.Position.x + dx, y = e.Position.y + dy, d = cheb({ x, y }, body.Position); return d >= 1 && d <= 2 && canEnter(world, e, x, y); });
        if (ring.length) { const [dx, dy] = ring[world.rng.int(ring.length)]; stepTo(world, e, dx, dy); }
        if (world.rng.chance(0.05)) { world.events.emit('animal_call', { id: e.id, species: A.species }); makeNoise(world, e.Position.x, e.Position.y, 1, e.id); }
      }
      return;
    }
  }
  if (!awake) return; // resting
  // 4. Keep with the herd, near home; wander a little; call now and then.
  if (S.call && world.rng.chance(S.call[0])) {
    world.events.emit('animal_call', { id: e.id, species: A.species });
    makeNoise(world, e.Position.x, e.Position.y, S.call[1], e.Position && e.id);
  }
  if (S.herd) {
    const pack = herdOf(world, e);
    if (pack.length > 1) {
      const mid = { x: Math.round(pack.reduce((a, m) => a + m.Position.x, 0) / pack.length), y: Math.round(pack.reduce((a, m) => a + m.Position.y, 0) / pack.length) };
      if (cheb(mid, e.Position) > S.herd && stepToward(world, e, mid, 8)) return;
    }
  }
  if (cheb(A.home, e.Position) > S.range && stepToward(world, e, A.home, 10)) return;
  if (world.rng.chance(0.3)) {
    const [dx, dy] = DIRS[world.rng.int(8)];
    if (canEnter(world, e, e.Position.x + dx, e.Position.y + dy)) stepTo(world, e, dx, dy);
  }
}
