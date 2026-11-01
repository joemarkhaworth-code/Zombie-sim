// Headless test run: drive the sim for N turns without rendering.
// Usage: node tests/headless.js [turns] [seed]
import { createWorld, tileAt, inBounds, query } from '../src/sim/world.js';
import { TILE_INFO, TILE } from '../src/sim/gen/testgrid.js';
import { refreshAllVision, canSee } from '../src/sim/systems/vision.js';
import { playerAct, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { CONFIG } from '../src/config.js';
import { createEventBus } from '../src/sim/events.js';
import { createMessageLog, PRIORITY } from '../src/render/messages.js';

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
  return w;
}
function place(w, e, x, y) { e.Position.x = x; e.Position.y = y; refreshAllVision(w); }
const seesTile = (w, e, x, y) => e.Vision.visible.has(y * w.width + x);
const range = (lvl) => CONFIG.vision.rangeByLevel[lvl];

{ // Walls block sight; range is limited.
  const w = openWorld([[7, 5]]);
  const p = playerOf(w);
  place(w, p, 5, 5);
  place(w, zombieOf(w), 18, 26);
  assert(seesTile(w, p, 7, 5), 'fov: wall itself should be visible');
  assert(!seesTile(w, p, 8, 5) && !seesTile(w, p, 9, 5), 'fov: tiles behind a wall should be hidden');
  assert(seesTile(w, p, 5, 5 + range(CONFIG.player.sight) - 1), 'fov: tile within range should be visible');
  assert(!seesTile(w, p, 5, 5 + range(CONFIG.player.sight) + 1), 'fov: tile beyond range should be hidden');
  console.log('fov: walls block sight, range limited OK');
}

{ // A zombie that can see you closes in, and the status line says so.
  const w = openWorld();
  const log = createMessageLog(w);
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 5, 10 + range(CONFIG.zombie.sight) - 1);
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
