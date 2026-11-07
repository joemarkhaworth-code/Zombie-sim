// Save/load: the whole game state as plain JSON (pure sim; main.js stores it).
// Saved: seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact state,
// tiles and light, stats, game over, and every entity with all its components (map memory,
// bag, brain...). Not saved, rebuilt on load: event wiring (createWorld installs it), the
// player's view (recomputed), the noise heatmap.
// Tile arrays are run-length encoded and map memory saves only remembered tiles, so saves stay
// small on the 110 x 150 town.
import { CONFIG } from '../config.js';
import { updatePlayerView } from './systems/vision.js';

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
    inputs: world.inputs,
    tiles: rle(world.tiles),
    light: rle(world.light),
    stats: world.stats,
    gameOver: world.gameOver,
    entities: [...world.entities.values()].map(e => (e.Memory ? { ...e, Memory: packMemory(e.Memory, size) } : e)),
  });
}

// Returns a world, or throws if the save can't be used (wrong version, broken JSON...).
export function loadWorld(createWorld, json) {
  const s = JSON.parse(json);
  if (!s || s.version !== CONFIG.save.version) throw new Error('save version');
  const world = createWorld(s.seed, { map: s.map });
  const size = world.w * world.h;
  unrle(s.tiles, world.tiles);
  unrle(s.light, world.light);
  world.turn = s.turn; world.tick = s.tick; world.nextId = s.nextId; world.playerId = s.playerId;
  world.rng.state = s.rng;
  world.cam = s.cam || world.cam;
  world.inputs = s.inputs;
  world.stats = s.stats;
  world.gameOver = s.gameOver;
  world.entities = new Map(s.entities.map(e => [e.id, e.Memory ? { ...e, Memory: unpackMemory(e.Memory, size) } : e]));
  if (!world.entities.get(world.playerId)) throw new Error('save has no player');
  updatePlayerView(world);
  return world;
}
