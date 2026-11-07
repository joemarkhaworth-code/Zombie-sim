// The turn loop. The player acts (spending energy), then the scheduler runs the world
// until the player can act again.
import { CONFIG } from '../config.js';
import { player } from './world.js';
import { advance } from './scheduler.js';
import { tryStep } from './systems/movement.js';
import { updatePlayerView } from './systems/vision.js';
import { clearNoise } from './systems/noise.js';

// Inputs: { type: 'move', dx, dy } (one of dx, dy is 0: no diagonals), { type: 'wait' },
// { type: 'sneak', on } (toggle: takes no turn, but is recorded so replays match).
// Returns true if the input took a turn.
export function applyInput(world, input) {
  const p = player(world);
  let took = false, cost = CONFIG.scheduler.actionCost;
  if (input.type === 'sneak') {
    if (!p.Stealth || p.Stealth.sneaking === !!input.on) return false;
    p.Stealth.sneaking = !!input.on;
    world.inputs.push({ turn: world.turn, type: 'sneak', on: !!input.on });
    world.events.emit('sneak_toggled', { id: p.id, on: !!input.on });
    return false;
  }
  clearNoise(world);
  if (input.type === 'wait') {
    world.events.emit('entity_waited', { id: p.id });
    took = true;
  } else if (input.type === 'move') {
    // Blocked or diagonal: no turn spent. (Walking into a zombie attacks it from step 8.)
    took = tryStep(world, p, input.dx, input.dy) === 'moved';
    if (p.Stealth && p.Stealth.sneaking) cost *= CONFIG.stealth.moveCost; // slow, careful steps
  }
  if (took) {
    world.inputs.push({ turn: world.turn, ...input });
    endTurn(world, cost);
  }
  return took;
}

function endTurn(world, cost) {
  player(world).Actor.energy -= cost;
  advance(world);
  updatePlayerView(world);
  world.turn++;
  world.events.emit('turn_ended', { turn: world.turn });
}

// Rebuild a run from its seed and inputs.
export function replay(createWorld, seed, inputs) {
  const world = createWorld(seed);
  for (const { turn, ...input } of inputs) applyInput(world, input);
  return world;
}
