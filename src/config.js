// All tuning numbers live here.
export const CONFIG = {
  grid: { width: 20, height: 28 },
  testGrid: { wallChance: 0.08 },   // chance a floor tile becomes a wall block
  scheduler: {
    actionCost: 100,                 // energy spent per action
    maxTicksPerTurn: 1000,           // safety cap against runaway loops
  },
  // Light: how far anyone can see in the open, and how well-lit each tile is.
  // Day/night and weather will lower both later.
  light: {
    range: 15,                       // clear day: covers the whole portrait screen (5 across x ~10 up/down each side)
    ambient: 3,                      // light level 0-3 on every tile
  },
  vision: {
    // Eyesight 0-3 scales the light range: 3 = sees as far as the light allows.
    eyesightFactor: [0, 0.25, 0.5, 1],
    minLevelToSpot: 1,               // lowest visibility (light) level at which a creature is noticed
  },
  render: {
    dimAlpha: [1, 0.45, 0.25, 0],    // black overlay per visibility level 0-3 (0 is not drawn at all)
  },
  player: { speed: 100, eyesight: 3 },  // speed = energy per tick; 100 = one action per tick
  zombie: {
    speed: 50,                       // half player speed: acts every other turn
    eyesight: 2,                     // poor eyes: half the light range, so you usually see them first
    wanderChance: 0.5,               // with nothing to chase, chance to shuffle a step
    staggerChance: 0.2,              // chance a step lurches in a random direction
    spawnMinDistance: 8,             // tiles from the player at start
  },
  view: { tilesAcross: 11 },        // camera width in tiles (odd keeps the player centred)
  input: {
    longPressMs: 450,                // hold this long without moving = inspect (shorter = tap)
    tapMaxMovePx: 20,
    waitRadiusTiles: 0.7,            // tap this close to the player = wait
  },
  colours: {
    background: '#000000',
    floor: '#203020',
    wall: '#707070',
    memoryFloor: '#1c1c1c',          // remembered but out of sight: greyed out
    memoryWall: '#3c3c3c',
    inspect: '#ffffff',              // outline on the long-pressed tile
    player: '#ffff00',
    zombie: '#40c040',
    zombieText: '#000000',
    playerText: '#000000',
    statusBg: '#0000aa',
    statusText: '#ffffff',
    statusTurn: '#00ffff',
    statusDanger: '#ffff00',
    statusDim: '#8080ff',
  },
};
