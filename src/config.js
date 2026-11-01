// All tuning numbers live here.
export const CONFIG = {
  grid: { width: 20, height: 28 },
  testGrid: { wallChance: 0.08 },   // chance a floor tile becomes a wall block
  scheduler: {
    actionCost: 100,                 // energy spent per action
    maxTicksPerTurn: 1000,           // safety cap against runaway loops
  },
  vision: {
    // sight level 0-3 -> radius in tiles. Keep the top level <= half of view.tilesAcross,
    // so anything you can see is on screen.
    rangeByLevel: [1, 2, 4, 5],
  },
  player: { speed: 100, sight: 3 },  // speed = energy per tick; 100 = one action per tick
  zombie: {
    speed: 50,                       // half player speed: acts every other turn
    sight: 2,                        // zombies see less far than you
    wanderChance: 0.5,               // with nothing to chase, chance to shuffle a step
    staggerChance: 0.2,              // chance a step lurches in a random direction
    spawnMinDistance: 8,             // tiles from the player at start
  },
  view: { tilesAcross: 11 },        // camera width in tiles (odd keeps the player centred)
  input: {
    tapMaxMs: 500, tapMaxMovePx: 20,
    waitRadiusTiles: 0.7,            // tap this close to the player = wait
  },
  colours: {
    background: '#000000',
    floor: '#203020',
    wall: '#707070',
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
