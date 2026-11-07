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
    turn: 0,              // player actions taken
    tick: 0,              // scheduler ticks (world time)
    inputs: [],           // every player input, in order, for replay
  };
  const start = generateTestScreen(world, CONFIG.testScreen);
  const player = addEntity(world, {
    Position: { x: start.x, y: start.y },
    Glyph: { ch: '@', colour: CONFIG.colours.player },
    Name: { name: 'you' },
    Player: {},
    Prey: {},
    Blocks: {},
    Actor: { speed: CONFIG.player.speed, energy: CONFIG.scheduler.actionCost },
  });
  world.playerId = player.id;
  const zpos = placeTestZombie(world, start, CONFIG.testScreen.zombieDist);
  if (zpos) makeZombie(world, zpos.x, zpos.y);
  return world;
}

export function makeZombie(world, x, y) {
  return addEntity(world, {
    Position: { x, y },
    Glyph: { ch: 'Z', colour: CONFIG.colours.zombie },
    Name: { name: 'zombie' },
    Zombie: {},
    Blocks: {},
    Actor: { speed: CONFIG.zombie.speed, energy: 0, brain: 'shamble' },
  });
}

// A random open floor tile within [min, max] steps (4-way distance) of the start.
function placeTestZombie(world, start, [min, max]) {
  const spots = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const d = Math.abs(x - start.x) + Math.abs(y - start.y);
      if (d >= min && d <= max && !tileBlocks(world, x, y) && !blockerAt(world, x, y)) spots.push({ x, y });
    }
  }
  return spots.length ? spots[world.rng.int(spots.length)] : null;
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
