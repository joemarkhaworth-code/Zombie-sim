// All tuning numbers live here. Code reads them from CONFIG, never hard-codes them.
export const CONFIG = {
  // One screen of the flip-screen world, in tiles. Portrait, sized so tiles stay thumb-sized.
  screen: { w: 11, h: 15 },

  // Layout on the phone, in CSS pixels.
  ui: {
    topBarHeight: 36,     // status bar (turn number now, messages from step 3)
    actionBarHeight: 72,  // thumb-friendly action bar (buttons from step 7)
    minTile: 28,          // never draw tiles smaller than this
  },

  // Step 1 test screen: a walled room with a few seeded obstacles.
  testScreen: {
    rocks: 10,            // single wall tiles scattered inside
  },

  colours: {
    background: '#000000',
    floor: '#3a3a2e',
    floorMark: '#44443a',
    wall: '#7a7a72',
    wallMark: '#5e5e58',
    player: '#ffdd33',
    playerText: '#000000',
    topBar: '#111111',
    topBarText: '#ffffff',
    dimText: '#777777',
    actionBar: '#0b0b0b',
  },
};
