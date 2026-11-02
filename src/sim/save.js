// Save/load: the whole game state as plain JSON, and back.
// Pure sim code - no browser APIs; main.js decides where the string is kept.
//
// Saved: seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact
// state, the tile arrays (terrain, light, blood, glass, wall health), the player's
// sightings, the test building's rect, and every entity with all its components
// (memory snapshots, inventories, brains, doors, barricades...).
// Not saved (rebuilt on load): each viewer's current visible set, the noise heatmap,
// event-bus wiring (createWorld installs it), and lookup maps like world.structures.
//
// A save carries CONFIG.save.version. Loading anything else throws SaveError, and the
// caller starts a fresh game rather than trying to read an incompatible save.
import { CONFIG } from '../config.js';
import { refreshAllVision } from './systems/vision.js';
import { buildingInfo } from './gen/building.js';

const TILE_ARRAYS = ['tiles', 'light', 'blood', 'glass', 'tileHp'];
// Tile arrays are mostly long runs (village maps are tens of thousands of tiles), so they
// are saved run-length encoded: [value, count, value, count, ...].
const rle = (arr) => { const out = []; for (let i = 0; i < arr.length;) { let j = i; while (j < arr.length && arr[j] === arr[i]) j++; out.push(arr[i], j - i); i = j; } return out; };
const unrle = (runs, n) => { const out = new Array(n); let p = 0; for (let i = 0; i < runs.length; i += 2) for (let c = 0; c < runs[i + 1]; c++) out[p++] = runs[i]; if (p !== n) throw new SaveError('tile data size'); return out; };

export class SaveError extends Error {}

export function serialize(world) {
  const entities = [];
  for (const e of world.entities.values()) {
    const copy = { ...e };
    if (copy.Vision) { copy.Vision = { ...copy.Vision }; delete copy.Vision.visible; } // recomputed on load
    if (copy.Memory) { // only the remembered tiles: [[index, snapshot], ...]
      const seen = [];
      copy.Memory.tiles.forEach((snap, i) => { if (snap) seen.push([i, snap]); });
      copy.Memory = { seen };
    }
    entities.push(copy);
  }
  const tb = world.testBuilding;
  return JSON.stringify({
    version: CONFIG.save.version,
    seed: world.seed,
    map: world.map,
    turn: world.turn,
    tick: world.tick,
    nextId: world.nextId,
    playerId: world.playerId,
    rng: world.rng.state,
    inputs: world.inputs,
    sightings: [...world.sightings],
    stats: world.stats,
    tilesArrays: Object.fromEntries(TILE_ARRAYS.map((k) => [k, rle(world[k])])),
    testBuilding: tb ? { x: tb.x, y: tb.y, w: tb.w, h: tb.h } : null,
    entities,
  });
}

// createWorld(seed) builds a world with all systems wired; the saved state is then
// poured into it. Throws SaveError if the save is unreadable or from another version.
export function deserialize(json, createWorld) {
  let data;
  try { data = JSON.parse(json); } catch (err) { throw new SaveError('save is not valid JSON'); }
  if (!data || data.version !== CONFIG.save.version) throw new SaveError(`save version ${data && data.version} != ${CONFIG.save.version}`);
  const world = createWorld(data.seed, { map: data.map || 'testgrid' }); // older saves were all test grid
  const n = world.width * world.height;
  for (const k of TILE_ARRAYS) world[k].set(unrle(data.tilesArrays[k], n));
  world.entities = new Map();
  for (const e of data.entities) {
    if (e.Vision) e.Vision.visible = new Map();
    if (e.Memory) { const tiles = new Array(n).fill(null); for (const [i, snap] of e.Memory.seen) tiles[i] = snap; e.Memory = { tiles }; }
    world.entities.set(e.id, e);
  }
  // Older saves: keys were carried in the bag. Move them onto the keyring.
  for (const e of world.entities.values()) {
    if (!e.Inventory || !e.Player) continue;
    e.Keyring = e.Keyring || { keys: [] };
    for (const id of [...e.Inventory.items]) {
      const it = world.entities.get(id);
      if (it && it.Item && CONFIG.items[it.Item.type]?.key) {
        e.Inventory.items.splice(e.Inventory.items.indexOf(id), 1);
        it.Item.slots = 0;
        it.Item.lockId = it.Item.lockId || CONFIG.items[it.Item.type].lockId;
        e.Keyring.keys.push(id);
      }
    }
  }
  for (const e of world.entities.values()) { // older saves: doors had no lockId
    if (e.Door && e.Door.lockId === undefined) e.Door.lockId = e.Door.locked ? CONFIG.items.key.lockId : null;
  }
  world.structures = new Map();
  for (const e of world.entities.values()) {
    if (e.Structure && e.Position) world.structures.set(e.Position.y * world.width + e.Position.x, e.id);
  }
  world.turn = data.turn;
  world.tick = data.tick;
  world.nextId = data.nextId;
  world.playerId = data.playerId;
  world.inputs = data.inputs;
  world.rng.state = data.rng;
  world.sightings = new Set(data.sightings);
  world.stats = { kills: 0, ...(data.stats || {}) }; // older saves had no stats: start from 0
  world.testBuilding = data.testBuilding ? buildingInfo(data.testBuilding) : null;
  // world.plots / green / bridgeRow are regenerated by createWorld from the seed (land doesn't change).
  world.gameOver = null;
  world.noise.fill(0);
  if (!world.entities.has(world.playerId)) throw new SaveError('no player in save');
  refreshAllVision(world);
  return world;
}
