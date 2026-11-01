// All tuning numbers live here.
export const CONFIG = {
  // Which map a new game uses: 'village' (step 14) or 'testgrid' (phase 1). Debug overlay
  // -> MAP switches; ?map=testgrid in the URL too. Saves remember their map.
  world: { map: 'village' },
  grid: { width: 20, height: 28 },   // test grid size
  village: {
    width: 48, height: 64,
    floorHalf: [5, 9],               // valley floor half-width at the valley head / near the lake
    intake: 5,                       // intake fields between the floor and the fell wall
    lakeRows: 12,                    // the lake fills the foot of the dale
    gills: 3,                        // side streams off the fells
    roadOffset: 3,                   // road runs this far from the beck
    bridgeAt: 0.5,                   // the bridge (village centre) sits this far down to the lake
    villageRows: 13,                 // plots within this many rows of the bridge (a tight village)
    plots: 8, plotW: [6, 8], plotH: [5, 6], // empty building plots (14b builds on them)
    gardenHedge: 0.15,               // garden boundaries that are hedges (the rest dry-stone; hedges are rare in the Lakes)
    laneGateChance: 0.08,            // gaps in the walled lane
    fields: 16, fieldGateChance: 0.04, // walled enclosures on floor + intake
    fellWalls: 3,                    // walls climbing the open fell
    screeFrom: 6,                    // scree only this far up the fellside
    beckTrees: 0.3, woodRows: 14, woodDensity: 0.55, fieldTrees: 14,
  },

  testGrid: {
    wallChance: 0.08,                // chance a floor tile becomes a wall block
    bushClumps: 6,                   // hiding spots
    bushClumpSize: 4,
    items: { beans: 3, bandage: 2, bat: 1, airRifle: 1, shotgun: 1, planks: 2, key: 1 }, // test items scattered on the map
    building: { x: 2, y: 2, w: 8, h: 6 },  // test building (walls, locked door, windows)
  },
  // Item types. slots = how much bag space it takes. Effects are data: heal, stanch, weapon.
  items: {
    beans: { name: 'tin of beans', char: '%', fg: '#000000', bg: '#ff9030', slots: 1, heal: 1 }, // until hunger (step 16)
    bandage: { name: 'bandage', char: '+', fg: '#c00000', bg: '#f0f0f0', slots: 1, stanch: true },
    bat: { name: 'cricket bat', char: '/', fg: '#000000', bg: '#d8b878', slots: 2, weapon: { damage: 2, hitChance: 0.8, verb: 'hit' } },
    planks: { name: 'planks', char: '=', fg: '#000000', bg: '#b07840', slots: 2, barricade: true }, // use next to a door/window
    // Keys go on your keyring, not in the bag (no slot). A key opens doors with the same lockId.
    key: { name: 'door key', char: '-', fg: '#000000', bg: '#ffd700', slots: 0, key: true, lockId: 'test-building' },
    // Guns: wield, then FIRE. ranged.noise is at the shooter. ammo = rounds it starts with.
    airRifle: {
      name: 'air rifle', char: '}', fg: '#000000', bg: '#a0a0ff', slots: 2, ammo: 10,
      weapon: { damage: 1, hitChance: 0.7, verb: 'hit' },        // as a club
      ranged: { range: 8, damage: 1, hitChance: 0.75, woundChance: 0.3, noise: 1 }, // quiet pfft, weak
    },
    shotgun: {
      name: 'shotgun', char: '}', fg: '#ffffff', bg: '#803000', slots: 2, ammo: 4,
      weapon: { damage: 1, hitChance: 0.7, verb: 'hit' },
      ranged: { range: 4, damage: 4, hitChance: 0.9, woundChance: 0.8, noise: 3 }, // very loud, strong, short range
    },
  },
  // Materials: what walls, doors, windows and barricades are made of.
  //   hp           - blows to break it (at 1 damage per blow)
  //   flammability - 0-3, does it catch fire and spread flames (fire, step 19)
  //   heatDamage   - 1-3, how fast fire wears it down even if it never catches:
  //                  everything suffers in a fire (glass shatters, slate splits,
  //                  metal buckles, stone and brick spall and lose their mortar)
  //   seeThrough   - does sight pass through it while it's intact
  //   hitNoise     - noise level of each blow against it
  //   breakNoise   - noise level when it finally breaks
  //   shards       - leaves broken glass when it breaks
  materials: {
    stone:           { hp: 20, flammability: 0, heatDamage: 1, seeThrough: false, hitNoise: 2, breakNoise: 3 },
    slate:           { hp: 16, flammability: 0, heatDamage: 2, seeThrough: false, hitNoise: 2, breakNoise: 3 }, // splits and cracks
    brick:           { hp: 18, flammability: 0, heatDamage: 1, seeThrough: false, hitNoise: 2, breakNoise: 3 },
    wood:            { hp: 6,  flammability: 2, heatDamage: 3, seeThrough: false, hitNoise: 2, breakNoise: 2 },
    glass:           { hp: 1,  flammability: 0, heatDamage: 3, seeThrough: true,  hitNoise: 3, breakNoise: 3, shards: true }, // shatters in heat
    corrugatedMetal: { hp: 8,  flammability: 0, heatDamage: 2, seeThrough: false, hitNoise: 3, breakNoise: 3 }, // buckles; clangs
    thatch:          { hp: 4,  flammability: 3, heatDamage: 3, seeThrough: false, hitNoise: 1, breakNoise: 1 },
  },
  // What things are made of (for now; step 14 picks per building).
  build: {
    wall: 'stone',                   // wall tiles
    door: 'wood',
    window: 'glass',
    barricade: 'wood',               // planks
    hammerNoise: 2,                  // nailing up a barricade
    glassCrunchNoise: 1,             // stepping on broken glass
  },
  throw: {
    range: 6,                        // tiles (round), needs a clear line you can see
    hitChance: 0.75,                 // chance a thrown item hits a creature on the target tile
    heavySlots: 2,                   // items this big or bigger hurt when they hit
    heavyDamage: 1,
    staggerActions: 1,               // anything that hits staggers the target (loses its next action), light or heavy
    landNoise: 2,                    // clatter where it lands (~8 tiles): a lure
  },
  inventory: { capacity: 6 },        // bag size in slots
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
    // In cover (bush) a creature is only noticed from an adjacent tile (unless the viewer
    // was already tracking it).
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
  melee: {
    noise: 2,                        // fighting noise level (carries ~8 tiles)
    // Sneak attack: hitting a creature that hasn't noticed you. Always lands and adds
    // bonus damage (enough to kill a zombie outright at 4 health).
    sneakAttackHitChance: 1,
    sneakAttackBonus: 3,
  },
  shove: {
    noise: 1,                        // scuffle noise level (~3 tiles)
    staggerActions: 1,               // the shoved creature loses this many actions
    slamDamage: 1,                   // if the tile behind is blocked, it slams into it
  },
  bleeding: {
    intervalByLevel: [Infinity, 12, 7, 4], // ticks between losing 1 health, by bleeding level
    clotChance: 0.3,                 // each drip, chance the bleeding drops a level
  },
  player: {
    speed: 100,
    health: 6,
    melee: { damage: 1, hitChance: 0.8, woundChance: 0.3, verb: 'hit' },                      // energy per tick; 100 = one action per tick
    eyesight: 3,
    hearing: 2,
    footsteps: 1,                    // noise level when walking
    sneakFootsteps: 0,               // noise level when sneaking (silent)
  },
  zombie: {
    speed: 50,                       // half player speed: acts every other turn
    health: 4,
    // Rebalanced: most bites land; 3 bites kill a healthy player (6 health); bites usually draw blood.
    melee: { damage: 2, hitChance: 0.85, woundChance: 0.7, verb: 'bite' },
    eyesight: 2,                     // poor eyes: half the light range, so you usually see them first
    hearing: 3,                      // good ears: hear your footsteps up to 3 tiles away in the open
    footsteps: 0,                    // shuffle quietly (raise to let zombies hear each other)
    wanderChance: 0.5,               // with nothing to chase, chance to shuffle a step
    staggerChance: 0.2,
    reactActions: 1,                 // on first noticing prey (or being hit), spend this many actions reacting before attacking
    groanNoise: 1,                   // reacting is a groan: noise level (warns you, and other zombies may hear)
    searchActions: 12,               // after reaching a last-seen spot or noise, search this many moves (~24 of your turns)
    searchRadius: 3,                 // ...within this many tiles of it. Any new noise heard restarts the hunt there.              // chance a step lurches in a random direction
    spawnMinDistance: 8,             // tiles from the player at start
  },
  // Time: the clock runs on scheduler ticks (a normal step or wait = 1 tick, a sneaking
  // step = 2). 2 minutes per tick = 720 ticks a day; a run starts at 08:00 on day 1.
  time: { minutesPerTick: 2, startHour: 8 },
  // Save/load. Bump `version` whenever the saved state's shape changes in a way old
  // saves can't be read with; an older save is then discarded for a fresh game.
  save: { version: 1, key: 'zombie-sim-save' },
  ui: {
    barHeight: 72,                   // bottom button bar (SNEAK) in CSS px: thumb-sized
    blinkMs: 400,
    deathTapDelayMs: 1000,           // ignore taps this long after dying, so you see the page                    // health blocks blink this fast while bleeding
  },
  view: {
    tilesAcross: 11,                 // camera width in tiles (odd keeps the player centred)
    // The player's sight is clipped to a screen-shaped box around them, so you only
    // see (and remember) what the screen can show: tilesAcross/2 to each side, and this
    // many up/down (fits most portrait phones; taller screens just show extra dark rows).
    sightHalfHeight: 9,
  },
  input: {
    longPressMs: 450,                // hold this long without moving = inspect (shorter = tap)
    tapMaxMovePx: 20,
    waitRadiusTiles: 0.7,            // tap this close to the player = wait
  },
  colours: {
    background: '#000000',
    floor: '#203020',
    grass: '#2f5a24',
    lane: '#6a6050',
    stream: '#2f6fb0',
    streamMark: '#9cc8f0',
    bridge: '#a99f88',               // paved like the road (walkable), not like a wall
    parapet: '#4e4b45',              // low stone parapet along the edges facing water
    drystone: '#7a7a72',
    drystoneMark: '#4a4a46',
    hedge: '#1f4a1a',
    hedgeMark: '#0f2e0c',
    tree: '#2f5a24',                 // grass under the tree
    treeCrown: '#14380f',
    pond: '#163e78',
    fell: '#55683a',
    bracken: '#8a5a24',              // November: rusty brown
    brackenMark: '#5e3c14',
    rock: '#6e6a64',
    rockMark: '#4c4944',
    scree: '#8c877c',
    screeMark: '#5f5b52',
    lake: '#1d4f8a',
    shore: '#9a917c',
    wall: '#707070',
    memoryFloor: '#1c1c1c',          // remembered but out of sight: greyed out
    memoryWall: '#3c3c3c',
    bush: '#2e7d32',
    bushMark: '#1b4d1e',             // small mark so bushes read as bushes
    memoryBush: '#2c332c',
    memoryThing: '#6a6a6a',          // remembered items/doors: grey letter on the greyed tile
    door: '#7a4a1a',
    doorOpen: '#3a2a10',
    doorText: '#f0d0a0',
    window: '#80c0ff',
    windowBroken: '#304860',
    windowText: '#003060',
    barricade: '#a06830',
    barricadeText: '#2a1a00',
    glass: '#c0e8ff',
    memoryGlass: '#505860',
    corpse: '#4a2020',
    corpseText: '#a08080',
    blood: '#b00000',
    memoryBlood: '#4a2a2a',
    healthFull: '#ff2020',
    healthEmpty: '#400000',
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
    buttonArmedBg: '#ff8000',
    bagBg: '#000080',                // inventory panel: Teletext blue
    bagRow: '#000000',
    bagText: '#ffffff',
    bagTitle: '#00ffff',
    bagButton: '#ffff00',
    bagButtonText: '#000000',
    aimTile: 'rgba(255,255,0,0.22)', // valid target tiles while aiming
    aimCreature: 'rgba(255,64,0,0.45)', // valid target with a creature on it        // one-shot action waiting for a target (SHOVE)
    statusBg: '#0000aa',
    statusText: '#ffffff',
    statusTurn: '#00ffff',
    statusDanger: '#ffff00',
    statusDim: '#8080ff',
  },
};
