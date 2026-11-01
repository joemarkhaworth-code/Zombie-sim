// World state: tiles + entities (plain objects holding data components).
// Never touches the DOM or canvas.
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { generateTestGrid, TILE_INFO } from './gen/testgrid.js';
import { createEventBus } from './events.js';
import { installVision, refreshAllVision } from './systems/vision.js';

export function createWorld(seed) {
  const { width, height } = CONFIG.grid;
  const rng = createRng(seed);
  const world = {
    seed, rng, width, height,
    tiles: generateTestGrid(rng, width, height),
    light: new Uint8Array(width * height).fill(CONFIG.light.ambient), // light level 0-3 per tile
    entities: new Map(),
    events: createEventBus(),
    nextId: 1,
    turn: 0,      // player turns taken
    tick: 0,      // scheduler ticks elapsed
    inputs: [],   // every player input, in order, so runs replay from seed + inputs
    playerId: null,
  };

  // Player starts on the floor tile nearest the centre.
  const start = nearestOpenTile(world, width >> 1, height >> 1);
  world.playerId = addEntity(world, {
    Position: { x: start.x, y: start.y },
    Glyph: { char: '@', fg: CONFIG.colours.playerText, bg: CONFIG.colours.player },
    Player: {},
    Prey: {},
    Vision: { level: CONFIG.player.sight, visible: new Map() },
    Actor: { speed: CONFIG.player.speed, energy: CONFIG.scheduler.actionCost, actions: 0 },
    Blocks: {},
    Name: { name: 'you' },
  });

  const zpos = spawnTile(world, start, CONFIG.zombie.spawnMinDistance);
  addEntity(world, {
    Position: zpos,
    Glyph: { char: 'Z', fg: CONFIG.colours.zombieText, bg: CONFIG.colours.zombie },
    Actor: { speed: CONFIG.zombie.speed, energy: 0, actions: 0 },
    Vision: { level: CONFIG.zombie.sight, visible: new Map() },
    Brain: { type: 'shamble', lastSeen: null },
    Blocks: {},
    Name: { name: 'zombie' },
  });

  installVision(world);
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
