// Headless test run: drive the sim for N turns without rendering.
// Usage: node tests/headless.js [turns] [seed]
import { createWorld, tileAt, inBounds, query } from '../src/sim/world.js';
import { TILE_INFO, TILE } from '../src/sim/gen/testgrid.js';
import { refreshAllVision, canSee, lineClear, visibilityAt, sightRadius, rememberedTile } from '../src/sim/systems/vision.js';
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
  for (const t of ['action_attempted', 'entity_moved', 'move_blocked', 'entity_waited', 'entity_staggered', 'turn_ended', 'prey_spotted', 'prey_lost', 'entity_seen']) {
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
  const driver = createRng(seed ^ 0xabcdef); // fake player input, separate from the sim RNG
  let acted = 0;
  for (let i = 0; i < TURNS; i++) {
    const r = driver.int(10);
    const action = r === 0 ? { type: 'wait' } : { type: 'move', dx: driver.int(3) - 1, dy: driver.int(3) - 1 };
    if (playerAct(world, action)) acted++;
    checkPositions(world, seed);
    const m = log.message;
    if (m) assert(typeof m.text === 'string' && m.text.length <= 32, `seed ${seed}: bad message ${JSON.stringify(m)}`);
    if (m && m.priority === PRIORITY.danger) sawDanger = true;
    for (const k of playerOf(world).Vision.visible.keys()) everSeen.add(k);
  }
  // Map memory = exactly the tiles ever seen, each remembered as it is (tiles don't change yet).
  const mem = playerOf(world).Memory.tiles;
  for (let i = 0; i < mem.length; i++) {
    assert(!!mem[i] === everSeen.has(i), `seed ${seed}: memory mismatch at tile ${i}`);
    if (mem[i]) assert(mem[i] - 1 === world.tiles[i], `seed ${seed}: remembered wrong tile at ${i}`);
  }
  assert(counts.turn_ended === acted, `seed ${seed}: turn_ended ${counts.turn_ended} != ${acted}`);
  assert(counts.action_attempted === TURNS, `seed ${seed}: action_attempted ${counts.action_attempted} != ${TURNS}`);
  assert(counts.move_blocked > 0 && counts.entity_moved > 0 && counts.entity_staggered > 0 && counts.prey_spotted > 0 && counts.entity_seen > 0, `seed ${seed}: missing events ${JSON.stringify(counts)}`);
  assert(sawDanger, `seed ${seed}: never warned that the zombie was adjacent`);
  assert(world.turn === acted, `seed ${seed}: turn ${world.turn} != actions ${acted}`);
  assert(world.inputs.length === acted, `seed ${seed}: inputs not recorded`);
  assert(!playerAct(world, { type: 'move', dx: 2, dy: 0 }), 'non-adjacent move accepted');

  // Scheduler: actions match speed ratio.
  const z = zombieOf(world);
  const expected = Math.floor((acted * CONFIG.zombie.speed) / CONFIG.player.speed);
  assert(Math.abs(z.Actor.actions - expected) <= 1, `seed ${seed}: zombie acted ${z.Actor.actions}, expected ~${expected}`);

  const replayed = replay(createWorld, seed, world.inputs);
  assert(snapshot(replayed) === snapshot(world), `seed ${seed}: replay diverged`);

  console.log(`seed ${seed}: ${world.turn} turns OK, events ${JSON.stringify(counts)}, zombie acted ${z.Actor.actions}x, replay matches`);
}
// 3. Field of view and zombie sight, on a hand-made open map.
function openWorld(walls = []) {
  const w = createWorld(7);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    const edge = x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1;
    w.tiles[y * w.width + x] = edge ? TILE.WALL : TILE.FLOOR;
  }
  for (const [x, y] of walls) w.tiles[y * w.width + x] = TILE.WALL;
  playerOf(w).Memory.tiles.fill(0); // forget the generated map
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
  assert(seesTile(w, p, 5, 5 + range(p) - 1), 'fov: far tile in the open should be visible on a clear day');
  place(w, p, 2, 2);
  assert(!seesTile(w, p, 2 + range(p) + 1, 2 + range(p) + 1), 'fov: tile beyond light range should be hidden');
  const saved = CONFIG.light.range;
  CONFIG.light.range = 3; refreshAllVision(w);
  assert(seesTile(w, p, 2, 5) && !seesTile(w, p, 2, 7), 'fov: shorter light range should shorten sight');
  CONFIG.light.range = saved; refreshAllVision(w);
  console.log('fov: walls block sight, light range limits distance OK');
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
  assert(lv(10, 14) === 3 && lv(10, 24) === 3, 'levels: near and far tiles equally visible in daylight');

  w.light[16 * w.width + 10] = 1; w.light[17 * w.width + 10] = 2; refreshAllVision(w);
  assert(lv(10, 16) === 1 && lv(10, 17) === 2 && lv(10, 18) === 3, 'levels: visibility should equal tile light');

  w.light.fill(0); place(w, z, 11, 14);
  assert(lv(10, 14) === 1, 'levels: you always see your own tile');
  assert(lv(11, 14) === 0 && !canSee(w, p, z) && !canSee(w, z, p), 'levels: in pitch dark nobody sees anybody');

  w.light.fill(CONFIG.light.ambient); w.light[20 * w.width + 10] = 1; place(w, z, 10, 20);
  const saved = CONFIG.vision.minLevelToSpot;
  CONFIG.vision.minLevelToSpot = 2;
  assert(!canSee(w, p, z), 'levels: a zombie on a dim tile should not be noticed when level 2 is needed');
  CONFIG.vision.minLevelToSpot = saved;
  assert(canSee(w, p, z), 'levels: a dim zombie is noticed at the default threshold');
  console.log('levels: from light, darkness hides, spot threshold OK');
}

{ // "Comes into view" only for zombies on screen.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 12, 10); // 7 tiles to the side: in sight, but off a 5-tile half-width screen
  const offLog = createMessageLog(w, { onScreen: (x) => Math.abs(x - p.Position.x) <= 5 });
  playerAct(w, { type: 'wait' });
  assert(canSee(w, p, z), 'onscreen: zombie should be in sight');
  assert(offLog.message?.text !== 'A zombie comes into view.', 'onscreen: off-screen zombie should not be announced');
  console.log('onscreen: off-screen zombies not announced OK');
}

{ // Map memory keeps seen tiles after you leave; inspect describes what you know.
  const w = openWorld([[3, 3]]);
  const p = playerOf(w), z = zombieOf(w);
  p.Position.x = 4; p.Position.y = 4;
  place(w, z, 18, 26);
  assert(rememberedTile(w, p, 3, 3) === TILE.WALL, 'memory: seen wall remembered');
  assert(describeTile(w, 3, 3) === 'A wall.', `inspect: visible wall, got ${describeTile(w, 3, 3)}`);
  assert(describeTile(w, 5, 5) === 'Open ground.', 'inspect: visible floor');
  assert(describeTile(w, 4, 4) === "That's you.", 'inspect: own tile');
  place(w, p, 18, 12); // walk away: (3,3) is now beyond the light range
  assert(visibilityAt(w, p, 3, 3) === 0, 'memory: (3,3) should be out of sight now');
  assert(rememberedTile(w, p, 3, 3) === TILE.WALL, 'memory: wall still remembered out of sight');
  assert(describeTile(w, 3, 3) === 'A wall, out of sight.', `inspect: remembered wall, got ${describeTile(w, 3, 3)}`);
  assert(rememberedTile(w, p, 2, 26) === null && describeTile(w, 2, 26) === 'Unexplored.', 'inspect: never-seen tile');
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
  assert(!spotted && z.Brain.lastSeen === null, 'blind: zombie out of sight should not track the player');
  console.log('blind: zombie out of sight just wanders OK');
}

{ // Break line of sight: the zombie goes to where it last saw you, then gives up.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 5, 13);
  playerAct(w, { type: 'wait' }); playerAct(w, { type: 'wait' });
  assert(z.Brain.lastSeen, 'lastSeen: zombie should have spotted the player');
  const seenAt = { ...z.Brain.lastSeen };
  place(w, p, 17, 2); // vanish out of range
  let lost = false;
  w.events.on('prey_lost', () => { lost = true; });
  let reached = false;
  for (let i = 0; i < 40 && !lost; i++) {
    playerAct(w, { type: 'wait' });
    if (cheb(z.Position, seenAt) <= 1) reached = true;
  }
  assert(reached && lost, `lastSeen: zombie should search the last-seen spot then give up (reached ${reached}, lost ${lost})`);
  console.log('lastSeen: zombie searches last-seen spot, then gives up OK');
}

console.log('PASS');
