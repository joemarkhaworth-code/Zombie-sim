// All tuning numbers live here.
export const CONFIG = {
  // Which map a new game uses: 'village' (step 14) or 'testgrid' (phase 1). Debug overlay
  // -> MAP switches; ?map=testgrid in the URL too. Saves remember their map.
  world: { map: 'village' },
  grid: { width: 20, height: 28 },   // test grid size
  // Scale (see CLAUDE.md "Scale"): 1 tile is about 1.5 m, about one person. Walls take
  // whole tiles. Objects and buildings are true scale; the countryside is compressed.
  // Sizes are [width, length] in tiles. A building's size is its outside, walls included:
  // width is the frontage (the side facing the street or yard), length runs back from it.
  // The generator may turn a building to fit (the church lies along the street).
  scale: {
    metresPerTile: 1.5,
    objects: {
      bed: [1, 2], sofa: [1, 2], table: [1, 1], longTable: [2, 1],
      car: [3, 2], van: [4, 2], tractor: [3, 2], caravan: [4, 2],
    },
    buildings: {
      shed: [3, 3], greenhouse: [3, 4],
      terracedCottage: [5, 7], detachedCottage: [7, 9], farmhouse: [7, 9],
      cornerShop: [6, 8], pub: [10, 12], church: [9, 18], barn: [8, 12],
    },
    ways: { // widths in tiles; [min, max] picked per map from the seed
      ginnel: 1, pavement: 1, lane: [2, 3], mainRoad: [4, 5], bridge: 3, beck: [2, 3], wall: 1, hedge: 1,
    },
    countryside: { field: [10, 20], villageSpacing: [60, 120] }, // field across; between villages (region, step 37)
  },
  village: {
    // Generated in layers (src/sim/gen/village.js) at CONFIG.scale: valley, road + bridge,
    // high street, ginnels + yards, green + church, outskirts.
    width: 112, height: 200,
    floorRows: 48,                   // extra rows below the valley: the void band holding upstairs, cellars, lofts
    floorHalf: [12, 20],             // valley floor half-width outside the village (head / foot)
    intake: 12,                      // lower fellside walled into intake fields, below the fell wall
    lakeRows: 14,                    // the lake at the foot of the dale
    gills: 2,                        // side streams off the fell (1 tile wide)
    roadDrift: 0.12,                 // chance per row the road bends a tile outside the village
    bridgeAt: 0.45,                  // the bridge (village centre) this far down the map
    streetRows: [44, 48],            // high street length above / below the bridge
    yardMin: 3,                      // yard behind the deepest street building (the pub), back wall included
    terraceUnits: [3, 5],            // cottages per terrace row (a ginnel between rows)
    greenRows: [10, 12],             // the green by the bridge
    graveRows: 2,                    // rows of graves between the church and the graveyard wall
    detachedGarden: 1,               // garden tiles each side of a detached cottage
    yardShed: 0.4, gardenShed: 0.5,  // chance of a shed in a back yard / a detached cottage's back garden (greenhouse: always)
    graves: 0.75,                    // chance of a gravestone on each grave spot
    backHedge: 0.2,                  // field edge behind a back lane is sometimes a hedge (else dry stone)
    farms: 2, farmYard: 8,
    // Allotments (14d): a hedged site off the far end of one street, beyond its back lane.
    allotments: { plotW: 5, plotH: 5, cols: 2, rows: 3, shed: 0.5, edge: 'hedge' },
    // Zombies (14d): residents shut in buildings (houses, pub, shop, church, upstairs too),
    // more about the streets, yards and green, and a few out in the fields and on the fell.
    // None start within minDistance of you.
    zombies: { residents: 12, streets: 18, fields: 5, minDistance: 14 },           // walled farmyard (yard this deep) with a farmhouse and a barn
    fieldGate: 0.8, fellGate: 0.4,   // gates between fields / from a field onto the open fell
    screeFrom: 8,                    // scree only this far up the open fell
    beckTrees: 0.3, woodRadius: 12, woodDensity: 0.55, fieldTrees: 40,
  },

  testGrid: {
    wallChance: 0.08,                // chance a floor tile becomes a wall block
    bushClumps: 6,                   // hiding spots
    bushClumpSize: 4,
    itemRadius: 20,                  // village: test items scattered within this many tiles of the start
    items: { beans: 3, bandage: 2, bat: 1, airRifle: 1, shotgun: 1, planks: 2, key: 1 }, // test items scattered on the map
    building: { x: 2, y: 2, w: 8, h: 6 },  // test building (walls, locked door, windows)
  },
  // Item types. slots = how much bag space it takes. Effects are data: food / drink (ticks of
  // hunger / thirst taken off, step 16), heal, stanch, weapon, ranged, light, ammoFor...
  items: {
    beans: { name: 'tin of beans', char: '%', fg: '#000000', bg: '#ff9030', slots: 1, food: 360 }, // a proper meal: a level of hunger
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
    // Village loot (step 14d). Food and drink feed and water you (step 16). Anything can be
    // thrown as a lure. ammoFor: USE loads that many rounds into a carried gun of that type.
    fork: { name: 'garden fork', char: '/', fg: '#000000', bg: '#a0a0a0', slots: 2, weapon: { damage: 2, hitChance: 0.75, verb: 'stab' } },
    stick: { name: 'walking stick', char: '/', fg: '#000000', bg: '#8a6a40', slots: 1, weapon: { damage: 1, hitChance: 0.9, verb: 'hit' } },
    golfClub: { name: 'golf club', char: '/', fg: '#000000', bg: '#c8c8d0', slots: 2, weapon: { damage: 2, hitChance: 0.7, verb: 'hit' } },
    knife: { name: 'kitchen knife', char: '-', fg: '#000000', bg: '#d0d0d0', slots: 1, weapon: { damage: 1, hitChance: 0.85, verb: 'stab', woundChance: 0.6 } },
    crisps: { name: 'bag of crisps', char: '%', fg: '#000000', bg: '#f0d040', slots: 1, food: 120 },
    chocolate: { name: 'bar of chocolate', char: '%', fg: '#ffffff', bg: '#6a3a1a', slots: 1, food: 180 },
    ale: { name: 'bottle of ale', char: '!', fg: '#000000', bg: '#c08030', slots: 1, drink: 180, food: 45 },
    water: { name: 'bottle of water', char: '!', fg: '#000000', bg: '#b0e0ff', slots: 1, drink: 240 },
    pop: { name: 'can of pop', char: '!', fg: '#ffffff', bg: '#d02020', slots: 1, drink: 180, food: 45 },
    firstAid: { name: 'first aid kit', char: '+', fg: '#ffffff', bg: '#20a040', slots: 1, stanch: true, heal: 1 },
    shells: { name: 'box of shells', char: '"', fg: '#ffffff', bg: '#803000', slots: 1, ammoFor: 'shotgun', rounds: 4 },
    // Fire (step 19): ignite (uses) lights the most flammable tile next to you; spill pours or
    // (thrown) splashes petrol; explodes: blast power when it's in a fire or gets shot.
    lighter: { name: 'lighter', char: '*', fg: '#000000', bg: '#ff8040', slots: 1, ignite: true, uses: 12 },
    matches: { name: 'box of matches', char: '*', fg: '#000000', bg: '#e0c080', slots: 1, ignite: true, uses: 6 },
    petrolCan: { name: 'petrol can', char: '&', fg: '#ffffff', bg: '#c02020', slots: 2, spill: true, explodes: 2 },
    gasBottle: { name: 'gas bottle', char: '0', fg: '#000000', bg: '#40a0e0', slots: 2, explodes: 3 },
    brolly: { name: 'brolly', char: '/', fg: '#ffffff', bg: '#202060', slots: 1, weapon: { damage: 1, hitChance: 0.8, verb: 'hit' }, rainCover: 2 }, // wielded: keeps the rain off (2 levels)
    // Lights (step 15): USE switches them on/off. charge = ticks of light (2 min each).
    torch: { name: 'torch', char: '(', fg: '#000000', bg: '#f0f080', slots: 1, light: { radius: 6, level: 3 }, charge: 480 }, // ~16 hours of battery
    candle: { name: 'candle', char: 'i', fg: '#000000', bg: '#f8f0d8', slots: 1, light: { radius: 2, level: 2, burnsOut: true }, charge: 180 }, // ~6 hours, then gone
    pellets: { name: 'tin of pellets', char: '"', fg: '#000000', bg: '#a0a0ff', slots: 1, ammoFor: 'airRifle', rounds: 10 },
  },
  // Loot (step 14d), placed by src/sim/gen/life.js. rooms: by room name, n = [min, max]
  // items per room, items = weighted table. extras: per building type, [item, chance] put in
  // a random room (farmers keep a shotgun). Rooms not listed get nothing.
  loot: {
    rooms: {
      kitchen: { n: [1, 3], items: { beans: 4, knife: 2, crisps: 1, chocolate: 1, candle: 2, torch: 1, water: 2, pop: 1, matches: 2, lighter: 1 } },
      scullery: { n: [0, 1], items: { beans: 2, bandage: 1, planks: 1, torch: 2, candle: 1 } },
      'front room': { n: [0, 1], items: { stick: 2, chocolate: 1, golfClub: 1, brolly: 2 } },
      'living room': { n: [0, 2], items: { stick: 2, golfClub: 1, chocolate: 1, ale: 1, brolly: 2 } },
      'sitting room': { n: [0, 1], items: { ale: 2, stick: 1 } },
      'front bedroom': { n: [0, 1], items: { bandage: 2, airRifle: 1, pellets: 1 } },
      'back bedroom': { n: [0, 1], items: { bandage: 2, chocolate: 1, golfClub: 1 } },
      bedroom: { n: [0, 1], items: { bandage: 1, chocolate: 1, candle: 1 } },
      bathroom: { n: [0, 1], items: { bandage: 2, firstAid: 1 } },
      flat: { n: [0, 1], items: { beans: 1, crisps: 1 } },
      shop: { n: [2, 5], items: { beans: 3, crisps: 3, chocolate: 3, bandage: 1, water: 3, pop: 3 } },
      'stock room': { n: [1, 3], items: { beans: 3, crisps: 2, chocolate: 2, torch: 1, candle: 1, water: 3, pop: 2 } },
      'stock cellar': { n: [1, 3], items: { beans: 3, crisps: 1, planks: 1 } },
      bar: { n: [1, 3], items: { ale: 4, crisps: 3, pop: 2, brolly: 1, lighter: 1 } },
      store: { n: [1, 2], items: { ale: 2, crisps: 2, planks: 1 } },
      'beer cellar': { n: [1, 3], items: { ale: 4, planks: 1 } },
      vestry: { n: [1, 2], items: { firstAid: 2, chocolate: 1, candle: 4, matches: 2 } },
      nave: { n: [0, 2], items: { candle: 1 } },
      cellar: { n: [0, 2], items: { beans: 2, planks: 2, ale: 1 } },
      barn: { n: [0, 2], items: { fork: 2, planks: 3, torch: 1, petrolCan: 2, gasBottle: 1 } },
      hayloft: { n: [0, 1], items: { planks: 1, shells: 1 } },
      shed: { n: [0, 1], items: { fork: 3, planks: 2, golfClub: 1, torch: 1, petrolCan: 1, gasBottle: 1 } },
      greenhouse: { n: [0, 1], items: { fork: 1 } },
    },
    extras: {
      farmhouse: [['shotgun', 0.6], ['shells', 0.7]],
      pub: [['bat', 0.5]],
      detachedCottage: [['bat', 0.2], ['airRifle', 0.15]],
    },
    // Keys to locked buildings: a resident zombie carries it, else it's left by the door,
    // else it's lost (bash or smash your way in).
    keyResident: 0.7, keyDoorstep: 0.4,
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
  // Building types (step 14b): what each is made of, picked per building from the seed.
  // walls/roof: weighted choice of CONFIG.materials keys (roof 'walls' = same as the walls;
  // roofs are recorded for fire, step 19). floor: wood | flags | concrete | earth.
  // door: material of outside doors ('walls' = same as the walls). lockFront/lockBack: chance
  // the outside door is locked (keys come with loot, 14d). innerDoorOpen: chance an inside
  // door starts open. Room layouts live in src/sim/gen/buildings.js.
  buildingTypes: {
    terracedCottage: { name: 'cottage', walls: { stone: 3, brick: 1 }, roof: { slate: 4, thatch: 1 }, floor: 'wood', door: 'wood', lockFront: 0.6, lockBack: 0.4 },
    detachedCottage: { name: 'cottage', walls: { stone: 4, brick: 1 }, roof: { slate: 3, thatch: 1 }, floor: 'wood', door: 'wood', lockFront: 0.6, lockBack: 0.4 },
    farmhouse: { name: 'farmhouse', walls: { stone: 1 }, roof: { slate: 1 }, floor: 'flags', door: 'wood', lockFront: 0.5, lockBack: 0.5 },
    cornerShop: { name: 'shop', walls: { stone: 2, brick: 1 }, roof: { slate: 1 }, floor: 'wood', door: 'wood', lockFront: 0.9, lockBack: 0.6 },
    pub: { name: 'pub', walls: { stone: 3, brick: 1 }, roof: { slate: 1 }, floor: 'flags', door: 'wood', lockFront: 0.8, lockBack: 0.5 },
    church: { name: 'church', walls: { stone: 1 }, roof: { slate: 1 }, floor: 'flags', door: 'wood', lockFront: 0.3, lockBack: 0.3 },
    barn: { name: 'barn', walls: { stone: 2, corrugatedMetal: 1 }, roof: { slate: 1, corrugatedMetal: 1 }, floor: 'concrete', door: 'walls', lockFront: 0.1, lockBack: 0 },
    shed: { name: 'shed', walls: { wood: 3, corrugatedMetal: 2 }, roof: 'walls', floor: 'concrete', door: 'walls', lockFront: 0.5, lockBack: 0 },
    greenhouse: { name: 'greenhouse', walls: { glass: 1 }, roof: 'walls', floor: 'earth', door: 'walls', lockFront: 0, lockBack: 0 },
  },
  innerDoorOpen: 0.7,
  // Upstairs, cellars and lofts (step 14c): each is a small separate map in a band of void
  // below the valley (CONFIG.village.floorRows), reached by stairs or a ladder. chance:
  // which buildings have which floors (plans in src/sim/gen/floors.js).
  floors: {
    chance: {
      terracedCottage: { upstairs: 1 },
      detachedCottage: { upstairs: 1 },
      farmhouse: { upstairs: 1, cellar: 0.5 },
      cornerShop: { upstairs: 1, cellar: 0.5 },
      pub: { upstairs: 1, cellar: 1 },
      church: { loft: 1 },
      barn: { loft: 0.8 },
    },
    stairsCost: 1, ladderCost: 2,    // time to climb (x a normal step)
    linkNoiseCost: 3,                // sound loses this much strength going up or down stairs (like a wall)
    ladderNoise: 1,                  // pulling up / lowering a ladder clatters
    gap: 2,                          // void between floors in the band
  },
  // What things are made of on the test grid (the village picks per building, above).
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
  // Light: how far anyone can see in the open, and how well-lit each tile is (step 15:
  // systems/light.js). Weather will lower it later.
  light: {
    range: 15,                       // clear day: covers the whole portrait screen (5 across x ~10 up/down each side)
    ambient: 3,                      // starting light level before the first update
    // Daylight by the hour (0-23), a November day in the Lakes: dark till 7, dawn, full light
    // 8-15, dusk at 4, then moonlight (1). Night shrinks noticing distance to a third.
    byHour: [1, 1, 1, 1, 1, 1, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1, 1, 1, 1, 1, 1],
    cloudHidesMoon: false,           // true: cloudy nights are pitch black outdoors (too harsh: the whole screen went black)
    indoorDim: 1,                    // indoors is this much darker: dim by day, pitch black at night
    falloff: 2,                      // a light is one level weaker for this many tiles past its radius
  },
  vision: {
    // Eyesight 0-3 scales the light range: 3 = sees as far as the light allows.
    eyesightFactor: [0, 0.25, 0.5, 1],
    darkSight: 1,                    // tiles this close are always made out (dimly) even in pitch darkness: eyes adjust
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
    dimAlpha: [1, 0.6, 0.3, 0],         // black overlay per visibility level 0-3 (0 is not drawn at all)
    weather: { rain: 'rgba(170,200,255,0.55)', snow: 'rgba(255,255,255,0.85)', fog: 'rgba(190,190,190,0.35)' }, // overlays on outdoor tiles in sight (step 17)
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
  // Weather (step 17, systems/weather.js): one weather for the valley, changing every few
  // hours. Per kind: hours [min, max] it lasts; next: weighted kinds that follow;
  // hoursOfDay: only starts in these hours (fog: mornings). cloudy: hides the moon (night
  // outdoors 0). dayDrop: dims the day. sight: outdoor sight radius x this. mask: heard
  // noise is this much weaker outdoors. wet: wetness level 0-3 you drift toward outdoors.
  // chill: [day, night] cold level 0-3 outdoors. scentWash / fireDamp: steps 18 / 19.
  weather: {
    start: 'overcast',
    kinds: {
      clear:     { hours: [3, 8], next: { clear: 1, overcast: 4, fog: 2 },                  cloudy: false, dayDrop: 0, sight: 1,    mask: 0, wet: 0, chill: [0, 2], scentWash: 0, fireDamp: 0 },
      overcast:  { hours: [3, 8], next: { clear: 2, overcast: 1, rain: 4, fog: 1, snow: 1 }, cloudy: true,  dayDrop: 0, sight: 1,    mask: 0, wet: 0, chill: [1, 1], scentWash: 0, fireDamp: 0 },
      rain:      { hours: [2, 6], next: { overcast: 3, heavyRain: 2, rain: 1 },             cloudy: true,  dayDrop: 0, sight: 0.8,  mask: 1, wet: 2, chill: [1, 2], scentWash: 1, fireDamp: 1 },
      heavyRain: { hours: [1, 3], next: { rain: 3, overcast: 1, gale: 1.5 },                cloudy: true,  dayDrop: 1, sight: 0.6,  mask: 2, wet: 3, chill: [2, 2], scentWash: 2, fireDamp: 2 },
      gale:      { hours: [2, 5], next: { heavyRain: 2, rain: 2, overcast: 1 },             cloudy: true,  dayDrop: 1, sight: 0.6,  mask: 3, wet: 3, chill: [2, 3], scentWash: 3, fireDamp: 2, wind: true },
      fog:       { hours: [2, 5], next: { overcast: 2, clear: 1 }, hoursOfDay: [0, 10],    cloudy: true,  dayDrop: 0, sight: 0.35, mask: 0, wet: 1, chill: [1, 2], scentWash: 0, fireDamp: 1 },
      snow:      { hours: [2, 6], next: { overcast: 3, snow: 1 },                           cloudy: true,  dayDrop: 1, sight: 0.7,  mask: 1, wet: 1, chill: [2, 3], scentWash: 1, fireDamp: 1 },
    },
  },
  // Fire, smoke and explosions (step 19, systems/fire.js). Flammability is tile data
  // (TILE_INFO flammable 0-3); these are the rates.
  fire: {
    fuelPerLevel: 40,                // ticks of fuel per level of flammability (intensity burns that many per tick)
    petrolFuel: 20,                  // extra fuel from spilled petrol
    growEvery: 3,                    // a fire grows a level every 3 ticks, up to flammability + 1
    spread: [0, 0.02, 0.06, 0.12],   // chance a tick to spread to a neighbour of flammability 1-3 (x intensity/3)
    dampChance: 0.08,                // outdoors, chance a tick per level of the weather's fireDamp to lose a level
    wetGround: 2,                    // grass/fell/bracken/bushes won't burn when the mud is this deep
    heatEvery: 4,                    // doors, barricades, windows on a burning tile take heat damage this often
    burnEvery: [Infinity, 4, 2, 1],  // a creature in fire of intensity 1-3 loses 1 health every N ticks
    crackleEvery: 6,                 // crackle (noise 1; 2 when roaring) every N ticks
    smokeClearIndoors: 8, smokeClearOutdoors: 2, // smoke thins a level every N ticks
    coughEvery: 3, chokeEvery: 4,    // in thick smoke (2+) you cough (noise 1); choking smoke (3) costs 1 health
    candleIgnite: 0.01,              // a lit candle on something that burns: chance every 5 ticks to set it alight
    blastStructure: 3, blastWall: 8, // explosion damage to doors/windows and to walls, x force (power - distance + 1)
  },
  // Gales (after step 20, src/sim/systems/storm.js): what a storm does to the valley, per tick in a gale.
  storm: {
    treeFall: 0.12,                  // chance a tick that a tree somewhere comes down (most of a dozen in a gale)
    fallLength: 2,                   // it lies across this many tiles downwind
    knockActions: 1,                 // anything it lands on is knocked flat: loses its next action (no damage)
    fallNoise: 3,
    roofLoss: 0.05,                  // chance a tick that a roof loses slates (a 2x2 patch opens to the sky; thatch twice as likely)
    roofNoise: 2,
    glassBreak: 0.03,                // chance a tick that a greenhouse pane blows in
  },
  // Water (step 20): src/sim/systems/water.js.
  water: {
    // Dirty water: drinking from the beck, the lake, a pond or floodwater may make you ill,
    // some hours later. A corpse lying in or by the water (within corpseReach) fouls it.
    dirty: { stream: 0.15, lake: 0.3, pond: 0.45, flood: 0.5 }, // chance each drink makes you ill
    corpseFoul: 0.5, corpseReach: 6,  // + this chance with a corpse in or by the water
    onset: [60, 150],                // ticks (2-5 h) before you fall ill
    illDose: 2, foulDose: 3,         // how ill (level): dirty water / water fouled by a corpse
    vomitEvery: 20, vomitChance: 0.35, vomitNoise: 1, // ill 2+: you throw up now and then
    vomitLoss: 60,                   // ...losing this many ticks of hunger and thirst
    feverEvery: 120,                 // ill 3: lose 1 health every 4 hours
    // The beck: world.water.beck counts ticks; level 0-3 = ticks / perLevel (1 normal,
    // 2 in spate: too strong to wade, 3 in flood: over its banks, bridges may go).
    beckPerLevel: 240,
    beckRise: { rain: 1, heavyRain: 2, gale: 3 }, snowMeltRise: 2, // per tick of rain / of snow melting
    beckFall: 2,                     // per tick otherwise, never below normal (level 1)
    floodReach: 2,                   // in flood, the beck spills this many tiles over low ground...
    floodMaxReach: 6, floodGrowHours: 2, // ...a tile further every 2 hours it stays in flood, up to 6 (into houses, cellars fill)
    floatChance: 0.35, floatRange: 3,  // each hour in flood, things in floodwater may drift (downstream) this far
    siltTicks: 720,                  // floodwater leaves silt (slow, squelching mud) for a day
    wallBreach: 0.015,               // each hour in flood, chance a dry-stone wall by the water gives way (rubble)
    erode: 0.005,                    // each hour in spate or flood, chance a bank tile by the torrent is washed out (the beck widens)
    washout: { footbridge: 0.1, bridge: 0.01 }, // chance an hour in flood that a bridge is swept away
    // Ice: world.water.ice counts ticks of frost; level 0-3 = ticks / icePerLevel.
    // Freezing by the weather's chill (day/night): 3 +2 a tick, 2 +1; rain or chill <= 1 thaws.
    icePerLevel: 120,
    iceBreak: [0, 0.3, 0.06, 0],     // chance a step on ice of this level breaks through
    iceCrackNoise: 2,                // the ice giving way
    fallInDamage: 1,                 // falling through the ice (zombies go under and drown)
    sweptDamage: 1,                  // caught in the beck as it rises
  },
  // Scent (step 18, systems/scent.js): you leave a trail, zombies smell it.
  scent: {
    fadeTicks: 45,                   // a trail loses a level every 1.5 hours (3 levels: gone in 4.5 h; faster in rain outdoors)
    minLevelBySmell: [99, 3, 2, 1],  // faintest scent level noticed by smell 0-3 (0: no sense of smell)
  },
  // Tracks (step 18, systems/tracks.js): snow and mud on the ground, and prints in them.
  tracks: {
    snowPerLevel: 60,                // snow settles a level every 2 h of snowfall
    meltEvery: 3,                    // ...and melts a tick per 3 ticks when it isn't snowing (every tick in rain)
    mudPerLevel: 60,                 // rain makes the ground muddy a level every 2 h
    dryEvery: 4,                     // ...and it dries a tick per 4 ticks otherwise
    life: 720,                       // a print lasts 24 h
    coveredLife: 90,                 // ...but only 3 h while fresh snow falls on it / rain washes it
  },
  // Needs (step 16, systems/needs.js): hunger, thirst and fatigue, counted in ticks (2 min)
  // and shown as levels 0-3 (one level every perLevel ticks).
  needs: {
    perLevel: { hunger: 360, thirst: 240, fatigue: 180, wet: 40, cold: 90, ill: 120 }, // ill (step 20): 4 h a level // 12 h, 8 h, 6 h awake; wet/cold (step 17) per level
    starveEvery: 360,                // starving (hunger 3, after 36 h): lose 1 health every 12 hours
    parchedEvery: 180,               // parched (thirst 3, after 24 h): lose 1 health every 6 hours
    exhaustedCost: 1.5,              // exhausted (fatigue 3): every action takes 1.5x as long
    sleepRecovery: 3,                // asleep, fatigue drops 3 ticks per tick (6 h sleep clears 3 levels)
    sleepHealEvery: 60,              // asleep and not starving/parched: +1 health every 2 hours
    restHealEvery: 240,              // awake, fed, watered and rested (all <= 1), not bleeding: +1 health every 8 hours
    maxSleepTicks: 360,              // nobody sleeps more than 12 hours
    drinkNoise: 1,                   // scooping water from the beck splashes
    // Wet and cold (step 17). Both drift toward a target level: wet toward the weather's wet
    // outdoors (0 indoors, less under a brolly), cold toward the weather's chill (+1 if you're
    // soaked, -shelter indoors). Getting wet takes 1 tick per tick; drying takes dryIndoors
    // ticks per tick indoors, dryOutdoors outdoors. Cold rises 1 per tick and eases 1 per tick.
    dryIndoors: 2, dryOutdoors: 4,   // ticks of drying per tick of wetness gone
    wadeWet: 2,                      // wading a beck soaks you to at least this level
    shelter: 2,                      // indoors it's this many levels less cold
    coldTiresFrom: 2,                // shivering (cold 2+): fatigue rises twice as fast
    freezeEvery: 240,                // freezing (cold 3): lose 1 health every 8 hours, and you can't sleep
  },
  zombie: {
    speed: 50,                       // half player speed: acts every other turn
    health: 4,
    // Rebalanced: most bites land; 3 bites kill a healthy player (6 health); bites usually draw blood.
    melee: { damage: 2, hitChance: 0.85, woundChance: 0.7, verb: 'bite' },
    eyesight: 2,                     // poor eyes: half the light range, so you usually see them first
    hearing: 3,                      // good ears: hear your footsteps up to 3 tiles away in the open
    smell: 2,                        // follows a scent trail of level 2+ (laid in the last 3 h; less in rain)
    footsteps: 0,                    // shuffle quietly (raise to let zombies hear each other)
    wanderChance: 0.5,               // with nothing to chase, chance to shuffle a step
    staggerChance: 0.2,
    reactActions: 1,                 // on first noticing prey (or being hit), spend this many actions reacting before attacking
    groanNoise: 1,                   // reacting is a groan: noise level (warns you, and other zombies may hear)
    searchActions: 12,               // after reaching a last-seen spot or noise, search this many moves (~24 of your turns)
    searchRadius: 3,                 // ...within this many tiles of it. Any new noise heard restarts the hunt there.              // chance a step lurches in a random direction
    spawnMinDistance: 8,             // tiles from the player at start
    spawnMaxDistance: 20,            // ...and no further (the village map is big; until 14d places zombies)
  },
  // Time: the clock runs on scheduler ticks (a normal step or wait = 1 tick, a sneaking
  // step = 2). 2 minutes per tick = 720 ticks a day; a run starts at 08:00 on day 1.
  time: { minutesPerTick: 2, startHour: 8 },
  // Save/load. Bump `version` whenever the saved state's shape changes in a way old
  // saves can't be read with; an older save is then discarded for a fresh game.
  save: { version: 14, key: 'zombie-sim-save' },
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
    lane: '#6a6050',                 // gravel back lanes and farm tracks
    laneMark: '#544c3e',
    road: '#3e3e44',                 // tarmac main road
    roadMark: '#c8c8a0',             // faded centre line
    pavement: '#9a978e',             // flagstones
    pavementMark: '#78756d',
    ginnel: '#6e6a62',               // narrow flagged passage
    yard: '#5e5850',                 // cobbles
    yardMark: '#48433c',
    gate: '#3a3024',
    gateMark: '#b08850',             // wooden bars
    path: '#8c7a54',                 // worn earth
    pathMark: '#6c5c3c',
    plot: '#3a302a',                 // bare earth: empty building plot (14b builds here)
    plotMark: '#5a4a3e',
    graveStone: '#a8a8a0',
    stairs: '#e8d8a0', stairsText: '#3a2a10',            // stairs < > and ladders H (things on a tile)
    hatch: '#5a4a30', hatchText: '#a89060',              // a pulled-up ladder seen from below
    snow: ['rgba(255,255,255,0)', 'rgba(235,240,255,0.35)', 'rgba(235,240,255,0.55)', 'rgba(240,245,255,0.75)'], // settled snow by level (step 18)
    trackSnow: '#5a6070', trackMud: '#2a1e12',          // prints: boots (pairs of dots) and drag marks (streaks)
    debugScent: '60,220,90',
    fire: ['rgba(0,0,0,0)', 'rgba(255,140,30,0.45)', 'rgba(255,100,20,0.65)', 'rgba(255,60,10,0.8)'], // by intensity (step 19)
    flame: '#ffe060',
    smoke: ['rgba(0,0,0,0)', 'rgba(120,120,120,0.25)', 'rgba(110,110,110,0.5)', 'rgba(90,90,90,0.75)'],
    petrol: 'rgba(200,120,255,0.5)',
    ash: '#3a3632', ashMark: '#5a5650', charred: '#2c2420', rubble: '#6a665e', rubbleMark: '#4a4640',                             // debug overlay: scent trail
    phoneBox: '#c01818', phoneBoxMark: '#f0e0a0',        // red phone box with glazed panes
    allotment: '#4a3626', allotmentMark: '#2e2016',      // dug-over beds in rows
    wallStone: '#8c8678', wallStoneMark: '#5e5a50',      // building walls (neat courses; dry-stone field walls are rougher)
    wallBrick: '#8e4a36', wallBrickMark: '#5e2e22',
    wallWood: '#7a5430', wallWoodMark: '#4e3418',
    wallMetal: '#7e868c', wallMetalMark: '#5a6066',
    wallGlass: '#a8d8e8', wallGlassMark: '#6a98a8',
    floorWood: '#6a4c32', floorWoodMark: '#523a26',      // floorboards
    floorFlags: '#6c6860', floorFlagsMark: '#56524a',
    floorConcrete: '#7a7a76',
    floorEarth: '#4e3c2a', floorEarthMark: '#3c2e20',
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
    torrent: '#5a7f9e', torrentMark: '#e8f0f6', // the beck in spate: churning, white water
    floodwater: '#4f5f58', floodMark: '#8aa0a0', // muddy water over the fields
    ice: '#b8d0e0', iceMark: '#ffffff', iceThin: '#7fa4c4', // ice: pale, cracks; thin ice darker
    fallenTree: '#4a5a2a', fallenTrunk: '#6a4a2a', fallenLeaf: '#203f14', stump: '#3c5a28', stumpMark: '#7a5a36',
    silt: '#6a5a40', siltMark: '#4e4230',
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
    needLevel: ['#6a7aa8', '#f0e040', '#ff9020', '#ff3030'], // H/T/Z marks in the top bar by level (0 = fine, dim)
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
