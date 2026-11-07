// The turn loop. The player acts (spending energy), then the scheduler runs the world
// until the player can act again.
import { CONFIG } from '../config.js';
import { player } from './world.js';
import { advance } from './scheduler.js';
import { tryStep } from './systems/movement.js';

// Inputs: { type: 'move', dx, dy } (one of dx, dy is 0: no diagonals) or { type: 'wait' }.
// Returns true if the input took a turn.
export function applyInput(world, input) {
  const p = player(world);
  let took = false;
  if (input.type === 'wait') {
    took = true;
  } else if (input.type === 'move') {
    // Blocked or diagonal: no turn spent. (Walking into a zombie attacks it from step 8.)
    took = tryStep(world, p, input.dx, input.dy) === 'moved';
  }
  if (took) {
    world.inputs.push({ turn: world.turn, ...input });
    endTurn(world);
  }
  return took;
}

function endTurn(world) {
  player(world).Actor.energy -= CONFIG.scheduler.actionCost;
  advance(world);
  world.turn++;
  world.events.emit('turn_ended', { turn: world.turn });
}

// Rebuild a run from its seed and inputs.
export function replay(createWorld, seed, inputs) {
  const world = createWorld(seed);
  for (const { turn, ...input } of inputs) applyInput(world, input);
  return world;
}
