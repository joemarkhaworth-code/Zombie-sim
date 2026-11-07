// Brackenby: the one fixed town (docs/town-plan.md, town-plan.png), the same every run. Laid out
// by hand as data (the river, the roads and lanes, the railway, the streets and what lines
// them, the landmarks), with the fixed world seed only for small things: how long each row of
// terraces is, where the trees stand, which way a hedge gate opens. Coordinates are map tiles
// (179 x 279); north is up.
//
// The order matters: each feature claims its tiles, and later ones only build on what's left.
//   1. the countryside: fields and hedges, the moor, woods, parks
//   2. the River Kell, its gorge (crags) and banks, the bridges
//   3. the roads, lanes and railway
//   4. landmarks (market place, castle, church, station, the stopped train...)
//   5. the streets' frontages: terraces, shops, semis, estates, industry
//   6. the edge of the map (police roadblocks on the roads out), then gates so that every open
//      tile can be reached from your front door.
import { TILE, TILE_INFO } from '../tiles.js';
import { createCanvas, inPoly, eachInPoly, zigzag, wayRects, polyDistance, thickLine, WAYS } from './paint.js';
import { createLayout, frontage, stampNS, stampEW } from './buildings.js';

export const DISTRICT = { country: 0, centre: 1, river: 2, inner: 3, suburb: 4, edge: 5 };

// ---------------------------------------------------------------------------------------------
// The river: a centreline (water 5 wide), through a gorge with crags below the town centre.
export const RIVER = [[0, 126], [14, 130], [28, 138], [40, 143], [52, 148], [64, 155], [74, 161], [86, 167],
  [98, 170], [112, 171], [124, 174], [132, 182], [138, 194], [144, 206], [150, 220], [158, 234], [168, 246], [178, 254]];

// What lines the streets. Sizes are the outside sizes (buildings.js KINDS).
const VIC = { kind: 'terrace', count: [5, 8], minRun: 2, gap: 1, gapTile: 'PATH', back: 2, backTile: 'YARD', backEdge: 'WALL', divide: 'WALL', roof: 'SLATE', wall: 'STONE' };
const SPECS = {
  vic: VIC,
  vicBay: { ...VIC, setback: 2, boundary: 'LOWWALL', count: [4, 6] }, // bay windows and low front walls
  cottage: { kind: 'cottage', count: [2, 4], gap: 1, gapTile: 'PATH', back: 1, backTile: 'YARD', backEdge: 'WALL', divide: 'WALL', roof: 'SLATE', wall: 'STONE' },
  shops: { kind: 'shop', count: [2, 5], back: 3, backTile: 'YARD', backEdge: 'WALL', divide: 'WALL', roof: 'SLATE', wall: ['STONE', 'STONE', 'RENDER'] },
  semi30: { kind: 'semi', count: [2, 2], gap: 2, gapTile: 'DRIVE', setback: 2, boundary: 'HEDGE', back: 4, backTile: 'GRASS', backEdge: 'FENCE', divide: 'FENCE', roof: 'TILES', wall: ['RENDER', 'BRICK'] },
  council: { kind: 'semi', count: [2, 4], gap: 2, gapTile: 'PATH', setback: 2, boundary: 'FENCE', back: 5, backTile: 'GRASS', backEdge: 'FENCE', divide: 'FENCE', roof: 'TILES', wall: 'BRICK' },
  semi60: { kind: 'semi', count: [2, 2], gap: 2, gapTile: 'DRIVE', setback: 2, back: 4, backTile: 'GRASS', backEdge: 'FENCE', divide: 'FENCE', roof: 'TILES', wall: 'BRICK' },
  estate70: { kind: 'terrace', count: [3, 4], gap: 1, gapTile: 'PATH', setback: 2, back: 3, backTile: 'GRASS', backEdge: 'FENCE', divide: 'FENCE', roof: 'TILES', wall: 'BRICK' },
  bungalow: { kind: 'bungalow', count: [1, 1], gap: 2, gapTile: 'DRIVE', setback: 2, boundary: 'LOWWALL', back: 3, backTile: 'GRASS', backEdge: 'FENCE', roof: 'TILES', wall: ['BRICK', 'RENDER'] },
  detached: { kind: 'detached', count: [1, 1], gap: 3, gapTile: 'DRIVE', setback: 3, boundary: 'HEDGE', back: 5, backTile: 'GRASS', backEdge: 'HEDGE', roof: 'SLATE', wall: 'STONE' },
  bighouse: { kind: 'bighouse', count: [1, 1], gap: 5, gapTile: 'GRASS', setback: 5, boundary: 'WALL', back: 6, backTile: 'GRASS', backEdge: 'WALL', roof: 'SLATE', wall: 'STONE' },
  industrial: { kind: 'factory', count: [1, 1], gap: 3, gapTile: 'YARD', setback: 3, boundary: 'FENCE', back: 3, backTile: 'YARD', backEdge: 'FENCE', roof: 'METAL', wall: 'METAL' },
};

// The High Street, in order from the west, both sides. Facing-away shops get a hanging sign.
const HIGH_ST_N = [
  { kind: 'shop', name: 'the bakery' }, { kind: 'shop', name: 'the butcher' }, { kind: 'bank', name: 'the bank', wall: 'STONE' },
  { kind: 'shop', name: 'the ironmonger' }, { kind: 'postoffice', name: 'the post office' }, { kind: 'shop', name: 'the chemist' },
  { kind: 'shop', name: 'the newsagent' }, { kind: 'shop', name: 'the greengrocer' }, { kind: 'shop', name: 'the toy shop' },
  { kind: 'pub', name: 'the Angel', wall: 'RENDER' }, { kind: 'shop', name: 'the hardware shop' }, { kind: 'bank', name: 'the building society' },
  { kind: 'cinema', name: 'the Picture House', wall: 'BRICK' }, { kind: 'shop', name: 'the electrical shop' }, { kind: 'shop', name: 'the launderette' },
];
const HIGH_ST_S = [
  { kind: 'shop', name: 'the charity shop', sign: 'CHARITY' },
  { kind: 'shop', name: 'the outfitters', sign: 'TAILOR' }, { kind: 'shop', name: 'the tea room', sign: 'TEAS' },
  { kind: 'bank', name: 'the other bank', sign: 'BANK' },
  // east of the market
  { kind: 'shop', name: 'the fish and chip shop', sign: 'CHIPS' }, { kind: 'shop', name: 'the bookmaker', sign: 'BETS' },
  { kind: 'pub', name: 'the Kings Arms', sign: 'KINGS' }, { kind: 'shop', name: 'the barber', sign: 'BARBER' },
  { kind: 'shop', name: 'the police station', sign: 'POLICE', wall: 'BRICK' }, { kind: 'hall', name: 'the fire station', sign: 'FIRE', wall: 'BRICK' },
  { kind: 'hall', name: 'the Co-op', sign: 'CO-OP' }, { kind: 'shop', name: 'the video shop', sign: 'VIDEO' },
];

// Roads and lanes: corner points (each the top-left tile of the way's cross-section), width,
// surface, pavements, centre line, and what lines them. front: [{ u: [from, to], N/S/W/E: spec }]
// (u is x along east-west legs, y along north-south ones).
const STREETS = [
  // The High Street and York Road: the town's spine, east-west along the ridge.
  { name: 'High Street', pts: [[54, 132], [127, 132]], w: 4, pave: true, line: true,
    front: [{ u: [54, 132], N: { ...SPECS.shops, units: HIGH_ST_N }, S: { ...SPECS.shops, units: HIGH_ST_S } }] },
  { name: 'York Road', pts: [[127, 132], [140, 132], [140, 128], [158, 128], [158, 124], [178, 124]], w: 4, pave: true, line: true,
    front: [{ u: [128, 157], N: SPECS.cottage, S: SPECS.vic }, { u: [158, 170], N: SPECS.semi60, S: SPECS.semi60 }] },
  // North Road (the old Great North Road) and the road to the north-east.
  { name: 'North Road', pts: [[92, 131], [92, 66]], w: 4, pave: true, line: true, late: true,
    front: [{ u: [66, 131], W: SPECS.vic, E: SPECS.vic }] },
  { name: 'North Road', pts: [[92, 66], [92, 62], [95, 62], [95, 0]], w: 4, line: true, country: true },
  { name: 'Harrogate Road', pts: [[116, 131], [116, 100], [122, 100], [122, 50]], w: 4, pave: true, line: true, late: true,
    front: [{ u: [104, 131], W: SPECS.vic, E: SPECS.cottage }, { u: [64, 99], W: SPECS.semi30, E: { ...SPECS.shops, roof: 'TILES', wall: 'BRICK', count: [6, 6] } }, { u: [50, 63], W: SPECS.semi30, E: SPECS.semi30 }] },
  { name: 'Harrogate Road', pts: [[122, 50], [122, 36], [132, 36], [132, 0]], w: 4, line: true, country: true },
  // West: the top square, the road out over the moor, Bond End down to the Old Bridge.
  { name: 'Ripley Road', pts: [[44, 128], [34, 128], [34, 116], [22, 116], [22, 100]], w: 4, pave: true, line: true,
    front: [{ u: [22, 44], N: SPECS.bighouse, S: SPECS.bighouse }, { u: [100, 131], W: SPECS.bighouse, E: SPECS.bighouse }] },
  { name: 'Ripley Road', pts: [[22, 100], [10, 100], [10, 84], [0, 84]], w: 4, line: true, country: true },
  { name: 'Bond End', pts: [[50, 137], [50, 141]], w: 4, surface: 'SETTS', pave: true,
    front: [{ u: [137, 144], W: SPECS.cottage, E: SPECS.cottage }] },
  // South of the river: the west road, the south-east road over East Bridge, the bypass.
  { name: 'Wetherby Road', pts: [[50, 153], [50, 160], [40, 160], [40, 172], [28, 172], [28, 184], [14, 184], [14, 190], [0, 190]], w: 4, line: true, country: true },
  { name: 'Selby Road', pts: [[124, 136], [124, 150], [150, 150], [150, 209]], w: 4, pave: true, line: true, late: true,
    front: [{ u: [136, 149], W: SPECS.vic, E: SPECS.cottage }, { u: [128, 149], N: SPECS.vic, S: SPECS.semi30 }, { u: [154, 205], W: SPECS.semi60, E: SPECS.industrial }] },
  { name: 'Selby Road', pts: [[136, 209], [136, 222], [142, 222], [142, 232], [148, 232], [148, 278]], w: 4, line: true, country: true },
  { name: 'the bypass', pts: [[28, 186], [28, 196], [40, 196], [40, 206], [52, 206], [52, 216], [64, 216], [64, 226], [80, 226], [80, 234], [100, 234], [100, 240], [171, 240], [171, 124]], w: 4, line: true, country: true,
    front: [{ u: [140, 236], W: SPECS.industrial }] },
  // Inner town north: Victorian terraces between the centre and the railway, semis to the west.
  { name: 'Victoria Street', pts: [[20, 77], [134, 77]], w: 3, pave: true,
    front: [{ u: [20, 53], N: SPECS.semi30, S: SPECS.semi30 }, { u: [54, 91], N: SPECS.vic, S: SPECS.vic }, { u: [96, 134], N: SPECS.vic, S: SPECS.vicBay }] },
  { name: 'Albert Street', pts: [[20, 98], [91, 98]], w: 3, pave: true,
    front: [{ u: [20, 53], N: SPECS.semi30, S: SPECS.semi30 }, { u: [54, 91], N: SPECS.vic, S: SPECS.vicBay }] },
  { name: 'Chapel Street', pts: [[77, 80], [77, 117]], w: 3, pave: true,
    front: [{ u: [80, 117], W: SPECS.vic, E: SPECS.vic }] },
  { name: 'Mill Lane', pts: [[44, 136], [22, 136]], w: 3, surface: 'SETTS',
    front: [{ u: [22, 44], N: SPECS.cottage, S: SPECS.cottage }] },
  // North-west: 1940s semis and a 1960s estate.
  { name: 'Moor View', pts: [[20, 47], [91, 47]], w: 3, pave: true,
    front: [{ u: [20, 91], S: SPECS.semi60 }] },
  { name: 'Grange Road', pts: [[50, 50], [50, 76]], w: 3, pave: true },
  // North-east, across the railway: 1930s semis and council houses.
  { name: 'Coronation Avenue', pts: [[99, 56], [140, 56]], w: 3, pave: true,
    front: [{ u: [99, 142], N: SPECS.council, S: SPECS.council }] },
  // East: the 1970s estate (a loop off York Road with cul-de-sacs off it).
  { name: 'Eastfield Drive', pts: [[140, 127], [140, 104]], w: 3, pave: true, front: [{ u: [104, 127], W: SPECS.estate70 }] },
  { name: 'Eastfield Drive', pts: [[140, 104], [166, 104]], w: 3, pave: true, front: [{ u: [140, 168], N: SPECS.estate70 }] },
  { name: 'Eastfield Drive', pts: [[166, 104], [166, 123]], w: 3, pave: true, front: [{ u: [104, 123], E: SPECS.estate70 }] },
  { name: 'Eastfield Close', pts: [[144, 116], [160, 116]], w: 3, pave: true, head: true,
    front: [{ u: [144, 160], N: SPECS.estate70, S: SPECS.estate70 }] },
  { name: 'Eastfield Rise', pts: [[146, 136], [146, 145]], w: 3, pave: true, head: true,
    front: [{ u: [136, 146], W: SPECS.estate70, E: SPECS.estate70 }] },
  { name: 'Eastfield Way', pts: [[160, 132], [160, 144]], w: 3, pave: true, head: true,
    front: [{ u: [132, 146], W: SPECS.bungalow, E: SPECS.bungalow }] },
  // South-east, on the crag top inside the river bend: 1950s-70s houses and bungalows.
  { name: 'Bridge Street', pts: [[128, 164], [149, 164]], w: 3, pave: true,
    front: [{ u: [128, 149], N: SPECS.semi60, S: SPECS.bungalow }] },
  { name: 'Riverside Crescent', pts: [[140, 178], [149, 178]], w: 3, pave: true,
    front: [{ u: [136, 149], N: SPECS.bungalow, S: SPECS.bungalow }] },
  // Industrial estate.
  { name: 'Kell Way', pts: [[154, 196], [170, 196]], w: 4, front: [{ u: [154, 170], N: SPECS.industrial, S: SPECS.industrial }] },
  { name: 'Tannery Lane', pts: [[154, 180], [170, 180]], w: 4, front: [{ u: [154, 170], N: SPECS.industrial, S: SPECS.industrial }] },
  { name: 'Brewery Lane', pts: [[154, 222], [170, 222]], w: 4, front: [{ u: [154, 170], N: SPECS.industrial, S: SPECS.industrial }] },
  // Town centre lanes.
  { name: 'Back Lane', pts: [[56, 118], [124, 118]], w: 2, surface: 'SETTS',
    front: [{ u: [76, 124], N: SPECS.cottage }] },
  { name: 'Station Road', pts: [[103, 112], [103, 131]], w: 3, pave: true },
  { name: 'Briggate', pts: [[108, 137], [108, 151], [111, 151], [111, 166]], w: 3, surface: 'SETTS',
    front: [{ u: [137, 150], E: SPECS.cottage }] },
  { name: 'Park Row', pts: [[131, 106], [131, 131]], w: 3, pave: true, late: true,
    front: [{ u: [104, 131], W: SPECS.cottage, E: SPECS.vic }] },
  // Lanes in the country.
  { name: 'Low Bridge Lane', pts: [[111, 177], [111, 186], [96, 186], [96, 196]], w: 3, surface: 'TRACK', country: true },
  { name: 'the hamlet', pts: [[62, 196], [99, 196]], w: 3, surface: 'TRACK',
    front: [{ u: [62, 99], N: SPECS.cottage, S: SPECS.cottage }] },
  { name: 'Chapel Fold', pts: [[74, 186], [74, 195]], w: 2, surface: 'TRACK',
    front: [{ u: [184, 195], W: SPECS.cottage, E: SPECS.cottage }] },
  { name: 'Town End', pts: [[66, 199], [66, 206]], w: 2, surface: 'TRACK',
    front: [{ u: [199, 207], W: SPECS.cottage, E: SPECS.cottage }] },
  { name: 'Abbey Road', pts: [[114, 177], [120, 177], [120, 181], [126, 181]], w: 2, surface: 'TRACK', country: true },
  { name: 'Moor Lane', pts: [[22, 100], [22, 92], [10, 92], [10, 66], [6, 66], [6, 34]], w: 2, surface: 'TRACK', country: true },
  { name: 'Lund Lane', pts: [[99, 46], [106, 46], [106, 33]], w: 2, surface: 'TRACK', country: true },
  { name: 'Golf Lane', pts: [[68, 40], [94, 40]], w: 2, surface: 'TRACK', country: true },
  { name: 'Racecourse Lane', pts: [[136, 37], [140, 37], [140, 45]], w: 2, surface: 'TRACK', country: true },
  { name: 'Quarry Lane', pts: [[90, 199], [90, 211]], w: 2, surface: 'TRACK', country: true },
  { name: 'Woodhouse Lane', pts: [[28, 200], [28, 240]], w: 2, surface: 'TRACK', country: true },
  { name: 'Ings Lane', pts: [[147, 264], [104, 264], [104, 259]], w: 2, surface: 'TRACK', country: true },
];

// Districts (for zombie and loot numbers, 13d): polygons, later ones on top.
const DISTRICTS = [
  ['inner', [[18, 54], [148, 54], [150, 100], [116, 106], [52, 118], [18, 104]]],
  ['suburb', [[18, 54], [52, 54], [52, 112], [18, 104]]],
  ['suburb', [[96, 48], [148, 48], [150, 98], [112, 104], [96, 92]]],
  ['suburb', [[134, 100], [172, 100], [172, 148], [134, 148]]],
  ['suburb', [[124, 154], [150, 154], [150, 206], [136, 206], [124, 178]]],
  ['suburb', [[2, 96], [44, 96], [50, 126], [2, 126]]],
  ['suburb', [[56, 184], [100, 184], [100, 206], [56, 206]]],
  ['edge', [[152, 140], [176, 140], [176, 238], [152, 238]]],
  ['edge', [[110, 238], [156, 238], [156, 262], [110, 262]]],
  ['inner', [[18, 126], [50, 126], [52, 146], [18, 146]]],
  ['centre', [[44, 110], [134, 110], [134, 150], [112, 166], [96, 162], [74, 156], [54, 150], [44, 140]]],
];

// ---------------------------------------------------------------------------------------------
let cache = null;

// The layout (tiles, buildings, signs, districts, your front door), worked out once.
export function townLayout(w, h, rng) {
  if (!cache || cache.w !== w || cache.h !== h) cache = build(w, h, rng);
  return cache;
}

function build(w, h, rng) {
  const c = createCanvas(w, h);
  const L = createLayout(w, h);
  L.district = new Uint8Array(w * h);
  L.w = w; L.h = h;
  const T = TILE;
  for (const [name, poly] of DISTRICTS) eachInPoly(c, poly, (x, y) => { L.district[y * w + x] = DISTRICT[name]; });

  countryside(c, rng);
  river(c, L);
  ways(c, L, rng);
  landmarks(c, L, rng);
  for (const s of STREETS) if (!s.late) streetFronts(c, L, rng, s);
  for (const s of STREETS) if (s.late) streetFronts(c, L, rng, s);
  countryHedges(c);
  farms(c, L, rng);
  // The home: your terraced house on Albert Street (the start screen, 11,8).
  const home = L.buildings.filter(b => b.facing === 'S' && b.kind === 'terrace' && b.y + b.h === 97)
    .sort((a, b) => Math.abs(a.x - 80) - Math.abs(b.x - 80))[0];
  home.name = 'your house';
  L.home = L.buildings.indexOf(home);
  L.start = { x: home.entry.x, y: home.entry.y };
  edge(c);
  connect(c, rng, L.start);
  centreLines(c, L);
  c.t.forEach((t, i) => { if (t === T.WATER && L.district[i] !== DISTRICT.river) L.district[i] = DISTRICT.river; });
  return { w, h, tiles: c.t, layout: L };
}

// 1. The countryside --------------------------------------------------------------------------
function countryside(c, rng) {
  const T = TILE;
  c.rect(0, 0, c.w, c.h, T.GRASS);
  // Fields: a jittered patchwork of crops and pasture with hedges between (dry stone walls on the
  // moor side). Gates come later, where they're needed.
  const ys = [0];
  while (ys[ys.length - 1] < c.h) ys.push(ys[ys.length - 1] + 9 + rng.int(6));
  for (let j = 0; j + 1 < ys.length; j++) {
    const y0 = ys[j], y1 = ys[j + 1];
    let x = -rng.int(8);
    while (x < c.w) {
      const fw = 10 + rng.int(8);
      const crop = rng.chance(0.45) ? T.FIELD : T.GRASS;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x; xx < x + fw; xx++) {
          const edgeTile = yy === y0 || xx === x;
          c.set(xx, yy, edgeTile ? (xx < 30 ? T.LOWWALL : T.HEDGE) : crop);
        }
      }
      x += fw;
    }
  }
  // Built-up areas start as open ground (gardens and verges come with the streets).
  for (const poly of BUILT) eachInPoly(c, poly, (x, y) => c.set(x, y, T.GRASS));
  // The moor to the west: heather, boulders, dry stone walls.
  eachInPoly(c, MOOR, (x, y) => {
    const t = c.get(x, y);
    c.set(x, y, t === T.LOWWALL || t === T.HEDGE ? T.LOWWALL : rng.chance(0.03) ? T.ROCK : T.MOOR);
  });
  // Woods: the gorge woods upstream and on the far bank, and the woods to the south-west.
  for (const poly of WOODS) eachInPoly(c, poly, (x, y) => c.set(x, y, rng.chance(0.42) ? T.TREE : T.GRASS));
  // The golf course: fairways, greens, bunkers, a few copses.
  eachInPoly(c, GOLF, (x, y) => c.set(x, y, T.GRASS, { use: true }));
  for (const [gx, gy] of [[28, 10], [50, 8], [36, 22], [58, 18], [30, 36], [54, 30], [44, 38]]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) c.set(gx + dx, gy + dy, T.GREEN, { use: true });
    c.set(gx + 3, gy + 1, T.SAND, { use: true }); c.set(gx + 3, gy + 2, T.SAND, { use: true }); c.set(gx - 3, gy - 1, T.SAND, { use: true });
  }
  for (let k = 0; k < 40; k++) {
    const x = 20 + rng.int(48), y = 6 + rng.int(36);
    if (inPoly(GOLF, x, y) && c.get(x, y) === T.GRASS) c.set(x, y, T.TREE, { use: true });
  }
  // The racecourse: an oval of turf inside white rails, with the grandstand on the west side.
  for (let y = 8; y <= 92; y++) {
    for (let x = 146; x <= 176; x++) {
      const ex = (x + 0.5 - 161) / 15, ey = (y + 0.5 - 50) / 42, r = Math.hypot(ex, ey);
      if (r > 1.02) continue;
      c.set(x, y, r > 0.97 || (r > 0.78 && r < 0.83) ? T.FENCE : T.GRASS, { use: true });
    }
  }
}

const BUILT = [
  [[18, 52], [150, 52], [152, 100], [176, 100], [176, 238], [110, 238], [110, 166], [44, 156], [18, 140]],
  [[2, 94], [50, 94], [50, 130], [2, 130]],
  [[54, 182], [102, 182], [102, 208], [54, 208]],
];
const MOOR = [[0, 0], [16, 0], [22, 40], [16, 90], [4, 92], [0, 94]];
const WOODS = [
  [[0, 132], [12, 134], [26, 142], [40, 148], [48, 156], [52, 164], [100, 172], [108, 178], [100, 184], [56, 184], [40, 176], [26, 168], [0, 160]],
  [[0, 206], [36, 200], [56, 222], [52, 262], [30, 272], [0, 272]],
];
const GOLF = [[18, 4], [68, 4], [70, 42], [22, 44]];

// 2. The river ----------------------------------------------------------------------------------
function river(c, L) {
  const T = TILE;
  // The ford: shallows a few tiles along the river near (128, 178); the weir at x = 98.
  const fordAt = polyDistance(RIVER, 128.5, 178.5).along;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const { d, along } = polyDistance(RIVER, x + 0.5, y + 0.5);
      const a = Math.abs(d);
      if (a > 13) continue;
      const half = x > 118 ? 3 : x < 30 ? 2.2 : 2.5;
      const opts = { use: true };
      if (a <= half) {
        if (Math.abs(along - fordAt) <= 1.5) c.set(x, y, T.SHALLOWS, opts);
        else if (x === 98) c.set(x, y, T.WEIR, opts);
        else c.set(x, y, T.WATER, opts);
        continue;
      }
      if (d < 0) {
        // North bank. Below the centre: the towpath (Waterside), a wide bank, then the crag.
        if (x >= 56 && x <= 109) {
          const bank = x >= 76 ? 6 : 2;
          if (a <= half + 1) c.set(x, y, T.PATH, opts);
          else if (a <= half + bank) c.set(x, y, T.GRASS, opts);
          else if (a <= half + bank + 3) c.set(x, y, T.CRAG, opts);
        } else if (a <= half + 1) c.set(x, y, T.GRASS, opts);
      } else {
        // South bank: a strip of bank, then the far crag under the woods.
        if (x >= 56 && x <= 104) {
          if (a <= half + 2) c.set(x, y, T.GRASS, opts);
          else if (a <= half + 5) c.set(x, y, T.CRAG, opts);
        } else if (a <= half + 1) c.set(x, y, T.GRASS, opts);
      }
    }
  }
  // The water meadows (the ings) south of the river below the town: open, no building.
  eachInPoly(c, [[100, 176], [126, 176], [136, 200], [112, 200], [98, 188]], (x, y) => {
    if (!c.isUsed(x, y)) c.set(x, y, T.GRASS, { use: true });
  });
  // Gallon Steps: up the crag from Waterside to the castle.
  for (let y = 150; y < 166; y++) if (c.get(88, y) === T.CRAG) c.set(88, y, T.STEPS, { use: true });
}

// Bridge: a deck with parapets along its sides (only over water and crag), claimed.
function bridge(c, x, y, bw, bh, horiz, deck = TILE.BRIDGE, rail = TILE.PARAPET) {
  const T = TILE;
  const under = (xx, yy) => [T.WATER, T.CRAG, T.SHALLOWS, T.WEIR, T.PATH, T.GRASS].includes(c.get(xx, yy));
  for (let yy = y; yy < y + bh; yy++) {
    for (let xx = x; xx < x + bw; xx++) {
      const side = horiz ? (yy === y || yy === y + bh - 1) : (xx === x || xx === x + bw - 1);
      if (side) { if (under(xx, yy) && c.isUsed(xx, yy)) c.set(xx, yy, rail, { use: true }); }
      else c.set(xx, yy, deck, { use: true });
    }
  }
}

// 3. Ways -------------------------------------------------------------------------------------------
function ways(c, L, rng) {
  const T = TILE;
  // The railway. East: from the edge of the map down to the station's platform. West: from the
  // viaduct's south end away through the woods. Tracks 2 wide, fenced off.
  const railway = (pts, fenced = true) => {
    const bed = new Set();
    thickLine(c, pts, fenced ? 4 : 2, (x, y) => { if (c.inb(x, y)) bed.add(y * c.w + x); });
    const track = new Set();
    thickLine(c, pts, 2, (x, y) => { if (c.inb(x, y)) track.add(y * c.w + x); });
    for (const i of bed) {
      const x = i % c.w, y = (i / c.w) | 0;
      if (c.get(x, y) === T.WATER) continue;
      c.set(x, y, track.has(i) ? T.RAIL : T.FENCE, { use: true });
    }
  };
  railway([[178, 88], [146, 96], [113, 104]]);
  c.rect(97, 104, 17, 2, T.RAIL, { use: true });
  railway([[73, 184], [60, 196], [40, 212], [16, 232], [0, 244]]);
  // The tunnel's north mouth, east of North Road, under the town to the south mouth.
  c.rect(96, 103, 1, 4, T.WALL, { use: true });
  c.rect(96, 104, 1, 2, T.TUNNEL, { use: true });

  // Roads: pavements (or verges) first, then the carriageways, so junctions are clear.
  const legs = [];
  for (const s of STREETS) {
    s.rects = wayRects(s.pts, s.w);
    for (const r of s.rects) legs.push({ s, r });
  }
  for (const { s, r } of legs) {
    if (s.pave) c.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, T.PAVEMENT, { use: true, onlyFree: true });
    else if (s.country && s.w >= 4) c.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, T.GRASS, { use: true, onlyFree: true });
  }
  L.roadCover = new Uint8Array(c.w * c.h);
  for (const { s, r } of legs) {
    const surface = T[s.surface || 'ROAD'];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!c.inb(x, y)) continue;
        const t = c.get(x, y);
        if (t === T.WATER || t === T.SHALLOWS) continue; // bridges are their own
        if (t === T.RAIL) { c.set(x, y, T.CROSSING, { use: true }); continue; }
        c.set(x, y, surface, { use: true });
        if (surface === T.ROAD) L.roadCover[y * c.w + x]++;
      }
    }
  }
  // A turning head at the end of a cul-de-sac.
  for (const s of STREETS) {
    if (!s.head) continue;
    const [ex, ey] = s.pts[s.pts.length - 1];
    c.rect(ex - 1, ey - 1, s.w + 2, s.w + 2, T.ROAD, { use: true });
  }
  // Bridges, west to east.
  bridge(c, 15, 128, 3, 7, false, T.BRIDGE, T.FENCE);   // the wooden footbridge in the gorge woods
  bridge(c, 49, 142, 5, 11, false);                     // the Old Bridge (3 wide, medieval)
  bridge(c, 110, 166, 5, 11, false);                    // Low Bridge
  bridge(c, 138, 208, 16, 6, true);                     // East Bridge
  bridge(c, 157, 239, 15, 6, true);                     // the bypass bridge (concrete, 1980s)
  // Old Bridge: the road comes off Bond End onto the deck and down to the west road.
  c.rect(50, 142, 3, 11, T.BRIDGE, { use: true });
  // The roundabout where the bypass meets the Selby road, by the superstore.
  for (let y = 236; y <= 247; y++) for (let x = 144; x <= 155; x++) {
    const r = Math.hypot(x + 0.5 - 150, y + 0.5 - 242);
    if (r <= 6) c.set(x, y, r <= 2.6 ? T.GRASS : T.ROAD, { use: true });
  }
}

// Hedges along country roads, where the fields meet the verge.
function countryHedges(c) {
  const T = TILE;
  for (const s of STREETS) {
    if (!s.country) continue;
    const off = s.w >= 4 ? 2 : 1;
    for (const r of s.rects) {
      for (let y = r.y - off; y < r.y + r.h + off; y++) {
        for (let x = r.x - off; x < r.x + r.w + off; x++) {
          const ring = x === r.x - off || x === r.x + r.w + off - 1 || y === r.y - off || y === r.y + r.h + off - 1;
          if (!ring || c.isUsed(x, y)) continue;
          const t = c.get(x, y);
          if (t === T.GRASS || t === T.FIELD || t === T.MOOR) c.set(x, y, x < 30 ? T.LOWWALL : T.HEDGE);
        }
      }
    }
  }
}

// 4. Landmarks -----------------------------------------------------------------------------------
function landmarks(c, L, rng) {
  const T = TILE;
  const use = { use: true };
  // The top square at the west end of the High Street (Haworth's), with the Black Bull.
  c.rect(44, 126, 10, 11, T.SETTS, use);
  stampNS(c, L, 45, 118, 8, 8, { kind: 'pub', name: 'the Black Bull', roof: 'SLATE', wall: 'STONE', facing: 'S' });
  // St John's and its graveyard, at the top of the town, by the top square.
  c.rect(56, 102, 18, 16, T.GRASS, use);
  for (let x = 56; x < 74; x++) { c.set(x, 102, T.LOWWALL, use); c.set(x, 117, T.LOWWALL, use); }
  for (let y = 102; y <= 117; y++) { c.set(56, y, T.LOWWALL, use); c.set(73, y, T.LOWWALL, use); }
  c.set(65, 117, T.GATE, use); c.set(56, 112, T.GATE, use);
  for (let y = 114; y < 117; y++) c.set(65, y, T.PATH, use);
  const church = stampNS(c, L, 58, 106, 14, 8, { kind: 'church', name: "St John's church", roof: 'SLATE', wall: 'STONE', facing: 'S' });
  c.rect(58, 104, 4, 2, T.ROOF_SLATE_N, use);  // the tower at the west end
  for (let y = 104; y < 106; y++) for (let x = 58; x < 62; x++) L.buildingAt[y * c.w + x] = L.buildings.indexOf(church) + 1;
  for (let y = 103; y < 117; y += 2) for (let x = 57; x < 73; x += 2) {
    if (c.get(x, y) === T.GRASS && x !== 65 && (y < 104 || y > 113 || x < 58 || x > 71) && rng.chance(0.5)) c.set(x, y, T.GRAVE, use);
  }
  // The Market Place: a big triangle of setts with the old Town Hall standing alone in it.
  for (let y = 137; y <= 147; y++) {
    const k = y - 137;
    for (let x = 78 + k; x <= 106 - k; x++) c.set(x, y, T.SETTS, use);
  }
  stampNS(c, L, 89, 139, 7, 5, { kind: 'hall', name: 'the Town Hall', roof: 'SLATE', wall: 'STONE', facing: 'S', front: 'grand' });
  c.set(84, 138, T.MARKET_CROSS, use);
  // The Shambles: the old covered market down the west side.
  stampNS(c, L, 80, 141, 6, 2, { kind: 'shop', name: 'the Shambles', roof: 'SLATE', wall: 'STONE', facing: 'S', storeys: 1 });
  // The castle on its crag above the gorge: ruined curtain walls, the keep, lawns.
  // (Only on the crag top: the gorge's tiles are already claimed.)
  const free = { use: true, onlyFree: true };
  c.rect(74, 148, 28, 9, T.GRASS, { onlyFree: true });
  for (let x = 75; x < 101; x++) if (x % 7 !== 3) c.set(x, 149, T.RUIN, free);
  for (let y = 149; y <= 156; y++) { if (y !== 152) c.set(75, y, T.RUIN, free); if (y !== 153) c.set(100, y, T.RUIN, free); }
  c.rect(85, 150, 5, 4, T.RUIN, free);
  c.rect(86, 151, 3, 2, T.GRASS, free);
  c.set(87, 153, T.GRASS, free);
  c.rect(92, 151, 5, 2, T.GREEN, free);   // the bowling green
  c.claim(74, 148, 28, 9);
  // The station: forecourt off Back Lane, the building, the platform, the line into the tunnel.
  c.rect(97, 106, 17, 1, T.PLATFORM, use);
  c.rect(97, 107, 17, 11, T.CARPARK, use);
  stampNS(c, L, 99, 107, 12, 5, { kind: 'station', name: 'the station', roof: 'SLATE', wall: 'STONE', facing: 'S' });
  // The railway in a cutting south of the tunnel, out onto the viaduct with the train on it.
  c.rect(69, 143, 9, 1, T.WALL, use);
  c.rect(72, 143, 3, 1, T.TUNNEL, use);
  for (let y = 144; y <= 148; y++) {
    c.set(69, y, T.WALL, use); c.set(77, y, T.WALL, use);
    c.set(70, y, T.PATH, use); c.set(71, y, T.PATH, use); c.set(72, y, T.PATH, use);
    c.set(73, y, T.RAIL, use); c.set(74, y, T.RAIL, use);
    c.set(75, y, T.PATH, use); c.set(76, y, T.PATH, use);
  }
  c.set(69, 146, T.STEPS, use);
  for (let y = 149; y <= 172; y++) {
    c.set(71, y, T.PARAPET, use); c.set(72, y, T.BRIDGE, use);
    c.set(73, y, T.RAIL, use); c.set(74, y, T.RAIL, use); c.set(75, y, T.PARAPET, use);
  }
  for (let y = 173; y <= 186; y++) {
    c.set(71, y, T.FENCE, use); c.set(72, y, T.PATH, use);
    c.set(73, y, T.RAIL, use); c.set(74, y, T.RAIL, use); c.set(75, y, T.PATH, use); c.set(76, y, T.FENCE, use);
  }
  // The stopped train: three carriages (2 x 12), the last still in the tunnel mouth.
  L.train = [];
  for (let k = 0; k < 3; k++) {
    const y0 = 144 + k * 12;
    for (let y = y0; y < y0 + 12; y++) for (let x = 73; x <= 74; x++) c.set(x, y, y === y0 + 11 ? T.CARRIAGE_END : T.CARRIAGE, use);
    L.train.push({ x: 73, y: y0, w: 2, h: 12 });
    L.buildings.push({ x: 73, y: y0, w: 2, h: 12, kind: 'carriage', name: ['the rear carriage', 'the middle carriage', 'the front carriage'][k], facing: 'S', entry: { x: 72, y: y0 + 5 } });
    const n = L.buildings.length;
    for (let y = y0; y < y0 + 12; y++) for (let x = 73; x <= 74; x++) L.buildingAt[y * c.w + x] = n;
  }
  // The park with its bandstand, railed in.
  c.rect(56, 81, 15, 14, T.GRASS, use);
  for (let x = 56; x < 71; x++) { c.set(x, 81, T.FENCE, use); c.set(x, 94, T.FENCE, use); }
  for (let y = 81; y < 95; y++) { c.set(56, y, T.FENCE, use); c.set(70, y, T.FENCE, use); }
  for (let x = 57; x < 70; x++) c.set(x, 88, T.PATH, use);
  for (let y = 82; y < 94; y++) c.set(63, y, T.PATH, use);
  c.set(63, 81, T.GATE, use); c.set(63, 94, T.GATE, use); c.set(56, 88, T.GATE, use); c.set(70, 88, T.GATE, use);
  stampNS(c, L, 62, 87, 3, 3, { kind: 'pavilion', name: 'the bandstand', roof: 'METAL', wall: 'WOOD', facing: 'S', storeys: 1 });
  for (const [tx, ty] of [[58, 83], [68, 83], [58, 92], [68, 92], [60, 85], [66, 91]]) c.set(tx, ty, T.TREE, use);
  // The King George V playing field, with its pavilion.
  c.rect(127, 62, 17, 14, T.GREEN, { use: true, onlyFree: true });
  stampNS(c, L, 129, 63, 6, 4, { kind: 'pavilion', name: 'the KGV pavilion', roof: 'TILES', wall: 'BRICK', facing: 'S', storeys: 1 });
  // The board school, and the allotments by the railway.
  c.rect(98, 82, 16, 12, T.YARD, use);
  for (let x = 98; x < 114; x++) { c.set(x, 82, T.FENCE, use); c.set(x, 93, T.FENCE, use); }
  for (let y = 82; y < 94; y++) { c.set(98, y, T.FENCE, use); c.set(113, y, T.FENCE, use); }
  c.set(105, 82, T.GATE, use);
  stampNS(c, L, 100, 85, 12, 7, { kind: 'school', name: 'the board school', roof: 'SLATE', wall: 'STONE', facing: 'S' });
  for (let y = 86; y <= 95; y++) for (let x = 127; x <= 143; x++) {
    if (c.isUsed(x, y)) continue;
    const edgeT = y === 86 || y === 95 || x === 127 || x === 143;
    c.set(x, y, edgeT ? T.FENCE : (x - 127) % 5 === 0 || (y - 86) % 4 === 0 ? T.PATH : T.BEDS, use);
  }
  for (const sx of [129, 134, 139]) stampNS(c, L, sx, 87, 2, 2, { kind: 'shed', name: 'an allotment shed', roof: 'METAL', wall: 'WOOD', facing: 'S', storeys: 1 });
  // The Grange: the old workhouse, a hospital now, in walled grounds.
  c.rect(27, 102, 22, 12, T.GRASS, use);
  for (let x = 27; x < 49; x++) { c.set(x, 102, T.WALL, use); c.set(x, 113, T.WALL, use); }
  for (let y = 102; y < 114; y++) { c.set(27, y, T.WALL, use); c.set(48, y, T.WALL, use); }
  stampNS(c, L, 30, 104, 16, 7, { kind: 'hall', name: 'the Grange hospital', roof: 'SLATE', wall: 'STONE', facing: 'S', front: 'grand' });
  // The Hall by the river, with its crazy golf.
  c.rect(2, 106, 20, 18, T.GRASS, use);
  stampNS(c, L, 6, 108, 10, 7, { kind: 'hall', name: 'the Hall', roof: 'SLATE', wall: 'STONE', facing: 'S', front: 'grand' });
  for (let x = 4; x < 18; x += 3) for (let y = 118; y < 123; y += 2) c.set(x, y, T.GREEN, use);
  // Waterside, below the crag: cottages, the cafe, the riverside pub, Castle Mill at the weir.
  for (const [x, kind, name] of [[78, 'cottage', 'a riverside cottage'], [82, 'cottage', 'a riverside cottage'],
    [89, 'shop', 'the riverside cafe'], [94, 'factory', 'Castle Mill'], [103, 'pub', "the World's End"]]) {
    waterside(c, L, x, kind, name);
  }
  // The football ground, the leisure centre, the cemetery, the high school, the superstore.
  c.rect(155, 153, 15, 15, T.GREEN, use);
  for (let x = 155; x < 170; x++) { c.set(x, 153, T.FENCE, use); c.set(x, 167, T.FENCE, use); }
  for (let y = 153; y < 168; y++) { c.set(155, y, T.FENCE, use); c.set(169, y, T.FENCE, use); }
  c.set(162, 167, T.GATE, use); c.set(155, 160, T.GATE, use);
  stampNS(c, L, 157, 154, 11, 3, { kind: 'pavilion', name: 'the football stand', roof: 'METAL', wall: 'METAL', facing: 'S', storeys: 1 });
  c.rect(128, 155, 14, 7, T.CARPARK, use);
  stampNS(c, L, 129, 155, 10, 6, { kind: 'hall', name: 'the swimming baths', roof: 'FLAT', wall: 'BRICK', facing: 'S', front: 'grand' });
  c.rect(130, 168, 18, 8, T.GRASS, use);
  for (let x = 130; x < 148; x++) { c.set(x, 168, T.LOWWALL, use); c.set(x, 175, T.LOWWALL, use); }
  for (let y = 168; y < 176; y++) { c.set(130, y, T.LOWWALL, use); c.set(147, y, T.LOWWALL, use); }
  c.set(139, 168, T.GATE, use);
  for (let y = 170; y < 175; y += 2) for (let x = 132; x < 146; x += 2) if (rng.chance(0.7)) c.set(x, y, T.GRAVE, use);
  c.rect(139, 184, 11, 20, T.GREEN, { use: true, onlyFree: true });
  stampNS(c, L, 139, 184, 10, 6, { kind: 'school', name: 'the high school', roof: 'FLAT', wall: 'BRICK', facing: 'S', front: 'grand' });
  c.rect(110, 244, 32, 10, T.CARPARK, use);
  stampNS(c, L, 120, 254, 16, 12, { kind: 'superstore', name: 'the superstore', roof: 'FLAT', wall: 'BRICK', facing: 'N' });
  L.signs.push({ x: 128, y: 253, text: 'SUPERSTORE' });
  // The old quarry, and the scout hut in the woods.
  for (let y = 210; y <= 226; y++) for (let x = 80; x <= 100; x++) {
    const r = Math.hypot((x + 0.5 - 90) / 9, (y + 0.5 - 218) / 7);
    if (r <= 1) c.set(x, y, r > 0.82 ? T.CRAG : rng.chance(0.06) ? T.ROCK : T.YARD, use);
  }
  for (let y = 210; y <= 213; y++) { c.set(90, y, T.TRACK, use); c.set(91, y, T.TRACK, use); }
  c.rect(24, 240, 14, 10, T.GRASS, use);
  stampNS(c, L, 25, 241, 6, 4, { kind: 'pavilion', name: 'the scout hut', roof: 'METAL', wall: 'WOOD', facing: 'S', storeys: 1 });
  // The garden centre on the lane out.
  c.rect(12, 58, 12, 10, T.YARD, use);
  stampNS(c, L, 14, 59, 6, 4, { kind: 'gardencentre', name: 'the garden centre', roof: 'TILES', wall: 'WOOD', facing: 'S', storeys: 1 });
  for (const gx of [14, 18]) stampNS(c, L, gx, 64, 3, 3, { kind: 'greenhouse', name: 'a greenhouse', roof: 'GLASS', wall: 'WOOD', facing: 'S', storeys: 1 });
  // The golf clubhouse, the racecourse grandstand.
  stampNS(c, L, 60, 33, 8, 6, { kind: 'pavilion', name: 'the golf club', roof: 'TILES', wall: 'BRICK', facing: 'S', storeys: 1 });
  stampEW(c, L, 138, 46, 6, [{ len: 16, kind: 'pavilion', name: 'the grandstand' }], { roof: 'METAL', wall: 'BRICK', facing: 'E', storeys: 1 });
}

// A building on the bank below the crag, facing the river (its front faces you).
function waterside(c, L, x, kind, name) {
  const T = TILE;
  const [bw, bd] = kind === 'cottage' ? [4, 4] : kind === 'shop' ? [5, 5] : kind === 'pub' ? [7, 6] : [8, 6];
  // Find the lowest rows of bank above the towpath at this x.
  for (let y = 140; y < 180; y++) {
    if (c.get(x, y) !== T.PATH) continue;
    const y1 = y - 1, y0 = y1 - bd + 1;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x; xx < x + bw; xx++) if (c.get(xx, yy) !== T.GRASS) return;
    stampNS(c, L, x, y0, bw, bd, { kind, name, roof: 'SLATE', wall: 'STONE', facing: 'S', chimney: kind !== 'factory' });
    return;
  }
}

// Farms: farmhouse, barn and yard.
function farms(c, L, rng) {
  const T = TILE;
  for (const [x, y, name] of [[102, 22, 'Lund Farm'], [96, 248, 'Ings Farm'], [2, 194, 'Moor End Farm'], [60, 246, 'Wood Farm']]) {
    if (!c.free(x, y, 18, 11)) continue;
    c.rect(x, y, 18, 11, T.YARD, { use: true });
    for (let xx = x; xx < x + 18; xx++) { c.set(xx, y, T.LOWWALL, { use: true }); c.set(xx, y + 10, T.LOWWALL, { use: true }); }
    for (let yy = y; yy < y + 11; yy++) { c.set(x, yy, T.LOWWALL, { use: true }); c.set(x + 17, yy, T.LOWWALL, { use: true }); }
    stampNS(c, L, x + 2, y + 2, 6, 7, { kind: 'farmhouse', name, roof: 'SLATE', wall: 'STONE', facing: 'S' });
    stampNS(c, L, x + 10, y + 1, 6, 8, { kind: 'barn', name: 'a barn', roof: 'METAL', wall: 'STONE', facing: 'S', storeys: 1 });
  }
}

// 5. Street frontages --------------------------------------------------------------------------
function streetFronts(c, L, rng, s) {
  if (!s.front) return;
  const pave = s.pave ? 1 : 0;
  for (const r of s.rects) {
    const sides = r.horiz
      ? [['N', { horiz: true, u0: r.x, u1: r.x + r.w - 1, line: r.y - pave, side: -1 }], ['S', { horiz: true, u0: r.x, u1: r.x + r.w - 1, line: r.y + r.h - 1 + pave, side: 1 }]]
      : [['W', { horiz: false, u0: r.y, u1: r.y + r.h - 1, line: r.x - pave, side: -1 }], ['E', { horiz: false, u0: r.y, u1: r.y + r.h - 1, line: r.x + r.w - 1 + pave, side: 1 }]];
    for (const [key, seg] of sides) {
      for (const f of s.front) {
        if (!f[key]) continue;
        const u0 = Math.max(seg.u0, f.u[0]), u1 = Math.min(seg.u1, f.u[1]);
        if (u0 > u1) continue;
        frontage(c, L, rng, { ...seg, u0, u1 }, f[key]);
      }
    }
  }
}

// 6. The edge of the map, connecting everything, road markings ---------------------------------
function edge(c) {
  const T = TILE;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (x !== 0 && y !== 0 && x !== c.w - 1 && y !== c.h - 1) continue;
      const t = c.get(x, y);
      if (t === T.ROAD || t === T.ROAD_LINE_H || t === T.ROAD_LINE_V || t === T.TRACK || t === T.RAIL || t === T.PATH) c.set(x, y, t === T.RAIL ? T.FENCE : T.BARRIER, { use: true });
      else if (!TILE_INFO[t].blocks) c.set(x, y, x < 22 && y < 94 ? T.LOWWALL : y > 200 && x < 56 ? T.TREE : T.HEDGE, { use: true });
    }
  }
}

// Every open tile reachable from your front door: where a hedge, wall or fence (or a tree)
// shuts off a patch of ground, open a gate in it, preferring a gate onto a road or path. Patches
// that still can't be reached (sealed in by buildings or water) are filled in.
const OPENABLE = new Set([TILE.HEDGE, TILE.LOWWALL, TILE.FENCE, TILE.WALL, TILE.TREE]);
function connect(c, rng, start) {
  const T = TILE, { w, h } = c;
  const open = i => !TILE_INFO[c.t[i]].blocks;
  // Label the open patches.
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
  // Candidate gates: an openable tile between two different patches, straight through.
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
  for (const g of cands) {
    const ra = find(g.a), rb = find(g.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    c.t[g.i] = c.t[g.i] === T.TREE ? T.GRASS : T.GATE;
  }
  // Whatever still isn't joined to your front door is filled in.
  const home = find(label[start.y * w + start.x]);
  for (let i = 0; i < w * h; i++) {
    if (label[i] < 0 || find(label[i]) === home) continue;
    const t = c.t[i];
    c.t[i] = t === T.YARD || t === T.PATH || t === T.DRIVE ? T.WALL : t === T.WATER ? t : T.HEDGE;
  }
}

// Centre lines down the middle of wide roads, but not through junctions.
function centreLines(c, L) {
  const T = TILE;
  for (const s of STREETS) {
    if (!s.line) continue;
    for (const r of s.rects) {
      if (r.horiz) {
        const y = r.y + (s.w >> 1);
        for (let x = r.x + s.w; x < r.x + r.w - s.w; x++) if (c.get(x, y) === T.ROAD && L.roadCover[y * c.w + x] === 1 && (x & 1)) c.set(x, y, T.ROAD_LINE_H);
      } else {
        const x = r.x + (s.w >> 1);
        for (let y = r.y + s.w; y < r.y + r.h - s.w; y++) if (c.get(x, y) === T.ROAD && L.roadCover[y * c.w + x] === 1 && (y & 1)) c.set(x, y, T.ROAD_LINE_V);
      }
    }
  }
  delete L.roadCover;
}

// Into the world: the tiles, and the layout for the renderer and later steps. Returns the start.
export function generateTown(world, rng) {
  const t = townLayout(world.w, world.h, rng);
  world.tiles.set(t.tiles);
  world.layout = t.layout;
  return { ...t.layout.start };
}
