// All tuning numbers live here. Code reads them from CONFIG, never hard-codes them.
export const CONFIG = {
  // One screen of the flip-screen world, in tiles. Portrait, sized so tiles stay thumb-sized.
  screen: { w: 11, h: 15 },

  // Layout on the phone, in CSS pixels.
  ui: {
    topBarHeight: 36,     // status bar (turn number now, messages from step 3)
    actionBarHeight: 72,  // thumb-friendly action bar (buttons from step 7)
    minTile: 28,          // never draw tiles smaller than this
    longPressMs: 450,     // hold this long to inspect a tile
    tapSlop: 12,          // a finger moving further than this isn't a tap
    vibrateMs: 15,        // short buzz on inspect, where the phone supports it
    messageFont: 14,      // status bar text size (fits ~30 characters on a phone)
  },

  // Energy scheduler: every tick each actor gains `speed` energy; an action costs actionCost.
  scheduler: { actionCost: 100 },

  player: { speed: 100, eyesight: 3, hearing: 2, footsteps: 1 },  // one action per tick; full sight; footsteps noise level 1

  zombie: {
    speed: 50,            // half speed: acts every other tick
    stagger: 0.15,        // chance a step goes a random way instead
    eyesight: 2,          // 0-3: poor eyes, so you usually see them first
    hearing: 3,           // 0-3: good ears
    footsteps: 0,         // shuffles quietly
    glimpseRange: 2,      // sees you further off than this: stops and stares (?) first; only comes
                          // for you (!) if it still sees you on its next look
    glimpseCost: 50,      // energy a stare costs (a normal action is 100): it looks again sooner, so
                          // at half speed you get one move to get out of sight, not two
    searchActions: 12,    // after losing you, shuffles about the last known spot this many moves
    searchRadius: 3,      // ...staying within this many tiles of it
    wanderChance: 0.3,    // with nothing to do, chance an action is a random shuffle
  },

  // Light: how far anyone can see in the open, and the light level (0-3) of every tile.
  light: {
    range: 15,            // sight range in the open on a clear day (covers the whole screen)
    ambient: 3,           // every tile's light until day/night (step 15)
  },

  // Noise: makeNoise(x, y, level 0-3). Level sets the starting strength; strength drops 1 per
  // tile (8 ways) and by wallCost more when passing through a wall, so walls muffle rather than
  // block; the map edge blocks. Quiet noises die in a wall, loud ones carry through.
  noise: {
    radiusByLevel: [0, 4, 8, 12],
    wallCost: 3,
    minStrengthToHear: [Infinity, 3, 2, 1], // by hearing 0-3: the faintest strength still heard
  },

  // Sneaking: each step costs moveCost x the energy (zombies get that much more time), footsteps
  // are one level quieter (a walking step becomes silent), and you can only be noticed from
  // noticeFactor of the usual distance. Waiting costs the same as normal.
  stealth: {
    moveCost: 2,
    noticeFactor: 0.67,
  },

  vision: {
    eyesightFactor: [0, 0.2, 0.35, 1], // sight radius = light.range x this, by eyesight 0-3 (zombie 2: 5 tiles)
    minLevelToSpot: 1,    // a creature is only noticed on a tile at least this visible
    noticeByLight: [0, 0.34, 0.67, 1], // noticing distance x this, by the tile's light level
  },

  // Step 1 test screen: a walled room with a few seeded obstacles.
  testScreen: {
    rocks: 10,            // single wall tiles scattered inside
    zombieDist: [5, 9],   // the test zombie starts this many steps (4-way) from you
    wallRuns: 3,          // short straight walls to hide behind
    wallLength: [3, 5],
    bushClumps: 3,        // clumps of bushes to hide in
    bushClumpSize: [2, 4],
  },

  render: {
    dimAlpha: [1, 0.5, 0.25, 0], // black over a tile by visibility 0-3
    // Out of sight: tiles you remember are drawn in their grey colours (colours.memory);
    // tiles you've never seen are black. Creatures out of sight are never drawn.
  },

  colours: {
    background: '#000000',
    floor: '#3a3a2e',
    floorMark: '#44443a',
    wall: '#7a7a72',
    wallMark: '#5e5e58',
    bush: '#2f4a22',
    bushMark: '#4f7a36',
    player: '#ffdd33',
    playerText: '#000000',
    zombie: '#6fcf4f',
    topBar: '#111111',
    topBarText: '#ffffff',
    dimText: '#777777',
    dangerText: '#ffdd33',
    inspectOutline: '#ffffff',
    // Remembered tiles: dark greys that keep each tile's shapes.
    memory: { floor: '#1e1e1b', floorMark: '#262622', wall: '#4a4a46', wallMark: '#383835', bush: '#1f251c', bushMark: '#30382b', thing: '#5a5a5a' },
    sneakButton: '#ffdd33',
    noise: '255,140,0',   // debug heatmap (rgb, alpha by strength)
    alert: '#ffdd33',     // ! over a zombie that's after you
    puzzled: '#dddddd',   // ? over a zombie looking for you
    actionBar: '#0b0b0b',
  },
};
