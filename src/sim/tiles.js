// Every kind of tile, as data: what it is, and whether it blocks walking, blocks sight (opaque)
// and muffles noise (muffles: defaults to opaque). Systems only read these properties; nothing
// checks for a particular tile. Wording (inspect text, blocked messages) lives in
// render/messages.js and colours in config.js, both keyed by the tile's key.
//
// The numbers are saved (map memory, changed tiles), so add new tiles at the end of a group's
// list and bump CONFIG.save.version if numbers move.
//
// Buildings on the town map are tokens (one camera angle, looking north): roof tiles over every
// row but the bottom one or two, which are the south-facing wall with its door and windows.
//   Roof tiles: material x slope. An east-west ridge has slopes N (far), R (the ridge runs
//   through the tile) and S (near); a north-south ridge has W, V (ridge) and E. RC / VC are ridge
//   tiles with a chimney stack on the party wall (left / top edge). FLAT roofs have no slope.
//   Wall tiles: material x part (plain wall, window, door, shopfront).

const GROUND = [
  // key,        blocks, opaque, extra
  ['FLOOR',      false, false],
  ['WALL',       true,  true],            // a high stone wall (also the test room)
  ['GRASS',      false, false],
  ['FIELD',      false, false],           // crops / ploughed
  ['MOOR',       false, false],           // heather
  ['GREEN',      false, false],           // mown: bowling, golf and cricket greens
  ['SAND',       false, false],           // golf bunker
  ['ROAD',       false, false],
  ['ROAD_LINE_H', false, false],          // road with the centre line on its top edge
  ['ROAD_LINE_V', false, false],          // ...on its left edge
  ['PAVEMENT',   false, false],
  ['SETTS',      false, false],           // cobbles: the market place, Bond End
  ['TRACK',      false, false],           // unsurfaced lane or farm track
  ['PATH',       false, false],           // gravel footpath, towpath
  ['YARD',       false, false],           // flagstones / concrete: back yards, folds
  ['DOORSTEP',   false, false],           // in front of a door you can't see (the building faces away)
  ['GATE',       false, false],
  ['STEPS',      false, false],           // stone steps up the crag
  ['BRIDGE',     false, false],           // a bridge's deck
  ['WATER',      true,  false, { muffles: false }],
  ['SHALLOWS',   true,  false, { muffles: false }], // the river shallows: need waders (step 20)
  ['WEIR',       false, false],           // the mill weir: walkable, if you dare
  ['CRAG',       true,  false, { muffles: false }], // the gorge's rock faces: you can see across
  ['ROCK',       true,  false, { muffles: false }], // a boulder
  ['LOWWALL',    true,  false, { muffles: false }], // dry stone wall, garden wall, bridge parapet
  ['HEDGE',      true,  true],
  ['FENCE',      true,  false, { muffles: false }], // railings, post and rail
  ['TREE',       true,  true],
  ['RAIL',       false, false],           // railway track
  ['PLATFORM',   false, false],
  ['CROSSING',   false, false],           // a level crossing (road over the rails)
  ['TUNNEL',     true,  true],            // the railway tunnel's mouth
  ['GRAVE',      true,  false, { muffles: false }],
  ['RUIN',       true,  true],            // the castle's broken walls
  ['CARRIAGE',   true,  true],            // a railway carriage's roof (outside size 2 x 12)
  ['CARRIAGE_END', true, true],           // its south end, with the end door
  ['BARRIER',    true,  false, { muffles: false }], // a police roadblock where a road leaves town
  ['ARCH',       false, false],           // an archway through a building (the Angel's yard)
  ['BEDS',       false, false],           // allotment beds, veg patches
  ['CARPARK',    false, false],
  ['DRIVE',      false, false],           // a garden path or drive
  ['MARKET_CROSS', true, false, { muffles: false }],
  ['PARAPET',    true,  false, { muffles: false }], // a bridge's or the trestle's parapet (never a gate)
  ['PADLOCK',    true,  false, { muffles: false }], // a padlocked gate (bolt cutters, step 20)
  ['MARSH',      false, false],                     // the swamp: reeds and mud
  ['GRAVEL',     false, false, { step: 'loud' }],   // gravel (editor maps): crunchy underfoot
  // Maine (editor maps). step: footsteps are 'loud' or 'quiet' here (noise.surfaceStep).
  ['MEADOW',     false, false],                     // rough meadow
  ['CRACKED',    false, false],                     // cracked asphalt
  ['NEEDLES',    false, false, { step: 'quiet' }],  // the pine forest floor
  ['LEAVES',     false, false, { step: 'loud' }],   // dead leaves: the fall
  ['MOSS',       false, false, { step: 'quiet' }],
  ['GRANITE',    false, false],                     // bare granite ledge
  ['MUD',        false, false],
  ['CORN',       false, false],                     // cornfield: you can see over it
  ['PUMPKINS',   false, false],
  ['BLUEBERRY',  false, false],                     // blueberry barrens
  ['STREAM',     false, false, { step: 'loud', muffles: false }], // a rocky stream you can wade
  ['LINO',       false, false],                     // linoleum
  ['CARPET',     false, false, { step: 'quiet' }],
  ['CHECKER',    false, false],                     // diner tiles
  ['CONCRETE',   false, false],
];

const ROOF_MATS = ['SLATE', 'TILES', 'METAL'];
const SLOPES = ['N', 'R', 'S', 'W', 'V', 'E'];
const WALL_MATS = ['STONE', 'BRICK', 'RENDER', 'WOOD', 'METAL'];
const WALL_PARTS = ['WALL', 'WIN', 'DOOR', 'SHOP'];

const SPECS = [...GROUND];
for (const m of ROOF_MATS) {
  for (const s of SLOPES) SPECS.push([`ROOF_${m}_${s}`, true, true, { part: 'roof', mat: m, slope: s }]);
  if (m !== 'METAL') for (const s of ['R', 'V']) SPECS.push([`ROOF_${m}_${s}C`, true, true, { part: 'roof', mat: m, slope: s, chimney: true }]);
}
SPECS.push(['ROOF_FLAT', true, true, { part: 'roof', mat: 'FLAT', slope: 'F' }]);
SPECS.push(['ROOF_GLASS', true, false, { part: 'roof', mat: 'GLASS', slope: 'F', muffles: true }]); // greenhouse
for (const m of WALL_MATS) for (const p of WALL_PARTS) SPECS.push([`${p}_${m}`, true, true, { part: p.toLowerCase(), mat: m }]);

export const TILE = {};
export const TILE_INFO = [];
SPECS.forEach(([key, blocks, opaque, extra = {}], n) => {
  TILE[key] = n;
  TILE_INFO[n] = { key, blocks, opaque, muffles: opaque, ...extra };
});

// Helpers for building tokens.
export const roofTile = (mat, slope, chimney = false) =>
  TILE[mat === 'FLAT' || mat === 'GLASS' ? `ROOF_${mat}` : `ROOF_${mat}_${slope}${chimney ? 'C' : ''}`];
export const wallTile = (mat, part = 'WALL') => TILE[`${part}_${mat}`];
export const isBuilding = t => !!TILE_INFO[t].part;
