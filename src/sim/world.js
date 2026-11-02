// World state: tiles + entities (plain objects holding data components).
// Never touches the DOM or canvas.
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { generateTestGrid, TILE_INFO, TILE } from './gen/testgrid.js';
import { generateVillage } from './gen/village.js';
import { createEventBus } from './events.js';
import { installVision, refreshAllVision } from './systems/vision.js';
import { installMemory, createMemory } from './systems/memory.js';
import { installNoise } from './systems/noise.js';
import { installShamble } from './systems/shamble.js';
import { installBleeding } from './systems/bleeding.js';
import { scatterTestItems } from './systems/items.js';
import { installStructures, initTileHp } from './systems/structures.js';
import { buildTestBuilding } from './gen/building.js';
import { buildVillage } from './gen/buildings.js';
import { buildFloors } from './gen/floors.js';
import { rebuildLinks } from './systems/floors.js';
import { populateVillage } from './gen/life.js';
import { updateLight } from './systems/light.js';

// opts.map: 'village' (default from CONFIG.world.map) or 'testgrid' (the phase-1 grid).
export function createWorld(seed, opts = {}) {
  const map = opts.map || CONFIG.world.map;
  // The village map is the valley (landHeight rows) plus a void band below it holding the
  // upstairs, cellars and lofts (step 14c).
  const { width } = map === 'village' ? CONFIG.village : CONFIG.grid;
  const landHeight = map === 'village' ? CONFIG.village.height : CONFIG.grid.height;
  const height = map === 'village' ? landHeight + CONFIG.village.floorRows : landHeight;
  const rng = createRng(seed);
  let tiles, plots = [], green = null, graveyard = null, farms = [], bridgeRow = null, villageStart = null, widths = null, phoneBox = null, allotments = null;
  if (map === 'village') {
    let land;
    ({ tiles: land, plots, green, graveyard, farms, bridgeRow, start: villageStart, widths, phoneBox, allotments } = generateVillage(rng, width, landHeight));
    tiles = new Uint8Array(width * height);
    tiles.set(land);
  } else tiles = generateTestGrid(rng, width, height);
  const world = {
    seed, rng, width, height, landHeight, map,
    plots, // village: empty building plots { x, y, w, h, kind, front, back? } for step 14b
    // kind: cottage | detached | pub | shop | church | farmhouse | barn; building = its CONFIG.scale.buildings key;
    // facing = side the front faces (N/E/S/W); front = the tile outside the front door.
    green, graveyard, farms, bridgeRow, widths, phoneBox, allotments, // village: green/graveyard rects, farmyards, bridge row, way widths picked
    tiles,
    light: new Uint8Array(width * height).fill(CONFIG.light.ambient), // light level 0-3 per tile
    entities: new Map(),
    events: createEventBus(),
    nextId: 1,
    turn: 0,      // player turns taken
    tick: 0,      // scheduler ticks elapsed
    inputs: [],   // every player input, in order, so runs replay from seed + inputs
    playerId: null,
    gameOver: null, // set when the player dies: { cause, killerId, killerName, turn }
    stats: { kills: 0 }, // run stats for the death page (zombies killed by the player)
  };
  installBleeding(world); // world.blood
  installStructures(world); // world.structures, world.glass, world.tileHp
  if (map === 'testgrid') buildTestBuilding(world);
  else {
    buildVillage(world, plots); // step 14b: a building on every plot
    buildFloors(world, plots, landHeight); // step 14c: upstairs, cellars, lofts in the void band
  }
  rebuildLinks(world); // world.links / world.stairsAt (none on the test grid)
  initTileHp(world, (t) => (TILE_INFO[t].blocks && TILE_INFO[t].material) || null);

  // Player starts in the middle of the map: on the lane in the village, else the nearest open tile.
  // Village: on the road at the bridge (the village centre).
  const start = map === 'village' ? villageStart : nearestOpenTile(world, width >> 1, height >> 1);
  world.playerId = addEntity(world, {
    Position: { x: start.x, y: start.y },
    Glyph: { char: '@', fg: CONFIG.colours.playerText, bg: CONFIG.colours.player },
    Player: {},
    Prey: {},
    // clip: your view is screen-shaped, so you never see or remember off-screen tiles.
    Vision: { eyesight: CONFIG.player.eyesight, visible: new Map(), clip: { x: Math.floor(CONFIG.view.tilesAcross / 2), y: CONFIG.view.sightHalfHeight } },
    Hearing: { level: CONFIG.player.hearing },
    Health: { hp: CONFIG.player.health, max: CONFIG.player.health },
    Melee: { ...CONFIG.player.melee },
    Inventory: { items: [], capacity: CONFIG.inventory.capacity, wielded: null },
    Keyring: { keys: [] }, // keys don't take bag slots
    Noisy: { move: CONFIG.player.footsteps },
    Stealth: { sneaking: false, walkFootsteps: CONFIG.player.footsteps, sneakFootsteps: CONFIG.player.sneakFootsteps },
    Actor: { speed: CONFIG.player.speed, energy: CONFIG.scheduler.actionCost, actions: 0 },
    Blocks: {},
    Name: { name: 'you' },
  });

  world.start = { x: start.x, y: start.y };
  world.entities.get(world.playerId).Memory = createMemory(world); // snapshots of tiles as last seen
  if (map === 'village') populateVillage(world); // step 14d: loot, keys and zombies
  else {
    makeZombie(world, spawnTile(world, start, CONFIG.zombie.spawnMinDistance, CONFIG.zombie.spawnMaxDistance));
    scatterTestItems(world);
  }
  installVision(world);
  installMemory(world);
  installNoise(world);
  installShamble(world);
  updateLight(world, true); // the time of day's light (and vision)
  return world;
}

// A zombie at pos. Every zombie is made here (the test grid's one, the village's crowd).
export function makeZombie(world, pos) {
  return addEntity(world, {
    Position: { x: pos.x, y: pos.y },
    Glyph: { char: 'Z', fg: CONFIG.colours.zombieText, bg: CONFIG.colours.zombie },
    Actor: { speed: CONFIG.zombie.speed, energy: 0, actions: 0 },
    Vision: { eyesight: CONFIG.zombie.eyesight, visible: new Map() },
    Hearing: { level: CONFIG.zombie.hearing },
    Health: { hp: CONFIG.zombie.health, max: CONFIG.zombie.health },
    Melee: { ...CONFIG.zombie.melee },
    Noisy: { move: CONFIG.zombie.footsteps },
    Brain: { type: 'shamble', goal: null, seesPrey: false, trackingId: null, reacting: 0 }, // goal: { x, y, why: 'seen' | 'heard' }
    Blocks: {},
    Name: { name: 'zombie' },
  });
}

export function addEntity(world, components) {
  const id = world.nextId++;
  world.entities.set(id, { id, ...components });
  return id;
}

export function query(world, ...components) {
  const out = [];
  for (const e of world.entities.values()) {
    if (components.every((c) => c in e)) out.push(e);
  }
  return out;
}

export function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function tileAt(world, x, y) {
  return world.tiles[y * world.width + x];
}

// What stops movement into (x, y): null if open, { tile: true } for walls/edges,
// or { entity } for a blocking entity.
export function blockerAt(world, x, y) {
  if (!inBounds(world, x, y) || TILE_INFO[tileAt(world, x, y)].blocks) return { tile: true };
  // (entities never stand on blocking tiles, so checking the tile first is safe)
  for (const e of query(world, 'Position', 'Blocks')) {
    if (e.Position.x === x && e.Position.y === y) return { entity: e };
  }
  return null;
}

export function isPassable(world, x, y) {
  return blockerAt(world, x, y) === null;
}

// Try to step an entity by (dx, dy). Emits entity_moved or move_blocked.
export function tryMove(world, e, dx, dy) {
  const nx = e.Position.x + dx, ny = e.Position.y + dy;
  const blocker = blockerAt(world, nx, ny);
  if (blocker) {
    world.events.emit('move_blocked', { id: e.id, x: nx, y: ny, blockerId: blocker.entity ? blocker.entity.id : null });
    return false;
  }
  const from = { x: e.Position.x, y: e.Position.y };
  e.Position.x = nx; e.Position.y = ny;
  // Rough ground (hedge, stream) makes the step take longer: the scheduler charges it.
  if (e.Actor) e.Actor.nextCost = CONFIG.scheduler.actionCost * TILE_INFO[tileAt(world, nx, ny)].moveCost;
  world.events.emit('entity_moved', { id: e.id, from, to: { x: nx, y: ny } });
  return true;
}

// A random open tile at least minDist (Chebyshev) from `from`; farthest open tile if none.
function spawnTile(world, from, minDist, maxDist = Infinity) {
  const open = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const d = Math.max(Math.abs(x - from.x), Math.abs(y - from.y));
      if (d <= maxDist && isPassable(world, x, y)) open.push({ x, y, d });
    }
  }
  const far = open.filter((t) => t.d >= minDist);
  if (far.length) { const t = far[world.rng.int(far.length)]; return { x: t.x, y: t.y }; }
  const t = open.reduce((a, b) => (b.d > a.d ? b : a));
  return { x: t.x, y: t.y };
}

function nearestOpenTile(world, cx, cy) {
  for (let r = 0; r < Math.max(world.width, world.height); r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (isPassable(world, x, y)) return { x, y };
      }
    }
  }
  throw new Error('No open tile for player');
}
