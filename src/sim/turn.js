// Turn loop: the player acts, then the scheduler runs the world until the
// player has enough energy to act again.
import { tryMove } from './world.js';
import { advance, spend } from './scheduler.js';
import { shamble } from './systems/shamble.js';
import { updateSightings } from './systems/vision.js';
import { clearNoise } from './systems/noise.js';

// Brain type -> system that decides what an actor does with its action.
const BRAINS = { shamble };

function act(world, e) {
  const brain = e.Brain && BRAINS[e.Brain.type];
  if (brain) brain(world, e);
}

// action: { type: 'move', dx, dy } (dx, dy in -1..1) or { type: 'wait' }
// Returns true if the action used up a turn.
export function playerAct(world, action) {
  const player = world.entities.get(world.playerId);
  if (!player) return false;
  clearNoise(world); // the heatmap shows noise made since the player's last action
  world.events.emit('action_attempted', { id: player.id, action: { ...action } });

  if (action.type === 'move') {
    const { dx, dy } = action;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
    if (!tryMove(world, player, dx, dy)) return false; // bumping costs nothing (melee is step 8)
  } else if (action.type === 'wait') {
    world.events.emit('entity_waited', { id: player.id });
  } else {
    return false;
  }

  world.inputs.push({ turn: world.turn, action: { ...action } });
  spend(player);
  world.turn++;
  advance(world, act);
  updateSightings(world);
  world.events.emit('turn_ended', { turn: world.turn });
  return true;
}

// Rebuild a run exactly from its seed and recorded inputs.
export function replay(createWorld, seed, inputs) {
  const world = createWorld(seed);
  for (const { action } of inputs) playerAct(world, action);
  return world;
}
