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
import { TILE } from './tiles.js';

// [char, key, label]. Ground keys are tile keys (tiles.js), so the game's tile rules and
// drawing work on them unchanged.
export const GROUND = [
  ['.', 'GRASS', 'grass'], ['=', 'ROAD', 'road'], ['-', 'PAVEMENT', 'sidewalk'], [':', 'PATH', 'path'],
  [',', 'GRAVEL', 'gravel'], ['"', 'FIELD', 'field'], ['~', 'WATER', 'water'], ['_', 'FLOOR', 'floor'],
];
// Structures: blocks movement, blocks sight (opaque), muffles noise, pass: walkable whatever
// the ground (a bridge over water).
export const STRUCT = [
  ['.', 'NONE', 'none', {}],
  ['#', 'WALL', 'wall', { blocks: true, opaque: true, muffles: true }],
  ['+', 'DOOR', 'door', { muffles: true, pass: true }],
  ['|', 'FENCE', 'fence', { blocks: true }],
  ['%', 'HEDGE', 'hedge', { blocks: true, opaque: true, muffles: true }],
  ['H', 'BRIDGE', 'bridge', { pass: true }],
  ['^', 'STEPS', 'steps', { pass: true }],
  ['v', 'LEDGE', 'ledge', {}],
];
// Objects: footprint (w x h, turned by rot), blocks movement, blocks sight. A sign has text.
export const OBJECT = [
  ['.', 'NONE', 'none', { w: 1, h: 1 }],
  ['c', 'CAR', 'car', { w: 3, h: 2, blocks: true }],
  ['v', 'VAN', 'van', { w: 4, h: 2, blocks: true, opaque: true }],
  ['T', 'TREE', 'tree', { w: 1, h: 1, blocks: true, opaque: true, muffles: true }],
  ['b', 'BENCH', 'bench', { w: 2, h: 1, blocks: true }],
  ['x', 'CRATE', 'shelf/crate', { w: 1, h: 1, blocks: true }],
  ['s', 'SIGN', 'sign', { w: 1, h: 1, blocks: true, text: true }],
  ['f', 'FISHING', 'fishing spot', { w: 1, h: 1 }],
];
export const MARKER = [
  ['.', 'NONE', 'none', {}],
  ['@', 'START', 'player start', {}],
  ['Z', 'ZOMBIE', 'zombie spawn', {}],
  ['L', 'LABEL', 'landmark label', { text: true }],
];
export const ROOF = [
  ['.', 'NONE', 'none'], ['R', 'RED', 'red roof'], ['S', 'SLATE', 'slate roof'], ['B', 'BROWN', 'brown roof'], ['G', 'GREEN', 'green roof'],
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
export function cellBlocks(map, i) {
  const s = structInfo(map.struct[i]);
  if (objectInfo(map.object[i]).blocks) return true;
  if (s.pass) return false;
  return !!s.blocks || map.ground[i] === WATER;
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
    if (kind === S.DOOR) {
      const solid = (xx, yy) => struct(xx, yy) === S.WALL;
      if (!((solid(x - 1, y) && solid(x + 1, y)) || (solid(x, y - 1) && solid(x, y + 1)))) return 'A door needs a wall either side.';
    }
    if (kind === S.BRIDGE && map.ground[i] !== WATER) return 'Bridges go over water.';
    if ((kind === S.WALL || kind === S.FENCE || kind === S.HEDGE || kind === S.DOOR) && map.ground[i] === WATER) return "Can't build that in the water.";
    if (kind === S.STEPS && !n4.some(([dx, dy]) => height(x + dx, y + dy) >= 0 && height(x + dx, y + dy) !== map.height[i])) return 'Steps need a height change beside them.';
    if (kind === S.LEDGE && !n4.some(([dx, dy]) => height(x + dx, y + dy) >= 0 && height(x + dx, y + dy) < map.height[i])) return 'A ledge needs a drop beside it.';
    if (kind && map.object[i]) return 'Something is in the way.';
  }
  if (layer === 'ground' && map.ground[i] !== kind && kind === WATER) {
    const o = map.object[i];
    if (o && o !== O.FISHING && o !== O.TREE) return `Can't flood a ${OBJECT[o][2]}.`;
    const s = map.struct[i];
    if (s && s !== S.BRIDGE && s !== S.STEPS && s !== S.LEDGE) return "Can't flood that.";
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
        if (s === S.WALL || s === S.FENCE || s === S.HEDGE || s === S.DOOR) return `A ${name} can't go on a ${STRUCT[s][2]}.`;
        if (kind !== O.FISHING && map.ground[j] === WATER && s !== S.BRIDGE) return `A ${name} would sink.`;
        if (map.height[j] !== map.height[y * w + x]) return `The ${name} needs flat ground.`;
      }
    }
    if (kind === O.FISHING) {
      if (map.ground[i] === WATER) return 'Fishing spots go on the bank.';
      if (!n4.some(([dx, dy]) => ground(x + dx, y + dy) === WATER)) return 'Fishing spots go by the water.';
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
  const fromChar = {};
  for (const [l, table] of Object.entries(TABLES)) fromChar[l] = Object.fromEntries(table.map(([c], i) => [c, i]));
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
