// Headless test run: drive the sim for N turns without rendering.
// Usage: node tests/headless.js [turns] [seed]
import { createWorld as createWorldAny, tileAt, inBounds, query, isPassable } from '../src/sim/world.js';
// Most tests below were written for the phase-1 test grid; default to it. Village tests pass { map: 'village' }.
const createWorld = (seed, opts = {}) => createWorldAny(seed, { map: 'testgrid', ...opts });
import { TILE_INFO, TILE } from '../src/sim/gen/testgrid.js';
import { refreshAllVision, canSee, lineClear, visibilityAt, sightRadius } from '../src/sim/systems/vision.js';
import { rememberedAt } from '../src/sim/systems/memory.js';
import { spreadNoise, makeNoise } from '../src/sim/systems/noise.js';
import { wound } from '../src/sim/systems/bleeding.js';
import { makeItem, usedSlots, itemsAt, meleeStats } from '../src/sim/systems/items.js';
import { validTargets } from '../src/sim/systems/ranged.js';
import { makeDoor, makeWindow, structureAt } from '../src/sim/systems/structures.js';
import { serialize, deserialize, SaveError } from '../src/sim/save.js';
import { dayOf, daysSurvived, clockOf } from '../src/sim/time.js';
import { deathText } from '../src/render/messages.js';
import { TUNABLES, getPath, nudge, applyOverrides, currentOverrides, resetAll, syncWorld, defaultOf } from '../src/sim/tuning.js';
import { addEntity } from '../src/sim/world.js';
import { playerAct, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { CONFIG } from '../src/config.js';
import { createEventBus } from '../src/sim/events.js';
import { createMessageLog, PRIORITY, describeTile } from '../src/render/messages.js';

const TURNS = Number(process.argv[2] ?? 5000);
const SEEDS = process.argv[3] ? [Number(process.argv[3])] : [1, 42, 12345, 999999];

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function snapshot(world) {
  const ents = [...world.entities.values()].map((e) => [e.id, e.Position, e.Actor]);
  return JSON.stringify({ turn: world.turn, tick: world.tick, ents, rng: world.rng.state });
}

function checkPositions(world, seed) {
  const seen = new Set();
  for (const e of query(world, 'Position')) {
    const { x, y } = e.Position;
    assert(inBounds(world, x, y), `seed ${seed}: entity ${e.id} out of bounds at ${x},${y}`);
    assert(!TILE_INFO[tileAt(world, x, y)].blocks, `seed ${seed}: entity ${e.id} inside a wall`);
    if (e.Blocks) {
      const k = `${x},${y}`;
      assert(!seen.has(k), `seed ${seed}: two blocking entities on ${k}`);
      seen.add(k);
    }
  }
}

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const zombieOf = (world) => query(world, 'Brain')[0];
const playerOf = (world) => world.entities.get(world.playerId);

// 0. Event bus basics.
{
  const bus = createEventBus();
  const got = [];
  const off = bus.on('x', (d) => got.push(d.n));
  bus.emit('x', { n: 1 }); off(); bus.emit('x', { n: 2 }); bus.emit('nobody_listens');
  assert(got.length === 1 && got[0] === 1, 'event bus on/off/emit');
}

for (const seed of SEEDS) {
  // 1. Random play: no crashes, no illegal positions, replay is exact.
  const world = createWorld(seed);
  const counts = {};
  const moves = new Map(); // id -> moves seen via events
  for (const t of ['action_attempted', 'entity_moved', 'move_blocked', 'entity_waited', 'entity_staggered', 'turn_ended', 'prey_spotted', 'prey_lost', 'entity_seen', 'noise_made', 'noise_heard', 'noise_investigated', 'entity_shoved', 'item_picked_up', 'item_used', 'item_dropped', 'item_thrown', 'shot_fired']) {
    world.events.on(t, (d) => {
      counts[t] = (counts[t] || 0) + 1;
      if (t === 'entity_moved') {
        assert(cheb(d.from, d.to) === 1, `seed ${seed}: entity_moved jumped ${JSON.stringify(d)}`);
        const e = world.entities.get(d.id);
        assert(e.Position.x === d.to.x && e.Position.y === d.to.y, `seed ${seed}: entity_moved before position updated`);
      }
    });
  }
  const log = createMessageLog(world);
  let sawDanger = false;
  const everSeen = new Set(playerOf(world).Vision.visible.keys());
  const playerMemory = playerOf(world).Memory; // kept even if the player dies
  const driver = createRng(seed ^ 0xabcdef); // fake player input, separate from the sim RNG
  let acted = 0;
  for (let i = 0; i < TURNS; i++) {
    const r = driver.int(10);
    const dir = { dx: driver.int(3) - 1, dy: driver.int(3) - 1 };
    const inv = playerOf(world)?.Inventory.items || [];
    const pick = inv.length ? inv[driver.int(inv.length)] : null;
    const action = r === 0 ? { type: 'wait' } : r === 1 ? { type: 'shove', ...dir }
      : r === 2 && pick ? { type: driver.chance(0.5) ? 'use' : 'drop', itemId: pick }
      : r === 3 ? { type: 'pickup' }
      : r === 4 && pick ? { type: 'throw', itemId: pick, x: playerOf(world).Position.x + driver.int(7) - 3, y: playerOf(world).Position.y + driver.int(7) - 3 }
      : r === 5 ? { type: 'fire', x: playerOf(world).Position.x + driver.int(9) - 4, y: playerOf(world).Position.y + driver.int(9) - 4 }
      : { type: 'move', ...dir };
    if (playerAct(world, action)) acted++;
    checkPositions(world, seed);
    for (const k of (playerOf(world) || world.fallenPlayer).Vision.visible.keys()) everSeen.add(k);
    if (world.gameOver) break;
    const m = log.message;
    if (m) assert(typeof m.text === 'string' && m.text.length <= 32, `seed ${seed}: bad message ${JSON.stringify(m)}`);
    if (m && m.priority === PRIORITY.danger) sawDanger = true;
  }
  // Map memory = exactly the tiles ever seen; terrain matches (tiles don't change yet); no creatures.
  const mem = playerMemory.tiles;
  for (let i = 0; i < mem.length; i++) {
    assert(!!mem[i] === everSeen.has(i), `seed ${seed}: memory mismatch at tile ${i} (remembered ${!!mem[i]}, seen ${everSeen.has(i)}, dead ${!!world.gameOver})`);
    if (mem[i]) {
      assert(mem[i].tile === world.tiles[i], `seed ${seed}: remembered wrong tile at ${i}`);
      assert(mem[i].things.every((t) => t.name !== 'zombie' && t.name !== 'you'), `seed ${seed}: a creature got into memory at ${i}`);
    }
  }
  assert(JSON.parse(JSON.stringify(mem)).length === mem.length, 'memory should be plain, saveable data');
  assert(counts.turn_ended === acted, `seed ${seed}: turn_ended ${counts.turn_ended} != ${acted}`);
  assert(world.gameOver || counts.action_attempted === TURNS, `seed ${seed}: action_attempted ${counts.action_attempted} != ${TURNS}`);
  assert(counts.move_blocked > 0 && counts.entity_moved > 0 && counts.noise_made > 0, `seed ${seed}: missing events ${JSON.stringify(counts)}`);
  if (counts.prey_spotted) assert(sawDanger || world.gameOver, `seed ${seed}: never warned that the zombie was adjacent`);
  assert((counts.prey_spotted || 0) < acted / 10 + 1, `seed ${seed}: 'spotted' fired ${counts.prey_spotted} times - spamming`);
  assert(world.turn === acted, `seed ${seed}: turn ${world.turn} != actions ${acted}`);
  assert(world.inputs.length === acted, `seed ${seed}: inputs not recorded`);
  assert(!playerAct(world, { type: 'move', dx: 2, dy: 0 }), 'non-adjacent move accepted');
  if (world.gameOver) assert(!playerAct(world, { type: 'wait' }), `seed ${seed}: dead player should not act`);

  // Scheduler: actions match speed ratio.
  const z = zombieOf(world) || { Actor: { actions: NaN } };
  const expected = Math.floor((acted * CONFIG.zombie.speed) / CONFIG.player.speed);
  if (zombieOf(world)) assert(Math.abs(z.Actor.actions - expected) <= 1, `seed ${seed}: zombie acted ${z.Actor.actions}, expected ~${expected}`);

  const replayed = replay(createWorld, seed, world.inputs);
  assert(snapshot(replayed) === snapshot(world), `seed ${seed}: replay diverged`);

  console.log(`seed ${seed}: ${world.turn} turns OK${world.gameOver ? ` (died: ${world.gameOver.cause})` : ''}, events ${JSON.stringify(counts)}, zombie acted ${z.Actor.actions}x, replay matches`);
}
// 2. Stress: long runs with an unkillable player, to catch crashes and runaway behaviour.
for (const seed of SEEDS) {
  const world = createWorld(seed);
  const p = playerOf(world);
  p.Health.hp = p.Health.max = 1e9;
  const driver = createRng(seed ^ 0x51ced);
  for (let i = 0; i < TURNS; i++) {
    const r = driver.int(10);
    playerAct(world, r === 0 ? { type: 'wait' } : { type: 'move', dx: driver.int(3) - 1, dy: driver.int(3) - 1 });
    checkPositions(world, seed);
  }
  for (const v of world.blood) assert(v <= 3, 'stress: blood level out of range');
  console.log(`stress seed ${seed}: ${world.turn} turns OK, zombie ${zombieOf(world) ? 'alive' : 'killed'}, blood tiles ${world.blood.filter(Boolean).length}`);
}

// 3. Field of view and zombie sight, on a hand-made open map.
function openWorld(walls = []) {
  const w = createWorld(7);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    const edge = x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1;
    w.tiles[y * w.width + x] = edge ? TILE.WALL : TILE.FLOOR;
  }
  for (const [x, y] of walls) w.tiles[y * w.width + x] = TILE.WALL;
  for (const e of query(w, 'Item')) w.entities.delete(e.id); // no scattered test items
  for (const e of query(w, 'Structure')) w.entities.delete(e.id); // no test building
  w.structures.clear(); w.glass.fill(0);
  playerOf(w).Memory.tiles.fill(null); // forget the generated map
  return w;
}
function place(w, e, x, y) { e.Position.x = x; e.Position.y = y; refreshAllVision(w); }
const seesTile = (w, e, x, y) => e.Vision.visible.has(y * w.width + x);
const range = (e) => sightRadius(e);

{ // Walls block sight; range is limited.
  const w = openWorld([[7, 5]]);
  const p = playerOf(w);
  place(w, p, 5, 5);
  place(w, zombieOf(w), 18, 26);
  assert(seesTile(w, p, 7, 5), 'fov: wall itself should be visible');
  assert(!seesTile(w, p, 8, 5) && !seesTile(w, p, 9, 5), 'fov: tiles behind a wall should be hidden');
  const clip = p.Vision.clip;
  assert(seesTile(w, p, 5, 5 + clip.y) && seesTile(w, p, 5 - 4, 5 + clip.y), 'fov: the whole screen-shaped box is visible on a clear day');
  assert(!seesTile(w, p, 5, 5 + clip.y + 1), 'fov: nothing below the screen box');
  place(w, p, 10, 10);
  assert(seesTile(w, p, 10 + clip.x, 10) && !seesTile(w, p, 10 + clip.x + 1, 10), 'fov: nothing beyond the screen sides, even in range');
  // Light range on its own (zombies have no screen box).
  const z = zombieOf(w);
  place(w, z, 2, 2);
  assert(seesTile(w, z, 2, 2 + range(z)) && !seesTile(w, z, 2, 2 + range(z) + 1), 'fov: light range limits distance');
  const saved = CONFIG.light.range;
  CONFIG.light.range = 3; refreshAllVision(w);
  assert(seesTile(w, p, 10, 13) && !seesTile(w, p, 10, 15), 'fov: shorter light range should shorten sight');
  CONFIG.light.range = saved; refreshAllVision(w);
  console.log('fov: walls block sight, screen box + light range limit distance OK');
}

{ // No peeking through diagonal gaps; sight is symmetric; clear-day light covers the screen.
  const w = openWorld([[11, 10], [10, 11]]);
  const p = playerOf(w);
  place(w, p, 10, 10);
  assert(!seesTile(w, p, 11, 11) && !seesTile(w, p, 12, 12), 'fov: should not see through a diagonal gap');
  const w2 = createWorld(3);
  for (const a of w2.tiles.keys()) {
    const ax = a % w2.width, ay = Math.floor(a / w2.width);
    if (TILE_INFO[w2.tiles[a]].opaque) continue;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const bx = ax + dx, by = ay + dy;
      if (!inBounds(w2, bx, by) || TILE_INFO[tileAt(w2, bx, by)].opaque) continue;
      assert(lineClear(w2, ax, ay, bx, by) === lineClear(w2, bx, by, ax, ay), `fov: asymmetric between ${ax},${ay} and ${bx},${by}`);
    }
  }
  // Tall phone (20:9): ~5 tiles each side, ~11 up/down -> corner ~12.1 tiles away.
  assert(CONFIG.light.range >= Math.ceil(Math.hypot(Math.floor(CONFIG.view.tilesAcross / 2), 11)), 'config: clear-day light range does not cover the screen');
  console.log('fov: diagonal gaps blocked, symmetric, light covers screen OK');
}

{ // Visibility levels come from light, not distance; darkness hides; spot threshold.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 14); place(w, z, 18, 26);
  const lv = (x, y) => visibilityAt(w, p, x, y);
  for (const v of p.Vision.visible.values()) assert(v === CONFIG.light.ambient, `levels: clear day should be uniform, got ${v}`);
  assert(lv(10, 14) === 3 && lv(10, 22) === 3, 'levels: near and far tiles equally visible in daylight');

  w.light[16 * w.width + 10] = 1; w.light[17 * w.width + 10] = 2; refreshAllVision(w);
  assert(lv(10, 16) === 1 && lv(10, 17) === 2 && lv(10, 18) === 3, 'levels: visibility should equal tile light');

  w.light.fill(0); place(w, z, 11, 14);
  assert(lv(10, 14) === 1, 'levels: you always see your own tile');
  assert(lv(11, 14) === 0 && !canSee(w, p, z) && !canSee(w, z, p), 'levels: in pitch dark nobody sees anybody');

  w.light.fill(CONFIG.light.ambient); w.light[17 * w.width + 10] = 1; place(w, z, 10, 17);
  const saved = CONFIG.vision.minLevelToSpot;
  CONFIG.vision.minLevelToSpot = 2;
  assert(!canSee(w, p, z), 'levels: a zombie on a dim tile should not be noticed when level 2 is needed');
  CONFIG.vision.minLevelToSpot = saved;
  assert(canSee(w, p, z), 'levels: a dim zombie is noticed at the default threshold');
  console.log('levels: from light, darkness hides, spot threshold OK');
}

{ // You never remember tiles the screen couldn't have shown you.
  for (const seed of [1, 3, 42]) {
    const w = createWorld(seed);
    const p = playerOf(w), clip = p.Vision.clip;
    const visited = [{ ...p.Position }];
    const drv = createRng(seed);
    for (let i = 0; i < 200 && !w.gameOver; i++) {
      playerAct(w, { type: 'move', dx: drv.int(3) - 1, dy: drv.int(3) - 1 });
      if (playerOf(w)) visited.push({ ...playerOf(w).Position });
    }
    (playerOf(w) || w.fallenPlayer).Memory.tiles.forEach((m, i) => {
      if (!m) return;
      const x = i % w.width, y = Math.floor(i / w.width);
      assert(visited.some((v) => Math.abs(x - v.x) <= clip.x && Math.abs(y - v.y) <= clip.y), `memory: seed ${seed} remembers ${x},${y}, never on screen`);
    });
  }
  console.log('memory: only tiles that were on screen OK');
}

{ // Off the side of the screen: not seen at all (screen-shaped view), so never announced.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 12, 10); // 7 tiles to the side: within light range, off screen
  const log = createMessageLog(w);
  playerAct(w, { type: 'wait' });
  assert(!canSee(w, p, z), 'onscreen: zombie off the side of the screen is not seen');
  assert(log.message?.text !== 'A zombie comes into view.', 'onscreen: off-screen zombie should not be announced');
  // The render-side on-screen filter still applies on top (e.g. camera clamped at map edges).
  place(w, z, 7, 10);
  const offLog = createMessageLog(w, { onScreen: () => false });
  playerAct(w, { type: 'wait' });
  assert(canSee(w, p, z) && offLog.message?.text !== 'A zombie comes into view.', 'onscreen: filter suppresses announcements');
  console.log('onscreen: off-screen zombies not seen or announced OK');
}

{ // Map memory keeps seen tiles after you leave; inspect describes what you know.
  const w = openWorld([[3, 3]]);
  const p = playerOf(w), z = zombieOf(w);
  p.Position.x = 4; p.Position.y = 4;
  place(w, z, 18, 26);
  assert(rememberedAt(w, p, 3, 3).tile === TILE.WALL, 'memory: seen wall remembered');
  assert(describeTile(w, 3, 3) === 'A wall.', `inspect: visible wall, got ${describeTile(w, 3, 3)}`);
  assert(describeTile(w, 5, 5) === 'Open ground.', 'inspect: visible floor');
  assert(describeTile(w, 4, 4) === "That's you.", 'inspect: own tile');
  place(w, p, 18, 12); // walk away: (3,3) is now beyond the light range
  assert(visibilityAt(w, p, 3, 3) === 0, 'memory: (3,3) should be out of sight now');
  assert(rememberedAt(w, p, 3, 3).tile === TILE.WALL, 'memory: wall still remembered out of sight');
  assert(describeTile(w, 3, 3) === 'A wall, out of sight.', `inspect: remembered wall, got ${describeTile(w, 3, 3)}`);
  assert(rememberedAt(w, p, 2, 26) === null && describeTile(w, 2, 26) === 'Unexplored.', 'inspect: never-seen tile');
  place(w, z, 18, 6);
  assert(describeTile(w, 18, 6) === 'A zombie.', 'inspect: visible zombie');
  place(w, p, 2, 26);
  assert(describeTile(w, 18, 6) === 'Open ground, out of sight.', 'inspect: zombie not remembered, only the ground');
  assert(describeTile(w, -1, 0) === 'Nothing there.', 'inspect: off the map');
  const log = createMessageLog(w);
  log.show(describeTile(w, 3, 3));
  assert(log.message.text === 'A wall, out of sight.', 'inspect: shows in status bar');
  playerAct(w, { type: 'wait' });
  assert(log.message.text === 'You wait.', 'inspect: next action replaces the inspect text');
  console.log('memory + inspect OK');
}

{ // Memory is a snapshot: it shows how a tile looked when last seen, not how it is now.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  p.Position.x = 4; p.Position.y = 4;
  const beans = addEntity(w, { Position: { x: 5, y: 5 }, Glyph: { char: '%', fg: '#fff', bg: '#000' }, Name: { name: 'tin of beans' } });
  place(w, z, 6, 6); // zombie in view: must not be remembered
  let snap = rememberedAt(w, p, 5, 5);
  assert(snap.things.length === 1 && snap.things[0].name === 'tin of beans', 'snapshot: item remembered');
  assert(rememberedAt(w, p, 6, 6).things.length === 0, 'snapshot: creature not remembered');

  place(w, p, 18, 26); // walk far away; (5,5) and (8,4) now out of sight
  assert(visibilityAt(w, p, 5, 5) === 0 && visibilityAt(w, p, 8, 4) === 0, 'snapshot: test tiles should be out of sight');
  // The world changes behind your back.
  w.entities.get(beans).Position.x = 7; // someone moves the beans
  w.tiles[4 * w.width + 8] = TILE.WALL; // a wall goes up where there was floor
  assert(rememberedAt(w, p, 5, 5).things[0]?.name === 'tin of beans', 'snapshot: still remembers beans where they were');
  assert(describeTile(w, 5, 5) === 'A tin of beans, out of sight.', `snapshot: inspect shows remembered beans, got ${describeTile(w, 5, 5)}`);
  assert(rememberedAt(w, p, 8, 4).tile === TILE.FLOOR && describeTile(w, 8, 4) === 'Open ground, out of sight.', 'snapshot: remembers the old floor, not the new wall');

  place(w, p, 4, 4); // come back: snapshots refresh
  assert(rememberedAt(w, p, 5, 5).things.length === 0, 'snapshot: beans gone from old spot once seen again');
  assert(rememberedAt(w, p, 7, 5).things[0]?.name === 'tin of beans', 'snapshot: beans remembered at new spot');
  assert(rememberedAt(w, p, 8, 4).tile === TILE.WALL, 'snapshot: new wall remembered once seen');
  assert(describeTile(w, 7, 5) === 'A tin of beans.', 'inspect: visible item');
  // Something appears in view while you stand still: remembered after the turn.
  addEntity(w, { Position: { x: 6, y: 3 }, Glyph: { char: '/', fg: '#fff', bg: '#000' }, Name: { name: 'cricket bat' } });
  playerAct(w, { type: 'wait' });
  assert(rememberedAt(w, p, 6, 3).things[0]?.name === 'cricket bat', 'snapshot: item appearing in view is remembered without moving');
  console.log('memory snapshots: stale until seen again, no creatures OK');
}

{ // A zombie that can see you closes in, and the status line says so.
  const w = openWorld();
  const log = createMessageLog(w);
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 5, 10 + range(z) - 1);
  assert(canSee(w, z, p), 'chase: zombie should see the player');
  let spotted = false, warned = false;
  w.events.on('prey_spotted', () => { spotted = true; });
  for (let i = 0; i < 40; i++) {
    playerAct(w, { type: 'wait' });
    if (log.message?.text === 'The zombie has seen you!') warned = true;
  }
  assert(spotted && warned, 'chase: zombie should spot the player and say so');
  assert(cheb(z.Position, p.Position) <= 1, `chase: zombie should reach the player, at ${cheb(z.Position, p.Position)}`);
  console.log('chase: zombie in sight closes in OK');
}

{ // A zombie that can't see you doesn't know where you are.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 3, 3); place(w, z, 16, 24);
  let spotted = false;
  w.events.on('prey_spotted', () => { spotted = true; });
  for (let i = 0; i < 20; i++) playerAct(w, { type: 'wait' });
  assert(!spotted && z.Brain.goal === null, 'blind: zombie out of sight should not track the player');
  console.log('blind: zombie out of sight just wanders OK');
}

{ // Break line of sight: the zombie goes to where it last saw you, then gives up.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 5, 13);
  playerAct(w, { type: 'wait' }); playerAct(w, { type: 'wait' });
  assert(z.Brain.goal && z.Brain.goal.why === "seen", 'lastSeen: zombie should have spotted the player');
  const seenAt = { x: z.Brain.goal.x, y: z.Brain.goal.y };
  place(w, p, 17, 2); // vanish out of range
  let lost = false;
  w.events.on('prey_lost', () => { lost = true; });
  let reached = false;
  for (let i = 0; i < 120 && !lost; i++) {
    playerAct(w, { type: 'wait' });
    if (cheb(z.Position, seenAt) <= 1) reached = true;
  }
  assert(reached && lost, `lastSeen: zombie should search the last-seen spot then give up (reached ${reached}, lost ${lost})`);
  console.log('lastSeen: zombie searches last-seen spot, then gives up OK');
}

// 4. Noise.
{ // Spreads outward, fading with distance; walls muffle it.
  const w = openWorld();
  const R = CONFIG.noise.radiusByLevel;
  const f = spreadNoise(w, 10, 10, 2);
  const at = (field, x, y) => field.get(y * w.width + x) || 0;
  assert(at(f, 10, 10) === R[2], 'noise: full strength at the source');
  assert(at(f, 13, 10) === R[2] - 3 && at(f, 13, 13) === R[2] - 3, 'noise: loses 1 per tile (diagonals too)');
  assert(at(f, 10 + R[2], 10) === 0, 'noise: fades out at its radius');
  assert(spreadNoise(w, 10, 10, 0).size === 0, 'noise: level 0 is silent');

  // A wall right across the map, between source and listener.
  const wallCol = []; for (let y = 1; y < w.height - 1; y++) wallCol.push([12, y]);
  const w2 = openWorld(wallCol);
  const f2 = spreadNoise(w2, 10, 10, 2);
  const open = at(f, 14, 10), muffled = at(f2, 14, 10);
  assert(muffled > 0 && muffled === open - (CONFIG.noise.wallCost - 1), `noise: wall should muffle by wallCost (open ${open}, behind wall ${muffled})`);
  assert(at(spreadNoise(w2, 10, 10, 1), 13, 10) === 0, 'noise: quiet noise should not get through a wall');
  console.log('noise: spreads, fades, walls muffle OK');
}

{ // A zombie that can't see you hears your footsteps and goes to look.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  w.light.fill(0); // pitch dark: no seeing, only hearing
  place(w, p, 5, 10); place(w, z, 8, 12);
  assert(!canSee(w, z, p), 'hear: zombie should not see the player in the dark');
  let heard = null, investigated = false;
  w.events.on('noise_heard', (d) => { if (d.id === z.id) heard = d; });
  w.events.on('noise_investigated', (d) => { if (d.id === z.id) investigated = true; });
  playerAct(w, { type: 'move', dx: 0, dy: 1 }); // footsteps at (5,11)
  assert(heard && heard.x === 5 && heard.y === 11, 'hear: zombie should hear footsteps 3 tiles away');
  assert(z.Brain.goal && z.Brain.goal.why === 'heard', 'hear: zombie should head for the noise');
  assert(w.noise[11 * w.width + 5] === CONFIG.noise.radiusByLevel[CONFIG.player.footsteps], 'hear: heatmap records the noise');
  for (let i = 0; i < 80 && !investigated; i++) playerAct(w, { type: 'wait' });
  assert(investigated, 'hear: zombie should reach the noise and give up');
  assert(cheb(z.Position, { x: 5, y: 11 }) <= CONFIG.zombie.searchRadius, 'hear: zombie should end up searching around the noise');
  assert(w.noise.every((v) => v === 0), 'hear: waiting is silent and the heatmap clears');
  console.log('hear: zombie hears footsteps and investigates OK');
}

{ // Too far, or behind a wall: footsteps go unheard. Loud noises carry.
  const wallCol = []; for (let y = 1; y < 27; y++) wallCol.push([7, y]);
  const w = openWorld(wallCol);
  const p = playerOf(w), z = zombieOf(w);
  w.light.fill(0);
  place(w, p, 5, 10); place(w, z, 9, 10); // 4 tiles, wall in between
  let heard = false;
  w.events.on('noise_heard', (d) => { if (d.id === z.id) heard = true; });
  playerAct(w, { type: 'move', dx: 0, dy: 1 });
  assert(!heard && z.Brain.goal === null, 'hear: footsteps behind a wall should go unheard');
  makeNoise(w, 5, 11, 3, p.id); // something loud
  assert(heard && z.Brain.goal?.why === 'heard', 'hear: a loud noise should carry through the wall');
  console.log('hear: walls and distance stop quiet noises, loud ones carry OK');
}

// 5. Stealth.
{ // Sneak toggle: recorded, no turn; slower; silent.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 5); place(w, z, 18, 26);
  let noises = 0, stance = null;
  w.events.on('noise_made', () => noises++);
  w.events.on('stance_changed', (d) => { stance = d.sneaking; });
  const turn0 = w.turn, tick0 = w.tick;
  assert(playerAct(w, { type: 'sneak', on: true }) === false && w.turn === turn0, 'sneak: toggling takes no turn');
  assert(stance === true && w.inputs.at(-1).action.type === 'sneak', 'sneak: toggle emits stance_changed and is recorded');
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(noises === 0, 'sneak: sneaking steps are silent');
  assert(w.tick - tick0 === CONFIG.stealth.sneakMoveCost, `sneak: a sneaking step should take ${CONFIG.stealth.sneakMoveCost} ticks, took ${w.tick - tick0}`);
  const t1 = w.tick;
  playerAct(w, { type: 'wait' });
  assert(w.tick - t1 === 1, 'sneak: waiting while sneaking is normal speed');
  playerAct(w, { type: 'sneak', on: false });
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(noises === 1 && w.tick - t1 === 2, 'sneak: walking again is noisy and normal speed');
  const replayed = replay(createWorld, 7, w.inputs);
  assert(replayed.inputs.length === w.inputs.length, 'sneak: toggles replay');
  console.log('sneak: no turn, recorded, slower, silent OK');
}

{ // Noticing depends on distance, light and sneaking.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  const zr = sightRadius(z); // 7 on a clear day
  place(w, z, 10, 5);
  place(w, p, 10, 5 + zr - 1);
  assert(canSee(w, z, p), 'notice: walking in daylight, seen within the zombie\'s range');
  playerAct(w, { type: 'sneak', on: true });
  assert(!canSee(w, z, p), 'notice: sneaking at the same distance goes unnoticed');
  place(w, p, 10, 5 + Math.floor(zr * CONFIG.stealth.sneakNoticeFactor));
  assert(canSee(w, z, p), 'notice: sneaking is still noticed up close');
  place(w, p, 10, 6);
  assert(canSee(w, z, p), 'notice: adjacent is always noticed');
  playerAct(w, { type: 'sneak', on: false });
  place(w, p, 10, 9); // 4 tiles away, in daylight: seen
  assert(canSee(w, z, p), 'notice: 4 tiles in daylight is seen');
  w.light[9 * w.width + 10] = 1; refreshAllVision(w);
  assert(!canSee(w, z, p), 'notice: same spot in dim light is not');
  console.log('notice: distance x light x sneaking, adjacent always OK');
}

{ // Sneaking doesn't shake off a zombie that's already chasing you in plain sight.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 5); place(w, z, 10, 9);
  playerAct(w, { type: 'wait' }); playerAct(w, { type: 'wait' });
  assert(z.Brain.seesPrey, 'track: zombie should be chasing');
  playerAct(w, { type: 'sneak', on: true });
  let lost = false;
  for (let i = 0; i < 6; i++) {
    playerAct(w, { type: 'move', dx: 1, dy: 0 });
    const d = Math.hypot(p.Position.x - z.Position.x, p.Position.y - z.Position.y);
    if (d <= sightRadius(z) && !z.Brain.seesPrey) lost = true;
  }
  assert(!lost, 'track: sneaking in plain sight should not lose a chasing zombie');
  // An unalerted zombie at the same kind of distance doesn't notice a sneaking player.
  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, z2, 10, 5); place(w2, p2, 10, 10);
  playerAct(w2, { type: 'sneak', on: true });
  assert(!canSee(w2, z2, p2) && canSee(w2, z2, p2, { tracking: true }), 'track: sneaking only stops the first notice');
  // ...nor does ducking into a bush while it watches.
  const w3 = openWorld();
  w3.tiles[5 * w3.width + 14] = TILE.BUSH;
  const p3 = playerOf(w3), z3 = zombieOf(w3);
  place(w3, p3, 10, 5); place(w3, z3, 10, 9);
  playerAct(w3, { type: 'wait' }); playerAct(w3, { type: 'wait' });
  for (let i = 0; i < 4; i++) playerAct(w3, { type: 'move', dx: 1, dy: 0 });
  let gaveUp = false;
  for (let i = 0; i < 20 && cheb(z3.Position, p3.Position) > 1; i++) {
    playerAct(w3, { type: 'wait' });
    if (!z3.Brain.goal) gaveUp = true;
  }
  assert(!gaveUp && cheb(z3.Position, p3.Position) <= 1, 'track: a zombie that watched you enter a bush finds you');
  console.log('track: once noticed, sneaking and bushes do not hide you OK');
}

{ // Bushes: hidden unless adjacent - for you and for zombies.
  const w = openWorld();
  w.tiles[10 * w.width + 10] = TILE.BUSH;
  w.tiles[20 * w.width + 10] = TILE.BUSH;
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 10, 12);
  assert(visibilityAt(w, z, 10, 10) > 0, 'bush: bushes do not block sight');
  assert(!canSee(w, z, p), 'bush: player in a bush is hidden 2 tiles away');
  place(w, z, 10, 11);
  assert(canSee(w, z, p), 'bush: an adjacent zombie finds you');
  assert(describeTile(w, 10, 10) === 'You, hidden in a bush.', `bush: inspect own tile, got ${describeTile(w, 10, 10)}`);
  place(w, z, 10, 20); place(w, p, 10, 17);
  assert(!canSee(w, p, z) && describeTile(w, 10, 20) === 'A bush.', 'bush: a zombie in a bush is hidden from you too');
  console.log('bush: hidden unless adjacent, both ways OK');
}

{ // Generated maps have bushes, and they're walkable.
  const w = createWorld(5);
  const bushes = [...w.tiles].filter((t) => t === TILE.BUSH).length;
  assert(bushes > 5, `gen: expected some bushes, got ${bushes}`);
  assert(!TILE_INFO[TILE.BUSH].blocks && !TILE_INFO[TILE.BUSH].opaque && TILE_INFO[TILE.BUSH].cover, 'gen: bush is walkable, see-through cover');
  console.log(`gen: ${bushes} bush tiles OK`);
}

// 6. Health, melee, bleeding, death.
{ // Tapping into a creature attacks it; hits hurt, misses don't; fights are loud.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 11, 10);
  z.Brain.seesPrey = true; z.Brain.trackingId = p.id; // it already knows you're there: no sneak attack
  let hits = 0, misses = 0, noise = 0;
  w.events.on('attack_hit', (d) => { if (d.id === p.id) hits++; });
  w.events.on('attack_missed', (d) => { if (d.id === p.id) misses++; });
  w.events.on('noise_made', (d) => { if (d.level === CONFIG.melee.noise) noise++; });
  const turn0 = w.turn;
  assert(playerAct(w, { type: 'move', dx: 1, dy: 0 }), 'melee: attacking takes a turn');
  assert(p.Position.x === 10 && w.turn === turn0 + 1, 'melee: attacking does not move you');
  assert(hits + misses === 1 && noise >= 1, 'melee: one swing, and it made fighting noise');
  assert(z.Health.hp === CONFIG.zombie.health - hits * CONFIG.player.melee.damage, 'melee: hit deals damage');
  assert(w.inputs.at(-1).action.type === 'move' && !('attack' in w.inputs.at(-1).action), 'melee: recorded as a plain move for replay');
  console.log('melee: bump attacks, takes a turn, loud OK');
}

{ // The zombie bites back when you're next to it.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 11, 10);
  z.Melee.hitChance = 1;
  let bites = 0;
  w.events.on('attack_hit', (d) => { if (d.id === z.id) bites++; });
  w.events.on('attack_missed', (d) => { if (d.id === z.id) bites++; });
  for (let i = 0; i < 6; i++) playerAct(w, { type: 'wait' });
  assert(bites >= 2, `melee: zombie should attack an adjacent player (swings ${bites})`);
  assert(p.Health.hp < CONFIG.player.health || w.gameOver, 'melee: after several swings the player is hurt');
  console.log('melee: zombie attacks adjacent prey OK');
}

{ // Bleeding drains health over time, drips blood, can clot; blood is remembered.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, z, 18, 26); place(w, p, 5, 5);
  wound(w, p); wound(w, p); // level 2
  assert(p.Bleeding.level === 2, 'bleed: two wounds = level 2');
  const hp0 = p.Health.hp;
  for (let i = 0; i < 10; i++) playerAct(w, { type: 'wait' });
  assert(p.Health.hp < hp0, 'bleed: bleeding drains health');
  assert(w.blood[5 * w.width + 5] > 0, 'bleed: drips blood on your tile');
  assert(rememberedAt(w, p, 5, 5).blood > 0, 'bleed: blood is part of the memory snapshot');
  assert(describeTile(w, 6, 5) === 'Open ground.' && w.blood[5 * w.width + 6] === 0, 'bleed: no blood where you did not bleed');
  p.Bleeding.level = 1; p.Health.hp = 100; p.Health.max = 100;
  let stopped = false;
  w.events.on('bleeding_stopped', () => { stopped = true; });
  for (let i = 0; i < 200 && !stopped; i++) playerAct(w, { type: 'wait' });
  assert(stopped && p.Bleeding.level === 0, 'bleed: bleeding eventually clots');
  console.log('bleed: drains, drips, clots, remembered OK');
}

{ // Death: the creature is removed and leaves a corpse; player death ends the game.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 11, 10);
  z.Health.hp = 1;
  p.Melee.hitChance = 1;
  let died = null;
  w.events.on('entity_died', (d) => { died = d; });
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(died && died.id === z.id && !w.entities.has(z.id), 'death: zombie removed');
  const corpse = query(w, 'Corpse')[0];
  assert(corpse && corpse.Position.x === 11 && !corpse.Actor && !corpse.Blocks, 'death: corpse left behind, walkable');
  assert(describeTile(w, 11, 10) === 'A zombie corpse.', `death: inspect corpse, got ${describeTile(w, 11, 10)}`);
  assert(playerAct(w, { type: 'move', dx: 1, dy: 0 }) && p.Position.x === 11, 'death: you can step onto a corpse');

  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, p2, 10, 10); place(w2, z2, 11, 10);
  p2.Health.hp = 1;
  z2.Melee.hitChance = 1;
  for (let i = 0; i < 4 && !w2.gameOver; i++) playerAct(w2, { type: 'wait' });
  assert(w2.gameOver && w2.gameOver.cause === 'bite' && w2.gameOver.killerName === 'zombie', `death: player killed by a bite, got ${JSON.stringify(w2.gameOver)}`);
  assert(!w2.entities.has(p2.id) && !playerAct(w2, { type: 'wait' }), 'death: dead player cannot act');
  console.log('death: corpse left, player death ends the game OK');
}

// 7. Who strikes first.
function firstStrike(setup, playerMoves) {
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  setup(w, p, z);
  let first = null;
  w.events.on('attack_hit', (d) => { first ??= d.id === p.id ? 'player' : 'zombie'; });
  w.events.on('attack_missed', (d) => { first ??= d.id === p.id ? 'player' : 'zombie'; });
  for (let i = 0; i < 40 && !first; i++) {
    const dx = Math.sign(z.Position.x - p.Position.x), dy = Math.sign(z.Position.y - p.Position.y);
    if (cheb(p.Position, z.Position) <= 1 || playerMoves) playerAct(w, { type: 'move', dx, dy });
    else playerAct(w, { type: 'wait' });
  }
  return { first, w, p, z };
}

{ // A zombie that steps next to you used its action moving: you strike first.
  for (let k = 0; k < 20; k++) {
    const { first } = firstStrike((w, p, z) => { place(w, p, 10, 5); place(w, z, 10, 9 + (k % 3)); }, false);
    assert(first === 'player', `first: zombie walked up but struck first (case ${k})`);
  }
  console.log('first strike: a zombie that walks up to you never hits first OK');
}

{ // Sneak attack: an unaware zombie dies in one hit and never strikes.
  const { first, w, z } = firstStrike((w, p, z) => {
    place(w, p, 10, 5); place(w, z, 10, 6);
    z.Brain.seesPrey = false; // hasn't noticed you
  }, true);
  assert(first === 'player' && !w.entities.has(z.id), 'sneak attack: unaware zombie killed in one hit');
  // A tougher unaware creature survives, but reacts instead of striking back at once.
  const savedStagger = CONFIG.zombie.staggerChance;
  CONFIG.zombie.staggerChance = 0; // no random lurches muddying the sequence
  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, p2, 10, 5); place(w2, z2, 10, 6);
  z2.Health.hp = z2.Health.max = 20;
  z2.Melee.hitChance = 1;
  let sneakHits = 0, zombieSwings = 0, reacted = 0;
  w2.events.on('attack_hit', (d) => { if (d.id === p2.id && d.sneak) sneakHits++; if (d.id === z2.id) zombieSwings++; });
  w2.events.on('attack_missed', (d) => { if (d.id === z2.id) zombieSwings++; });
  w2.events.on('entity_reacted', (d) => { if (d.id === z2.id) reacted++; });
  playerAct(w2, { type: 'move', dx: 0, dy: 1 });
  assert(sneakHits === 1 && z2.Health.hp === 20 - CONFIG.player.melee.damage - CONFIG.melee.sneakAttackBonus, 'sneak attack: bonus damage');
  playerAct(w2, { type: 'wait' }); // zombie's next action: react, not bite
  assert(reacted === 1 && zombieSwings === 0, `sneak attack: zombie reacts before striking (reacted ${reacted}, swings ${zombieSwings})`);
  playerAct(w2, { type: 'move', dx: 0, dy: 1 });
  const hpAfter = z2.Health.hp;
  assert(hpAfter <= 20 - 4, 'sneak attack: second hit is a normal hit');
  for (let i = 0; i < 4; i++) playerAct(w2, { type: 'wait' });
  assert(zombieSwings >= 1, 'sneak attack: after reacting, the zombie fights back');
  CONFIG.zombie.staggerChance = savedStagger;
  console.log('sneak attack: unaware = one-hit kill, no free strike, then normal fight OK');
}

{ // Noticing: the first action after spotting you is a groan (noise), not a step or bite.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 5); place(w, z, 10, 9);
  const zStart = { ...z.Position };
  let groan = null;
  w.events.on('noise_made', (d) => { if (d.sourceId === z.id) groan = d; });
  let reacted = false;
  w.events.on('entity_reacted', () => { reacted = true; });
  for (let i = 0; i < 2 && !reacted; i++) playerAct(w, { type: 'wait' });
  assert(reacted && z.Position.x === zStart.x && z.Position.y === zStart.y, 'react: zombie stays put while reacting');
  assert(groan && groan.level === CONFIG.zombie.groanNoise, 'react: reacting is a groan (noise)');
  console.log('react: noticing costs the zombie an action and makes a groan OK');
}

// 8. Shove.
{ // Push into open ground: moves one tile away, loses its next action, makes noise.
  const w = openWorld();
  const log = createMessageLog(w, { onScreen: () => false }); // only check the shove line
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 11, 10);
  z.Brain.seesPrey = true; z.Brain.trackingId = p.id;
  let pushed = null, noise = null, lost = 0;
  w.events.on('entity_pushed', (d) => { pushed = d; });
  w.events.on('noise_made', (d) => { if (d.sourceId === p.id) noise = d; });
  w.events.on('entity_lost_action', (d) => { if (d.id === z.id) lost++; });
  const turn0 = w.turn;
  assert(playerAct(w, { type: 'shove', dx: 1, dy: 0 }) && w.turn === turn0 + 1, 'shove: takes a turn');
  assert(z.Position.x === 12 && z.Position.y === 10 && p.Position.x === 10, 'shove: target pushed one tile away, you stay put');
  assert(pushed && pushed.to.x === 12 && pushed.by === p.id && pushed.dx === 1, 'shove: entity_pushed carries the destination (hook for water/fire/ledges)');
  assert(noise && noise.level === CONFIG.shove.noise, 'shove: makes noise');
  assert(log.message?.text === 'You shove the zombie.', `shove: message, got ${log.message?.text}`);
  assert(w.inputs.at(-1).action.type === 'shove', 'shove: recorded for replay');
  const zActions = z.Actor.actions;
  for (let i = 0; i < 2; i++) playerAct(w, { type: 'wait' });
  assert(lost === 1 && z.Position.x === 12, 'shove: zombie loses its next action (stays put)');
  assert(z.Actor.actions > zActions, 'shove: the lost action still uses its time');
  console.log('shove: pushes, staggers, noisy, recorded OK');
}

{ // Blocked behind: slams into the wall, takes minor damage, still staggered.
  const w = openWorld([[12, 10]]);
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 11, 10);
  let slammed = null, lost = 0;
  w.events.on('entity_slammed', (d) => { slammed = d; });
  w.events.on('entity_lost_action', () => { lost++; });
  playerAct(w, { type: 'shove', dx: 1, dy: 0 });
  assert(z.Position.x === 11 && slammed && slammed.blockerId === null, 'slam: blocked target stays and slams the wall');
  assert(z.Health.hp === CONFIG.zombie.health - CONFIG.shove.slamDamage, 'slam: minor damage');
  for (let i = 0; i < 2; i++) playerAct(w, { type: 'wait' });
  assert(lost === 1, 'slam: still staggered');
  // Into another creature: the shoved one takes the damage.
  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, p2, 10, 10); place(w2, z2, 11, 10);
  const z3 = addEntity(w2, { Position: { x: 12, y: 10 }, Actor: { speed: 50, energy: 0, actions: 0 }, Blocks: {}, Health: { hp: 4, max: 4 }, Name: { name: 'zombie' }, Glyph: { char: 'Z', fg: '#000', bg: '#0f0' } });
  playerAct(w2, { type: 'shove', dx: 1, dy: 0 });
  assert(z2.Health.hp === CONFIG.zombie.health - 1 && w2.entities.get(z3).Health.hp === 4, 'slam: shoved creature hurt, the one behind is not');
  console.log('slam: blocked shove = minor damage + stagger OK');
}

{ // Nothing there: no turn, nothing recorded.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 18, 26);
  const n = w.inputs.length, t = w.turn;
  assert(!playerAct(w, { type: 'shove', dx: 1, dy: 0 }) && w.turn === t && w.inputs.length === n, 'shove: empty tile costs nothing');
  assert(!playerAct(w, { type: 'shove', dx: 2, dy: 0 }), 'shove: must be adjacent');
  console.log('shove: nothing to shove = no turn OK');
}

// 9. Items and inventory.
{ // Walk onto an item: picked up. Bag has a slot limit.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 5); place(w, z, 18, 26);
  const beans = makeItem(w, 'beans', 6, 5);
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(p.Inventory.items.includes(beans) && !w.entities.get(beans).Position, 'items: walking onto an item picks it up');
  assert(itemsAt(w, 6, 5).length === 0, 'items: gone from the tile');
  // Fill the bag: bat (2) + 3 more beans = 6 slots, then one more won't fit.
  const more = [makeItem(w, 'bat', 7, 5), makeItem(w, 'beans', 8, 5), makeItem(w, 'beans', 9, 5), makeItem(w, 'beans', 10, 5), makeItem(w, 'bandage', 11, 5)];
  let full = false;
  w.events.on('pickup_failed', (d) => { if (d.reason === 'full') full = true; });
  for (let i = 0; i < 5; i++) playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(usedSlots(w, p) === CONFIG.inventory.capacity, `items: bag filled to capacity, got ${usedSlots(w, p)}`);
  assert(full && itemsAt(w, 11, 5).length === 1 && p.Position.x === 11, 'items: a full bag leaves the item on the tile (you still step there)');
  // Drop: back on your tile, and tapping yourself picks the bandage... after making room.
  const t = w.turn;
  assert(playerAct(w, { type: 'drop', itemId: more[1] }) && w.turn === t + 1, 'items: drop takes a turn');
  assert(itemsAt(w, 11, 5).length === 2 && w.entities.get(more[1]).Position.x === 11, 'items: dropped where you stand');
  assert(playerAct(w, { type: 'pickup' }), 'items: tap-yourself pickup');
  assert(p.Inventory.items.includes(more[1]) || p.Inventory.items.includes(more[4]), 'items: picked up the top item underfoot');
  assert(!playerAct(w, { type: 'drop', itemId: 99999 }), 'items: cannot drop what you do not have');
  console.log('items: pickup on step, slot limit, drop, tap pickup OK');
}

{ // Use: beans heal, bandage stops bleeding, bat changes melee damage.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 5); place(w, z, 18, 26);
  const beans = makeItem(w, 'beans', 5, 5); playerAct(w, { type: 'pickup' });
  p.Health.hp = 3;
  assert(playerAct(w, { type: 'use', itemId: beans }) && p.Health.hp === 3 + CONFIG.items.beans.heal, 'use: beans heal');
  assert(!w.entities.has(beans) && !p.Inventory.items.includes(beans), 'use: beans are used up');
  const band = makeItem(w, 'bandage', 5, 5); playerAct(w, { type: 'pickup' });
  const t0 = w.turn;
  assert(!playerAct(w, { type: 'use', itemId: band }) && w.entities.has(band) && w.turn === t0, 'use: bandage not wasted when not bleeding');
  wound(w, p); wound(w, p);
  playerAct(w, { type: 'use', itemId: band });
  assert(p.Bleeding.level === 0 && !w.entities.has(band), 'use: bandage stops bleeding and is used up');
  const bat = makeItem(w, 'bat', 5, 5); playerAct(w, { type: 'pickup' });
  assert(meleeStats(w, p).damage === CONFIG.player.melee.damage, 'bat: carrying is not wielding');
  playerAct(w, { type: 'use', itemId: bat });
  assert(p.Inventory.wielded === bat && meleeStats(w, p).damage === CONFIG.items.bat.weapon.damage, 'bat: wielding changes damage');
  place(w, z, 6, 5);
  z.Brain.seesPrey = true; z.Brain.trackingId = p.id; // aware: no sneak bonus
  p.Melee.hitChance = 1; CONFIG.items.bat.weapon.hitChance = 1;
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(z.Health.hp === CONFIG.zombie.health - CONFIG.items.bat.weapon.damage, `bat: hits for ${CONFIG.items.bat.weapon.damage}, zombie at ${z.Health.hp}`);
  CONFIG.items.bat.weapon.hitChance = 0.8;
  playerAct(w, { type: 'use', itemId: bat });
  assert(p.Inventory.wielded === null, 'bat: using again puts it away');
  playerAct(w, { type: 'use', itemId: bat }); playerAct(w, { type: 'drop', itemId: bat });
  assert(p.Inventory.wielded === null, 'bat: dropping a wielded weapon empties your hands');
  console.log('use: beans heal, bandage stanches, bat hits harder OK');
}

{ // The test map has the configured items, on open tiles, and you remember seeing them.
  const w = createWorld(3);
  const items = query(w, 'Item');
  const want = Object.values(CONFIG.testGrid.items).reduce((a, b) => a + b, 0) + 2; // + loot inside the test building
  assert(items.length === want, `gen: expected ${want} items, got ${items.length}`);
  for (const i of items) assert(!TILE_INFO[tileAt(w, i.Position.x, i.Position.y)].blocks, 'gen: item inside a wall');
  console.log(`gen: ${items.length} test items OK`);
}

// 10. Throwing and shooting.
{ // Targets: in range, in a clear line you can see, not solid.
  const w = openWorld([[12, 10]]);
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 18, 26);
  const t = validTargets(w, p, CONFIG.throw.range);
  const has = (x, y) => t.has(y * w.width + x);
  assert(has(10, 14) && has(13, 13) && !has(10, 10), 'aim: open tiles in range, not your own');
  assert(!has(12, 10) && !has(13, 10), 'aim: not walls, not behind them');
  assert(!has(10, 10 + CONFIG.throw.range + 1), 'aim: not beyond range');
  console.log('aim: range + line of sight + not solid OK');
}

{ // Throw: lands on the tile, clatters, lures a zombie; out-of-range refused.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  w.light.fill(0); // zombie can't see you: only the noise matters
  place(w, p, 5, 5); place(w, z, 15, 12);
  w.light.fill(CONFIG.light.ambient); place(w, p, 5, 5); // you can see where you throw
  z.Vision.eyesight = 0; refreshAllVision(w);         // ...but the zombie is blind
  const beans = makeItem(w, 'beans', 5, 5); playerAct(w, { type: 'pickup' });
  const t0 = w.turn;
  assert(!playerAct(w, { type: 'throw', itemId: beans, x: 5, y: 5 + CONFIG.throw.range + 2 }) && w.turn === t0, 'throw: out of range refused, no turn');
  let landNoise = null;
  w.events.on('noise_made', (d) => { if (d.level === CONFIG.throw.landNoise) landNoise = d; });
  assert(playerAct(w, { type: 'throw', itemId: beans, x: 10, y: 9 }), 'throw: takes a turn');
  const b = w.entities.get(beans);
  assert(b.Position && b.Position.x === 10 && b.Position.y === 9 && !p.Inventory.items.includes(beans), 'throw: lands on the target tile');
  assert(landNoise && landNoise.x === 10 && landNoise.y === 9, 'throw: clatters where it lands');
  assert(z.Brain.goal && z.Brain.goal.why === 'heard' && z.Brain.goal.x === 10, 'throw: a zombie goes to investigate the landing spot (distraction)');
  console.log('throw: lands, clatters, lures OK');
}

{ // Heavy thrown items hurt; light ones don't.
  const saved = CONFIG.throw.hitChance;
  CONFIG.throw.hitChance = 1;
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 5); place(w, z, 8, 5);
  const beans = makeItem(w, 'beans', 5, 5); playerAct(w, { type: 'pickup' });
  const bat = makeItem(w, 'bat', 5, 5); playerAct(w, { type: 'pickup' });
  const hp = z.Health.hp;
  let lost = 0;
  w.events.on('entity_lost_action', (d) => { if (d.id === z.id) lost++; });
  const zPos = { ...z.Position };
  playerAct(w, { type: 'throw', itemId: beans, x: z.Position.x, y: z.Position.y });
  assert(z.Health.hp === hp, 'throw: a tin of beans does no damage');
  assert(z.Staggered || lost === 1, 'throw: ...but it staggers the zombie');
  playerAct(w, { type: 'wait' }); playerAct(w, { type: 'wait' });
  assert(lost === 1 && z.Position.x === zPos.x && z.Position.y === zPos.y, 'throw: the staggered zombie loses its next action');
  playerAct(w, { type: 'throw', itemId: bat, x: z.Position.x, y: z.Position.y });
  assert(z.Health.hp === hp - CONFIG.throw.heavyDamage, 'throw: a cricket bat hurts');
  CONFIG.throw.hitChance = saved;
  console.log('throw: any hit staggers, heavy items also hurt OK');
}

{ // Shotgun: loud, strong, short range, limited ammo. Air rifle: quiet, weak.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 5); place(w, z, 5, 8);
  const sg = makeItem(w, 'shotgun', 5, 5); playerAct(w, { type: 'pickup' });
  assert(!playerAct(w, { type: 'fire', x: 5, y: 8 }), 'fire: needs a wielded gun');
  playerAct(w, { type: 'use', itemId: sg });
  CONFIG.items.shotgun.ranged.hitChance = 1;
  let bang = null;
  w.events.on('noise_made', (d) => { if (d.sourceId === p.id && d.level === CONFIG.items.shotgun.ranged.noise) bang = d; });
  assert(!playerAct(w, { type: 'fire', x: 5, y: 5 + CONFIG.items.shotgun.ranged.range + 2 }), 'fire: beyond range refused');
  assert(playerAct(w, { type: 'fire', x: z.Position.x, y: z.Position.y }), 'fire: shotgun fires');
  assert(!w.entities.has(z.id), 'fire: shotgun kills a zombie in one shot');
  assert(bang && bang.x === 5 && bang.y === 5, 'fire: very loud bang at the shooter');
  assert(w.entities.get(sg).Item.ammo === CONFIG.items.shotgun.ammo - 1, 'fire: uses a shell');
  CONFIG.items.shotgun.ranged.hitChance = 0.9;
  w.entities.get(sg).Item.ammo = 0;
  let empty = false;
  w.events.on('fire_failed', () => { empty = true; });
  const t0 = w.turn;
  assert(!playerAct(w, { type: 'fire', x: 5, y: 7 }) && empty && w.turn === t0, 'fire: empty gun clicks, no turn');

  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, p2, 5, 5); place(w2, z2, 5, 11);
  const ar = makeItem(w2, 'airRifle', 5, 5); playerAct(w2, { type: 'pickup' }); playerAct(w2, { type: 'use', itemId: ar });
  CONFIG.items.airRifle.ranged.hitChance = 1;
  let pfft = null;
  w2.events.on('noise_made', (d) => { if (d.sourceId === p2.id) pfft = d; });
  playerAct(w2, { type: 'fire', x: z2.Position.x, y: z2.Position.y });
  assert(z2.Health.hp === CONFIG.zombie.health - CONFIG.items.airRifle.ranged.damage, 'fire: air rifle is weak');
  assert(pfft && pfft.level === CONFIG.items.airRifle.ranged.noise && pfft.level < CONFIG.items.shotgun.ranged.noise, 'fire: air rifle is quiet');
  CONFIG.items.airRifle.ranged.hitChance = 0.75;
  console.log('fire: shotgun loud/strong/short/ammo, air rifle quiet/weak OK');
}

// 11. Materials: walls, doors, windows, barricades.
// A small room: walls x 8..12, y 8..12, door at (10,12), window at (12,10).
function roomWorld({ locked = false, lockId = null } = {}) {
  const walls = [];
  for (let x = 8; x <= 12; x++) for (const y of [8, 12]) walls.push([x, y]);
  for (let y = 9; y <= 11; y++) for (const x of [8, 12]) walls.push([x, y]);
  const w = openWorld(walls.filter(([x, y]) => !(x === 10 && y === 12) && !(x === 12 && y === 10)));
  const door = w.entities.get(makeDoor(w, 10, 12, { locked, lockId }));
  const win = w.entities.get(makeWindow(w, 12, 10));
  refreshAllVision(w);
  return { w, door, win };
}

{ // The generated test building: locked wooden door, glass windows, stone walls.
  const w = createWorld(3);
  const doors = query(w, 'Door'), windows = query(w, 'Window');
  assert(doors.length === 1 && doors[0].Door.locked && doors[0].Structure.hp === CONFIG.materials.wood.hp, 'build: one locked wooden door');
  assert(windows.length === 2 && windows[0].Structure.hp === CONFIG.materials.glass.hp, 'build: two glass windows');
  const b = CONFIG.testGrid.building;
  assert(w.tileHp[b.y * w.width + b.x] === CONFIG.materials[CONFIG.build.wall].hp, 'build: walls have their material\'s health');
  assert(query(w, 'Item').some((i) => i.Item.type === 'key') && query(w, 'Item').some((i) => i.Item.type === 'planks'), 'build: key and planks on the map');
  assert(query(w, 'Item').find((i) => i.Item.type === 'key').Item.lockId === doors[0].Door.lockId, 'build: the scattered key fits the building door');
  for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
    const ring = x === b.x - 1 || y === b.y - 1 || x === b.x + b.w || y === b.y + b.h;
    if (ring && x > 0 && y > 0 && x < w.width - 1 && y < w.height - 1) assert(w.tiles[y * w.width + x] === TILE.FLOOR, `build: yard should be clear at ${x},${y}`);
  }
  console.log('build: test building generated OK');
}

{ // Doors: walk into a closed door to open it; tap it to close; closed blocks sight.
  const { w, door } = roomWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, z, 18, 26); place(w, p, 10, 13); // outside, below the door
  assert(!isPassable(w, 10, 12) && visibilityAt(w, p, 10, 10) === 0, 'door: closed door blocks movement and sight');
  const t0 = w.turn;
  assert(playerAct(w, { type: 'move', dx: 0, dy: -1 }) && w.turn === t0 + 1, 'door: opening takes a turn');
  assert(door.Door.open && p.Position.y === 13, 'door: you open it rather than step in');
  assert(isPassable(w, 10, 12) && visibilityAt(w, p, 10, 10) > 0, 'door: open door lets you through and see in');
  playerAct(w, { type: 'move', dx: 0, dy: -1 });
  assert(p.Position.y === 12, 'door: walk into the doorway');
  assert(!playerAct(w, { type: 'door', x: 10, y: 12 }), 'door: cannot close a door you are standing in (not adjacent)');
  playerAct(w, { type: 'move', dx: 0, dy: -1 }); // inside
  assert(playerAct(w, { type: 'door', x: 10, y: 12 }) && !door.Door.open, 'door: tap to close it behind you');
  assert(!playerAct(w, { type: 'door', x: 10, y: 14 }), 'door: no door there');
  console.log('door: open by walking into it, close by tapping, blocks sight OK');
}

{ // Locked: walking into it bashes it (noisy) until it breaks. The key locks/unlocks.
  const { w, door } = roomWorld({ locked: true });
  const p = playerOf(w), z = zombieOf(w);
  place(w, z, 18, 26); place(w, p, 10, 13);
  let bash = 0;
  w.events.on('noise_made', (d) => { if (d.level === CONFIG.materials.wood.hitNoise && d.sourceId === p.id) bash++; });
  const t0 = w.turn;
  assert(!playerAct(w, { type: 'move', dx: 0, dy: -1 }) && w.turn === t0 && door.Structure.hp === CONFIG.materials.wood.hp, 'locked: walking into it does not bash it (no turn)');
  playerAct(w, { type: 'bash', x: 10, y: 12 });
  assert(!door.Door.open && door.Structure.hp === CONFIG.materials.wood.hp - 1 && bash === 1, 'locked: a deliberate bash damages it, noisily');
  for (let i = 0; i < 10 && !door.Door.broken; i++) playerAct(w, { type: 'bash', x: 10, y: 12 });
  assert(door.Door.broken && isPassable(w, 10, 12), 'locked: enough blows break the door down');
  // Key: goes on the keyring (no bag slot); walking into the locked door unlocks it; closing locks it.
  const r2 = roomWorld({ locked: true, lockId: CONFIG.items.key.lockId });
  const p2 = playerOf(r2.w);
  place(r2.w, zombieOf(r2.w), 18, 26); place(r2.w, p2, 10, 13);
  const key = makeItem(r2.w, 'key', 10, 13); playerAct(r2.w, { type: 'pickup' });
  assert(p2.Keyring.keys.includes(key) && !p2.Inventory.items.includes(key) && usedSlots(r2.w, p2) === 0, 'key: goes on the keyring, takes no bag slot');
  assert(playerAct(r2.w, { type: 'move', dx: 0, dy: -1 }) && r2.door.Door.open && !r2.door.Door.locked, 'key: walking into the locked door unlocks and opens it');
  playerAct(r2.w, { type: 'move', dx: 0, dy: -1 }); playerAct(r2.w, { type: 'move', dx: 0, dy: -1 }); // through, inside
  assert(playerAct(r2.w, { type: 'door', x: 10, y: 12 }) && !r2.door.Door.open && r2.door.Door.locked, 'key: closing the door locks it behind you');
  // A key for a different lock does nothing.
  const r3 = roomWorld({ locked: true, lockId: 'somewhere-else' });
  const p3 = playerOf(r3.w);
  place(r3.w, zombieOf(r3.w), 18, 26); place(r3.w, p3, 10, 13);
  makeItem(r3.w, 'key', 10, 13); playerAct(r3.w, { type: 'pickup' });
  assert(!playerAct(r3.w, { type: 'move', dx: 0, dy: -1 }) && r3.door.Door.locked, 'key: the wrong key does not open it');
  // Old saves with a key in the bag get it moved onto the keyring.
  const old = JSON.parse(serialize(r2.w));
  const op = old.entities.find((e) => e.Player);
  delete op.Keyring; op.Inventory.items.push(key);
  old.entities.find((e) => e.id === key).Item.slots = 1;
  const loaded = deserialize(JSON.stringify(old), createWorld);
  const lp = playerOf(loaded);
  assert(lp.Keyring.keys.includes(key) && !lp.Inventory.items.includes(key), 'key: old saves move the key from the bag to the keyring');
  console.log('locked: bump is harmless, deliberate bash breaks it, key works OK');
}

{ // Windows: see-through, not walk-through; smashing is loud and leaves glass that crunches.
  const { w, win } = roomWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, z, 18, 26); place(w, p, 13, 10); // outside the window
  assert(!isPassable(w, 12, 10) && visibilityAt(w, p, 11, 10) > 0, 'window: blocks movement, not sight');
  assert(!validTargets(w, p, CONFIG.throw.range).has(10 * w.width + 11), 'window: you cannot throw through glass');
  let smash = null;
  w.events.on('noise_made', (d) => { if (d.level === CONFIG.materials.glass.breakNoise) smash = d; });
  const t0 = w.turn;
  assert(!playerAct(w, { type: 'move', dx: -1, dy: 0 }) && !win.Window.broken && w.turn === t0, 'window: walking into it does NOT smash it');
  assert(!playerAct(w, { type: 'bash', x: 12, y: 12 }), 'window: bash needs an adjacent obstacle');
  playerAct(w, { type: 'bash', x: 12, y: 10 });
  assert(win.Window.broken && smash && w.glass[10 * w.width + 12] > 0, 'window: one blow smashes it, loudly, leaving glass');
  assert(isPassable(w, 12, 10), 'window: climb through a broken window');
  playerAct(w, { type: 'sneak', on: true });
  let crunch = null;
  w.events.on('noise_made', (d) => { if (d.sourceId === p.id && d.level === CONFIG.build.glassCrunchNoise) crunch = d; });
  playerAct(w, { type: 'move', dx: -1, dy: 0 });
  assert(crunch && crunch.x === 12, 'glass: crunches underfoot even when sneaking');
  assert(rememberedAt(w, p, 12, 10).glass > 0, 'glass: remembered in map memory');
  console.log('window: see-through, smashable, glass crunches OK');
}

{ // Planks: barricade an adjacent window; blows hit the barricade first.
  const { w, win } = roomWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, z, 18, 26); place(w, p, 11, 10); // inside, next to the window
  const planks = makeItem(w, 'planks', 11, 10); playerAct(w, { type: 'pickup' });
  let hammer = false;
  w.events.on('noise_made', (d) => { if (d.level === CONFIG.build.hammerNoise && d.sourceId === p.id) hammer = true; });
  assert(playerAct(w, { type: 'use', itemId: planks }) && win.Barricade && hammer, 'planks: barricade the window (noisy)');
  assert(!p.Inventory.items.includes(planks), 'planks: used up');
  assert(visibilityAt(w, p, 13, 10) === 0, 'planks: a boarded window blocks sight');
  playerAct(w, { type: 'bash', x: 12, y: 10 });
  assert(win.Barricade.hp === CONFIG.materials[CONFIG.build.barricade].hp - 1 && !win.Window.broken, 'planks: blows hit the barricade first');
  const n = p.Inventory.items.length;
  const planks2 = makeItem(w, 'planks', 11, 10); playerAct(w, { type: 'pickup' });
  assert(!playerAct(w, { type: 'use', itemId: planks2 }) && p.Inventory.items.includes(planks2), 'planks: nothing left to barricade = kept, no turn');
  console.log('planks: barricade, soaks blows, blocks sight OK');
}

{ // A zombie that knows you're inside bashes the door to get at you (and it's noisy).
  const { w, door } = roomWorld({ locked: true });
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 10, 15);
  z.Brain.goal = { x: 10, y: 10, why: 'heard' }; // it heard you in there
  let blows = 0;
  w.events.on('structure_damaged', (d) => { if (d.by === z.id && d.id === door.id) blows++; });
  for (let i = 0; i < 20 && !blows; i++) playerAct(w, { type: 'wait' });
  assert(blows >= 1, 'zombie: bashes the door to reach a player it knows is inside');
  for (let i = 0; i < 40 && !door.Door.broken; i++) playerAct(w, { type: 'wait' });
  assert(door.Door.broken, 'zombie: eventually breaks the door down');
  console.log('zombie: bashes doors to reach you OK');
}

{ // Materials table: every material has the same fields, and properties drive behaviour.
  for (const [name, m] of Object.entries(CONFIG.materials)) {
    for (const k of ['hp', 'flammability', 'heatDamage', 'seeThrough', 'hitNoise', 'breakNoise']) assert(k in m, `materials: ${name} is missing ${k}`);
    assert(m.heatDamage >= 1 && m.heatDamage <= 3, `materials: ${name} heatDamage must be 1-3 (fire hurts everything)`);
    assert(m.flammability >= 0 && m.flammability <= 3 && m.hitNoise >= 0 && m.hitNoise <= 3 && m.breakNoise >= 0 && m.breakNoise <= 3, `materials: ${name} levels must be 0-3`);
  }
  for (const n of ['stone', 'slate', 'brick', 'wood', 'glass', 'corrugatedMetal', 'thatch']) assert(CONFIG.materials[n], `materials: ${n} defined`);
  // A see-through door (glass) doesn't block sight; a metal window does; health follows material.
  const { w } = roomWorld();
  const p = playerOf(w);
  place(w, zombieOf(w), 18, 26);
  const glassDoor = w.entities.get(makeDoor(w, 5, 5, { material: 'glass' }));
  const metalWin = w.entities.get(makeWindow(w, 5, 7, { material: 'corrugatedMetal' }));
  assert(glassDoor.Blocks && !glassDoor.Opaque && glassDoor.Structure.hp === CONFIG.materials.glass.hp, 'materials: glass door blocks movement, not sight');
  assert(metalWin.Blocks && metalWin.Opaque && metalWin.Structure.hp === CONFIG.materials.corrugatedMetal.hp, 'materials: metal window blocks sight');
  let clang = null;
  w.events.on('noise_made', (d) => { if (d.x === 5 && d.y === 7) clang = d.level; });
  place(w, p, 5, 6);
  playerAct(w, { type: 'bash', x: 5, y: 7 });
  assert(clang === CONFIG.materials.corrugatedMetal.hitNoise, 'materials: hit noise comes from the material');
  console.log('materials: table complete, properties drive sight/health/noise OK');
}

// 12. Save / load.
function randomAction(world, drv) {
  const p = playerOf(world);
  const inv = p.Inventory.items;
  const r = drv.int(12);
  const dir = { dx: drv.int(3) - 1, dy: drv.int(3) - 1 };
  if (r === 0) return { type: 'wait' };
  if (r === 1) return { type: 'shove', ...dir };
  if (r === 2 && inv.length) return { type: 'use', itemId: inv[drv.int(inv.length)] };
  if (r === 3) return { type: 'sneak', on: drv.chance(0.5) };
  if (r === 4) return { type: 'bash', x: p.Position.x + dir.dx, y: p.Position.y + dir.dy };
  if (r === 5) return { type: 'door', x: p.Position.x + dir.dx, y: p.Position.y + dir.dy };
  if (r === 6 && inv.length) return { type: 'throw', itemId: inv[drv.int(inv.length)], x: p.Position.x + drv.int(7) - 3, y: p.Position.y + drv.int(7) - 3 };
  return { type: 'move', ...dir };
}

for (const seed of [3, 42, 777]) {
  const a = createWorld(seed);
  playerOf(a).Health.hp = playerOf(a).Health.max = 1e9; // long run
  const drv = createRng(seed + 1);
  for (let i = 0; i < 300; i++) playerAct(a, randomAction(a, drv));
  const saved = serialize(a);
  const b = deserialize(saved, createWorld);
  assert(serialize(b) === saved, `save: seed ${seed} round trip is exact`);
  // Carry on playing both with the same inputs: they must stay identical.
  const drvA = createRng(seed + 2), drvB = createRng(seed + 2);
  for (let i = 0; i < 300; i++) { playerAct(a, randomAction(a, drvA)); playerAct(b, randomAction(b, drvB)); }
  assert(serialize(a) === serialize(b), `save: seed ${seed} loaded game plays on identically`);
  assert(b.inputs.length === a.inputs.length, `save: seed ${seed} recorded inputs carried over`);
}
console.log('save: exact round trip, loaded games play on identically OK');

{ // Old or broken saves are refused (the game then starts fresh instead of crashing).
  const w = createWorld(3);
  const data = JSON.parse(serialize(w));
  data.version = CONFIG.save.version - 1;
  let threw = false;
  try { deserialize(JSON.stringify(data), createWorld); } catch (e) { threw = e instanceof SaveError; }
  assert(threw, 'save: an older version is refused');
  threw = false;
  try { deserialize('{not json', createWorld); } catch (e) { threw = e instanceof SaveError; }
  assert(threw, 'save: corrupt data is refused');
  // Memory, inventory and door state survive.
  const p = playerOf(w);
  const door = query(w, 'Door')[0];
  door.Door.locked = false; door.Door.open = true;
  const bat = query(w, 'Item').find((i) => i.Item.type === 'bat');
  delete bat.Position; p.Inventory.items.push(bat.id); p.Inventory.wielded = bat.id;
  const w2 = deserialize(serialize(w), createWorld);
  const p2 = playerOf(w2);
  assert(p2.Inventory.wielded === bat.id && query(w2, 'Door')[0].Door.open, 'save: inventory and door state survive');
  assert(p2.Memory.tiles.filter(Boolean).length === p.Memory.tiles.filter(Boolean).length, 'save: memory snapshots survive');
  assert(structureAt(w2, door.Position.x, door.Position.y)?.id === door.id, 'save: structure lookup rebuilt');
  console.log('save: old/corrupt saves refused; inventory, doors, memory survive OK');
}

// 13. Days and the death page.
{
  const N = (24 * 60) / CONFIG.time.minutesPerTick; // ticks per day
  const toMidnight = ((24 - CONFIG.time.startHour) * 60) / CONFIG.time.minutesPerTick;
  assert(clockOf(0) === `${String(CONFIG.time.startHour).padStart(2, '0')}:00` && clockOf(1) === `${String(CONFIG.time.startHour).padStart(2, '0')}:0${CONFIG.time.minutesPerTick}`, 'time: clock starts at startHour and ticks forward');
  assert(dayOf(toMidnight - 1) === 1 && dayOf(toMidnight) === 2 && clockOf(toMidnight) === '00:00', 'time: day rolls over at midnight');
  assert(daysSurvived(N - 1) === 0 && daysSurvived(N) === 1 && daysSurvived(2 * N) === 2, 'time: days survived = full 24h since the start');
  { // a sneaking step takes twice as long on the clock
    const w = openWorld(); const p = playerOf(w); place(w, zombieOf(w), 18, 26); place(w, p, 5, 5);
    playerAct(w, { type: 'move', dx: 1, dy: 0 });
    const walk = w.tick;
    playerAct(w, { type: 'sneak', on: true }); playerAct(w, { type: 'move', dx: 1, dy: 0 });
    assert(w.tick - walk === 2 * walk, 'time: sneaking steps take twice as long');
  }
  // Kills count only zombies the player kills.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 11, 10);
  z.Health.hp = 1; p.Melee.hitChance = 1; z.Brain.seesPrey = true; z.Brain.trackingId = p.id;
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(w.stats.kills === 1, 'stats: killing a zombie counts');
  assert(deserialize(serialize(w), createWorld).stats.kills === 1, 'stats: kills are saved');
  const old = JSON.parse(serialize(w)); delete old.stats;
  assert(deserialize(JSON.stringify(old), createWorld).stats.kills === 0, 'stats: older saves without stats still load');
  // Death page wording.
  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, p2, 10, 10); place(w2, z2, 11, 10);
  p2.Health.hp = 1; z2.Melee.hitChance = 1; w2.tick = 2 * N + 5;
  for (let i = 0; i < 6 && !w2.gameOver; i++) playerAct(w2, { type: 'wait' });
  const t = deathText(w2);
  assert(t.cause === 'Bitten by a zombie' && t.days === 2 && t.seed === w2.seed && t.kills === 0 && /^\d\d:\d\d$/.test(t.clock), `death page: ${JSON.stringify(t)}`);
  const w3 = openWorld();
  const p3 = playerOf(w3);
  place(w3, zombieOf(w3), 18, 26); place(w3, p3, 5, 5);
  p3.Health.hp = 1; p3.Bleeding = { level: 3, timer: 0 };
  for (let i = 0; i < 10 && !w3.gameOver; i++) playerAct(w3, { type: 'wait' });
  assert(deathText(w3).cause === 'Bled out', 'death page: bled out');
  console.log('days + death page: days, kills (saved), causes OK');
}

// 14. Zombie balance targets.
{
  const Z = CONFIG.zombie.melee, P = CONFIG.player.health;
  const bitesToKill = Math.ceil(P / Z.damage);
  assert(Z.hitChance >= 0.8, 'balance: most zombie attacks land');
  assert(bitesToKill >= 3 && bitesToKill <= 4, `balance: 3-4 bites kill a healthy player (now ${bitesToKill})`);
  assert(Z.woundChance > CONFIG.player.melee.woundChance && Z.woundChance >= 0.6, 'balance: bites usually cause bleeding');
  // Persistence: searches for a long while, and a new noise mid-search restarts the hunt there.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  w.light.fill(0);
  place(w, p, 3, 3); place(w, z, 14, 14);
  z.Brain.goal = { x: 14, y: 14, why: 'heard' }; // already at the spot: about to search
  let searchMoves = 0, gaveUp = false;
  w.events.on('noise_investigated', () => { gaveUp = true; });
  for (let i = 0; i < 12 && !gaveUp; i++) { playerAct(w, { type: 'wait' }); if (z.Brain.goal && z.Brain.goal.search !== undefined) searchMoves++; }
  assert(!gaveUp && z.Brain.goal && z.Brain.goal.search !== undefined, 'persist: still searching after 12 turns');
  makeNoise(w, 18, 20, 2, p.id); // something new
  assert(z.Brain.goal.x === 18 && z.Brain.goal.y === 20 && z.Brain.goal.search === undefined, 'persist: a new noise renews its interest and sends it there');
  console.log(`balance: hit ${Z.hitChance}, ${bitesToKill} bites to kill, wound ${Z.woundChance}; long search, noise renews OK`);
}

// 15. Tuning panel (sim side).
{
  const speed = TUNABLES.find((t) => t.path === 'zombie.speed');
  const hit = TUNABLES.find((t) => t.path === 'zombie.melee.hitChance');
  const def = getPath('zombie.speed');
  nudge(speed, 1);
  assert(getPath('zombie.speed') === def + speed.step && currentOverrides()['zombie.speed'] === def + speed.step, 'tune: nudge changes CONFIG and shows as an override');
  for (let i = 0; i < 50; i++) nudge(hit, 1);
  assert(getPath('zombie.melee.hitChance') === hit.max, 'tune: values clamp to their range');
  const w = createWorld(3);
  syncWorld(w);
  const z = query(w, 'Brain')[0];
  assert(z.Actor.speed === def + speed.step && z.Melee.hitChance === hit.max, 'tune: syncWorld updates zombies already on the map');
  resetAll();
  assert(getPath('zombie.speed') === defaultOf('zombie.speed') && Object.keys(currentOverrides()).length === 0, 'tune: reset restores defaults');
  applyOverrides({ 'light.range': 7, 'nonsense.path': 5, 'zombie.speed': 'fast' });
  assert(getPath('light.range') === 7 && getPath('zombie.speed') === def, 'tune: saved overrides apply; bad ones are ignored');
  resetAll();
  console.log('tune: nudge, clamp, sync to live zombies, reset, load overrides OK');
}

// 16. Village land (step 14a): generated in layers.
for (const seed of [1, 5, 11, 42, 2024]) {
  const w = createWorld(seed, { map: 'village' });
  const again = createWorld(seed, { map: 'village' });
  assert(w.tiles.every((t, i) => t === again.tiles[i]), `village ${seed}: same seed, same land`);
  const count = (t) => w.tiles.filter((x) => x === t).length;
  const T = (x, y) => (inBounds(w, x, y) ? tileAt(w, x, y) : -1);
  const n4 = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => T(x + dx, y + dy));
  const each = (t, fn) => { for (let i = 0; i < w.tiles.length; i++) if (w.tiles[i] === t) fn(i % w.width, Math.floor(i / w.width)); };
  for (const [name, t] of Object.entries({ road: TILE.ROAD, pavement: TILE.PAVEMENT, lane: TILE.LANE, ginnel: TILE.GINNEL, yard: TILE.YARD, gate: TILE.GATE, footpath: TILE.PATH, plot: TILE.PLOT, gravestone: TILE.GRAVE, beck: TILE.STREAM, bridge: TILE.BRIDGE, wall: TILE.DRYSTONE, tree: TILE.TREE, fell: TILE.FELL, bracken: TILE.BRACKEN, lake: TILE.LAKE })) {
    assert(count(t) > 0, `village ${seed}: has ${name}`);
  }
  assert(count(TILE.TREE) >= 20, `village ${seed}: trees along the beck and a wood`);
  assert(count(TILE.DRYSTONE) > 3 * Math.max(1, count(TILE.HEDGE)), `village ${seed}: walls are mostly dry stone`);
  // 1. Valley: fellside on both sides, slower to cross than the valley floor.
  const midRow = w.bridgeRow;
  const fellish = [TILE.FELL, TILE.BRACKEN, TILE.ROCK, TILE.SCREE, TILE.TREE, TILE.DRYSTONE, TILE.GATE, TILE.PATH, TILE.STREAM, TILE.BRIDGE];
  assert(fellish.includes(T(1, midRow)) && fellish.includes(T(w.width - 2, midRow)), `village ${seed}: fellside on both sides`);
  assert(TILE_INFO[TILE.FELL].moveCost > TILE_INFO[TILE.GRASS].moveCost && TILE_INFO[TILE.PATH].moveCost === 1, 'village: fellside is slow going; footpaths are not');
  // 2. The road runs the length of the valley and never meets water except on a bridge.
  for (let y = 0; y < w.height; y++) {
    let row = 0; for (let x = 0; x < w.width; x++) if ([TILE.ROAD, TILE.BRIDGE].includes(T(x, y))) row++;
    assert(row >= 2, `village ${seed}: road broken at row ${y}`);
  }
  each(TILE.STREAM, (x, y) => assert(!n4(x, y).includes(TILE.ROAD), `village ${seed}: beck touches the road at ${x},${y} without a bridge`));
  assert([TILE.BRIDGE, TILE.ROAD].includes(T(playerOf(w).Position.x, playerOf(w).Position.y)), `village ${seed}: you start at the bridge`);
  // Road, pavement and lane are different tiles; pavements line the road.
  assert(new Set([TILE.ROAD, TILE.PAVEMENT, TILE.LANE]).size === 3, 'village: road, pavement and lane are different tiles');
  each(TILE.PAVEMENT, (x, y) => assert(n4(x, y).includes(TILE.ROAD) || n4(x, y).includes(TILE.BRIDGE) || n4(x, y).includes(TILE.PAVEMENT), `village ${seed}: pavement off the street at ${x},${y}`));
  // 3. High street: plots of every kind; terraced plots front straight onto the pavement.
  const kinds = {}; for (const pl of w.plots) kinds[pl.kind] = (kinds[pl.kind] || 0) + 1;
  for (const k of ['cottage', 'pub', 'shop', 'church', 'farmhouse', 'barn']) assert(kinds[k] >= 1, `village ${seed}: has a ${k} plot`);
  assert(kinds.cottage >= 6, `village ${seed}: ${kinds.cottage} cottages`);
  for (const pl of w.plots) {
    for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) assert(T(x, y) === TILE.PLOT, `village ${seed}: ${pl.kind} plot not clear at ${x},${y}`);
    assert(!TILE_INFO[T(pl.front.x, pl.front.y)].blocks, `village ${seed}: ${pl.kind} front blocked`);
    if (['cottage', 'pub', 'shop'].includes(pl.kind)) {
      assert(T(pl.front.x, pl.front.y) === TILE.PAVEMENT, `village ${seed}: ${pl.kind} doesn't front the pavement`);
      assert(T(pl.back.x, pl.back.y) === TILE.YARD, `village ${seed}: ${pl.kind} has no yard behind`);
    }
  }
  // Terraces are continuous: neighbouring street plots share an edge.
  const street = w.plots.filter((p) => ['cottage', 'pub', 'shop'].includes(p.kind));
  assert(street.some((a) => street.some((b) => a !== b && a.x === b.x && a.y + a.h === b.y)), `village ${seed}: no terraced rows`);
  const pub = w.plots.find((p) => p.kind === 'pub');
  assert(Math.abs(pub.y + pub.h / 2 - w.bridgeRow) <= 7, `village ${seed}: the pub is by the bridge`);
  // 4. Ginnels run from the pavement through to a back lane.
  let through = 0;
  each(TILE.GINNEL, (x, y) => { if (n4(x, y).includes(TILE.PAVEMENT) && [x - 1, x + 1].some((gx) => T(gx, y) === TILE.GINNEL)) { let gx = x; const d = T(x + 1, y) === TILE.GINNEL ? 1 : -1; while (T(gx, y) === TILE.GINNEL) gx += d; if (T(gx, y) === TILE.LANE) through++; } });
  assert(through >= 2, `village ${seed}: ${through} ginnels reach a back lane`);
  // 5. The green and the church in its walled graveyard, near the bridge.
  assert(w.green && w.graveyard && Math.abs(w.green.y + w.green.h / 2 - w.bridgeRow) <= 10, `village ${seed}: green by the bridge`);
  const church = w.plots.find((p) => p.kind === 'church'), g = w.graveyard;
  assert(church.x > g.x && church.y > g.y && church.x + church.w < g.x + g.w && church.y + church.h < g.y + g.h, `village ${seed}: church inside its graveyard`);
  for (let x = g.x; x < g.x + g.w; x++) for (const y of [g.y, g.y + g.h - 1]) assert([TILE.DRYSTONE, TILE.GATE].includes(T(x, y)), `village ${seed}: graveyard wall gap at ${x},${y}`);
  each(TILE.GRAVE, (x, y) => assert(x > g.x && x < g.x + g.w - 1 && y > g.y && y < g.y + g.h - 1, `village ${seed}: gravestone outside the graveyard`));
  // 6. Outskirts: farms at the end of side lanes; footpaths reach the map edge.
  assert(w.farms.length >= 1, `village ${seed}: has a farm`);
  for (const f of w.farms) assert(T(f.gate.x, f.gate.y) === TILE.GATE && n4(f.gate.x, f.gate.y).includes(TILE.LANE), `village ${seed}: farm gate on its lane`);
  let edgePaths = 0; for (let y = 0; y < w.height; y++) for (const x of [0, w.width - 1]) if ([TILE.PATH, TILE.GATE, TILE.BRIDGE].includes(T(x, y))) edgePaths++;
  assert(edgePaths >= 1, `village ${seed}: footpaths lead up the fellside`);
  // Everything walkable is reachable from the start (8-way moves).
  const p = playerOf(w);
  const seen = new Uint8Array(w.width * w.height);
  const q = [[p.Position.x, p.Position.y]]; seen[p.Position.y * w.width + p.Position.x] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, i = ny * w.width + nx;
      if (!inBounds(w, nx, ny) || seen[i] || TILE_INFO[w.tiles[i]].blocks) continue;
      seen[i] = 1; q.push([nx, ny]);
    }
  }
  for (let i = 0; i < w.tiles.length; i++) if (!TILE_INFO[w.tiles[i]].blocks) assert(seen[i], `village ${seed}: unreachable tile ${i % w.width},${Math.floor(i / w.width)}`);
}
console.log('village: layers - valley, road + bridge, high street + pavements, terraces, ginnels + yards, green + church, farms, fields, footpaths; all reachable OK');

{ // Ground: hedges slow (x3), streams slow (x2) and splash, walls/hedges/trees block sight, pond doesn't.
  const w = openWorld([[12, 5]]);
  const p = playerOf(w), z = zombieOf(w);
  place(w, z, 18, 26);
  w.tiles[5 * w.width + 6] = TILE.HEDGE; w.tiles[5 * w.width + 8] = TILE.STREAM; w.tiles[9 * w.width + 5] = TILE.POND;
  w.tiles[12 * w.width + 5] = TILE.TREE; w.tiles[12 * w.width + 8] = TILE.DRYSTONE;
  place(w, p, 5, 5);
  let t = w.tick;
  playerAct(w, { type: 'move', dx: 1, dy: 0 }); // into the hedge
  assert(w.tick - t === TILE_INFO[TILE.HEDGE].moveCost, `ground: hedge step took ${w.tick - t} ticks`);
  playerAct(w, { type: 'move', dx: 1, dy: 0 }); // out to grass/floor (7,5)
  let splash = null;
  w.events.on('noise_made', (d) => { if (d.x === 8 && d.y === 5) splash = d.level; });
  t = w.tick;
  playerAct(w, { type: 'move', dx: 1, dy: 0 }); // into the stream
  assert(w.tick - t === TILE_INFO[TILE.STREAM].moveCost && splash === TILE_INFO[TILE.STREAM].stepNoise, `ground: stream step ${w.tick - t} ticks, splash ${splash}`);
  assert(!playerAct(w, { type: 'move', dx: 0, dy: 1 }) || true, 'ground: (move off)');
  place(w, p, 5, 7);
  assert(!isPassable(w, 5, 9) && visibilityAt(w, p, 5, 10) > 0, 'ground: the pond blocks walking, not sight');
  place(w, p, 5, 10);
  assert(visibilityAt(w, p, 5, 13) === 0, 'ground: a tree blocks sight');
  place(w, p, 8, 10);
  assert(visibilityAt(w, p, 8, 13) === 0, 'ground: a dry-stone wall blocks sight');
  place(w, p, 6, 3);
  assert(visibilityAt(w, p, 6, 7) === 0, 'ground: a hedge blocks sight');
  // Zombies are slowed by rough ground too.
  const w2 = openWorld();
  const z2 = zombieOf(w2), p2 = playerOf(w2);
  place(w2, p2, 5, 5); place(w2, z2, 10, 10);
  w2.tiles[10 * w2.width + 11] = TILE.STREAM;
  w2.light.fill(0);
  z2.Brain.goal = { x: 15, y: 10, why: 'heard' };
  CONFIG.zombie.staggerChance = 0;
  const actions0 = z2.Actor.actions, tick0 = w2.tick;
  while (z2.Position.x === 10 && w2.tick - tick0 < 20) playerAct(w2, { type: 'wait' });
  const stepTick = w2.tick;
  while (z2.Position.x === 11 && w2.tick - stepTick < 20) playerAct(w2, { type: 'wait' });
  CONFIG.zombie.staggerChance = 0.2;
  assert(w2.tick - stepTick >= 3, `ground: a zombie wading the stream takes longer to leave it (${w2.tick - stepTick} ticks)`);
  console.log('ground: hedge/stream slow + splash, sight blockers, zombies slowed too OK');
}

{ // Village: long stress run, save round trip, test grid still available.
  const w = createWorld(7, { map: 'village' });
  playerOf(w).Health.hp = playerOf(w).Health.max = 1e9;
  const drv = createRng(99);
  for (let i = 0; i < 2000; i++) { playerAct(w, randomAction(w, drv)); checkPositions(w, 7); }
  const back = deserialize(serialize(w), createWorldAny);
  assert(back.map === 'village' && serialize(back) === serialize(w), 'village: saves round-trip and remember the map');
  const tg = createWorldAny(7, { map: 'testgrid' });
  assert(tg.map === 'testgrid' && tg.width === CONFIG.grid.width && query(tg, 'Door').length === 1, 'village: the test grid is still available');
  console.log(`village: ${w.turn}-turn stress run, save round trip, test grid available OK`);
}

console.log('PASS');
