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

// opts.map: 'village' (default from CONFIG.world.map) or 'testgrid' (the phase-1 grid).
export function createWorld(seed, opts = {}) {
  const map = opts.map || CONFIG.world.map;
  const { width, height } = map === 'village' ? CONFIG.village : CONFIG.grid;
  const rng = createRng(seed);
  let tiles, plots = [], lane = null;
  if (map === 'village') ({ tiles, plots, lane } = generateVillage(rng, width, height));
  else tiles = generateTestGrid(rng, width, height);
  const world = {
    seed, rng, width, height, map,
    plots, // village: empty building plots { x, y, w, h, gate, side } for step 14b
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
  initTileHp(world, (t) => !!TILE_INFO[t].material && TILE_INFO[t].blocks);

  // Player starts in the middle of the map: on the lane in the village, else the nearest open tile.
  const start = map === 'village' ? nearestTileOf(world, width >> 1, height >> 1, TILE.LANE) : nearestOpenTile(world, width >> 1, height >> 1);
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

  const zpos = spawnTile(world, start, CONFIG.zombie.spawnMinDistance);
  addEntity(world, {
    Position: zpos,
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

  world.entities.get(world.playerId).Memory = createMemory(world); // snapshots of tiles as last seen
  scatterTestItems(world);
  installVision(world);
  installMemory(world);
  installNoise(world);
  installShamble(world);
  refreshAllVision(world);
  return world;
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
function spawnTile(world, from, minDist) {
  const open = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (isPassable(world, x, y)) open.push({ x, y, d: Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) });
    }
  }
  const far = open.filter((t) => t.d >= minDist);
  if (far.length) { const t = far[world.rng.int(far.length)]; return { x: t.x, y: t.y }; }
  const t = open.reduce((a, b) => (b.d > a.d ? b : a));
  return { x: t.x, y: t.y };
}

function nearestTileOf(world, cx, cy, type) {
  let best = null, bd = Infinity;
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
    if (world.tiles[y * world.width + x] !== type || !isPassable(world, x, y)) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best || nearestOpenTile(world, cx, cy);
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
