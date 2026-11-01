// Headless test run: drive the sim for N turns without rendering.
// Usage: node tests/headless.js [turns] [seed]
import { createWorld, isPassable, tileAt, inBounds } from '../src/sim/world.js';
import { TILE_INFO } from '../src/sim/gen/testgrid.js';
import { playerAct, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';

const TURNS = Number(process.argv[2] ?? 5000);
const SEEDS = process.argv[3] ? [Number(process.argv[3])] : [1, 42, 12345, 999999];

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function snapshot(world) {
  const p = world.entities.get(world.playerId).Position;
  return JSON.stringify({ turn: world.turn, p, rng: world.rng.state });
}

for (const seed of SEEDS) {
  const world = createWorld(seed);
  const driver = createRng(seed ^ 0xabcdef); // drives fake player input, separate from the sim RNG
  let acted = 0;

  for (let i = 0; i < TURNS; i++) {
    const r = driver.int(10);
    const action = r === 0 ? { type: 'wait' } : { type: 'move', dx: driver.int(3) - 1, dy: driver.int(3) - 1 };
    if (playerAct(world, action)) acted++;

    const p = world.entities.get(world.playerId).Position;
    assert(inBounds(world, p.x, p.y), `seed ${seed}: player out of bounds at ${p.x},${p.y}`);
    assert(!TILE_INFO[tileAt(world, p.x, p.y)].blocks, `seed ${seed}: player inside a wall`);
  }

  assert(world.turn === acted, `seed ${seed}: turn ${world.turn} != actions ${acted}`);
  assert(world.inputs.length === acted, `seed ${seed}: inputs not recorded`);
  assert(!playerAct(world, { type: 'move', dx: 2, dy: 0 }), 'non-adjacent move accepted');

  const replayed = replay(createWorld, seed, world.inputs);
  assert(snapshot(replayed) === snapshot(world), `seed ${seed}: replay diverged`);

  const p = world.entities.get(world.playerId).Position;
  console.log(`seed ${seed}: ${world.turn} turns OK, player at ${p.x},${p.y}, replay matches`);
}
console.log('PASS');
