// Phase 1 plain test grid: border walls, scattered wall blocks and bush clumps.
import { CONFIG } from '../../config.js';

// Tile types for every map (test grid and village).
export const TILE = {
  FLOOR: 0, WALL: 1, BUSH: 2,
  GRASS: 3, LANE: 4, STREAM: 5, BRIDGE: 6, DRYSTONE: 7, HEDGE: 8, TREE: 9, POND: 10,
  FELL: 11, BRACKEN: 12, ROCK: 13, SCREE: 14, LAKE: 15, SHORE: 16,
  ROAD: 17, PAVEMENT: 18, GINNEL: 19, YARD: 20, GATE: 21, PATH: 22, PLOT: 23, GRAVE: 24,
  // Buildings (step 14b): a wall tile per material, a floor tile per floor kind.
  WALL_STONE: 25, WALL_BRICK: 26, WALL_WOOD: 27, WALL_METAL: 28, WALL_GLASS: 29,
  FLOOR_WOOD: 30, FLOOR_FLAGS: 31, FLOOR_CONCRETE: 32, FLOOR_EARTH: 33,
  VOID: 34, // between floors (14c): blocks movement, sight and sound completely
};
// Building walls by material, and floors by kind (see CONFIG.buildingTypes).
export const WALL_OF = { stone: TILE.WALL_STONE, brick: TILE.WALL_BRICK, wood: TILE.WALL_WOOD, corrugatedMetal: TILE.WALL_METAL, glass: TILE.WALL_GLASS };
export const FLOOR_OF = { wood: TILE.FLOOR_WOOD, flags: TILE.FLOOR_FLAGS, concrete: TILE.FLOOR_CONCRETE, earth: TILE.FLOOR_EARTH };
// blocks: stops movement. opaque: stops sight (and muffles noise).
// cover: anything standing here can only be noticed from an adjacent tile.
// moveCost: a step onto it costs this many times the normal time (hedge 3, stream 2).
// stepNoise: noise level made by anything stepping onto it (sneaking: one less).
// material: what it's made of (health from CONFIG.materials), for solid tiles.
const T = (name, o = {}) => ({ name, blocks: false, opaque: false, cover: false, moveCost: 1, stepNoise: 0, ...o });
export const TILE_INFO = {
  [TILE.FLOOR]: T('floor'),
  [TILE.WALL]: T('wall', { blocks: true, opaque: true, material: 'stone' }),
  [TILE.BUSH]: T('bush', { cover: true }),
  [TILE.GRASS]: T('grass'),
  [TILE.LANE]: T('lane'),                                               // back lanes, side lanes, farm tracks
  [TILE.STREAM]: T('beck', { moveCost: 2, stepNoise: 2 }),              // shallow beck/gill: wade it, slowly and noisily
  [TILE.BRIDGE]: T('bridge', { material: 'stone' }),
  [TILE.DRYSTONE]: T('dry-stone wall', { blocks: true, opaque: true, material: 'stone' }),
  [TILE.HEDGE]: T('hedge', { opaque: true, moveCost: 3, stepNoise: 1, material: 'wood' }), // push through slowly
  [TILE.TREE]: T('tree', { blocks: true, opaque: true, material: 'wood' }),
  [TILE.POND]: T('pond', { blocks: true }),                             // too deep to wade (swimming: step 20)
  [TILE.FELL]: T('fell', { moveCost: 2 }),                              // rising fellside: slow going
  [TILE.BRACKEN]: T('bracken', { cover: true, moveCost: 2, stepNoise: 1 }), // tall, on the fellside: hides you; rustles
  [TILE.ROCK]: T('rock', { blocks: true, opaque: true, material: 'stone' }), // outcrop / crag
  [TILE.SCREE]: T('scree', { moveCost: 3, stepNoise: 2 }),              // loose stones high on the fell: very slow, clattering
  [TILE.LAKE]: T('lake', { blocks: true }),                             // too deep to wade
  [TILE.SHORE]: T('shore', { stepNoise: 1 }),                           // shingle: crunches
  [TILE.ROAD]: T('road'),                                               // the main road (tarmac)
  [TILE.PAVEMENT]: T('pavement'),                                       // flagstones along the high street
  [TILE.GINNEL]: T('ginnel'),                                           // narrow passage between terraces
  [TILE.YARD]: T('yard'),                                               // cobbled back yard / farmyard
  [TILE.GATE]: T('gate', { stepNoise: 1 }),                             // field/yard gate: creaks
  [TILE.PATH]: T('footpath'),                                           // worn path: easy going, even on the fell
  [TILE.PLOT]: T('building plot'),                                      // empty until buildings (step 14b)
  [TILE.GRAVE]: T('gravestone', { blocks: true, material: 'stone' }),   // see over it, can't walk through
  // A wall blocks sight unless its material is see-through (a greenhouse).
  ...Object.fromEntries(Object.entries({ stone: 'stone wall', brick: 'brick wall', wood: 'wooden wall', corrugatedMetal: 'metal wall', glass: 'glass wall' })
    .map(([m, name]) => [WALL_OF[m], T(name, { blocks: true, opaque: !CONFIG.materials[m].seeThrough, material: m })])),
  [TILE.FLOOR_WOOD]: T('floorboards'),
  [TILE.FLOOR_FLAGS]: T('flagstone floor'),
  [TILE.FLOOR_CONCRETE]: T('concrete floor'),
  [TILE.FLOOR_EARTH]: T('earth floor'),
  [TILE.VOID]: T('void', { blocks: true, opaque: true, silent: true }),
};
// Short description for long-press inspect (render side picks the wording).
export const TILE_DESC = {
  [TILE.FLOOR]: 'Open ground.',
  [TILE.WALL]: 'A wall.',
  [TILE.BUSH]: 'A bush.',
  [TILE.GRASS]: 'Grass.',
  [TILE.LANE]: 'A lane.',
  [TILE.STREAM]: 'A shallow beck.',
  [TILE.BRIDGE]: 'A stone bridge.',
  [TILE.DRYSTONE]: 'A dry-stone wall.',
  [TILE.HEDGE]: 'A hedge.',
  [TILE.TREE]: 'A tree.',
  [TILE.POND]: 'A pond. Too deep to wade.',
  [TILE.FELL]: 'Rough fellside. Slow going.',
  [TILE.BRACKEN]: 'Bracken.',
  [TILE.ROCK]: 'A rocky outcrop.',
  [TILE.SCREE]: 'Loose scree.',
  [TILE.LAKE]: 'The lake. Too deep to wade.',
  [TILE.SHORE]: 'A shingle shore.',
  [TILE.ROAD]: 'The road.',
  [TILE.PAVEMENT]: 'A pavement.',
  [TILE.GINNEL]: 'A narrow ginnel.',
  [TILE.YARD]: 'A cobbled yard.',
  [TILE.GATE]: 'A gate.',
  [TILE.PATH]: 'A footpath.',
  [TILE.PLOT]: 'An empty building plot.',
  [TILE.GRAVE]: 'A gravestone.',
  [TILE.WALL_STONE]: 'A stone wall.',
  [TILE.WALL_BRICK]: 'A brick wall.',
  [TILE.WALL_WOOD]: 'A wooden wall.',
  [TILE.WALL_METAL]: 'A corrugated metal wall.',
  [TILE.WALL_GLASS]: 'A glass wall.',
  [TILE.FLOOR_WOOD]: 'Floorboards.',
  [TILE.FLOOR_FLAGS]: 'A flagstone floor.',
  [TILE.FLOOR_CONCRETE]: 'A concrete floor.',
  [TILE.FLOOR_EARTH]: 'Bare earth.',
  [TILE.VOID]: 'Nothing there.',
};

export function generateTestGrid(rng, width, height) {
  const { wallChance, bushClumps, bushClumpSize } = CONFIG.testGrid;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles[y * width + x] = edge || rng.chance(wallChance) ? TILE.WALL : TILE.FLOOR;
    }
  }
  // Bush clumps: a short random walk of bushes from a random floor tile.
  for (let i = 0; i < bushClumps; i++) {
    let x = 1 + rng.int(width - 2), y = 1 + rng.int(height - 2);
    for (let j = 0; j < bushClumpSize; j++) {
      if (tiles[y * width + x] === TILE.FLOOR) tiles[y * width + x] = TILE.BUSH;
      x = Math.min(width - 2, Math.max(1, x + rng.int(3) - 1));
      y = Math.min(height - 2, Math.max(1, y + rng.int(3) - 1));
    }
  }
  return tiles;
}
