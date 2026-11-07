// The region (docs/region-plan.md, region-plan.png): rural New England, early 1980s. Seven
// compact places joined by roads, trails and the railway through forest, with the lake, the
// mountains and the Kennock River. Laid out by hand as data, the same every run; the fixed
// world seed only decides small things (where the trees stand in the open woods, which way a
// gate opens).
//
// Everything is on the grid, like movement: every way runs north-south or east-west with square
// corners, and places, fields and water have blocky edges. Ways are given by their centre line
// (as on the plan) and a width.
//
// Order: farmland -> water (lake, river, gorge, ponds, swamp) -> places' ground -> trails,
// railway, roads, bridges, the trestle and the train -> clearings and wild places -> your
// house -> the woods and mountains round everything (open near the ways, dense further off) ->
// the map's edge -> gates, so every open tile can be reached from your front door.
// Stage 1: the ground. The places' buildings and the finds in the woods come next.
import { TILE, TILE_INFO } from '../tiles.js';
import { createCanvas, WAYS } from './paint.js';
import { createLayout, stampNS } from './buildings.js';

export const DISTRICT = { country: 0, centre: 1, river: 2, inner: 3, suburb: 4, edge: 5 };

// The Kennock River (centre line, 5 wide): out of Loon Lake, past Haverly, through the gorge,
// east through Carrick Mills and away.
export const RIVER = [[56, 92], [56, 104], [72, 104], [72, 160], [100, 160], [100, 214], [178, 214]];
const LAKE = [[8, 50, 60, 90], [14, 46, 52, 52], [16, 88, 48, 96], [58, 58, 64, 84]]; // x0, y0, x1, y1
const ISLAND = [28, 64, 38, 72];
// Mountains along the top: columns [x0, x1] down to row y.
const MOUNTAINS = [[0, 30, 40], [30, 58, 46], [58, 84, 38], [84, 100, 30], [100, 116, 30], [116, 140, 44], [140, 178, 36]];
const FARMLAND = [0, 146, 64, 210];

// The places: ground, streets (centre line, width, paved?), and how dangerous they are.
export const PLACES = [
  { name: 'Haverly', rect: [80, 108, 114, 152], district: 'centre', paved: true,
    streets: [[[[80, 130], [114, 130]], 4], [[[97, 108], [97, 152]], 3], [[[86, 116], [108, 116]], 2],
      [[[86, 144], [108, 144]], 2], [[[86, 116], [86, 144]], 2], [[[108, 116], [108, 144]], 2]] },
  { name: 'Carrick Mills', rect: [112, 204, 148, 240], district: 'inner',
    streets: [[[[112, 222], [148, 222]], 3], [[[124, 204], [124, 240]], 3]] },
  { name: 'Loon Lake', rect: [66, 58, 90, 84], district: 'suburb',
    streets: [[[[66, 72], [90, 72]], 2], [[[78, 58], [78, 84]], 2]] },
  { name: 'Apple Hill', rect: [16, 158, 46, 190], district: 'edge',
    streets: [[[[16, 170], [46, 170]], 3], [[[30, 158], [30, 190]], 2]] },
  { name: "Cooper's Corner", rect: [140, 96, 162, 114], district: 'suburb',
    streets: [[[[140, 104], [162, 104]], 3], [[[151, 96], [151, 114]], 3]] },
  { name: 'Spruce Hollow', rect: [152, 58, 176, 86], district: 'suburb',
    streets: [[[[152, 72], [176, 72]], 3], [[[164, 58], [164, 86]], 3]] },
  { name: 'Ledgeview', rect: [60, 242, 86, 266], district: 'suburb',
    streets: [[[[60, 254], [86, 254]], 3], [[[72, 242], [72, 266]], 2]] },
];

// Roads between the places: [centre line, width, surface, centre line drawn?].
const ROADS = [
  [[[0, 170], [16, 170]], 4, 'ROAD', true],                                        // Route 9 west
  [[[46, 170], [52, 170], [52, 130], [80, 130]], 4, 'ROAD', true],                 // Route 9: Apple Hill to Haverly
  [[[114, 130], [130, 130], [130, 104], [140, 104]], 4, 'ROAD', true],             // Route 9 to the crossroads
  [[[162, 104], [178, 104]], 4, 'ROAD', true],                                     // Route 9 out east
  [[[97, 108], [97, 92], [78, 92], [78, 84]], 3, 'ROAD'],                          // Lake Road
  [[[78, 58], [78, 50], [96, 50], [96, 31]], 3, 'ROAD'],                           // Notch Road, up to the rockslide
  [[[106, 152], [106, 198], [124, 198], [124, 204]], 3, 'ROAD'],                   // River Road to Carrick Mills
  [[[151, 114], [151, 120], [156, 120], [156, 222], [148, 222]], 3, 'ROAD'],       // County Road (county bridge)
  [[[156, 222], [178, 222]], 3, 'ROAD'],                                           // out east
  [[[151, 96], [151, 90], [164, 90], [164, 86]], 3, 'TRACK'],                      // logging road to Spruce Hollow
  [[[36, 190], [36, 254], [60, 254]], 3, 'ROAD'],                                  // Quarry Road: Apple Hill to Ledgeview
  [[[124, 240], [124, 254], [86, 254]], 3, 'ROAD'],                                // Mills Road: Carrick Mills to Ledgeview
  [[[72, 266], [72, 278]], 3, 'ROAD'],                                             // out south
];
// The railway (2 wide, a cess path beside it): east edge, Haverly depot, across Haverly, over
// the gorge on the trestle, Apple Hill halt, west edge.
const RAIL = [[178, 120], [114, 120], [114, 146], [60, 146], [60, 184], [0, 184]];
// Trails (1 wide): shortcuts and the ways to the wild places.
const TRAILS = [
  [[90, 66], [118, 66], [118, 72]], [[108, 108], [108, 80], [118, 80], [118, 72]], [[30, 190], [30, 228]],
  [[112, 236], [90, 236], [90, 246], [80, 246]], [[46, 160], [50, 160], [50, 98], [24, 98], [24, 97]],
  [[10, 92], [6, 92], [6, 40]], [[46, 186], [96, 186]], [[88, 186], [88, 222]], [[104, 186], [106, 186]],
  [[52, 120], [40, 120], [40, 134], [44, 134]], [[40, 120], [30, 120], [30, 112], [6, 112], [6, 124]],
  [[106, 176], [112, 176]], [[156, 150], [168, 150]], [[156, 176], [140, 176]], [[130, 130], [130, 160]],
  [[156, 190], [170, 190]], [[130, 104], [130, 94], [126, 94]], [[36, 232], [8, 232]],
  [[124, 254], [124, 262], [150, 262]], [[86, 266], [86, 270], [106, 270]], [[156, 232], [164, 232]],
  [[78, 92], [78, 98], [50, 98]],
];
// Clearings in the woods for the finds (buildings come in stage 3): [x, y, name].
export const FINDS = [
  [40, 120, 'the hunting camp'], [6, 124, "the hermit's cabin"], [30, 112, 'the ranger cabin'], [44, 134, 'the sugar shack'],
  [130, 160, "the trapper's cabin"], [112, 176, 'the town dump'], [140, 176, 'the campground'], [168, 150, 'the cabin colony'],
  [170, 190, 'the radio tower'], [126, 94, 'the hilltop cemetery'], [8, 232, 'the abandoned farmhouse'],
  [150, 262, 'the plane wreck'], [104, 270, 'the fishing shack'], [164, 232, 'the roadside motel'],
];

let cache = null;
export function regionLayout(w, h, rng) {
  if (!cache || cache.w !== w || cache.h !== h) cache = build(w, h, rng);
  return cache;
}

export function generateTown(world, rng) {
  const t = regionLayout(world.w, world.h, rng);
  world.tiles.set(t.tiles);
  world.layout = t.layout;
  return { ...t.layout.start };
}

// A way's rectangles from its centre line: a leg from (x0, y) to (x1, y) of width w covers
// rows y - floor(w / 2) .. + w - 1.
function rects(pts, w) {
  const h = w >> 1, out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (ax !== bx && ay !== by) throw new Error(`not on the grid: ${ax},${ay} -> ${bx},${by}`);
    out.push({ x: Math.min(ax, bx) - h, y: Math.min(ay, by) - h, w: Math.abs(bx - ax) + w, h: Math.abs(by - ay) + w, horiz: ay === by });
  }
  return out;
}

function build(w, h, rng) {
  const c = createCanvas(w, h);
  const L = createLayout(w, h);
  const T = TILE, use = { use: true };
  L.w = w; L.h = h;
  L.district = new Uint8Array(w * h);
  L.places = PLACES.map(p => ({ name: p.name, x0: p.rect[0], y0: p.rect[1], x1: p.rect[2], y1: p.rect[3] }));
  const zone = new Uint8Array(w * h); // 1: mountains
  for (const [x0, x1, y1] of MOUNTAINS) for (let y = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (c.inb(x, y)) zone[y * w + x] = 1;
  const box = (x0, y0, x1, y1, tile, opts = use) => c.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, tile, opts);

  // Farmland round Apple Hill: fields walled with stone, crops and pasture; two orchards.
  {
    const [x0, y0, x1, y1] = FARMLAND;
    for (let fy = y0; fy <= y1; fy += 9) {
      for (let fx = x0; fx <= x1; fx += 10) {
        const crop = rng.chance(0.5) ? T.FIELD : T.GRASS;
        for (let y = fy; y < Math.min(fy + 9, y1 + 1); y++) for (let x = fx; x < Math.min(fx + 10, x1 + 1); x++) {
          c.set(x, y, y === fy || x === fx ? T.LOWWALL : crop, use);
        }
      }
    }
    for (const [ox, oy] of [[48, 194], [2, 194]]) {
      box(ox, oy, ox + 12, oy + 12, T.GRASS);
      for (let y = oy + 1; y < oy + 12; y += 2) for (let x = ox + 1; x < ox + 12; x += 2) c.set(x, y, T.TREE, use);
    }
  }
  // Water: Loon Lake (and its island), the river, the gorge's crags, ponds, the swamp.
  for (const [x0, y0, x1, y1] of LAKE) box(x0, y0, x1, y1, T.WATER);
  box(...ISLAND, T.TREE);
  for (const r of rects([[72, 140], [72, 160], [98, 160]], 11)) c.rect(r.x, r.y, r.w, r.h, T.CRAG, use);
  for (const r of rects(RIVER, 5)) c.rect(r.x, r.y, r.w, r.h, T.WATER, use);
  for (let y = 184; y <= 186; y++) for (let x = 98; x <= 102; x++) c.set(x, y, T.SHALLOWS, use);   // the shallows (waders)
  for (let y = 212; y <= 216; y++) c.set(120, y, T.WEIR, use);                                     // the dam at the falls
  box(22, 228, 34, 238, T.WATER);                                                                 // Pine Pond
  box(108, 264, 118, 274, T.WATER);                                                               // Mud Pond
  for (let y = 222; y <= 238; y++) for (let x = 78; x <= 102; x++) {                               // the swamp
    const k = (x * 7 + y * 13) % 11;
    c.set(x, y, k === 0 ? T.TREE : k < 4 ? T.WATER : T.MARSH, use);
  }
  // The places' ground.
  for (const p of PLACES) {
    const [x0, y0, x1, y1] = p.rect;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (c.get(x, y) !== T.WATER && c.get(x, y) !== T.WEIR) c.set(x, y, T.GRASS, use);   // not over the river
      L.district[y * w + x] = DISTRICT[p.district];
    }
  }
  // Trails, the railway (with its cess path), roads (with verges), the places' streets.
  for (const t of TRAILS) for (const r of rects(t, 1)) paintWay(c, r, T.PATH);
  for (const r of rects(RAIL, 2)) c.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, T.PATH, { use: true, onlyFree: true });
  for (const r of rects(RAIL, 2)) paintWay(c, r, T.RAIL);
  L.roadCover = new Uint8Array(w * h);
  const lines = [];
  for (const [pts, wd, surface, line] of ROADS) {
    const rs = rects(pts, wd);
    for (const r of rs) c.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, T.GRASS, { use: true, onlyFree: true });
    for (const r of rs) paintWay(c, r, T[surface], L.roadCover);
    if (line) lines.push(...rs.map(r => [r, wd]));
  }
  for (const p of PLACES) {
    const rs = p.streets.flatMap(([pts, wd]) => rects(pts, wd));
    if (p.paved) for (const r of rs) c.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, T.PAVEMENT, { use: true });
    for (const r of rs) paintWay(c, r, p.paved || r.w >= 3 && r.h >= 3 ? T.ROAD : T.TRACK, L.roadCover);
  }
  // Bridges: Route 9's iron bridge, the county bridge, the bridge in Carrick Mills, the lake footbridge.
  bridge(c, 68, 127, 9, 6, true);
  bridge(c, 154, 210, 5, 9, false);
  bridge(c, 122, 210, 5, 9, false);
  bridge(c, 53, 97, 7, 3, true, T.BRIDGE, T.FENCE);
  // The trestle over the gorge: parapet, a one-tile ledge, the track, parapet. The train stopped
  // on it: three carriages (12 x 2, end to end), one out over the gorge.
  for (let x = 65; x <= 79; x++) {
    c.set(x, 143, T.PARAPET, use); c.set(x, 144, T.BRIDGE, use);
    c.set(x, 145, T.RAIL, use); c.set(x, 146, T.RAIL, use); c.set(x, 147, T.PARAPET, use);
  }
  L.train = [];
  for (let k = 0; k < 3; k++) {
    const x0 = 54 + k * 12;
    for (let x = x0; x < x0 + 12; x++) for (let y = 145; y <= 146; y++) c.set(x, y, x === x0 ? T.CARRIAGE_END : T.CARRIAGE, use);
    L.train.push({ x: x0, y: 145, w: 12, h: 2 });
    L.buildings.push({ x: x0, y: 145, w: 12, h: 2, kind: 'carriage', name: ['the rear carriage', 'the middle carriage', 'the front carriage'][k], facing: 'S', entry: { x: x0 + 5, y: 144 } });
    const n = L.buildings.length;
    for (let x = x0; x < x0 + 12; x++) for (let y = 145; y <= 146; y++) L.buildingAt[y * w + x] = n;
  }
  // Clearings for the finds, the fire tower hill, the quarry, the old mine, the summer camp.
  for (const [x, y] of FINDS) box(x - 3, y - 3, x + 3, y + 3, T.GRASS, { use: true, onlyFree: true });
  box(110, 58, 126, 72, T.GRASS, { use: true, onlyFree: true });
  box(20, 220, 36, 227, T.GRASS, { use: true, onlyFree: true });
  for (let y = 236; y <= 250; y++) for (let x = 40; x <= 56; x++) {
    const edge = y === 236 || y === 250 || x === 40 || x === 56;
    c.set(x, y, edge ? (y === 250 && (x === 47 || x === 48) ? T.TRACK : T.CRAG) : (x * 5 + y * 3) % 17 === 0 ? T.ROCK : T.YARD, use);
  }
  for (let y = 251; y <= 252; y++) { c.set(47, y, T.TRACK, use); c.set(48, y, T.TRACK, use); }
  c.set(6, 39, T.TUNNEL, use);                                                                     // the old mine
  for (let y = 28; y <= 30; y++) for (let x = 94; x <= 98; x++) c.set(x, y, T.ROCK, use);          // the rockslide
  for (let x = 162; x <= 166; x++) c.set(x, 57, x === 164 ? T.PADLOCK : T.FENCE, use);             // the logging camp gate
  // Your house: a farmhouse in Apple Hill, facing the street.
  const home = stampNS(c, L, 22, 162, 6, 7, { kind: 'farmhouse', name: 'your house', roof: 'TILES', wall: 'WOOD', facing: 'S' });
  L.home = L.buildings.indexOf(home);
  L.start = { ...home.entry };
  // The woods and mountains round everything: open near the ways, dense further off.
  woods(c, zone, rng);
  edge(c, zone);
  connect(c, rng, L.start, zone);
  for (const [r, wd] of lines) centreLine(c, L, r, wd);
  delete L.roadCover;
  c.t.forEach((t, i) => { if (t === T.WATER || t === T.CRAG) L.district[i] = DISTRICT.river; });
  return { w, h, tiles: c.t, layout: L };
}

// A way over whatever's there, except water (bridges are their own); a road over the rails
// is a level crossing.
function paintWay(c, r, surface, cover) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!c.inb(x, y)) continue;
      const t = c.get(x, y);
      if (t === TILE.WATER || t === TILE.SHALLOWS || t === TILE.WEIR || t === TILE.MARSH) continue;
      if (t === TILE.RAIL && surface !== TILE.RAIL) { c.set(x, y, TILE.CROSSING, { use: true }); continue; }
      if (t === TILE.CRAG && surface === TILE.PATH) continue;
      c.set(x, y, surface, { use: true });
      if (cover && surface === TILE.ROAD) cover[y * c.w + x]++;
    }
  }
}

// A deck across water with parapets along its sides (only where it's over water or the bank).
function bridge(c, x, y, bw, bh, horiz, deck = TILE.BRIDGE, rail = TILE.PARAPET) {
  for (let yy = y; yy < y + bh; yy++) {
    for (let xx = x; xx < x + bw; xx++) {
      const side = horiz ? (yy === y || yy === y + bh - 1) : (xx === x || xx === x + bw - 1);
      if (side) { if (c.get(xx, yy) === TILE.WATER || c.get(xx, yy) === TILE.CRAG) c.set(xx, yy, rail, { use: true }); }
      else c.set(xx, yy, deck, { use: true });
    }
  }
}

// Everything not yet claimed: forest (or mountain). Within a few tiles of anything open it's
// open woods, clumps of trees with room to walk between (open crag and scree in the mountains);
// further off it's dense forest you can't get through: the walls between the routes.
function woods(c, zone, rng) {
  const T = TILE, { w, h } = c;
  const dist = new Int16Array(w * h).fill(-1);
  const q = [];
  for (let i = 0; i < w * h; i++) if (c.used[i] && !TILE_INFO[c.t[i]].blocks) { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    if (dist[i] >= 12) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[j] >= 0) continue;
      dist[j] = dist[i] + 1; q.push(j);
    }
  }
  const hash = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (c.used[i]) continue;
      const d = dist[i] < 0 ? 99 : dist[i];
      const reach = 2 + (hash(x >> 3, y >> 3) % 4);       // how far the open woods reach here: 2-5
      if (zone[i] === 1) {
        c.t[i] = d <= 2 ? (hash(x, y) < 120 ? T.ROCK : T.MOOR) : d <= 4 && hash(x, y) < 500 ? T.ROCK : T.CRAG;
      } else if (d <= 1) {
        c.t[i] = T.GRASS;
      } else if (d <= reach) {
        const clump = hash(x >> 1, y >> 1) < 380;
        c.t[i] = clump ? T.TREE : hash(x, y) < 25 ? T.ROCK : T.GRASS;
      } else {
        c.t[i] = T.TREE;
      }
    }
  }
  void rng;
}

// The map's edge is closed: trees, crags, roadblocks where the roads leave.
function edge(c, zone) {
  const T = TILE;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (x !== 0 && y !== 0 && x !== c.w - 1 && y !== c.h - 1) continue;
      const t = c.get(x, y);
      if (t === T.ROAD || t === T.ROAD_LINE_H || t === T.ROAD_LINE_V || t === T.TRACK) c.set(x, y, T.BARRIER, { use: true });
      else if (t === T.RAIL) c.set(x, y, T.FENCE, { use: true });
      else if (!TILE_INFO[t].blocks) c.set(x, y, zone[y * c.w + x] === 1 ? T.CRAG : T.TREE, { use: true });
    }
  }
}

// Every open tile reachable from your front door: where a wall, fence or tree shuts off a patch
// of open ground, open a gate (or fell the tree), preferring one onto a way (Kruskal over the
// patches). Patches still cut off are filled with what's round them.
const OPENABLE = new Set([TILE.LOWWALL, TILE.FENCE, TILE.WALL, TILE.HEDGE, TILE.TREE]);
function connect(c, rng, start, zone) {
  const T = TILE, { w, h } = c;
  const open = i => !TILE_INFO[c.t[i]].blocks;
  const label = new Int32Array(w * h).fill(-1);
  let n = 0;
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (label[i] >= 0 || !open(i)) continue;
    label[i] = n; stack.push(i);
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || label[k] >= 0 || !open(k)) continue;
        label[k] = n; stack.push(k);
      }
    }
    n++;
  }
  const cands = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!OPENABLE.has(c.t[i])) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const a = i - dy * w - dx, b = i + dy * w + dx;
        if (label[a] < 0 || label[b] < 0 || label[a] === label[b]) continue;
        const way = WAYS.has(c.t[a]) || WAYS.has(c.t[b]);
        cands.push({ i, a: label[a], b: label[b], score: (way ? 0 : 2) + rng.next() });
      }
    }
  }
  cands.sort((p, q) => p.score - q.score);
  const parent = Array.from({ length: n }, (_, k) => k);
  const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
  const opened = [];
  for (const g of cands) {
    const ra = find(g.a), rb = find(g.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    opened.push(g);
    c.t[g.i] = c.t[g.i] === T.TREE ? T.GRASS : T.GATE;
  }
  const home = find(label[start.y * w + start.x]);
  // A gate between patches that never joined up with home goes back to what it was.
  for (const g of opened) if (find(g.a) !== home) c.t[g.i] = zone[g.i] === 1 ? T.CRAG : T.TREE;
  for (let i = 0; i < w * h; i++) {
    if (label[i] < 0 || find(label[i]) === home) continue;
    const t = c.t[i];
    c.t[i] = t === T.YARD || t === T.DRIVE ? T.WALL : zone[i] === 1 ? T.CRAG : T.TREE;
  }
}

// A dashed centre line down a wide road, but not through junctions.
function centreLine(c, L, r, wd) {
  const T = TILE;
  if (r.horiz) {
    const y = r.y + (wd >> 1);
    for (let x = r.x + wd; x < r.x + r.w - wd; x++) if (c.get(x, y) === T.ROAD && L.roadCover[y * c.w + x] === 1 && (x & 1)) c.set(x, y, T.ROAD_LINE_H);
  } else {
    const x = r.x + (wd >> 1);
    for (let y = r.y + wd; y < r.y + r.h - wd; y++) if (c.get(x, y) === T.ROAD && L.roadCover[y * c.w + x] === 1 && (y & 1)) c.set(x, y, T.ROAD_LINE_V);
  }
}
