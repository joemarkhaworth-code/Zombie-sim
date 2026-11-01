// Turn loop: the player acts, then the world takes its turn.
import { isPassable } from './world.js';

// action: { type: 'move', dx, dy } (dx, dy in -1..1) or { type: 'wait' }
// Returns true if the action used up a turn.
export function playerAct(world, action) {
  const player = world.entities.get(world.playerId);
  if (!player) return false;

  if (action.type === 'move') {
    const { dx, dy } = action;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
    const nx = player.Position.x + dx;
    const ny = player.Position.y + dy;
    if (!isPassable(world, nx, ny)) return false; // bumping a wall costs nothing
    player.Position.x = nx;
    player.Position.y = ny;
  } else if (action.type !== 'wait') {
    return false;
  }

  world.inputs.push({ turn: world.turn, action: { ...action } });
  worldTurn(world);
  return true;
}

// Everything else acts here. Empty until the scheduler arrives (roadmap step 2).
function worldTurn(world) {
  world.turn++;
}

// Rebuild a run exactly from its seed and recorded inputs.
export function replay(createWorld, seed, inputs) {
  const world = createWorld(seed);
  for (const { action } of inputs) playerAct(world, action);
  return world;
}
