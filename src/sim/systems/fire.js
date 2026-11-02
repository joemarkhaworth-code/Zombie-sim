// Fire, smoke and explosions (step 19).
//
// Per tile (saved with the tile arrays):
//   world.fire   - 0-3 how hard it's burning
//   world.fuel   - ticks of fuel left in a burning tile (set when it catches)
//   world.smoke  - 0-3 how thick the smoke is
//   world.petrol - 0-3 petrol spilled on it (burns hot even on stone or tarmac)
// Only tiles that are burning or smoky are worked on each tick (world.fireActive).
//
// Burning: what a tile's flammability is comes from data - TILE_INFO flammable (0-3),
// plus petrol, plus 1 under a thatched roof - and the weather: settled snow stops ground
// fires, mud stops grass and fell burning (fire.wetGround). A fire grows a level every
// growEvery ticks up to its flammability + 1, burns its fuel (intensity per tick) and
// spreads to each flammable neighbour with chance spread[flam] x intensity/3 a tick.
// Stone and brick never catch, so walls stop it. Outdoors, rain damps it (the weather's
// fireDamp). Burnt out, a tile turns to ashes (TILE_INFO burnsTo, default ASH): a wooden
// wall burns away into a gap.
// What fire does: anything standing in it burns (damage every burnEvery[intensity]
// ticks); doors and barricades on it burn through, windows crack in the heat (material
// heatDamage); it lights the area (light.js reads fireLights()), crackles (noise 1) and
// makes smoke. Items that explode (gas bottle, petrol can) go off when they're on a
// burning tile or get shot.
// Smoke: a fire fills its tile with smoke at its intensity; smoke drifts to open
// neighbours one level thinner and thins out (fast outdoors, slowly indoors). Thick
// smoke (2+) blocks sight and makes you cough (noise); choking smoke (3) hurts.
// Explosions: damage falls off with distance, doors and windows blow in, walls lose
// health (world.tileHp) and fall to rubble at 0, flammable tiles catch, a loud bang.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from '../gen/testgrid.js';
import { makeNoise } from './noise.js';
import { damage } from './combat.js';
import { damageStructure, structureAt } from './structures.js';
import { itemsAt } from './items.js';
import { refreshAllVision } from './vision.js';
import { weatherOf, isIndoors, indoorAt } from './weather.js';
import { snowLevel, mudLevel } from './tracks.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function installFire(world) {
  const n = world.width * world.height;
  world.fire = new Uint8Array(n);
  world.fuel = new Uint16Array(n);
  world.smoke = new Uint8Array(n);
  world.petrol = new Uint8Array(n);
  world.thatch = new Uint8Array(n); // 1 = under a thatched roof
  world.roofless = new Uint8Array(n); // 1 = the roof over this floor is gone (blown off, burnt)
  world.fireActive = new Set();
  for (const b of world.buildings || []) {
    if (b.roof !== 'thatch') continue;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) world.thatch[y * world.width + x] = 1;
  }
  // A thrown petrol can splashes where it lands.
  world.events.on('item_thrown', (d) => {
    const it = world.entities.get(d.itemId);
    if (it && CONFIG.items[it.Item.type].spill) { spillPetrol(world, d.x, d.y, 1); world.entities.delete(it.id); }
  });
  // A shot that hits a tile with something explosive on it sets it off.
  world.events.on('shot_fired', (d) => {
    for (const it of itemsAt(world, d.x, d.y)) if (CONFIG.items[it.Item.type].explodes && world.entities.has(it.id)) detonate(world, it, d.id);
  });
}

// After loading: which tiles need work.
export function rebuildFireActive(world) {
  world.fireActive = new Set();
  for (let i = 0; i < world.fire.length; i++) if (world.fire[i] || world.smoke[i]) world.fireActive.add(i);
}

// How readily tile i burns, 0-3.
export function flammability(world, i) {
  const t = world.tiles[i];
  let f = TILE_INFO[t].flammable || 0;
  if (f && !indoorAt(world, i)) {
    if (snowLevel(world) >= 1) f = 0; // snow on the ground
    else if (mudLevel(world) >= CONFIG.fire.wetGround && TILE_INFO[t].ground) f = 0; // sodden grass and fell won't take
  }
  if (f && world.thatch[i]) f++;
  return Math.min(3, f + (world.petrol[i] ? 2 : 0));
}

// Set tile (x, y) alight if it can burn. Returns true if it caught.
export function ignite(world, x, y, byId = null) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  const i = y * world.width + x;
  if (world.fire[i]) return true;
  const f = flammability(world, i);
  if (!f) return false;
  world.fire[i] = 1;
  world.fuel[i] = CONFIG.fire.fuelPerLevel * f + (world.petrol[i] ? CONFIG.fire.petrolFuel : 0);
  world.fireActive.add(i);
  world.events.emit('fire_started', { x, y, by: byId });
  return true;
}

// Fire lights: [{ x, y, radius, level }] for light.js.
export function fireLights(world) {
  const out = [];
  for (const i of world.fireActive) {
    if (!world.fire[i]) continue;
    out.push({ x: i % world.width, y: Math.floor(i / world.width), radius: world.fire[i], level: 3 });
  }
  return out;
}

// Every tick.
export function tickFire(world) {
  // A lit candle left on something that burns may set it alight.
  if (world.tick % 5 === 0) for (const e of world.entities.values()) {
    if (e.Item && e.Item.lit && e.Position && CONFIG.items[e.Item.type].light.burnsOut && world.rng.chance(CONFIG.fire.candleIgnite)) ignite(world, e.Position.x, e.Position.y);
  }
  if (!world.fireActive || !world.fireActive.size) return;
  const F = CONFIG.fire, W = world.width, t = world.tick;
  const damp = weatherOf(world).fireDamp || 0;
  const burning = [...world.fireActive].filter((i) => world.fire[i]);
  let changed = false;
  for (const i of burning) {
    const x = i % W, y = (i - x) / W;
    let lv = world.fire[i];
    const flam = flammability(world, i);
    // grow, burn fuel, be damped by the rain outdoors
    if (t % F.growEvery === 0 && lv < Math.min(3, flam + 1)) lv++;
    if (damp && !isIndoors(world, x, y) && world.rng.chance(F.dampChance * damp)) lv--;
    world.fuel[i] = Math.max(0, world.fuel[i] - lv);
    world.smoke[i] = Math.max(world.smoke[i], lv);
    if (lv <= 0 || world.fuel[i] <= 0) { burnOut(world, i, lv > 0); changed = true; continue; }
    world.fire[i] = lv;
    if (world.petrol[i] && t % 4 === 0) world.petrol[i]--;
    // spread
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= world.height) continue;
      const j = ny * W + nx;
      if (world.fire[j]) continue;
      const nf = flammability(world, j);
      if (nf && world.rng.chance(F.spread[nf] * lv / 3) && ignite(world, nx, ny)) changed = true;
    }
    // what's on the tile: structures burn, explosives go off, creatures burn
    const st = structureAt(world, x, y);
    if (st && t % F.heatEvery === 0) {
      const m = CONFIG.materials[(st.Barricade || st.Structure).material];
      if ((m.flammability || m.heatDamage >= 3) && damageStructure(world, st, m.heatDamage)) changed = true;
    }
    for (const it of itemsAt(world, x, y)) if (CONFIG.items[it.Item.type].explodes && world.entities.has(it.id)) detonate(world, it);
    for (const e of [...world.entities.values()]) {
      if (!e.Health || !e.Position || e.Position.x !== x || e.Position.y !== y) continue;
      if (t % F.burnEvery[lv] === 0) {
        world.events.emit('entity_burned', { id: e.id, x, y });
        damage(world, e, 1, { cause: 'fire' });
      }
    }
    if (t % F.crackleEvery === 0) makeNoise(world, x, y, lv >= 3 ? 2 : 1);
  }
  // smoke: drifts to open neighbours a level thinner, thins out
  for (const i of [...world.fireActive]) {
    if (world.fire[i] || !world.smoke[i]) { if (!world.fire[i] && !world.smoke[i]) world.fireActive.delete(i); continue; }
    const x = i % W, y = (i - x) / W, indoor = isIndoors(world, x, y);
    if (t % (indoor ? F.smokeClearIndoors : F.smokeClearOutdoors) === 0) world.smoke[i]--;
    if (!world.smoke[i]) { world.fireActive.delete(i); continue; }
  }
  for (const i of burning.concat([...world.fireActive])) {
    const s = world.smoke[i];
    if (s < 2) continue;
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= world.height || TILE_INFO[world.tiles[j]].opaque || TILE_INFO[world.tiles[j]].silent) continue;
      const sj = structureAt(world, nx, ny);
      if (sj && sj.Blocks) continue; // closed doors and windows keep it out
      if (world.smoke[j] < s - 1) { world.smoke[j] = s - 1; world.fireActive.add(j); }
    }
  }
  // standing in thick smoke: cough; choking smoke hurts
  for (const e of world.entities.values()) {
    if (!e.Health || !e.Position || !e.Needs) continue; // the living breathe
    const s = world.smoke[e.Position.y * W + e.Position.x];
    if (s >= 2 && t % F.coughEvery === 0) { world.events.emit('coughed', { id: e.id }); makeNoise(world, e.Position.x, e.Position.y, 1, e.id); }
    if (s >= 3 && t % F.chokeEvery === 0) damage(world, e, 1, { cause: 'smoke' });
  }
  // (Sight near fires is refreshed at the end of the turn by light.js: the fires are lights.)
  world.fireChanged = world.fireChanged || changed;
}

function burnOut(world, i, natural) {
  world.fire[i] = 0;
  world.fuel[i] = 0;
  world.petrol[i] = 0;
  const t = world.tiles[i];
  const to = TILE_INFO[t].burnsTo;
  if (natural && TILE_INFO[t].flammable && to !== null) {
    world.tiles[i] = to === undefined ? TILE.ASH : to;
    world.events.emit('tile_burnt', { x: i % world.width, y: Math.floor(i / world.width), from: t });
    if (TILE_INFO[t].indoor) loseRoof(world, i); // the room burnt out: the roof timbers went with it
  }
}

// An item that explodes goes off where it is (or where its carrier stands).
export function detonate(world, item, byId = null) {
  const def = CONFIG.items[item.Item.type];
  let at = item.Position;
  if (!at) for (const h of world.entities.values()) if (h.Inventory && h.Inventory.items.includes(item.id)) { at = h.Position; h.Inventory.items.splice(h.Inventory.items.indexOf(item.id), 1); if (h.Inventory.wielded === item.id) h.Inventory.wielded = null; }
  world.entities.delete(item.id);
  if (at) explode(world, at.x, at.y, def.explodes, byId, def.spill);
}

// Explosion of power p at (x, y).
export function explode(world, x, y, p, byId = null, spill = false) {
  const F = CONFIG.fire;
  world.events.emit('explosion', { x, y, power: p, by: byId });
  makeNoise(world, x, y, 3, byId);
  for (const [i, d] of blastArea(world, x, y, p)) {
    const tx = i % world.width, ty = (i - tx) / world.width;
    const force = p - d + 1;
    for (const e of [...world.entities.values()]) {
      if (e.Health && e.Position && e.Position.x === tx && e.Position.y === ty) damage(world, e, force, { killerId: byId, cause: 'explosion' });
    }
    const st = structureAt(world, tx, ty);
    if (st) damageStructure(world, st, force * F.blastStructure, byId);
    const wallMat = TILE_INFO[world.tiles[i]].blocks && TILE_INFO[world.tiles[i]].material;
    if (wallMat && d < p) {
      const hp = world.tileHp[i] || CONFIG.materials[wallMat].hp; // a wall's health is its material's until hurt
      world.tileHp[i] = Math.max(0, hp - force * F.blastWall);
      if (!world.tileHp[i]) { world.tiles[i] = TILE.RUBBLE; world.events.emit('wall_destroyed', { x: tx, y: ty }); }
    }
    if (d < p) loseRoof(world, i); // the blast lifts the roof off
    if (spill && d <= 1) world.petrol[i] = 3;
    if (d < p) ignite(world, tx, ty, byId);
    world.smoke[i] = Math.max(world.smoke[i], 2); world.fireActive.add(i);
  }
  refreshAllVision(world);
}

// The roof over tile i is gone: the weather gets in from now on (rain, cold, snow, light).
// Cellars have a floor over them, not a roof, so they keep it.
export function loseRoof(world, i) {
  if (!world.roofless || world.roofless[i] || !TILE_INFO[world.tiles[i]].indoor) return;
  const x = i % world.width, y = (i - x) / world.width;
  if ((world.floors || []).some((fl) => /cellar/.test(fl.name) && x >= fl.x && x < fl.x + fl.w && y >= fl.y && y < fl.y + fl.h)) return;
  world.roofless[i] = 1;
  world.roofChanged = true;
}

// The tiles a blast of power p reaches: [[index, distance]]. It spreads out a step at a
// time (8 ways) up to p steps, through walls (it brings them down) but never across the
// void, so a blast in one floor's pocket can't reach the next pocket along.
function blastArea(world, x, y, p) {
  const W = world.width, start = y * W + x, dist = new Map([[start, 0]]);
  let ring = [start];
  for (let d = 1; d <= p; d++) {
    const next = [];
    for (const i of ring) for (const [dx, dy] of DIRS) {
      const nx = (i % W) + dx, ny = Math.floor(i / W) + dy, j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= world.height || dist.has(j) || TILE_INFO[world.tiles[j]].silent) continue;
      dist.set(j, d); next.push(j);
    }
    ring = next;
  }
  return [...dist];
}

// Pour petrol (a petrol can): your tile and the ones round it.
export function spillPetrol(world, x, y, radius = 1) {
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const tx = x + dx, ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) continue;
    const i = ty * world.width + tx;
    if (TILE_INFO[world.tiles[i]].blocks || [TILE.STREAM, TILE.LAKE, TILE.POND, TILE.FLOODWATER, TILE.FLOOD_IN, TILE.TORRENT].includes(world.tiles[i])) continue;
    world.petrol[i] = 3;
  }
  world.events.emit('petrol_spilled', { x, y });
}

// Light a fire next to you: the most flammable neighbouring tile (or your own).
export function lightFire(world, e) {
  let best = null, bestF = 0;
  for (const [dx, dy] of [...DIRS, [0, 0]]) { // a neighbour before your own tile
    const x = e.Position.x + dx, y = e.Position.y + dy;
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
    const i = y * world.width + x, f = world.fire[i] ? 0 : flammability(world, i);
    if (f > bestF) { bestF = f; best = { x, y }; }
  }
  if (!best) return false;
  return ignite(world, best.x, best.y, e.id);
}
