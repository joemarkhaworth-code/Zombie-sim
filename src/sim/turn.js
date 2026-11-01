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
import { pickUp, drop, useItem, itemsAt } from './systems/items.js';
import { throwItem, fire } from './systems/ranged.js';
import { structureAt, toggleDoor, damageStructure, isObstacle } from './systems/structures.js';
import { meleeStats } from './systems/items.js';
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
//         { type: 'pickup' } (item underfoot), { type: 'use', itemId }, { type: 'drop', itemId },
//         { type: 'throw', itemId, x, y }, { type: 'fire', x, y } (wielded gun),
//         { type: 'door', x, y } (open/close the adjacent door at x, y),
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
    const thing = target && target.entity;
    if (thing && thing.Health) {
      action = { ...action, attack: true };
      attack(world, player, thing); // moving into a creature attacks it
    } else if (thing && thing.Door && !thing.Door.locked && !thing.Barricade && toggleDoor(world, player, thing)) {
      action = { ...action, attack: true }; // moving into a closed door opens it (a normal-cost action)
    } else if (isObstacle(thing)) {
      if (thing.Door && thing.Door.locked && !thing.Barricade) world.events.emit('door_locked', { id: player.id, doorId: thing.id });
      action = { ...action, attack: true };
      damageStructure(world, thing, meleeStats(world, player).damage, player.id); // bash: locked door, window, barricade
    } else if (!tryMove(world, player, dx, dy)) {
      return false; // bumping a wall costs nothing
    } else if (itemsAt(world, player.Position.x, player.Position.y).length) {
      pickUp(world, player); // walking onto an item picks it up for free (if it fits)
    }
  } else if (action.type === 'shove') {
    if (!shove(world, player, action.dx, action.dy)) return false; // nothing to shove: no turn
  } else if (action.type === 'door') {
    // Open or close the door on an adjacent tile (tap exactly on it).
    const door = structureAt(world, action.x, action.y);
    const adj = Math.max(Math.abs(action.x - player.Position.x), Math.abs(action.y - player.Position.y)) === 1;
    if (!adj || !door || !door.Door || !toggleDoor(world, player, door)) return false;
  } else if (action.type === 'pickup') {
    if (!pickUp(world, player)) return false;
  } else if (action.type === 'use') {
    if (!useItem(world, player, action.itemId)) return false;
  } else if (action.type === 'drop') {
    if (!drop(world, player, action.itemId)) return false;
  } else if (action.type === 'throw') {
    if (!throwItem(world, player, action.itemId, action.x, action.y)) return false;
  } else if (action.type === 'fire') {
    if (!fire(world, player, action.x, action.y)) return false;
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
