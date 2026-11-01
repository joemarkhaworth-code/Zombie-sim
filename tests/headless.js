// Headless test run: drive the sim for N turns without rendering.
// Usage: node tests/headless.js [turns] [seed]
import { createWorld, tileAt, inBounds, query } from '../src/sim/world.js';
import { TILE_INFO } from '../src/sim/gen/testgrid.js';
import { playerAct, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { CONFIG } from '../src/config.js';

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

for (const seed of SEEDS) {
  // 1. Random play: no crashes, no illegal positions, replay is exact.
  const world = createWorld(seed);
  const driver = createRng(seed ^ 0xabcdef); // fake player input, separate from the sim RNG
  let acted = 0;
  for (let i = 0; i < TURNS; i++) {
    const r = driver.int(10);
    const action = r === 0 ? { type: 'wait' } : { type: 'move', dx: driver.int(3) - 1, dy: driver.int(3) - 1 };
    if (playerAct(world, action)) acted++;
    checkPositions(world, seed);
  }
  assert(world.turn === acted, `seed ${seed}: turn ${world.turn} != actions ${acted}`);
  assert(world.inputs.length === acted, `seed ${seed}: inputs not recorded`);
  assert(!playerAct(world, { type: 'move', dx: 2, dy: 0 }), 'non-adjacent move accepted');

  // Scheduler: actions match speed ratio.
  const z = zombieOf(world);
  const expected = Math.floor((acted * CONFIG.zombie.speed) / CONFIG.player.speed);
  assert(Math.abs(z.Actor.actions - expected) <= 1, `seed ${seed}: zombie acted ${z.Actor.actions}, expected ~${expected}`);

  const replayed = replay(createWorld, seed, world.inputs);
  assert(snapshot(replayed) === snapshot(world), `seed ${seed}: replay diverged`);

  // 2. Player waits: the zombie should close in.
  const w2 = createWorld(seed);
  const start = cheb(zombieOf(w2).Position, playerOf(w2).Position);
  for (let i = 0; i < 200; i++) playerAct(w2, { type: 'wait' });
  const end = cheb(zombieOf(w2).Position, playerOf(w2).Position);
  assert(end < start, `seed ${seed}: zombie didn't approach (${start} -> ${end})`);

  console.log(`seed ${seed}: ${world.turn} turns OK, zombie acted ${z.Actor.actions}x, replay matches, waiting: zombie ${start} -> ${end} tiles`);
}
console.log('PASS');
