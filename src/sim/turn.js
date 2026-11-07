// The turn loop. The player acts (spending energy), then the scheduler runs the world
// until the player can act again.
import { CONFIG } from '../config.js';
import { player } from './world.js';
import { advance } from './scheduler.js';
import { tryStep } from './systems/movement.js';
import { updatePlayerView } from './systems/vision.js';
import { clearNoise } from './systems/noise.js';
import { attack, shove, creatureAt, inReach } from './systems/combat.js';
import { pickUp, drop, useItem, itemsAt } from './systems/items.js';
import { throwItem } from './systems/throwing.js';

// Inputs: { type: 'move', dx, dy } (moving is 4-way; into a creature with Health it attacks
// instead, and attacks reach diagonals too), { type: 'wait' },
// { type: 'shove', dx, dy } (an adjacent creature, 8 ways), { type: 'pickup' },
// { type: 'use', itemId }, { type: 'drop', itemId }, { type: 'throw', itemId, x, y }.
// Item ids are deterministic from the seed.
// Returns true if the input took a turn.
export function applyInput(world, input) {
  const p = player(world);
  if (world.gameOver) return false;
  let took = false;
  clearNoise(world);
  if (input.type === 'wait') {
    world.events.emit('entity_waited', { id: p.id });
    took = true;
  } else if (input.type === 'pickup') {
    took = pickUp(world, p) === 'picked';
  } else if (input.type === 'use') {
    took = useItem(world, p, input.itemId);
  } else if (input.type === 'drop') {
    took = drop(world, p, input.itemId);
  } else if (input.type === 'throw') {
    took = throwItem(world, p, input.itemId, input.x, input.y);
  } else if (input.type === 'move' || input.type === 'shove') {
    const dx = Math.sign(input.dx), dy = Math.sign(input.dy);
    if (dx === 0 && dy === 0) return false;
    // Attacks and shoves reach 8 ways; moving is 4-way only.
    let target = creatureAt(world, p.Position.x + dx, p.Position.y + dy);
    if (target && !inReach(world, p, target)) target = null;
    if (dx !== 0 && dy !== 0 && !target) return false; // a diagonal with nothing to hit: no turn
    if (input.type === 'shove') {
      if (!target) return false; // nothing to shove: no turn
      shove(world, p, target);
      took = true;
    } else if (target) {
      attack(world, p, target); // walking into a creature attacks it (the input stays a move)
      took = true;
    } else {
      took = tryStep(world, p, dx, dy) === 'moved'; // blocked: no turn spent
      if (took && itemsAt(world, p.Position.x, p.Position.y).length) pickUp(world, p); // free, part of the step
    }
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
