// The turn loop. The player acts, then the rest of the world takes its turn (step 2 adds the scheduler).
import { tileBlocks, blockerAt, player } from './world.js';

// Inputs: { type: 'move', dx, dy } (dx, dy in -1..1) or { type: 'wait' }.
// Returns true if the input took a turn.
export function applyInput(world, input) {
  const p = player(world);
  let took = false;
  if (input.type === 'wait') {
    took = true;
  } else if (input.type === 'move') {
    const dx = Math.sign(input.dx), dy = Math.sign(input.dy);
    if (dx === 0 && dy === 0) return false;
    const nx = p.Position.x + dx, ny = p.Position.y + dy;
    if (tileBlocks(world, nx, ny) || blockerAt(world, nx, ny)) {
      world.events.emit('move_blocked', { id: p.id, x: nx, y: ny }); // no turn spent
      return false;
    }
    const from = { ...p.Position };
    p.Position.x = nx; p.Position.y = ny;
    world.events.emit('entity_moved', { id: p.id, from, to: { x: nx, y: ny } });
    took = true;
  }
  if (took) {
    world.inputs.push({ turn: world.turn, ...input });
    endTurn(world);
  }
  return took;
}

function endTurn(world) {
  // The rest of the world acts here (nothing yet).
  world.turn++;
  world.events.emit('turn_ended', { turn: world.turn });
}

// Rebuild a run from its seed and inputs.
export function replay(createWorld, seed, inputs) {
  const world = createWorld(seed);
  for (const { turn, ...input } of inputs) applyInput(world, input);
  return world;
}
