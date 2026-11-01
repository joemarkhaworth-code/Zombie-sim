// Turn loop: the player acts, then the scheduler runs the world until the
// player has enough energy to act again.
import { tryMove, blockerAt } from './world.js';
import { advance, spend } from './scheduler.js';
import { shamble } from './systems/shamble.js';
import { updateSightings } from './systems/vision.js';
import { clearNoise } from './systems/noise.js';
import { setSneaking, moveCost } from './systems/stealth.js';
import { attack } from './systems/combat.js';
import { shove } from './systems/shove.js';
import { tickBleeding } from './systems/bleeding.js';

// Brain type -> system that decides what an actor does with its action.
const BRAINS = { shamble };

function act(world, e) {
  if (e.Staggered && e.Staggered.actions > 0) { // staggered: this action is lost
    e.Staggered.actions--;
    if (e.Staggered.actions === 0) delete e.Staggered;
    world.events.emit('entity_lost_action', { id: e.id });
    return;
  }
  const brain = e.Brain && BRAINS[e.Brain.type];
  if (brain) brain(world, e);
}

// Systems that run every scheduler tick.
function onTick(world) {
  tickBleeding(world);
}

// action: { type: 'move', dx, dy } (dx, dy in -1..1; moving into a creature attacks it),
//         { type: 'wait' },
//         { type: 'shove', dx, dy } (push the adjacent creature in that direction; takes a turn),
//         or { type: 'sneak', on } (toggle stance: recorded, but takes no turn).
// Returns true if the action used up a turn.
export function playerAct(world, action) {
  const player = world.entities.get(world.playerId);
  if (!player || world.gameOver) return false;
  if (action.type === 'sneak') {
    if (setSneaking(world, player, !!action.on)) world.inputs.push({ turn: world.turn, action: { ...action } });
    return false;
  }
  clearNoise(world); // the heatmap shows noise made since the player's last action
  world.events.emit('action_attempted', { id: player.id, action: { ...action } });

  if (action.type === 'move') {
    const { dx, dy } = action;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
    const target = blockerAt(world, player.Position.x + dx, player.Position.y + dy);
    if (target && target.entity && target.entity.Health) {
      action = { ...action, attack: true };
      attack(world, player, target.entity); // moving into a creature attacks it
    } else if (!tryMove(world, player, dx, dy)) {
      return false; // bumping a wall costs nothing
    }
  } else if (action.type === 'shove') {
    if (!shove(world, player, action.dx, action.dy)) return false; // nothing to shove: no turn
  } else if (action.type === 'wait') {
    world.events.emit('entity_waited', { id: player.id });
  } else {
    return false;
  }

  const { attack: _a, ...recorded } = action;
  world.inputs.push({ turn: world.turn, action: recorded });
  spend(player, action.type === 'move' && !action.attack ? moveCost(player) : undefined);
  world.turn++;
  advance(world, act, onTick);
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
