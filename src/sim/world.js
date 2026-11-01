// World state: tiles + entities (plain objects holding data components).
// Never touches the DOM or canvas.
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { generateTestGrid, TILE_INFO } from './gen/testgrid.js';

export function createWorld(seed) {
  const { width, height } = CONFIG.grid;
  const rng = createRng(seed);
  const world = {
    seed, rng, width, height,
    tiles: generateTestGrid(rng, width, height),
    entities: new Map(),
    nextId: 1,
    turn: 0,
    inputs: [],   // every player input, in order, so runs replay from seed + inputs
    playerId: null,
  };

  // Player starts on the floor tile nearest the centre.
  const start = nearestOpenTile(world, width >> 1, height >> 1);
  world.playerId = addEntity(world, {
    Position: { x: start.x, y: start.y },
    Glyph: { char: '@', fg: CONFIG.colours.playerText, bg: CONFIG.colours.player },
    Player: {},
    Blocks: {},
    Name: { name: 'you' },
  });
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

export function isPassable(world, x, y) {
  if (!inBounds(world, x, y)) return false;
  if (TILE_INFO[tileAt(world, x, y)].blocks) return false;
  for (const e of query(world, 'Position', 'Blocks')) {
    if (e.Position.x === x && e.Position.y === y) return false;
  }
  return true;
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
