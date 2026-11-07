// The world: tiles, entities (plain component bags), RNG, events, turn counter, recorded inputs.
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { createEvents } from './events.js';
import { generateTestScreen, TILE_INFO } from './gen/testscreen.js';
import { initLight } from './systems/light.js';
import { updatePlayerView } from './systems/vision.js';
import { makeItem, makeInventory } from './systems/items.js';

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
    noise: new Int16Array(CONFIG.screen.w * CONFIG.screen.h), // heard since your last action (debug heatmap)
    gameOver: null,       // { cause, killerName, turn } once the player dies
    turn: 0,              // player actions taken
    tick: 0,              // scheduler ticks (world time)
    inputs: [],           // every player input, in order, for replay
  };
  const start = generateTestScreen(world, CONFIG.testScreen);
  initLight(world);
  const player = addEntity(world, {
    Position: { x: start.x, y: start.y },
    Glyph: { ch: '@', colour: CONFIG.colours.player },
    Name: { name: 'you' },
    Player: {},
    Prey: {},
    Blocks: {},
    Actor: { speed: CONFIG.player.speed, energy: CONFIG.scheduler.actionCost },
    Vision: { eyesight: CONFIG.player.eyesight },
    Memory: { tiles: {} },
    Health: { hp: CONFIG.player.hearts * 2, max: CONFIG.player.hearts * 2 },
    Melee: { ...CONFIG.player.melee },
    Hearing: { level: CONFIG.player.hearing },
    Noisy: { move: CONFIG.player.footsteps },
    Inventory: makeInventory(CONFIG.player.bag.cols, CONFIG.player.bag.rows),
  });
  world.playerId = player.id;
  if (CONFIG.player.startHolding) player.Inventory.hand = makeItem(world, CONFIG.player.startHolding).id;
  const zpos = placeTestZombie(world, start, CONFIG.testScreen.zombieDist);
  if (zpos) makeZombie(world, zpos.x, zpos.y);
  scatterItems(world, start, CONFIG.testScreen.items);
  updatePlayerView(world);
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
    Vision: { eyesight: CONFIG.zombie.eyesight },
    Hearing: { level: CONFIG.zombie.hearing },
    Noisy: { move: CONFIG.zombie.footsteps },
    Health: { hp: CONFIG.zombie.health, max: CONFIG.zombie.health },
    Melee: { ...CONFIG.zombie.melee },
    // goal: { x, y, why: 'seen' | 'glimpsed' | 'heard' } | null; glimpsed: prey id it stared at last look; search: { x, y, left } | null; tracking: prey id it saw last look
    Brain: { goal: null, search: null, tracking: 0, glimpsed: 0, distracted: null },
  });
}

// Test items on random open floor, not on anyone and not on another item.
function scatterItems(world, start, types) {
  const spots = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (tileBlocks(world, x, y) || blockerAt(world, x, y) || (x === start.x && y === start.y)) continue;
      spots.push({ x, y });
    }
  }
  for (const type of types) {
    if (!spots.length) return;
    const { x, y } = spots.splice(world.rng.int(spots.length), 1)[0];
    makeItem(world, type, x, y);
  }
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
