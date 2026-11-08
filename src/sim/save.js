// Save/load: the whole game state as plain JSON (pure sim; main.js stores it).
// Saved: seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact state,
// tiles and light, stats, game over, and every entity with all its components (map memory,
// bag, brain...). Not saved, rebuilt on load: event wiring (createWorld installs it), the
// player's view (recomputed), the noise heatmap.
// Tile arrays are run-length encoded and map memory saves only remembered tiles, so saves stay
// small on the 110 x 150 town.
import { CONFIG } from '../config.js';
import { updatePlayerView } from './systems/vision.js';
import { zombieComponents, createWorld as makeWorld } from './world.js';
import { itemComponents } from './systems/items.js';

// Entities made from a template (Kind: zombies, items) save only what differs from a fresh one:
// usually just where they are. A component that's gone is saved as null.
function template(kind) {
  if (kind === 'zombie') return zombieComponents();
  if (typeof kind === 'string' && kind.startsWith('item:')) return itemComponents(kind.slice(5));
  return null;
}

// Tiles: the layout is regenerated from the seed on load, so only tiles that have changed since
// are saved, as [index, value, index, value...].
function tileChanges(now, fresh) {
  const out = [];
  for (let i = 0; i < now.length; i++) if (now[i] !== fresh[i]) out.push(i, now[i]);
  return out;
}

// Inputs as short arrays: [turn, type, ...values]; INPUT_KEYS names the values per type.
const INPUT_KEYS = {
  move: ['dx', 'dy'], shove: ['dx', 'dy'], wait: [], pickup: [],
  use: ['itemId'], drop: ['itemId'], throw: ['itemId', 'x', 'y'],
};
function packInput(i) {
  const keys = INPUT_KEYS[i.type];
  return keys ? [i.turn, i.type, ...keys.map(k => i[k])] : i;
}
function unpackInput(a) {
  if (!Array.isArray(a)) return a;
  const [turn, type, ...vals] = a, out = { turn, type };
  INPUT_KEYS[type].forEach((k, j) => { out[k] = vals[j]; });
  return out;
}
function packEntity(e) {
  const t = e.Kind && template(e.Kind);
  if (!t) return e;
  const out = { id: e.id, Kind: e.Kind };
  for (const k of Object.keys(e)) {
    if (k === 'id' || k === 'Kind') continue;
    if (!(k in t) || JSON.stringify(e[k]) !== JSON.stringify(t[k])) out[k] = e[k];
  }
  for (const k of Object.keys(t)) if (!(k in e)) out[k] = null;
  // Just a fresh one somewhere: [id, kind, x, y].
  const keys = Object.keys(out);
  if (keys.length === 3 && out.Position) return [e.id, e.Kind, out.Position.x, out.Position.y];
  return out;
}
function unpackEntity(e) {
  if (Array.isArray(e)) e = { id: e[0], Kind: e[1], Position: { x: e[2], y: e[3] } };
  const t = e.Kind && template(e.Kind);
  if (!t) return e;
  const out = { id: e.id, ...t, ...e };
  for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
  return out;
}

// [value, count, value, count...]
export function rle(arr) {
  const out = [];
  for (let i = 0; i < arr.length;) {
    let j = i;
    while (j < arr.length && arr[j] === arr[i]) j++;
    out.push(arr[i], j - i);
    i = j;
  }
  return out;
}
export function unrle(runs, into) {
  let k = 0;
  for (let i = 0; i < runs.length; i += 2) for (let n = 0; n < runs[i + 1]; n++) into[k++] = runs[i];
  if (k !== into.length) throw new Error('save tiles');
  return into;
}

// Memory { tiles: { i: { t, things } } } <-> { t: rle of t+1 (0 = never seen), things: { i: [...] } }
function packMemory(mem, size) {
  const t = new Int16Array(size), things = {};
  for (const [i, snap] of Object.entries(mem.tiles)) { t[i] = snap.t + 1; if (snap.things.length) things[i] = snap.things; }
  return { t: rle(t), things };
}
function unpackMemory(packed, size) {
  const t = unrle(packed.t, new Int16Array(size)), tiles = {};
  for (let i = 0; i < size; i++) if (t[i]) tiles[i] = { t: t[i] - 1, things: packed.things[i] || [] };
  return { tiles };
}

export function saveWorld(world) {
  const size = world.w * world.h;
  const fresh = freshTiles(world);
  return JSON.stringify({
    version: CONFIG.save.version,
    map: world.map,
    seed: world.seed,
    turn: world.turn,
    tick: world.tick,
    nextId: world.nextId,
    playerId: world.playerId,
    cam: world.cam,
    rng: world.rng.state,
    inputs: world.inputs.map(packInput),
    tiles: tileChanges(world.tiles, fresh),
    light: rle(world.light),
    stats: world.stats,
    gameOver: world.gameOver,
    entities: [...world.entities.values()].map(e => (e.Memory ? { ...e, Memory: packMemory(e.Memory, size) } : packEntity(e))),
  });
}

// Returns a world, or throws if the save can't be used (wrong version, broken JSON...).
export function loadWorld(createWorld, json) {
  const s = JSON.parse(json);
  if (!s || s.version !== CONFIG.save.version) throw new Error('save version');
  const world = createWorld(s.seed, { map: s.map });
  const size = world.w * world.h;
  for (let i = 0; i < s.tiles.length; i += 2) world.tiles[s.tiles[i]] = s.tiles[i + 1];
  unrle(s.light, world.light);
  world.turn = s.turn; world.tick = s.tick; world.nextId = s.nextId; world.playerId = s.playerId;
  world.rng.state = s.rng;
  world.cam = s.cam || world.cam;
  world.inputs = s.inputs.map(unpackInput);
  world.stats = s.stats;
  world.gameOver = s.gameOver;
  world.entities = new Map(s.entities.map(e => {
    const u = e.Memory ? { ...e, Memory: unpackMemory(e.Memory, size) } : unpackEntity(e);
    return [u.id, u];
  }));
  if (!world.entities.get(world.playerId)) throw new Error('save has no player');
  updatePlayerView(world);
  return world;
}

// The tiles as first generated for this world's seed and map (worked out once per world).
const freshCache = new WeakMap();
function freshTiles(world) {
  if (world.pristine) return world.pristine;   // an editor map: its tiles as loaded
  if (!freshCache.has(world)) freshCache.set(world, makeWorld(world.seed, { map: world.map }).tiles);
  return freshCache.get(world);
}
