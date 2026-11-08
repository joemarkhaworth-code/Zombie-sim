// Layered maps, designed by Joe in the map editor (editor.html) and loaded by the game from
// maps/*.txt. Each tile is a stack, one value per layer:
//   height  0-3: Pokémon-style elevation. A change in height is a cliff (blocks movement like a
//           wall) unless steps connect it (both ways) or a ledge lets you hop down (one way).
//           Height never affects sight, noise or combat.
//   ground  what you stand on: grass, road, sidewalk, path, gravel, field, water, floor.
//   struct  walls, doors, fences, hedges, bridges, steps, ledges (or nothing).
//   object  things with a footprint (car 3x2, van 4x2, tree, bench, crate, sign, fishing spot).
//   marker  the player's start, zombie spawns, landmark labels (in the object list only).
//   roof    covers a building; shown while you're outside it, hidden while you're inside.
// Pure data and rules: no DOM. The editor and the game both use this module.
import { CONFIG } from '../config.js';
import { TILE, TILE_INFO } from './tiles.js';

// [char, key, label]. Ground keys are tile keys (tiles.js), so the game's tile rules and
// drawing work on them unchanged. Characters are what the map text uses: never change one.
export const GROUND = [
  ['.', 'GRASS', 'grass'], ['L', 'GREEN', 'lawn'], ['M', 'MEADOW', 'meadow'],
  ['=', 'ROAD', 'road'], ['c', 'CRACKED', 'cracked road'], ['d', 'TRACK', 'dirt road'], ['p', 'CARPARK', 'parking lot'],
  ['r', 'DRIVE', 'driveway'], ['-', 'PAVEMENT', 'sidewalk'], [':', 'PATH', 'path'], [',', 'GRAVEL', 'gravel'],
  ['n', 'NEEDLES', 'pine needles'], ['l', 'LEAVES', 'dead leaves'], ['o', 'MOSS', 'moss'], ['k', 'GRANITE', 'granite ledge'],
  ['s', 'SAND', 'sand'], ['u', 'MUD', 'mud'], ['b', 'MARSH', 'bog'],
  ['"', 'FIELD', 'hayfield'], ['C', 'CORN', 'cornfield'], ['P', 'PUMPKINS', 'pumpkins'], ['B', 'BLUEBERRY', 'blueberry barrens'],
  ['#', 'BEDS', 'ploughed earth'],
  ['R', 'STREAM', 'rocky stream'], ['w', 'SHALLOWS', 'shallow water'], ['~', 'WATER', 'deep water'],
  ['_', 'FLOOR', 'wood floor'], ['i', 'LINO', 'linoleum'], ['a', 'CARPET', 'carpet'], ['t', 'CHECKER', 'diner tiles'],
  ['x', 'CONCRETE', 'concrete'],
];
// Structures: blocks movement, blocks sight (opaque), muffles noise, pass: walkable whatever
// the ground (a bridge over water). wall: part of a building's wall (doors and windows go in
// these); opening: a door, window or garage door (also counts as wall for its neighbours);
// fence: a fence-like line a gate can go in. look: how it's drawn (render/layers.js).
const WALL = { blocks: true, opaque: true, muffles: true, wall: true };
export const STRUCT = [
  ['.', 'NONE', 'none', {}],
  ['#', 'WALL', 'plaster wall', { ...WALL, look: 'wall', colour: 'plaster' }],
  ['C', 'CLAPBOARD', 'clapboard wall', { ...WALL, look: 'wall', colour: 'clapboard' }],
  ['L', 'LOG', 'log wall', { ...WALL, look: 'wall', colour: 'log' }],
  ['K', 'BRICK', 'brick wall', { ...WALL, look: 'wall', colour: 'brick' }],
  ['Y', 'CINDER', 'cinder block', { ...WALL, look: 'wall', colour: 'cinder' }],
  ['A', 'BARN', 'barn boards', { ...WALL, look: 'wall', colour: 'barn' }],
  ['W', 'WINDOW', 'window', { blocks: true, muffles: true, opening: true, look: 'window' }],
  ['+', 'DOOR', 'door', { muffles: true, pass: true, opening: true, look: 'door' }],
  ['G', 'GARAGEDOOR', 'garage door', { blocks: true, opaque: true, muffles: true, opening: true, look: 'garage' }],
  ['S', 'STONEWALL', 'fieldstone wall', { blocks: true, fence: true, look: 'stonewall' }],
  ['|', 'FENCE', 'split-rail fence', { blocks: true, fence: true, look: 'rail' }],
  ['p', 'PICKET', 'picket fence', { blocks: true, fence: true, look: 'picket' }],
  ['c', 'CHAINLINK', 'chain-link fence', { blocks: true, fence: true, look: 'chain' }],
  ['b', 'BARBED', 'barbed wire', { blocks: true, fence: true, look: 'barbed' }],
  ['f', 'BOARDFENCE', 'board fence', { blocks: true, opaque: true, fence: true, look: 'board' }],
  ['g', 'GATE', 'gate', { pass: true, look: 'gate' }],
  ['%', 'HEDGE', 'hedge', { blocks: true, opaque: true, muffles: true, fence: true, look: 'hedge' }],
  ['u', 'GUARDRAIL', 'guardrail', { blocks: true, look: 'guard' }],
  ['H', 'BRIDGE', 'bridge', { pass: true, look: 'bridge' }],
  ['D', 'DOCK', 'dock', { pass: true, step: 'loud', look: 'dock' }],
  ['T', 'TRACKS', 'railroad track', { step: 'loud', look: 'tracks' }],
  ['^', 'STEPS', 'steps', { pass: true, look: 'steps' }],
  ['v', 'LEDGE', 'ledge', { look: 'ledge' }],
];
// Objects: footprint (w x h, turned by rot), blocks movement, blocks sight, muffles noise; text
// (a sign); look and colour for drawing (render/layers.js).
export const OBJECT = [
  ['.', 'NONE', 'none', { w: 1, h: 1 }],
  // Vehicles.
  ['c', 'CAR', 'car', { w: 3, h: 2, blocks: true, look: 'vehicle', colour: '#b8312f' }],
  ['p', 'PICKUP', 'pickup', { w: 3, h: 2, blocks: true, look: 'vehicle', colour: '#3a6a9a', bed: true }],
  ['w', 'WAGON', 'station wagon', { w: 3, h: 2, blocks: true, look: 'vehicle', colour: '#8a6a3a', wood: true }],
  ['v', 'VAN', 'van', { w: 4, h: 2, blocks: true, opaque: true, look: 'vehicle', colour: '#e2e2dc' }],
  ['R', 'CAMPER', 'camper', { w: 4, h: 2, blocks: true, opaque: true, look: 'vehicle', colour: '#e8dcc0' }],
  ['B', 'BUS', 'school bus', { w: 6, h: 2, blocks: true, opaque: true, look: 'vehicle', colour: '#e8b820' }],
  ['L', 'LOGTRUCK', 'logging truck', { w: 5, h: 2, blocks: true, opaque: true, look: 'vehicle', colour: '#6a4a2a', logs: true }],
  ['t', 'TRACTOR', 'tractor', { w: 3, h: 2, blocks: true, look: 'vehicle', colour: '#3a8a3a' }],
  ['X', 'WRECK', 'wrecked car', { w: 3, h: 2, blocks: true, look: 'vehicle', colour: '#5a4a44', wreck: true }],
  ['k', 'CANOE', 'canoe', { w: 2, h: 1, blocks: true, look: 'canoe', colour: '#c05030' }],
  // Trees and the woods.
  ['T', 'TREE', 'maple', { w: 1, h: 1, blocks: true, opaque: true, muffles: true, look: 'tree', colour: '#c05a28' }],
  ['N', 'PINE', 'pine', { w: 1, h: 1, blocks: true, opaque: true, muffles: true, look: 'pine', colour: '#1e4a24' }],
  ['j', 'BIRCH', 'birch', { w: 1, h: 1, blocks: true, opaque: true, muffles: true, look: 'tree', colour: '#d8c040', trunk: '#e8e8e0' }],
  ['a', 'APPLE', 'apple tree', { w: 1, h: 1, blocks: true, opaque: true, muffles: true, look: 'tree', colour: '#3a7a2a', fruit: '#d02020' }],
  ['y', 'SHRUB', 'shrub', { w: 1, h: 1, blocks: true, look: 'shrub', colour: '#3a6a2a' }],
  ['q', 'BERRY', 'berry bush', { w: 1, h: 1, blocks: true, look: 'shrub', colour: '#2e5a24', fruit: '#3a3aa8' }],
  ['u', 'STUMP', 'stump', { w: 1, h: 1, blocks: true, look: 'round', colour: '#8a6a44' }],
  ['Y', 'BOULDER', 'boulder', { w: 1, h: 1, blocks: true, look: 'round', colour: '#8a847c' }],
  ['h', 'HAY', 'hay bale', { w: 1, h: 1, blocks: true, look: 'round', colour: '#d8b860' }],
  ['W', 'WOODPILE', 'woodpile', { w: 2, h: 1, blocks: true, look: 'logs', colour: '#8a5a30' }],
  ['O', 'OUTHOUSE', 'outhouse', { w: 1, h: 1, blocks: true, opaque: true, look: 'box', colour: '#8a6a44', mark: 'moon' }],
  ['e', 'TENT', 'tent', { w: 2, h: 2, blocks: true, opaque: true, look: 'tent', colour: '#c08030' }],
  ['r', 'FIRERING', 'campfire ring', { w: 1, h: 1, look: 'fire' }],
  ['f', 'FISHING', 'fishing spot', { w: 1, h: 1, look: 'fishing' }],
  // Roadside.
  ['s', 'SIGN', 'sign', { w: 1, h: 1, blocks: true, text: true, look: 'sign' }],
  ['g', 'PUMP', 'gas pump', { w: 1, h: 1, blocks: true, look: 'box', colour: '#c03030', mark: 'pump' }],
  ['P', 'PHONE', 'payphone', { w: 1, h: 1, blocks: true, look: 'box', colour: '#c0c8d0', mark: 'phone' }],
  ['m', 'MAILBOX', 'mailbox', { w: 1, h: 1, blocks: true, look: 'post', colour: '#5a5a60' }],
  ['o', 'DRUM', 'oil drum', { w: 1, h: 1, blocks: true, look: 'round', colour: '#3a5a8a' }],
  ['d', 'DUMPSTER', 'dumpster', { w: 2, h: 1, blocks: true, opaque: true, look: 'box', colour: '#3a6a3a' }],
  ['n', 'TRASH', 'trash can', { w: 1, h: 1, blocks: true, look: 'round', colour: '#8a8a8a' }],
  ['l', 'LAMP', 'lamppost', { w: 1, h: 1, blocks: true, look: 'post', colour: '#2a2a2a', light: true }],
  ['A', 'BILLBOARD', 'billboard', { w: 3, h: 1, blocks: true, opaque: true, look: 'billboard', colour: '#e8e0c0' }],
  ['F', 'FLAG', 'flagpole', { w: 1, h: 1, blocks: true, look: 'flag', colour: '#c03030' }],
  // Indoors.
  ['x', 'CRATE', 'shelves', { w: 1, h: 1, blocks: true, look: 'crate', colour: '#b08850' }],
  ['b', 'BENCH', 'bench', { w: 2, h: 1, blocks: true, look: 'bench', colour: '#8a5a30' }],
  ['E', 'BED', 'bed', { w: 1, h: 2, blocks: true, look: 'bed', colour: '#4a6aa8' }],
  ['Q', 'TABLE', 'table', { w: 2, h: 1, blocks: true, look: 'furniture', colour: '#9a7040' }],
  ['z', 'CHAIR', 'chair', { w: 1, h: 1, blocks: true, look: 'furniture', colour: '#7a5430' }],
  ['V', 'SOFA', 'sofa', { w: 2, h: 1, blocks: true, look: 'furniture', colour: '#6a7a4a' }],
  ['K', 'COUNTER', 'counter', { w: 1, h: 1, blocks: true, look: 'furniture', colour: '#c8c0b0' }],
  ['H', 'STOVE', 'wood stove', { w: 1, h: 1, blocks: true, look: 'box', colour: '#2a2a2a', mark: 'stove' }],
  ['G', 'FRIDGE', 'fridge', { w: 1, h: 1, blocks: true, opaque: true, look: 'box', colour: '#e8e8e0' }],
  ['U', 'BATH', 'bathtub', { w: 2, h: 1, blocks: true, look: 'bath', colour: '#f0f0f0' }],
  ['J', 'DESK', 'desk', { w: 2, h: 1, blocks: true, look: 'furniture', colour: '#7a5430' }],
];
export const MARKER = [
  ['.', 'NONE', 'none', {}],
  ['@', 'START', 'player start', {}],
  ['Z', 'ZOMBIE', 'zombie spawn', {}],
  ['L', 'LABEL', 'landmark label', { text: true }],
  ['I', 'LOOT', 'loot spot', {}],
  ['K', 'KEYITEM', 'key-item spot', {}],
  ['W', 'WRECKSPOT', 'blocked-road spot', {}],
  ['N', 'NPC', 'NPC spot', {}],
];
export const ROOF = [
  ['.', 'NONE', 'none'], ['R', 'RED', 'red roof'], ['S', 'SLATE', 'slate roof'], ['B', 'BROWN', 'brown roof'], ['G', 'GREEN', 'green roof'],
  ['T', 'TIN', 'tin roof'], ['W', 'WHITE', 'white roof'],
];
export const LAYERS = ['height', 'ground', 'struct', 'object', 'marker', 'roof'];
const TABLES = { ground: GROUND, struct: STRUCT, object: OBJECT, marker: MARKER, roof: ROOF };
export const S = Object.fromEntries(STRUCT.map(([, k], i) => [k, i]));
export const O = Object.fromEntries(OBJECT.map(([, k], i) => [k, i]));
export const M = Object.fromEntries(MARKER.map(([, k], i) => [k, i]));
export const G = Object.fromEntries(GROUND.map(([, k], i) => [k, i]));
export const structInfo = s => STRUCT[s][3];
export const objectInfo = o => OBJECT[o][3];
export const groundTile = g => TILE[GROUND[g][1]];

// --- New kinds, made by Joe in the tile art builder (tileart/) ------------------------------------
// A kind is a plain definition: { layer: ground|struct|object|roof, key, char, name, w, h (objects),
// blocks, opaque (blocks sight; also muffles noise), step ('', 'loud', 'quiet'), type (structures:
// 'plain', 'wall' (doors and windows go in it), 'fence' (gates go in it), 'over' (walkable on
// anything, like a bridge)), text (its inspect line) }. They live in the art text (art/tiles.json,
// and the builder's autosave) and in any map that uses them, so a map always carries its own.
// registerKind adds one to the tables above (or updates it), so everything that reads the tables
// (the editor's palettes, the game's rules, drawing, the map text) takes it as it takes the rest.
export const KIND_LAYERS = ['ground', 'struct', 'object', 'roof'];
export const KIND_TYPES = ['plain', 'wall', 'fence', 'over'];
const KIND_TABLES = { ground: GROUND, struct: STRUCT, object: OBJECT, roof: ROOF };
const KIND_INDEX = { ground: G, struct: S, object: O, roof: null };
const KIND_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$&*?/<>()[]{};\'`';
export const kinds = new Map();   // 'layer:KEY' -> the definition, in the order they were added

export function cleanKind(d) {
  if (!d || !KIND_LAYERS.includes(d.layer) || !/^[A-Z][A-Z0-9_]*$/.test(d.key || '') || typeof d.char !== 'string' || d.char.length !== 1 || d.char === '.' || d.char === ' ') return null;
  const out = { layer: d.layer, key: d.key, char: d.char, name: String(d.name || d.key.toLowerCase()).slice(0, 30) };
  if (d.layer === 'object') { out.w = Math.max(1, Math.min(8, d.w | 0 || 1)); out.h = Math.max(1, Math.min(8, d.h | 0 || 1)); }
  if (d.layer !== 'roof') { out.blocks = !!d.blocks; out.opaque = !!d.opaque; }
  if (d.layer === 'ground' || d.layer === 'struct') out.step = d.step === 'loud' || d.step === 'quiet' ? d.step : '';
  if (d.layer === 'struct') out.type = KIND_TYPES.includes(d.type) ? d.type : 'plain';
  if (d.text) out.text = String(d.text).slice(0, 30);
  return out;
}
// The rules a kind gives the game (the same shape as the built-in kinds' info).
function kindInfo(d) {
  if (d.layer === 'ground') return { key: d.key, blocks: d.blocks, opaque: d.opaque, muffles: d.opaque, ...(d.step ? { step: d.step } : {}), custom: d };
  if (d.layer === 'struct') {
    return { blocks: d.type !== 'over' && d.blocks, opaque: d.opaque, muffles: d.opaque, wall: d.type === 'wall', fence: d.type === 'fence', pass: d.type === 'over',
      ...(d.step ? { step: d.step } : {}), ...(d.type === 'wall' ? { colour: 'plaster' } : {}), look: 'custom', custom: d };
  }
  if (d.layer === 'object') return { w: d.w, h: d.h, blocks: d.blocks, opaque: d.opaque, muffles: d.opaque, look: 'custom', custom: d };
  return { custom: d };
}
// Adds a kind, or updates the rules and name of one already added (its key and character never
// change). keep: leave one that's already there alone (a map's copy doesn't override the builder's).
// Returns null, or a message if it can't be added.
export function registerKind(raw, { keep = false } = {}) {
  const d = cleanKind(raw);
  if (!d) return 'That kind is broken.';
  const table = KIND_TABLES[d.layer], id = `${d.layer}:${d.key}`;
  const k = table.findIndex(e => e[1] === d.key);
  if (k >= 0 && !kinds.has(id)) return `${d.key} is already a ${d.layer} kind.`;
  if (k >= 0) {
    if (keep) return null;
    const old = kinds.get(id);
    d.char = old.char;
    Object.assign(old, d);
    for (const f of ['w', 'h', 'step', 'text']) if (!(f in d)) delete old[f];
    table[k][2] = old.name;
    const info = kindInfo(old);
    if (d.layer === 'ground') { const t = TILE_INFO[TILE[d.key]]; for (const f of Object.keys(t)) delete t[f]; Object.assign(t, info); }
    else { const t = table[k][3]; for (const f of Object.keys(t)) delete t[f]; Object.assign(t, info); }
    return null;
  }
  const clash = table.find(e => e[0] === d.char);
  if (clash) return `The ${d.layer} character '${d.char}' is taken by ${clash[2]}.`;
  if (table.length >= 255 || (d.layer === 'ground' && TILE_INFO.length >= 255)) return `No room for more ${d.layer} kinds.`;
  const info = kindInfo(d);
  if (d.layer === 'ground') { TILE[d.key] = TILE_INFO.length; TILE_INFO.push(info); table.push([d.char, d.key, d.name]); }
  else table.push([d.char, d.key, d.name, info]);
  if (KIND_INDEX[d.layer]) KIND_INDEX[d.layer][d.key] = table.length - 1;
  kinds.set(id, d);
  return null;
}
// Forgets a kind (the tables keep its row until the page reloads, so maps loaded already still read).
export function forgetKind(id) { kinds.delete(id); }
// The definition behind a table row, if it's a new kind.
export function kindOf(layer, v) {
  const e = KIND_TABLES[layer] && KIND_TABLES[layer][v];
  if (!e) return null;
  return (layer === 'ground' ? TILE_INFO[TILE[e[1]]].custom : e[3] && e[3].custom) || null;
}
// A free map character and an unused key for a new kind on a layer.
export function freeChar(layer) {
  const used = new Set(KIND_TABLES[layer].map(e => e[0]));
  for (const d of kinds.values()) if (d.layer === layer) used.add(d.char);
  return [...KIND_CHARS].find(c => !used.has(c)) || null;
}
export function freeKey(layer, name) {
  const base = 'X' + String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  const taken = k => KIND_TABLES[layer].some(e => e[1] === k) || kinds.has(`${layer}:${k}`);
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(base + n)) return base + n;
}
// Which new kinds are in the tables, in order: saves record it (tile numbers depend on it).
export const kindSignature = () => KIND_LAYERS.map(l => KIND_TABLES[l].filter((e, v) => kindOf(l, v)).map(e => e[1]).join(',')).join('|');

// Map sizes are whole screens (they overlap: CONFIG.world), so the flip-screen camera fits.
export function sizeForScreens(sx, sy) {
  const ov = CONFIG.world.flipAt + CONFIG.world.landIn + 1;
  return { w: (CONFIG.screen.w - ov) * sx + ov, h: (CONFIG.screen.h - ov) * sy + ov };
}
export function screensForSize(w, h) {
  const ov = CONFIG.world.flipAt + CONFIG.world.landIn + 1;
  return { sx: Math.max(1, Math.round((w - ov) / (CONFIG.screen.w - ov))), sy: Math.max(1, Math.round((h - ov) / (CONFIG.screen.h - ov))) };
}

export function createMap(sx = 3, sy = 3) {
  const { w, h } = sizeForScreens(sx, sy);
  const n = w * h;
  return {
    w, h,
    height: new Uint8Array(n), ground: new Uint8Array(n), struct: new Uint8Array(n),
    object: new Uint8Array(n), marker: new Uint8Array(n), roof: new Uint8Array(n),
    objects: [],  // { kind, x, y, w, h, text? }   (also painted into the object layer)
    markers: [],  // { kind, x, y, text? }         (also painted into the marker layer)
  };
}

// A copy of the map at a new size (in screens), keeping what fits from the top-left.
export function resizeMap(map, sx, sy) {
  const out = createMap(sx, sy);
  for (let y = 0; y < Math.min(map.h, out.h); y++) {
    for (let x = 0; x < Math.min(map.w, out.w); x++) {
      for (const l of ['height', 'ground', 'struct', 'roof']) out[l][y * out.w + x] = map[l][y * map.w + x];
    }
  }
  for (const o of map.objects) if (o.x + o.w <= out.w && o.y + o.h <= out.h) placeObject(out, { ...o });
  for (const m of map.markers) if (m.x < out.w && m.y < out.h) placeMarker(out, { ...m });
  return out;
}

export function cloneMap(map) {
  const out = { ...map, objects: map.objects.map(o => ({ ...o })), markers: map.markers.map(m => ({ ...m })) };
  for (const l of LAYERS) out[l] = map[l].slice();
  return out;
}

// --- Objects and markers -----------------------------------------------------------------------
export function footprint(kind, rot) {
  const { w, h } = objectInfo(kind);
  return rot ? { w: h, h: w } : { w, h };
}
export function objectAt(map, x, y) {
  return map.objects.find(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) || null;
}
export function placeObject(map, o) {
  map.objects.push(o);
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) map.object[y * map.w + x] = o.kind;
  return o;
}
export function removeObject(map, o) {
  map.objects = map.objects.filter(q => q !== o);
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) map.object[y * map.w + x] = 0;
}
export function markerAt(map, x, y) {
  return map.markers.find(m => m.x === x && m.y === y) || null;
}
export function placeMarker(map, m) {
  const old = markerAt(map, m.x, m.y);
  if (old) removeMarker(map, old);
  if (m.kind === M.START) for (const s of map.markers.filter(q => q.kind === M.START)) removeMarker(map, s); // only one start
  map.markers.push(m);
  map.marker[m.y * map.w + m.x] = m.kind;
  return m;
}
export function removeMarker(map, m) {
  map.markers = map.markers.filter(q => q !== m);
  map.marker[m.y * map.w + m.x] = 0;
}

// --- What a tile does ------------------------------------------------------------------------------
const WATER = G.WATER;
const WET = new Set([G.WATER, G.SHALLOWS]);   // can't build in it (a stream you can: it's shallow and stony)
export function cellBlocks(map, i) {
  const s = structInfo(map.struct[i]);
  if (objectInfo(map.object[i]).blocks) return true;
  if (s.pass) return false;
  return !!s.blocks || WET.has(map.ground[i]);
}

// --- Buildings: a rectangle becomes a whole building -------------------------------------------
// Each preset: wall, floor, roof, the front door (middle of the south wall: the side the camera
// sees) and windows. set(layer, i, v) does the painting (so the editor can undo it).
export const BUILDINGS = [
  { key: 'house', label: 'House', wall: 'CLAPBOARD', floor: 'FLOOR', roof: 'RED', door: 'DOOR', windows: 1 },
  { key: 'cabin', label: 'Cabin', wall: 'LOG', floor: 'FLOOR', roof: 'BROWN', door: 'DOOR', windows: 3 },
  { key: 'store', label: 'Store', wall: 'CLAPBOARD', floor: 'LINO', roof: 'SLATE', door: 'DOOR', windows: 1 },
  { key: 'diner', label: 'Diner', wall: 'CINDER', floor: 'CHECKER', roof: 'TIN', door: 'DOOR', windows: 1 },
  { key: 'barn', label: 'Barn', wall: 'BARN', floor: 'CONCRETE', roof: 'TIN', door: 'GARAGEDOOR', windows: 0 },
  { key: 'garage', label: 'Garage', wall: 'CINDER', floor: 'CONCRETE', roof: 'SLATE', door: 'GARAGEDOOR', windows: 0, side: 'DOOR' },
  { key: 'mill', label: 'Mill', wall: 'BRICK', floor: 'CONCRETE', roof: 'SLATE', door: 'DOOR', windows: 2 },
  { key: 'church', label: 'Church', wall: 'CLAPBOARD', floor: 'FLOOR', roof: 'WHITE', door: 'DOOR', windows: 3 },
  { key: 'shed', label: 'Shed', wall: 'BARN', floor: 'CONCRETE', roof: 'TIN', door: 'DOOR', windows: 0 },
];
// Returns null when built, else a message. r: { x0, y0, x1, y1 } inclusive.
export function buildBuilding(map, r, preset, set) {
  const { w } = map;
  if (r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) return 'A building needs at least 3 x 3.';
  const h0 = map.height[r.y0 * w + r.x0];
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * w + x;
      if (WET.has(map.ground[i])) return "Can't build on the water.";
      if (map.object[i]) return 'Something is in the way.';
      if (map.height[i] !== h0) return 'A building needs flat ground.';
    }
  }
  const wall = S[preset.wall], floor = G[preset.floor], roof = ROOF.findIndex(([, k]) => k === preset.roof);
  const doorX = (r.x0 + r.x1) >> 1;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * w + x;
      const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
      const corner = (x === r.x0 || x === r.x1) && (y === r.y0 || y === r.y1);
      let st = edge ? wall : 0;
      if (edge && !corner) {
        const along = y === r.y0 || y === r.y1 ? x - r.x0 : y - r.y0;
        if (y === r.y1 && x === doorX) st = S[preset.door];
        else if (preset.side && x === r.x1 && y === r.y1 - 1) st = S[preset.side];
        else if (preset.windows && along % (preset.windows + 1) === 0 && !(y === r.y1 && Math.abs(x - doorX) < 1)) st = S.WINDOW;
      }
      set('ground', i, floor);
      set('struct', i, st);
      set('roof', i, roof);
    }
  }
  furnish(map, r, preset.key, doorX, set);
  return null;
}

// --- Inside: rooms and furniture that fit the size you drew --------------------------------------
// Fixed rules, no dice: the same rectangle always gives the same building. Partitions get
// doorways; every piece of furniture is tried, and left out if it would cut any part of the
// inside off from the front door (or stand in the doorway).
function furnish(map, r, kind, doorX, set) {
  const { w } = map;
  const ix0 = r.x0 + 1, iy0 = r.y0 + 1, ix1 = r.x1 - 1, iy1 = r.y1 - 1;
  const iw = ix1 - ix0 + 1, ih = iy1 - iy0 + 1;
  if (iw < 2 || ih < 2) return;
  const entry = { x: doorX, y: iy1 };                  // just inside the front door
  const inside = (x, y) => x >= ix0 && x <= ix1 && y >= iy0 && y <= iy1;
  const connected = () => {
    const seen = new Set([entry.y * w + entry.x]), stack = [entry];
    while (stack.length) {
      const { x, y } = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * w + nx;
        if (!inside(nx, ny) || seen.has(k) || cellBlocks(map, k)) continue;
        seen.add(k); stack.push({ x: nx, y: ny });
      }
    }
    for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) if (!cellBlocks(map, y * w + x) && !seen.has(y * w + x)) return false;
    return true;
  };
  // A piece of furniture, only if it fits, stays clear of the entry and keeps every room reachable.
  const put = (kindKey, x, y, rot = 0, extra = {}) => {
    const k = O[kindKey], fp = footprint(k, rot);
    if (x < ix0 || y < iy0 || x + fp.w - 1 > ix1 || y + fp.h - 1 > iy1) return false;
    if (entry.x >= x && entry.x < x + fp.w && entry.y >= y && entry.y < y + fp.h) return false;
    if (checkPlace(map, 'object', k, x, y, rot)) return false;
    const o = placeObject(map, { kind: k, x, y, w: fp.w, h: fp.h, ...extra });
    if (!connected()) { removeObject(map, o); return false; }
    return true;
  };
  const wallH = (y, xa, xb, doors) => { for (let x = xa; x <= xb; x++) set('struct', y * w + x, doors.includes(x) ? S.DOOR : S.WALL); };
  const wallV = (x, ya, yb, doors) => { for (let y = ya; y <= yb; y++) set('struct', y * w + x, doors.includes(y) ? S.DOOR : S.WALL); };

  if (kind === 'house' || kind === 'cabin') {
    // Small: one room. Taller: a front room by the door, back rooms behind a partition. Wide too:
    // the back split in two (bedroom and kitchen), each with its own doorway.
    const split = kind === 'house' ? ih >= 5 && iw >= 3 : ih >= 6 && iw >= 5;
    if (!split) {
      put('BED', ix0, iy0); put('STOVE', ix1, iy0); put('TABLE', ix0 + 1, iy0 + Math.min(2, ih - 1)); put('CHAIR', ix1, iy1 - 1);
      return;
    }
    const py = iy0 + Math.floor((ih - 1) / 2);
    const two = iw >= 7;
    const mid = ix0 + Math.floor(iw / 2);
    const leftDoor = two ? ix0 + ((mid - ix0) >> 1) : Math.min(Math.max(doorX, ix0), ix1);
    const rightDoor = two ? mid + 1 + ((ix1 - mid - 1) >> 1) : -1;
    wallH(py, ix0, ix1, two ? [leftDoor, rightDoor] : [leftDoor]);
    if (two) wallV(mid, iy0, py - 1, []);
    // Back left: the bedroom. Back right (or the whole back): the kitchen.
    put('BED', ix0, iy0);
    if (two) { put('DESK', mid - 2, iy0); put('STOVE', ix1, iy0); put('FRIDGE', ix1 - 1, iy0); put('TABLE', mid + 1, py - 1); }
    else { put('STOVE', ix1, iy0); put('FRIDGE', ix1, iy0 + 1); }
    // Front: the living room.
    if (ih >= 9) put('BATH', ix0, py - 1);
    put('SOFA', ix0, py + 1); put('CHAIR', ix1, py + 1); put('STOVE', ix1, iy1);
    return;
  }
  if (kind === 'store') {
    // Shelf aisles running north-south, a counter by the door, a stockroom behind if it's deep.
    let top = iy0;
    if (ih >= 9) { wallH(iy0 + 2, ix0, ix1, [doorX]); put('CRATE', ix0, iy0); put('CRATE', ix1, iy0); put('CRATE', ix0 + 1, iy0); top = iy0 + 3; }
    for (let x = ix0 + 1; x <= ix1 - 1; x += 2) {
      if (Math.abs(x - doorX) < 1) continue;
      for (let y = top + 1; y <= iy1 - 3; y++) put('CRATE', x, y);
    }
    for (let x = ix0; x <= Math.min(ix1, doorX - 2); x++) put('COUNTER', x, iy1 - 1);
    return;
  }
  if (kind === 'diner') {
    // The counter along the back with stools before it (the kitchen behind it, if there's room),
    // tables along the front windows.
    const cy = ih >= 6 ? iy0 + 1 : iy0;
    if (ih >= 6) { put('STOVE', ix0, iy0); put('FRIDGE', ix0 + 1, iy0); }
    for (let x = ix0 + (ih >= 6 ? 0 : 0); x <= ix1 - 1; x++) put('COUNTER', x, cy);
    for (let x = ix0; x <= ix1 - 1; x += 2) put('CHAIR', x, cy + 1);
    for (let x = ix0; x + 1 <= ix1; x += 3) if (Math.abs(x - doorX) > 1 && Math.abs(x + 1 - doorX) > 1) put('TABLE', x, iy1 - 1);
    return;
  }
  if (kind === 'barn') {
    // A central aisle from the doors; stalls either side, hay along the back.
    for (let y = iy0 + 2; y <= iy1 - 2; y += 3) {
      for (let x = ix0; x <= doorX - 2; x++) set('struct', y * w + x, S.FENCE);
      for (let x = doorX + 2; x <= ix1; x++) set('struct', y * w + x, S.FENCE);
    }
    for (let x = ix0; x <= ix1; x++) if (Math.abs(x - doorX) > 1) put('HAY', x, iy0);
    return;
  }
  if (kind === 'garage') {
    // A truck in the bay if it fits, a workbench along the back, drums in a corner.
    if (iw >= 4 && ih >= 5) put('PICKUP', doorX - 1, iy1 - 3, 1);
    for (let x = ix0; x <= ix1; x++) put('COUNTER', x, iy0);
    put('DRUM', ix0, iy1); put('CRATE', ix1, iy1 - 1);
    return;
  }
  if (kind === 'mill') {
    // An office in the back corner if it's big; machine rows across the floor.
    let x0m = ix0;
    if (iw >= 8 && ih >= 6) { wallV(ix0 + 4, iy0, iy0 + 2, [iy0 + 1]); wallH(iy0 + 3, ix0, ix0 + 4, []); put('DESK', ix0, iy0); put('CHAIR', ix0 + 1, iy0 + 1); x0m = ix0 + 6; }
    for (let y = iy0 + 1; y <= iy1 - 2; y += 3) for (let x = Math.max(x0m, ix0 + 1); x <= ix1 - 1; x++) if (Math.abs(x - doorX) > 1) put('CRATE', x, y);
    return;
  }
  if (kind === 'church') {
    // The altar at the north end, pews either side of the aisle up the middle.
    put('TABLE', doorX - (iw >= 4 ? 1 : 0), iy0);
    for (let y = iy0 + 2; y <= iy1 - 1; y += 2) {
      for (let x = ix0; x + 1 <= doorX - 1; x += 2) put('BENCH', x, y);
      for (let x = doorX + 1; x + 1 <= ix1; x += 2) put('BENCH', x, y);
    }
    return;
  }
  if (kind === 'shed') {
    for (let x = ix0; x <= ix1; x++) put('CRATE', x, iy0);
    put('WOODPILE', ix0, iy1);
  }
}
// Knock a rectangle back to grass: walls, floor and roof gone (objects too, separately).
export function demolish(map, r, set) {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * map.w + x;
      if (map.roof[i] || (map.struct[i] && structInfo(map.struct[i]).wall) || map.struct[i] === S.WINDOW || map.struct[i] === S.DOOR || map.struct[i] === S.GARAGEDOOR) {
        if (!WET.has(map.ground[i])) set('ground', i, G.GRASS);
        set('struct', i, 0);
        set('roof', i, 0);
      }
    }
  }
}

// Can you step from one tile to its neighbour, as far as height goes? Level ground: yes. A
// change of height is a cliff, unless either tile is steps (both ways) or you're on a ledge
// stepping down.
export function heightStep(height, struct, from, to) {
  const a = height[from], b = height[to];
  if (a === b) return true;
  if (struct[from] === S.STEPS || struct[to] === S.STEPS) return true;
  return struct[from] === S.LEDGE && b < a;
}

// The roof tiles joined (4 ways) to the roof over tile i: one building's roof. Empty if none.
export function roofRegion(roof, w, h, i) {
  const out = new Set();
  if (!roof[i]) return out;
  const stack = [i];
  out.add(i);
  while (stack.length) {
    const j = stack.pop(), x = j % w, y = (j / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || out.has(k) || !roof[k]) continue;
      out.add(k); stack.push(k);
    }
  }
  return out;
}

// --- Placement rules (the editor refuses nonsense with a short message) ---------------------------
// Returns null if the placement is fine, else a message.
export function checkPlace(map, layer, kind, x, y, rot = 0) {
  const { w, h } = map;
  const inb = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h;
  if (!inb(x, y)) return 'Off the map.';
  const i = y * w + x;
  const ground = (xx, yy) => (inb(xx, yy) ? map.ground[yy * w + xx] : -1);
  const struct = (xx, yy) => (inb(xx, yy) ? map.struct[yy * w + xx] : -1);
  const height = (xx, yy) => (inb(xx, yy) ? map.height[yy * w + xx] : -1);
  const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (layer === 'struct') {
    const info = structInfo(kind);
    if (info.opening) {
      const solid = (xx, yy) => { const v = struct(xx, yy); return v > 0 && (structInfo(v).wall || structInfo(v).opening); };
      if (!((solid(x - 1, y) && solid(x + 1, y)) || (solid(x, y - 1) && solid(x, y + 1)))) return `A ${STRUCT[kind][2]} needs a wall either side.`;
    }
    if (kind === S.GATE) {
      const line = (xx, yy) => { const v = struct(xx, yy); return v > 0 && (structInfo(v).fence || v === S.GATE); };
      if (!((line(x - 1, y) && line(x + 1, y)) || (line(x, y - 1) && line(x, y + 1)))) return 'A gate needs a fence or wall either side.';
    }
    if ((kind === S.BRIDGE || kind === S.DOCK) && !WET.has(map.ground[i])) return `A ${STRUCT[kind][2]} goes over water.`;
    if ((info.blocks || info.opening || kind === S.TRACKS) && WET.has(map.ground[i])) return "Can't build that in the water.";
    if (kind === S.STEPS && !n4.some(([dx, dy]) => height(x + dx, y + dy) >= 0 && height(x + dx, y + dy) !== map.height[i])) return 'Steps need a height change beside them.';
    if (kind === S.LEDGE && !n4.some(([dx, dy]) => height(x + dx, y + dy) >= 0 && height(x + dx, y + dy) < map.height[i])) return 'A ledge needs a drop beside it.';
    if (kind && map.object[i]) return 'Something is in the way.';
  }
  if (layer === 'ground' && map.ground[i] !== kind && WET.has(kind)) {
    const o = map.object[i];
    if (o && o !== O.FISHING && o !== O.TREE) return `Can't flood a ${OBJECT[o][2]}.`;
    const s = map.struct[i];
    if (s && s !== S.BRIDGE && s !== S.DOCK && s !== S.STEPS && s !== S.LEDGE) return "Can't flood that.";
  }
  if (layer === 'object' && kind) {
    const fp = footprint(kind, rot);
    const name = OBJECT[kind][2];
    for (let yy = y; yy < y + fp.h; yy++) {
      for (let xx = x; xx < x + fp.w; xx++) {
        if (!inb(xx, yy)) return `No room for the ${name}.`;
        const j = yy * w + xx;
        if (map.object[j]) return 'Something is already there.';
        const s = map.struct[j];
        if (s && (structInfo(s).blocks || structInfo(s).opening || s === S.GATE)) return `A ${name} can't go on a ${STRUCT[s][2]}.`;
        if (kind !== O.FISHING && kind !== O.CANOE && WET.has(map.ground[j]) && s !== S.BRIDGE && s !== S.DOCK) return `A ${name} would sink.`;
        if (map.height[j] !== map.height[y * w + x]) return `The ${name} needs flat ground.`;
      }
    }
    if (kind === O.FISHING) {
      if (WET.has(map.ground[i]) && map.struct[i] !== S.DOCK) return 'Fishing spots go on the bank.';
      if (!n4.some(([dx, dy]) => WET.has(ground(x + dx, y + dy)))) return 'Fishing spots go by the water.';
    }
  }
  if (layer === 'marker' && kind) {
    if (cellBlocks(map, i)) return "Can't stand there.";
  }
  return null;
}

// --- Text: one character per tile per layer, a legend at the top, then the objects and markers
// with their properties. Copy and paste this; the game reads it from maps/*.txt. -----------------
export function serializeMap(map) {
  const out = ['# Zombie Survival map v1', `size ${map.w} ${map.h}`];
  // The new kinds this map uses, so it reads anywhere.
  const used = new Map();
  for (const l of KIND_LAYERS) {
    const arr = map[l];
    for (let i = 0; i < arr.length; i++) { const d = arr[i] && kindOf(l, arr[i]); if (d) used.set(`${l}:${d.key}`, d); }
  }
  for (const d of used.values()) out.push('kind ' + JSON.stringify(cleanKind(d)));
  out.push('legend height 0:0 1:1 2:2 3:3');
  for (const [l, table] of Object.entries(TABLES)) out.push(`legend ${l} ` + table.map(([c, , label]) => `${c}:${label.replace(/ /g, '_')}`).join(' '));
  const charOf = { ground: GROUND, struct: STRUCT, object: OBJECT, marker: MARKER, roof: ROOF };
  for (const l of LAYERS) {
    out.push(`layer ${l}`);
    for (let y = 0; y < map.h; y++) {
      let row = '';
      for (let x = 0; x < map.w; x++) {
        const v = map[l][y * map.w + x];
        row += l === 'height' ? String(v) : charOf[l][v][0];
      }
      out.push(row);
    }
  }
  out.push('objects');
  for (const o of map.objects) out.push(`${OBJECT[o.kind][1].toLowerCase()} ${o.x} ${o.y} ${o.w} ${o.h}${o.text ? ' text=' + o.text : ''}`);
  out.push('markers');
  for (const m of map.markers) out.push(`${MARKER[m.kind][1].toLowerCase()} ${m.x} ${m.y}${m.text ? ' text=' + m.text : ''}`);
  out.push('end');
  return out.join('\n') + '\n';
}

// Throws an Error with a short message if the text isn't a map.
export function parseMap(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let k = 0;
  const next = () => lines[k++];
  let w = 0, h = 0;
  while (k < lines.length && !w) {
    const m = /^size (\d+) (\d+)/.exec(lines[k++]);
    if (m) { w = +m[1]; h = +m[2]; }
  }
  if (!w || !h) throw new Error('Not a map: no size line.');
  const { sx, sy } = screensForSize(w, h);
  const map = createMap(sx, sy);
  if (map.w !== w || map.h !== h) throw new Error(`Map size ${w}x${h} isn't whole screens.`);
  let fromChar = {};
  const chars = () => { for (const [l, table] of Object.entries(TABLES)) fromChar[l] = Object.fromEntries(table.map(([c], i) => [c, i])); };
  chars();
  const objects = [], markers = [];
  let section = null;
  for (let line = next(); line !== undefined; line = next()) {
    if (line.startsWith('layer ')) {
      section = line.slice(6).trim();
      if (!LAYERS.includes(section)) throw new Error(`Unknown layer: ${section}.`);
      for (let y = 0; y < h; y++) {
        const row = next();
        if (row === undefined || row.length < w) throw new Error(`Layer ${section}: row ${y} is short.`);
        for (let x = 0; x < w; x++) {
          const c = row[x];
          let v;
          if (section === 'height') { v = c.charCodeAt(0) - 48; if (!(v >= 0 && v <= 3)) throw new Error(`Bad height '${c}' at ${x},${y}.`); }
          else { v = fromChar[section][c]; if (v === undefined) throw new Error(`Bad ${section} '${c}' at ${x},${y}.`); }
          if (section !== 'object' && section !== 'marker') map[section][y * w + x] = v;
        }
      }
      continue;
    }
    if (line.startsWith('kind ')) {
      let d = null;
      try { d = JSON.parse(line.slice(5)); } catch (e) { throw new Error('A broken kind line.'); }
      const err = registerKind(d, { keep: true });
      if (err) throw new Error(err);
      chars();
      continue;
    }
    if (line === 'objects' || line === 'markers') { section = line; continue; }
    if (line === 'end') break;
    if (!line.trim() || line.startsWith('#') || line.startsWith('legend')) continue;
    const textAt = line.indexOf(' text=');
    const text = textAt >= 0 ? line.slice(textAt + 6) : null;
    const parts = (textAt >= 0 ? line.slice(0, textAt) : line).trim().split(/\s+/);
    if (section === 'objects') {
      const kind = O[parts[0].toUpperCase()];
      if (!kind) throw new Error(`Unknown object: ${parts[0]}.`);
      const [x, y, ow, oh] = parts.slice(1).map(Number);
      objects.push({ kind, x, y, w: ow || objectInfo(kind).w, h: oh || objectInfo(kind).h, ...(text ? { text } : {}) });
    } else if (section === 'markers') {
      const kind = M[parts[0].toUpperCase()];
      if (!kind) throw new Error(`Unknown marker: ${parts[0]}.`);
      markers.push({ kind, x: +parts[1], y: +parts[2], ...(text ? { text } : {}) });
    }
  }
  for (const o of objects) placeObject(map, o);
  for (const m of markers) placeMarker(map, m);
  return map;
}

// --- Into the game ---------------------------------------------------------------------------------
// Fills a world (already sized by createWorld) from a map. Returns the start tile.
export function loadMapIntoWorld(world, map) {
  const n = map.w * map.h;
  world.tiles = new Uint8Array(n);
  for (let i = 0; i < n; i++) world.tiles[i] = groundTile(map.ground[i]);
  world.height = map.height.slice();
  world.struct = map.struct.slice();
  world.obj = map.object.slice();
  world.roof = map.roof.slice();
  world.pristine = world.tiles.slice();
  // Roofs as buildings: each roof region is one building, so seeing any of it from outside shows
  // the whole roof (vision.js).
  const L = { buildings: [], buildingAt: new Int16Array(n), signs: [], places: [], labels: [], objects: map.objects, markers: map.markers };
  for (let i = 0; i < n; i++) {
    if (!map.roof[i] || L.buildingAt[i]) continue;
    const region = roofRegion(map.roof, map.w, map.h, i);
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const j of region) { const x = j % map.w, y = (j / map.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    L.buildings.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, kind: 'building', name: null, facing: 'S', roofed: true });
    for (const j of region) L.buildingAt[j] = L.buildings.length;
  }
  for (const m of map.markers) if (m.kind === M.LABEL && m.text) L.labels.push({ x: m.x, y: m.y, text: m.text });
  world.layout = L;
  const start = map.markers.find(m => m.kind === M.START);
  return start ? { x: start.x, y: start.y } : { x: map.w >> 1, y: map.h >> 1 };
}
