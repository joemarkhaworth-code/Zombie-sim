// The world: tiles, entities (plain component bags), RNG, events, turn counter, recorded inputs.
import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { createEvents } from './events.js';
import { generateTestScreen, generatePlaceholderTown, TILE_INFO } from './gen/testscreen.js';
import { initLight } from './systems/light.js';
import { updatePlayerView } from './systems/vision.js';
import { makeItem, makeInventory } from './systems/items.js';

// map: 'town' (a grid of CONFIG.world.screens screens) or 'testscreen' (one walled room).
export function createWorld(seed, opts = {}) {
  const map = opts.map || CONFIG.world.map;
  const [screensX, screensY] = map === 'town' ? CONFIG.world.screens : [1, 1];
  // Neighbouring screens overlap: step onto the second-to-last tile of a screen (world.flipAt)
  // and the view flips to the next screen, where you're landIn (2) tiles in, with the tiles you
  // just crossed still behind you, so there's always a tile to tap either way.
  const screenW = CONFIG.screen.w, screenH = CONFIG.screen.h;
  const overlap = CONFIG.world.flipAt + CONFIG.world.landIn + 1;
  const stepX = screenW - overlap, stepY = screenH - overlap;
  const w = stepX * screensX + overlap, h = stepY * screensY + overlap;
  const world = {
    seed, map,
    rng: createRng(seed),
    events: createEvents(),
    w, h, screenW, screenH, screensX, screensY, stepX, stepY, overlap,
    cam: { sx: screensX >> 1, sy: screensY >> 1 }, // the screen you're looking at
    tiles: new Uint8Array(w * h),
    entities: new Map(),  // id -> { id, ...components }
    nextId: 1,
    playerId: 0,
    noise: new Int16Array(w * h), // heard since your last action (debug heatmap)
    gameOver: null,       // { cause, killerName, heldName, turn, tick } once the player dies
    stats: { kills: 0 },  // zombies you've put down
    turn: 0,              // player actions taken
    tick: 0,              // scheduler ticks (world time)
    inputs: [],           // every player input, in order, for replay
  };
  // The layout: the test room from the run seed, or the town from the fixed world seed.
  const start = map === 'town'
    ? generatePlaceholderTown(world, createRng(CONFIG.world.seed), CONFIG.testScreen)
    : generateTestScreen(world, CONFIG.testScreen);
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
  if (map === 'town') {
    populateTown(world, start);
  } else {
    const zpos = placeTestZombie(world, start, CONFIG.testScreen.zombieDist);
    if (zpos) makeZombie(world, zpos.x, zpos.y);
    scatterItems(world, start, CONFIG.testScreen.items);
  }
  updatePlayerView(world);
  return world;
}

// The placeholder town's zombies and items, from the run seed: a few on each screen, none on
// your first screen.
function populateTown(world, start) {
  const cfg = CONFIG.world, rng = world.rng;
  const home = world.cam;
  const homeRect = cameraRect(world);
  const between = ([lo, hi]) => lo + rng.int(hi - lo + 1);
  for (let sy = 0; sy < world.screensY; sy++) {
    for (let sx = 0; sx < world.screensX; sx++) {
      const spots = [];
      const r = screenRect(world, sx, sy);
      // Tiles whose home screen is this one, never on the screen you start on.
      for (let y = r.oy; y < r.oy + world.screenH; y++) {
        for (let x = r.ox; x < r.ox + world.screenW; x++) {
          const h = screenOf(world, x, y);
          if (h.sx !== sx || h.sy !== sy || tileBlocks(world, x, y) || inRect(world, homeRect, x, y)) continue;
          spots.push({ x, y });
        }
      }
      const take = () => spots.splice(rng.int(spots.length), 1)[0];
      const items = between(cfg.itemsPerScreen);
      for (let i = 0; i < items && spots.length; i++) { const { x, y } = take(); makeItem(world, cfg.itemTypes[rng.int(cfg.itemTypes.length)], x, y); }
      if (sx === home.sx && sy === home.sy) continue;
      const zs = between(cfg.zombiesPerScreen);
      for (let i = 0; i < zs && spots.length; i++) { const { x, y } = take(); makeZombie(world, x, y); }
    }
  }
}

// Screen (sx, sy)'s top-left tile. Screens overlap, so a tile near an edge is on two (or four).
export function screenRect(world, sx, sy) {
  return { sx, sy, ox: sx * world.stepX, oy: sy * world.stepY };
}

export function cameraRect(world) {
  return screenRect(world, world.cam.sx, world.cam.sy);
}

export function inRect(world, r, x, y) {
  return x >= r.ox && x < r.ox + world.screenW && y >= r.oy && y < r.oy + world.screenH;
}

// A tile's "home" screen (the one it's furthest into the middle of; for placing and for which
// screens run).
export function screenOf(world, x, y) {
  const clamp = (v, n) => Math.min(Math.max(v, 0), n - 1);
  const sx = clamp(Math.floor((x - 1) / world.stepX), world.screensX);
  const sy = clamp(Math.floor((y - 1) / world.stepY), world.screensY);
  return screenRect(world, sx, sy);
}

// Every screen a tile is on.
function screensAt(world, x, y) {
  const out = [];
  for (let sy = 0; sy < world.screensY; sy++) {
    for (let sx = 0; sx < world.screensX; sx++) if (inRect(world, screenRect(world, sx, sy), x, y)) out.push(sx + ',' + sy);
  }
  return out;
}

// Can a and b be on the same screen? You're only ever on the screen you're looking at; anything
// else is on every screen its tile is on.
export function sameScreen(world, a, b) {
  const on = e => (e.Player ? [world.cam.sx + ',' + world.cam.sy] : screensAt(world, e.Position.x, e.Position.y));
  const sa = on(a);
  return on(b).some(k => sa.includes(k));
}

// After you move: step onto the flip tile (world.flipAt in from the edge) of the screen you're
// looking at and the view flips to the next screen that way. If you're somehow off the screen (loading, tests), look at your
// home screen.
export function updateCamera(world) {
  const p = world.entities.get(world.playerId);
  if (!p || !p.Position) return;
  const { x, y } = p.Position;
  const r = cameraRect(world);
  if (!inRect(world, r, x, y)) {
    const home = screenOf(world, x, y);
    world.cam = { sx: home.sx, sy: home.sy };
    return;
  }
  const f = CONFIG.world.flipAt;
  if (x >= r.ox + world.screenW - 1 - f && world.cam.sx < world.screensX - 1) world.cam.sx++;
  else if (x <= r.ox + f && world.cam.sx > 0) world.cam.sx--;
  if (y >= r.oy + world.screenH - 1 - f && world.cam.sy < world.screensY - 1) world.cam.sy++;
  else if (y <= r.oy + f && world.cam.sy > 0) world.cam.sy--;
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
