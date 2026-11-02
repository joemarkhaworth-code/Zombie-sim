// Water (step 20): dirty water makes you ill, the beck rises in rain and floods, the lake
// and ponds freeze and the ice can break.
//
// Water changes by changing tiles, so everything that reads tiles (movement, sight,
// noise, memory, scent, fire) works on it unchanged. world.water.under remembers what a
// changed tile was (tile index -> original tile), so it can go back.
//
// The beck (world.water.beck, ticks): rises in rain and when snow melts, falls otherwise,
// never below normal. Level = ticks / beckPerLevel, 1 normal:
//   2 in spate: every beck tile becomes TORRENT (too strong to wade: blocks). Anyone in
//     the beck is swept ashore and hurt; anything lying in it is washed away.
//   3 in flood: as well, low ground within floodReach of the beck becomes FLOODWATER
//     (wade it: slow, splashy, soaks you, dirty). Each hour each bridge may be swept away
//     (its tiles become beck); a lost bridge doesn't come back: wade there once it's down.
// Ice (world.water.ice, ticks of frost): freezes by the weather's chill, thaws in rain or
// mild weather. Level = ticks / icePerLevel. At 1+ every lake and pond tile (bar holes)
// is ICE: walkable, creaking. A step on ice may break through (iceBreak by level): the
// tile becomes open water again (a hole, until the ice thickens a level). The living
// climb out, soaked, freezing and hurt; zombies go under and drown. Thawing drops anyone
// on the ice into the water the same way.
// Dirty water: each drink from the beck, lake, a pond or floodwater may make you ill some
// hours later (Needs.illAt); a corpse in or by the water makes it likelier and worse.
// Illness (Needs.ill, ticks, falls 1 a tick) makes you thirstier, stops you healing, and
// at 2+ you throw up (noise) and tire; at 3 a fever costs health.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from '../gen/testgrid.js';
import { weatherOf } from './weather.js';
import { blockerAt } from '../world.js';
import { makeNoise } from './noise.js';
import { damage, kill } from './combat.js';
import { adjustNeed, needLevel } from './needs.js';
import { refreshAllVision } from './vision.js';
import { minutesAt } from '../time.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const FLOODABLE = new Set([TILE.GRASS, TILE.LANE, TILE.PATH, TILE.ROAD, TILE.PAVEMENT, TILE.YARD, TILE.GINNEL, TILE.SHORE, TILE.FLOOR, TILE.ALLOTMENT, TILE.ASH]);
const SOURCE = { [TILE.STREAM]: 'stream', [TILE.TORRENT]: 'stream', [TILE.LAKE]: 'lake', [TILE.POND]: 'pond', [TILE.FLOODWATER]: 'flood' };
export const DRINKABLE = new Set(Object.keys(SOURCE).map(Number));

const levelOf = (ticks, per) => Math.min(3, Math.floor(ticks / per));
export const beckLevel = (world) => (world.water ? levelOf(world.water.beck, CONFIG.water.beckPerLevel) : 1);
export const iceLevel = (world) => (world.water ? levelOf(world.water.ice, CONFIG.water.icePerLevel) : 0);

export function installWater(world) {
  const W = CONFIG.water;
  world.water = { beck: Math.floor(W.beckPerLevel * 1.5), ice: 0, under: new Map(), holes: new Set(), snow: world.snowCover || 0 };
  findBridges(world);
  world.events.on('entity_moved', (d) => {
    if (world.water.moving) return; // being put back on land
    const e = world.entities.get(d.id);
    const i = d.to.y * world.width + d.to.x;
    if (!e || world.tiles[i] !== TILE.ICE) return;
    if (!world.rng.chance(W.iceBreak[iceLevel(world)])) return;
    breakIce(world, i);
    fallIn(world, e, d.from);
  });
}

// The bridges (stone and foot), as groups of joined BRIDGE tiles. Rebuilt after loading.
export function findBridges(world) {
  const seen = new Set(), out = [];
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i] !== TILE.BRIDGE || seen.has(i)) continue;
    const tiles = [], stack = [i]; seen.add(i);
    while (stack.length) {
      const j = stack.pop(); tiles.push(j);
      for (const [dx, dy] of DIRS.slice(0, 4)) {
        const x = (j % world.width) + dx, y = Math.floor(j / world.width) + dy, k = y * world.width + x;
        if (x >= 0 && y >= 0 && x < world.width && y < world.height && !seen.has(k) && world.tiles[k] === TILE.BRIDGE) { seen.add(k); stack.push(k); }
      }
    }
    out.push({ tiles, kind: tiles.length > 4 ? 'bridge' : 'footbridge' });
  }
  world.water.bridges = out;
}

// Every tick: the beck, the ice, illness.
export function tickWater(world) {
  const W = CONFIG.water, w = world.water;
  if (!w) return;
  const kind = (world.weather && world.weather.kind) || 'clear';
  const k = weatherOf(world);
  // The beck rises in rain and as snow melts; otherwise it falls back to normal.
  const beckBefore = beckLevel(world);
  const melting = (world.snowCover || 0) < w.snow;
  w.snow = world.snowCover || 0;
  const rise = (W.beckRise[kind] || 0) + (melting ? W.snowMeltRise : 0);
  w.beck = rise ? Math.min(W.beckPerLevel * 4 - 1, w.beck + rise) : Math.max(W.beckPerLevel, w.beck - W.beckFall);
  const beckNow = beckLevel(world);
  if (beckNow !== beckBefore) setBeck(world, beckBefore, beckNow);
  if (beckNow === 3 && world.tick % 30 === 0) washOut(world);
  // Frost freezes the lake; rain and mild weather thaw it.
  const iceBefore = iceLevel(world);
  const night = CONFIG.light.byHour[Math.floor(minutesAt(world.tick) / 60) % 24] <= 1;
  const chill = k.chill[night ? 1 : 0];
  const thaw = kind === 'rain' || kind === 'heavyRain';
  w.ice = thaw ? Math.max(0, w.ice - 2) : chill >= 3 ? Math.min(W.icePerLevel * 4 - 1, w.ice + 2) : chill === 2 ? Math.min(W.icePerLevel * 4 - 1, w.ice + 1) : Math.max(0, w.ice - 1);
  const iceNow = iceLevel(world);
  if (iceNow !== iceBefore) setIce(world, iceBefore, iceNow);
  tickIllness(world);
}

// --- The beck --------------------------------------------------------------------------

function setBeck(world, from, to) {
  const w = world.water;
  if (from < 3 && to === 3) flood(world);
  if (from === 3 && to < 3) restore(world, TILE.FLOODWATER);
  if (from < 2 && to >= 2) {
    for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i] === TILE.STREAM) { w.under.set(i, TILE.STREAM); world.tiles[i] = TILE.TORRENT; }
    clearWater(world, TILE.TORRENT);
  }
  if (from >= 2 && to < 2) restore(world, TILE.TORRENT);
  world.events.emit('beck_changed', { from, to });
  refreshAllVision(world);
}

// In flood: low ground near the beck goes under.
function flood(world) {
  const W = CONFIG.water, w = world.water, dist = new Map();
  let ring = [];
  for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i] === TILE.TORRENT || world.tiles[i] === TILE.STREAM) { dist.set(i, 0); ring.push(i); }
  for (let d = 1; d <= W.floodReach; d++) {
    const next = [];
    for (const i of ring) for (const [dx, dy] of DIRS.slice(0, 4)) {
      const x = (i % world.width) + dx, y = Math.floor(i / world.width) + dy, j = y * world.width + x;
      if (x < 0 || y < 0 || x >= world.width || y >= world.height || dist.has(j) || !FLOODABLE.has(world.tiles[j])) continue;
      dist.set(j, d); next.push(j);
      w.under.set(j, world.tiles[j]); world.tiles[j] = TILE.FLOODWATER;
    }
    ring = next;
  }
}

// Changed tiles of this kind go back to what they were.
function restore(world, kind) {
  const w = world.water;
  for (const [i, t] of w.under) {
    if (world.tiles[i] === kind) { world.tiles[i] = t; w.under.delete(i); }
    else if (kind === TILE.ICE && w.holes.has(i)) w.under.delete(i); // a hole: already open water
  }
  if (kind === TILE.ICE) w.holes.clear();
}

// Tiles that just became deep water: anyone in them is swept ashore, things in them float off.
function clearWater(world, kind) {
  for (const e of [...world.entities.values()]) {
    if (!e.Position || world.tiles[e.Position.y * world.width + e.Position.x] !== kind) continue;
    if (e.Item || e.Corpse) { world.entities.delete(e.id); world.events.emit('washed_away', { id: e.id, x: e.Position.x, y: e.Position.y }); continue; }
    if (!e.Health) continue;
    world.events.emit('swept', { id: e.id, x: e.Position.x, y: e.Position.y });
    if (e.Needs) soak(world, e);
    if (!putAshore(world, e, null)) { kill(world, e, { cause: 'drowned' }); continue; }
    damage(world, e, CONFIG.water.sweptDamage, { cause: 'drowned' });
  }
}

// Each hour in flood, each bridge may go.
function washOut(world) {
  const W = CONFIG.water;
  for (const b of world.water.bridges) {
    if (b.gone || !world.rng.chance(W.washout[b.kind])) continue;
    b.gone = true;
    for (const i of b.tiles) { world.water.under.set(i, TILE.STREAM); world.tiles[i] = TILE.TORRENT; }
    const mid = b.tiles[b.tiles.length >> 1], x = mid % world.width, y = Math.floor(mid / world.width);
    world.events.emit('bridge_washed_away', { x, y, kind: b.kind });
    makeNoise(world, x, y, 3);
    clearWater(world, TILE.TORRENT);
    refreshAllVision(world);
  }
}

// --- Ice -------------------------------------------------------------------------------

function setIce(world, from, to) {
  const w = world.water;
  if (to >= 1 && to > from) { // freezing (thicker ice closes the holes)
    w.holes.clear();
    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i];
      if (t === TILE.LAKE || t === TILE.POND) { w.under.set(i, t); world.tiles[i] = TILE.ICE; }
    }
  }
  if (to === 0) { // thawed: whoever's on the ice goes in
    const onIce = [...world.entities.values()].filter((e) => e.Health && e.Position && world.tiles[e.Position.y * world.width + e.Position.x] === TILE.ICE);
    restore(world, TILE.ICE);
    for (const e of onIce) fallIn(world, e, null);
    for (const e of [...world.entities.values()]) if ((e.Item || e.Corpse) && e.Position && TILE_INFO[world.tiles[e.Position.y * world.width + e.Position.x]].blocks) world.entities.delete(e.id); // sinks
  }
  world.events.emit('ice_changed', { from, to });
  refreshAllVision(world);
}

function breakIce(world, i) {
  const x = i % world.width, y = Math.floor(i / world.width);
  world.tiles[i] = world.water.under.get(i) || TILE.LAKE;
  world.water.holes.add(i);
  world.events.emit('ice_broke', { x, y });
  makeNoise(world, x, y, CONFIG.water.iceCrackNoise);
}

// e went into deep water (through the ice): the living climb out, soaked, frozen and hurt;
// zombies go under.
function fallIn(world, e, from) {
  world.events.emit('fell_through_ice', { id: e.id, x: e.Position.x, y: e.Position.y });
  for (const it of [...world.entities.values()]) if ((it.Item || it.Corpse) && it.Position && it.Position.x === e.Position.x && it.Position.y === e.Position.y) world.entities.delete(it.id); // sinks
  if (!e.Needs || !putAshore(world, e, from)) { kill(world, e, { cause: 'drowned' }); return; }
  soak(world, e);
  adjustNeed(world, e, 'cold', CONFIG.needs.perLevel.cold * 3);
  damage(world, e, CONFIG.water.fallInDamage, { cause: 'drowned' });
}

function soak(world, e) {
  const full = CONFIG.needs.perLevel.wet * 3;
  if (e.Needs && e.Needs.wet < full) adjustNeed(world, e, 'wet', full - e.Needs.wet);
}

// Put e on the nearest open tile (preferring `from`). Returns false if there's none near.
function putAshore(world, e, from) {
  const { x, y } = e.Position;
  let to = from && !blockerAt(world, from.x, from.y) ? from : null;
  for (let r = 1; r <= 4 && !to; r++) {
    for (let dy = -r; dy <= r && !to; dy++) for (let dx = -r; dx <= r && !to; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!blockerAt(world, x + dx, y + dy) && world.tiles[(y + dy) * world.width + x + dx] !== TILE.ICE) to = { x: x + dx, y: y + dy };
    }
  }
  if (!to) return false;
  world.water.moving = true;
  e.Position = { x: to.x, y: to.y };
  world.events.emit('entity_moved', { id: e.id, from: { x, y }, to });
  world.events.emit('entity_pushed', { id: e.id, by: null, from: { x, y }, to, dx: Math.sign(to.x - x), dy: Math.sign(to.y - y) });
  world.water.moving = false;
  return true;
}

// --- Dirty water and illness -----------------------------------------------------------

// e drinks from the water at (x, y): it may make them ill later.
export function drinkFrom(world, e, x, y) {
  const W = CONFIG.water, t = world.tiles[y * world.width + x];
  if (!e.Needs) return;
  const foul = corpseNear(world, x, y);
  const chance = (W.dirty[SOURCE[t]] || 0) + (foul ? W.corpseFoul : 0);
  if (!world.rng.chance(Math.min(1, chance))) return;
  const dose = foul ? W.foulDose : W.illDose;
  if (!e.Needs.illAt) e.Needs.illAt = world.tick + W.onset[0] + world.rng.int(W.onset[1] - W.onset[0] + 1);
  e.Needs.illDose = Math.max(e.Needs.illDose || 0, dose);
}

function corpseNear(world, x, y) {
  const R = CONFIG.water.corpseReach;
  for (const e of world.entities.values()) {
    if (!e.Corpse || !e.Position || Math.max(Math.abs(e.Position.x - x), Math.abs(e.Position.y - y)) > R) continue;
    const t = world.tiles[e.Position.y * world.width + e.Position.x];
    let wet = DRINKABLE.has(t) || t === TILE.ICE;
    for (const [dx, dy] of DIRS) { const nt = world.tiles[(e.Position.y + dy) * world.width + e.Position.x + dx]; if (DRINKABLE.has(nt)) wet = true; }
    if (wet) return true; // a body in or by the water
  }
  return false;
}

function tickIllness(world) {
  const W = CONFIG.water, N = CONFIG.needs;
  for (const e of [...world.entities.values()]) {
    if (!e.Needs || e.Needs.ill === undefined) continue;
    if (e.Needs.illAt && world.tick >= e.Needs.illAt) { // it comes on
      const want = (e.Needs.illDose + 1) * N.perLevel.ill - 1; // the top of that level
      if (e.Needs.ill < want) adjustNeed(world, e, 'ill', want - e.Needs.ill);
      e.Needs.illAt = 0; e.Needs.illDose = 0;
    }
    if (!e.Needs.ill) continue;
    const lv = needLevel(e, 'ill');
    if (lv >= 2 && world.tick % W.vomitEvery === 0 && world.rng.chance(W.vomitChance) && e.Position) {
      world.events.emit('vomited', { id: e.id });
      makeNoise(world, e.Position.x, e.Position.y, W.vomitNoise, e.id);
      adjustNeed(world, e, 'hunger', W.vomitLoss);
      adjustNeed(world, e, 'thirst', W.vomitLoss);
    }
    if (lv === 3 && world.tick % W.feverEvery === 0) damage(world, e, 1, { cause: 'illness' });
    if (world.entities.has(e.id)) adjustNeed(world, e, 'ill', -1);
  }
}

// After loading: the bridges (from the tiles as they are now).
export function rebuildWater(world) {
  findBridges(world);
}

// Debug (TUNE panel): put the beck (1-3) or the ice (0-3) at a level now. The weather
// carries on moving it from there.
export function setWaterLevel(world, what, level) {
  const W = CONFIG.water, w = world.water;
  if (what === 'beck') {
    const from = beckLevel(world), to = Math.max(1, Math.min(3, level));
    w.beck = (to + 1) * W.beckPerLevel - 1;
    if (to !== from) setBeck(world, from, to);
  } else {
    const from = iceLevel(world), to = Math.max(0, Math.min(3, level));
    w.ice = to ? (to + 1) * W.icePerLevel - 1 : 0;
    if (to !== from) setIce(world, from, to);
  }
}
