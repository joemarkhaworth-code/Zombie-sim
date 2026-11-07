// All tuning numbers live here. Code reads them from CONFIG, never hard-codes them.
export const CONFIG = {
  // One screen of the flip-screen world, in tiles. Portrait, sized so tiles stay thumb-sized.
  // Shorter than the phone so the control pad fits underneath.
  screen: { w: 11, h: 12 },

  // Layout on the phone, in CSS pixels.
  ui: {
    topBarHeight: 36,     // status bar (turn number now, messages from step 3)
    padMinHeight: 190,    // control pad under the map gets at least this much (and any spare)
    minTile: 28,          // never draw tiles smaller than this
    margin: 16,           // pad's distance from the screen's sides and bottom
    gap: 6,               // between d-pad buttons
    button: { min: 44, max: 64, perWidth: 7 }, // d-pad button size = screen width / perWidth, clamped
    abScale: 1.15,        // A and B are a bit bigger than a d-pad button
    pill: { h: 30, wScale: 1.4 }, // SELECT / START pills (width = button x wScale)
    hitSlop: 8,           // a press this close to a button still counts
    repeatDelayMs: 350,   // hold a d-pad arrow: keeps walking after this...
    repeatMs: 180,        // ...one step every this often
  },

  // Energy scheduler: every tick each actor gains `speed` energy; an action costs actionCost.
  scheduler: { actionCost: 100 },

  player: { speed: 100 },  // one action per tick

  zombie: {
    speed: 50,            // half speed: acts every other tick
    stagger: 0.15,        // chance a step goes a random way instead
  },

  // Step 1 test screen: a walled room with a few seeded obstacles.
  testScreen: {
    rocks: 10,            // single wall tiles scattered inside
    zombieDist: [5, 9],   // the test zombie starts this many steps (4-way) from you
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
    pad: '#0b0b0b',
    button: '#2a2a2a',
    buttonPressed: '#555555',
    buttonText: '#dddddd',
    abButton: '#7a1f2b',
    abPressed: '#b0334a',
  },
};
