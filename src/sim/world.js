// The world: tiles, entities (plain component bags), RNG, events, turn counter, recorded inputs.
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { createEvents } from './events.js';
import { generateTestScreen, TILE_INFO } from './gen/testscreen.js';

export function createWorld(seed) {
  const { w, h } = CONFIG.screen;
  const world = {
    seed,
    rng: createRng(seed),
    events: createEvents(),
    w, h,
    tiles: new Uint8Array(w * h),
    entities: new Map(),  // id -> { id, ...components }
    nextId: 1,
    playerId: 0,
    turn: 0,
    inputs: [],           // every player input, in order, for replay
  };
  const start = generateTestScreen(world, CONFIG.testScreen);
  const player = addEntity(world, {
    Position: { x: start.x, y: start.y },
    Glyph: { ch: '@', colour: CONFIG.colours.player },
    Name: { name: 'you' },
    Player: {},
    Blocks: {},
  });
  world.playerId = player.id;
  return world;
}

export function addEntity(world, components) {
  const e = { id: world.nextId++, ...components };
  world.entities.set(e.id, e);
  return e;
}

export function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.w && y < world.h;
}

export function tileAt(world, x, y) {
  return world.tiles[y * world.w + x];
}

export function tileBlocks(world, x, y) {
  return !inBounds(world, x, y) || TILE_INFO[tileAt(world, x, y)].blocks;
}

export function blockerAt(world, x, y) {
  for (const e of world.entities.values()) {
    if (e.Blocks && e.Position && e.Position.x === x && e.Position.y === y) return e;
  }
  return null;
}

export function player(world) {
  return world.entities.get(world.playerId);
}
