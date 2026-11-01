// All tuning numbers live here.
export const CONFIG = {
  grid: { width: 20, height: 28 },
  testGrid: {
    wallChance: 0.08,                // chance a floor tile becomes a wall block
    bushClumps: 6,                   // hiding spots
    bushClumpSize: 4,
  },
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
    // Noticing a creature: it must be in line of sight, and within
    //   sight radius x noticeByLight[light level on its tile] x (stealth.sneakNoticeFactor if sneaking
    //   and the viewer wasn't already tracking it).
    // Adjacent creatures are always noticed if their tile has any light.
    // In cover (bush) a creature is only noticed from an adjacent tile.
    noticeByLight: [0, 0.34, 0.67, 1],
  },
  stealth: {
    sneakMoveCost: 2,                // a sneaking step takes twice as long
    sneakNoticeFactor: 0.67,         // sneaking cuts the distance you can be noticed from (not once tracked)
  },
  render: {
    dimAlpha: [1, 0.45, 0.25, 0],    // black overlay per visibility level 0-3 (0 is not drawn at all)
  },
  noise: {
    radiusByLevel: [0, 4, 8, 12],    // noise level 0-3 -> starting strength (tiles it carries in the open)
    wallCost: 3,                     // passing through a wall costs this much strength instead of 1
    // Hearing level 0-3 -> weakest strength still heard (0 = deaf).
    minStrengthToHear: [Infinity, 3, 2, 1],
  },
  player: {
    speed: 100,                      // energy per tick; 100 = one action per tick
    eyesight: 3,
    hearing: 2,
    footsteps: 1,                    // noise level when walking
    sneakFootsteps: 0,               // noise level when sneaking (silent)
  },
  zombie: {
    speed: 50,                       // half player speed: acts every other turn
    eyesight: 2,                     // poor eyes: half the light range, so you usually see them first
    hearing: 3,                      // good ears: hear your footsteps up to 3 tiles away in the open
    footsteps: 0,                    // shuffle quietly (raise to let zombies hear each other)
    wanderChance: 0.5,               // with nothing to chase, chance to shuffle a step
    staggerChance: 0.2,              // chance a step lurches in a random direction
    spawnMinDistance: 8,             // tiles from the player at start
  },
  ui: { barHeight: 72 },             // bottom button bar (SNEAK) in CSS px: thumb-sized
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
    bush: '#2e7d32',
    bushMark: '#1b4d1e',             // small mark so bushes read as bushes
    memoryBush: '#2c332c',
    memoryThing: '#6a6a6a',          // remembered items/doors: grey letter on the greyed tile
    inspect: '#ffffff',              // outline on the long-pressed tile
    debugNoise: '255,96,0',          // heatmap overlay colour (r,g,b)
    player: '#ffff00',
    zombie: '#40c040',
    zombieText: '#000000',
    playerText: '#000000',
    sneakDim: 'rgba(0,0,0,0.45)',    // overlay on anything sneaking
    buttonBg: '#202020',
    buttonText: '#c0c0c0',
    buttonOnBg: '#ffff00',
    buttonOnText: '#000000',
    statusBg: '#0000aa',
    statusText: '#ffffff',
    statusTurn: '#00ffff',
    statusDanger: '#ffff00',
    statusDim: '#8080ff',
  },
};
