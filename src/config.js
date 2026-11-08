// All tuning numbers live here. Code reads them from CONFIG, never hard-codes them.
export const CONFIG = {
  // One screen of the flip-screen world, in tiles. Portrait, sized so tiles stay thumb-sized.
  screen: { w: 11, h: 15 },

  // The world: a grid of screens. The layout comes from the fixed world seed, so it's the same
  // every run; the run seed decides zombies and items. 'town' is the game; 'testscreen' is the
  // single phase-1 room (kept for tests).
  world: {
    map: 'town',
    seed: 1991,
    screens: [25, 25],
    // Crossing screens: the view flips when you step onto the tile flipAt tiles in from a screen's
    // edge (0 = the last tile, 1 = the second to last), and you land landIn tiles in on the new
    // screen. Neighbouring screens overlap by flipAt + landIn + 1 tiles so the two line up.
    flipAt: 1,
    landIn: 2,
    activeRadius: 1,           // screens round yours that run in full (1 = your screen and the 8 round it)
    zombiesPerScreen: [1, 2],  // zombies on each screen but your first (by district from 13d)
    itemsPerScreen: [0, 2],
    itemTypes: ['beans', 'beans', 'bandage', 'cricketBat'],
    mapFile: null,             // a map from maps/ (made in the editor) to play by default, e.g. 'main'
  },

  // The map editor (editor.html).
  editor: {
    saveKey: 'zombie-map-editor',   // its autosave
    playKey: 'zombie-map-play',     // the map "Play from here" sends to the game (index.html?map=editor)
    screens: [3, 3],                // a new map's size, in screens
    undoLevels: 100,
  },

  // Layout on the phone, in CSS pixels.
  ui: {
    topBarHeight: 36,     // status bar (turn number now, messages from step 3)
    actionBarHeight: 72,  // thumb-friendly action bar (buttons from step 7)
    minTile: 28,          // never draw tiles smaller than this
    longPressMs: 450,     // hold this long to inspect a tile
    tapSlop: 12,          // a finger moving further than this isn't a tap
    vibrateMs: 15,        // short buzz on inspect, where the phone supports it
    messageFont: 14,      // status bar text size (fits ~30 characters on a phone)
    deathTapDelayMs: 1000, // taps are ignored this long after death, so you see the screen
    scrollMs: 260,        // the slide between screens (0 = an instant cut)
  },

  // Time runs on scheduler ticks, so slow actions take longer. A run starts at 08:00 on day 1,
  // the bank holiday Saturday. Day/night (step 15) builds on this.
  time: { minutesPerTick: 2, startHour: 8 },

  // Autosave (localStorage) after every action. Bump version when the saved shape changes in a way
  // old saves can't be read with: an old or broken save starts a fresh game instead of crashing.
  save: { key: 'zombie-survival-save', version: 8 },

  // Energy scheduler: every tick each actor gains `speed` energy; an action costs actionCost.
  scheduler: { actionCost: 100 },

  // Health is counted in half-hearts, Zelda-style: every hit takes half a heart (1).
  player: {
    speed: 100, eyesight: 3, hearing: 2, footsteps: 1, // one action per tick; full sight; footsteps noise level 1
    hearts: 3,            // 6 half-hearts: six bites and you're dead
    // Bare hands: every hit lands for `damage`; weak, no knockback. A held weapon's numbers
    // replace these (like Zelda's sword: damage and a knockback).
    melee: { damage: 1, knockback: false, noise: 2 },
    bag: { cols: 5, rows: 4 }, // the bag is a grid; items take up their shape in it (was 4 x 3)
    startHolding: 'walkingStick', // in your hand (not in the bag) at the start
  },

  // Item types, as data: effects are properties, not special cases.
  //   size: [w, h] in bag squares (it may be turned to fit). heal: half-hearts restored when used
  //   (refused at full health). weapon: { damage, knockback, noise }: hold it to replace your
  //   bare-hands melee. verb: what the bag's use button says.
  items: {
    walkingStick: { name: 'walking stick', glyph: '/', colour: '#b08850', size: [1, 3], weapon: { damage: 1, knockback: true, noise: 2 }, throwDamage: 1 },
    cricketBat:   { name: 'cricket bat', glyph: '/', colour: '#e8d8a0', size: [1, 3], weapon: { damage: 2, knockback: true, noise: 2 }, throwDamage: 1 },
    beans:        { name: 'tin of beans', glyph: '%', colour: '#d07030', size: [1, 1], heal: 1, verb: 'EAT', throwDamage: 1 },
    bandage:      { name: 'bandage', glyph: '+', colour: '#f0f0f0', size: [1, 1], heal: 2, verb: 'USE' },
  },

  zombie: {
    speed: 50,            // half speed: acts every other tick
    stagger: 0.15,        // chance a step goes a random way instead
    pathLimit: 400,       // route-finding looks at most this many tiles (a screen is 165)
    eyesight: 2,          // 0-3: poor eyes, so you usually see them first
    hearing: 3,           // 0-3: good ears
    footsteps: 0,         // shuffles quietly
    health: 3,            // three hits to put one down
    melee: { damage: 1, knockback: false, noise: 2 }, // a bite: half a heart, every time
    glimpseRange: 2,      // sees you further off than this: stops and stares (?) first; only comes
                          // for you (!) if it still sees you on its next look
    glimpseCost: 50,      // energy a stare costs (a normal action is 100): it looks again sooner, so
                          // at half speed you get one move to get out of sight, not two
    distractLevel: 2,     // a noise this loud (a thing landing, a fight) distracts a zombie that hears it:
    distractActions: 1,   // for this many of its moves it goes to look, even if it can see you (3 was too strong),
                          // unless you're within glimpseRange of it (then it stays on you)
    searchActions: 12,    // after losing you, shuffles about the last known spot this many moves
    searchRadius: 3,      // ...staying within this many tiles of it
    wanderChance: 0.3,    // with nothing to do, chance an action is a random shuffle
  },

  // Throwing: any item. It lands on a tile you can see in a straight line within `range`
  // (not into walls), and clatters there (landNoise), so zombies come to look: a lure. A creature
  // on that tile is hit for the item's throwDamage (default 0) and notices you.
  throw: { range: 6, landNoise: 2 },

  // Shove: push an adjacent creature one tile directly away and stagger it. No damage, unless the
  // tile behind is blocked: then it slams into it and takes slamDamage. Quieter than a hit.
  shove: { slamDamage: 1, noise: 1, staggerActions: 1 },
  knockback: { staggerActions: 0 }, // a weapon hit staggers the target this many actions (0: knockback only)

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
    // Footsteps on a loud surface (gravel, dead leaves, a stream, a dock) carry further; on a quiet
    // one (moss, pine needles, carpet) less far. Added to the footstep's starting strength; it's
    // still a footstep (level 1), so it never distracts.
    surfaceStep: { loud: 3, quiet: -2 },
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
    items: ['beans', 'beans', 'bandage', 'cricketBat'], // scattered on open floor
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
    player: '#ffdd33',
    playerText: '#000000',
    zombie: '#6fcf4f',
    topBar: '#111111',
    topBarText: '#ffffff',
    dimText: '#777777',
    dangerText: '#ffdd33',
    inspectOutline: '#ffffff',
    // Remembered tiles: dark greys that keep each tile's shapes (worked out from these colours).
    memory: { thing: '#5a5a5a' },
    // Town tiles: [base, mark] by tile key (src/sim/tiles.js). Greybox until the art pass.
    tiles: {
      GRASS: ['#5d8a3c', '#6c9a48'], FIELD: ['#a89a52', '#8e8044'], MOOR: ['#6e5468', '#7e6276'], GREEN: ['#7cc05a', '#88cc66'],
      SAND: ['#d8c88a', '#c8b87a'], ROAD: ['#2e2f33', '#38393e'], PAVEMENT: ['#8d8b83', '#7a7870'], SETTS: ['#7a7064', '#665e54'],
      TRACK: ['#8e7a58', '#7a684a'], PATH: ['#b0a07c', '#9c8c6a'], YARD: ['#8a857a', '#78736a'], DOORSTEP: ['#8d8b83', '#d8d0bc'],
      STEPS: ['#a8a090', '#7a7266'], BRIDGE: ['#a89c84', '#8e836e'], WATER: ['#2f62a8', '#5a8ad0'], SHALLOWS: ['#5a8ed0', '#8ab4e4'],
      WEIR: ['#2f62a8', '#e8f0f8'], CRAG: ['#5e564e', '#463f39'], ROCK: ['#5d8a3c', '#8a847c'], LOWWALL: ['#a39a88', '#857c6c'],
      HEDGE: ['#2a4d22', '#376330'], FENCE: ['#5d8a3c', '#e4e4dc'], TREE: ['#4e7a32', '#1e4418'], RAIL: ['#5e544c', '#b8b8b8'],
      PLATFORM: ['#a8a296', '#e0c040'], TUNNEL: ['#0a0a0a', '#5e564e'], GRAVE: ['#5d8a3c', '#c8c8c0'], RUIN: ['#77736a', '#5c5850'],
      CARRIAGE: ['#7a2230', '#a83a48'], CARRIAGE_END: ['#7a2230', '#1a1a1a'], BARRIER: ['#d8d8d8', '#d02020'], ARCH: ['#1e1c1a', '#3a3632'],
      BEDS: ['#5a4430', '#4a8a3a'], CARPARK: ['#38393e', '#d8d8d0'], DRIVE: ['#9a958a', '#86817a'], MARKET_CROSS: ['#7a7064', '#c8c0b0'],
      PARAPET: ['#a89c84', '#7e7462'], MARSH: ['#4e6a44', '#5a8ad0'], PADLOCK: ['#5d8a3c', '#4a4a4a'], GATE: ['#5d8a3c', '#9a6a3a'], CROSSING: ['#2e2f33', '#b8b8b8'],
      // Roofs: [far / lit slope, near / shaded slope]; walls: [wall, courses].
      ROOF_SLATE: ['#5c636b', '#474d54'], ROOF_TILES: ['#a85a44', '#8a4434'], ROOF_METAL: ['#8a949a', '#6e787e'],
      ROOF_FLAT: ['#55585c', '#4a4d50'], ROOF_GLASS: ['#bcd8e4', '#98b8c8'],
      STONE: ['#b3a688', '#9a8e72'], BRICK: ['#a8463a', '#8a3a2e'], RENDER: ['#dcd8cb', '#c4c0b2'], WOOD: ['#8a6a44', '#6e5234'],
      METAL: ['#9aa2a8', '#7e868c'],
      window: ['#9ccbe8', '#ece8e0'], door: ['#6a3a1a', '#d9c060'], ridge: ['#2a2e33', '#6a5a50'],
      sign: ['#1e3a2a', '#f0e8c0'],
      GRAVEL: ['#9a948a', '#b4aea2'], MEADOW: ['#7a9a4a', '#a0b860'], CRACKED: ['#3a3b40', '#5a5b60'],
      NEEDLES: ['#7a5a3a', '#94704a'], LEAVES: ['#a8642a', '#d08a30'], MOSS: ['#4a7a3a', '#5e9448'],
      GRANITE: ['#a09a94', '#86807a'], MUD: ['#5e4a34', '#4a3a28'], CORN: ['#c8b048', '#5a8a2a'],
      PUMPKINS: ['#5d7a3c', '#e07a20'], BLUEBERRY: ['#6a5a6a', '#3a4a9a'], STREAM: ['#4a7ab8', '#9a948a'],
      LINO: ['#c8c0a0', '#a8a080'], CARPET: ['#7a3a3a', '#8a4a44'], CHECKER: ['#e8e8e0', '#2a2a2a'],
      CONCRETE: ['#a8a8a2', '#94948e'], FLOORWOOD: ['#8a6a44', '#6e5234'],
    },
    // Editor-map layers (render/layers.js).
    layers: {
      cliff: ['#7a6a58', '#4a3e32'], wall: ['#c9b48e', '#9a8a6a'],
      walls: { plaster: ['#d8ccb0', '#b0a488'], clapboard: ['#ece8dc', '#b8b4a8'], log: ['#8a5e34', '#5e3e20'],
        brick: ['#a8463a', '#7a2e24'], cinder: ['#a8a8a2', '#7e7e78'], barn: ['#a83a2a', '#7a2618'] }, door: ['#7a4a22', '#d9c060'], fence: '#e4e4dc',
      hedge: ['#2a4d22', '#376330'], bridge: ['#a8845a', '#7a5a3a'], steps: ['#b0a898', '#7a7266'], ledge: '#8a7a62',
      car: '#b8312f', van: '#e2e2dc', glass: '#7ab0d0', tree: ['#1e4418', '#4e7a32'], bench: '#8a5a30',
      crate: ['#b08850', '#6a4a22'], fishing: '#e8f0ff',
      roofs: [null, ['#a84a3a', '#7a3428'], ['#5c636b', '#3e444b'], ['#7a5a3a', '#54402a'], ['#4a7a4a', '#2e5a2e'],
        ['#9aa2a8', '#6e767c'], ['#e8e8e0', '#b0b0a8']],
    },
    noise: '255,140,0',   // debug heatmap (rgb, alpha by strength)
    heart: '#e0303a',
    heartEmpty: '#4a1418',
    corpse: '#7a2a2a',
    shoveArmed: '#ff8c00',
    button: '#2a2a2a',
    buttonText: '#dddddd',
    deadText: '#e0303a',
    bagBg: '#0a1a66',     // Teletext blue
    bagLine: '#ffffff',
    bagTitle: '#ffdd33',
    bagRow: '#13287a',
    bagCell: '#071450',
    bagUse: '#1f7a3a',
    bagDrop: '#7a1f2b',
    bagThrow: '#8a5a10',
    aimTile: 'rgba(255,221,51,0.28)',   // a tile you can throw to
    aimCreature: 'rgba(255,140,0,0.5)', // ... with a creature on it
    edgeArrow: '#ff3030',  // a creature right next to you across the screen's edge
    alert: '#ffdd33',     // ! over a zombie that's after you
    puzzled: '#dddddd',   // ? over a zombie looking for you
    actionBar: '#0b0b0b',
  },
};
