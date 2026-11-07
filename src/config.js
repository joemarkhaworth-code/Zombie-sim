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

  player: { speed: 100, eyesight: 3 },  // one action per tick; full sight

  zombie: {
    speed: 50,            // half speed: acts every other tick
    stagger: 0.15,        // chance a step goes a random way instead
    eyesight: 2,          // 0-3: poor eyes, so you usually see them first
    searchActions: 12,    // after losing you, shuffles about the last known spot this many moves
    searchRadius: 3,      // ...staying within this many tiles of it
    wanderChance: 0.3,    // with nothing to do, chance an action is a random shuffle
  },

  // Light: how far anyone can see in the open, and the light level (0-3) of every tile.
  light: {
    range: 15,            // sight range in the open on a clear day (covers the whole screen)
    ambient: 3,           // every tile's light until day/night (step 15)
  },

  vision: {
    eyesightFactor: [0, 0.25, 0.5, 1], // sight radius = light.range x this, by eyesight 0-3
    minLevelToSpot: 1,    // a creature is only noticed on a tile at least this visible
    noticeByLight: [0, 0.34, 0.67, 1], // noticing distance x this, by the tile's light level
  },

  // Step 1 test screen: a walled room with a few seeded obstacles.
  testScreen: {
    rocks: 10,            // single wall tiles scattered inside
    zombieDist: [5, 9],   // the test zombie starts this many steps (4-way) from you
    wallRuns: 3,          // short straight walls to hide behind
    wallLength: [3, 5],
  },

  render: {
    dimAlpha: [1, 0.5, 0.25, 0], // black over a tile by visibility 0-3
    // How tiles out of sight look: 'black' (nothing), 'dim' (the layout, darkened) or
    // 'dither' (the layout under an 8-bit checker of black). Creatures out of sight are never drawn.
    shadow: 'dither',
    shadowDimAlpha: 0.7,  // 'dim': black over out-of-sight tiles
    ditherPx: 3,          // 'dither': size of each checker square, in CSS pixels
  },

  colours: {
    background: '#000000',
    floor: '#3a3a2e',
    floorMark: '#44443a',
    wall: '#7a7a72',
    wallMark: '#5e5e58',
    player: '#ffdd33',
    playerText: '#000000',
    zombie: '#6fcf4f',
    topBar: '#111111',
    topBarText: '#ffffff',
    dimText: '#777777',
    dangerText: '#ffdd33',
    inspectOutline: '#ffffff',
    alert: '#ffdd33',     // ! over a zombie that's after you
    puzzled: '#dddddd',   // ? over a zombie looking for you
    actionBar: '#0b0b0b',
  },
};
