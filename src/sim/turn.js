// Turn loop: the player acts, then the scheduler runs the world until the
// player has enough energy to act again.
import { tryMove, blockerAt, tileAt } from './world.js';
import { TILE_INFO } from './gen/testgrid.js';
import { advance, spend } from './scheduler.js';
import { shamble } from './systems/shamble.js';
import { updateSightings } from './systems/vision.js';
import { clearNoise } from './systems/noise.js';
import { setSneaking, moveCost } from './systems/stealth.js';
import { attack } from './systems/combat.js';
import { shove } from './systems/shove.js';
import { pickUp, drop, useItem, itemsAt } from './systems/items.js';
import { throwItem, fire } from './systems/ranged.js';
import { structureAt, toggleDoor, damageStructure, isObstacle, hasKeyFor } from './systems/structures.js';
import { meleeStats } from './systems/items.js';
import { tickBleeding } from './systems/bleeding.js';
import { climb, setLadder } from './systems/floors.js';
import { tickLight, updateLight } from './systems/light.js';
import { tickWeather } from './systems/weather.js';
import { tickNeeds, needLevel, waterNearby, adjustNeed, wake } from './systems/needs.js';
import { makeNoise } from './systems/noise.js';
import { TILE } from './gen/testgrid.js';
import { CONFIG } from '../config.js';

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
  tickLight(world);
  tickNeeds(world);
}

// action: { type: 'move', dx, dy } (dx, dy in -1..1; moving into a creature attacks it),
//         { type: 'wait' },
//         { type: 'shove', dx, dy } (push the adjacent creature in that direction; takes a turn),
//         { type: 'pickup' } (item underfoot), { type: 'use', itemId }, { type: 'drop', itemId },
//         { type: 'throw', itemId, x, y }, { type: 'fire', x, y } (wielded gun),
//         { type: 'door', x, y } (open/close the adjacent door at x, y),
//         { type: 'bash', x, y } (smash/bash the adjacent window, locked door or barricade),
//         { type: 'drink' } (from the beck/lake next to you), { type: 'sleep' } (sleep until woken),
//         { type: 'climb' } (take the stairs/ladder you're standing on),
//         { type: 'ladder', up } (pull up / lower the ladder you're at the top of),
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
    } else if (thing && thing.Door && (!thing.Door.locked || hasKeyFor(world, player, thing)) && !thing.Barricade && toggleDoor(world, player, thing)) {
      action = { ...action, attack: true }; // moving into a closed door opens it (unlocking it if you have the key)
    } else if (isObstacle(thing)) {
      // Walking into a window, locked door or barricade never breaks it by accident:
      // it just says what's there (no turn). Bashing is a deliberate tap on the tile itself.
      world.events.emit('move_blocked', { id: player.id, x: thing.Position.x, y: thing.Position.y, blockerId: thing.id });
      return false;
    } else if (!tryMove(world, player, dx, dy)) {
      return false; // bumping a wall costs nothing
    } else if (itemsAt(world, player.Position.x, player.Position.y).length) {
      pickUp(world, player); // walking onto an item picks it up for free (if it fits)
    }
  } else if (action.type === 'shove') {
    if (!shove(world, player, action.dx, action.dy)) return false; // nothing to shove: no turn
  } else if (action.type === 'bash') {
    // Deliberately bash the adjacent window / locked door / barricade at x, y.
    const st = structureAt(world, action.x, action.y);
    const adj = Math.max(Math.abs(action.x - player.Position.x), Math.abs(action.y - player.Position.y)) === 1;
    if (!adj || !isObstacle(st)) return false;
    damageStructure(world, st, meleeStats(world, player).damage, player.id);
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
  } else if (action.type === 'climb') {
    if (!climb(world, player)) return false;
  } else if (action.type === 'ladder') {
    if (!setLadder(world, player, !!action.up)) return false;
  } else if (action.type === 'drink') {
    const water = player.Needs && player.Needs.thirst > 0 && waterNearby(world, player, isWater);
    if (!water) { world.events.emit('use_failed', { id: player.id, reason: player.Needs && player.Needs.thirst > 0 ? 'no_water' : 'not_thirsty' }); return false; }
    adjustNeed(world, player, 'thirst', -CONFIG.needs.perLevel.thirst);
    world.events.emit('drank', { id: player.id, x: water.x, y: water.y });
    makeNoise(world, water.x, water.y, CONFIG.needs.drinkNoise, player.id);
  } else if (action.type === 'sleep') {
    if (!canSleep(player)) { world.events.emit('use_failed', { id: player.id, reason: 'not_tired' }); return false; }
    if (needLevel(player, 'cold') >= 3) { world.events.emit('use_failed', { id: player.id, reason: 'too_cold' }); return false; }
    if (world.sightings.size) { world.events.emit('use_failed', { id: player.id, reason: 'not_safe' }); return false; } // not with something in sight
    player.Asleep = { since: world.tick };
    world.events.emit('fell_asleep', { id: player.id });
  } else if (action.type === 'wait') {
    world.events.emit('entity_waited', { id: player.id });
  } else {
    return false;
  }

  const { attack: _a, ...recorded } = action;
  world.inputs.push({ turn: world.turn, action: recorded });
  const tileCost = TILE_INFO[tileAt(world, player.Position.x, player.Position.y)].moveCost;
  const base = action.type === 'move' && !action.attack ? moveCost(player, tileCost) : action.type === 'climb' ? player.Actor.nextCost : CONFIG.scheduler.actionCost;
  endTurn(world, player, base);
  // Asleep: the world runs on, a turn at a time, until something wakes you (one input).
  const started = world.tick;
  while (player.Asleep && !world.gameOver && world.entities.has(player.id)) {
    if (world.tick - started >= CONFIG.needs.maxSleepTicks) { wake(world, player, 'rested'); break; }
    clearNoise(world);
    endTurn(world, player, CONFIG.scheduler.actionCost);
  }
  return true;
}

// Spend the player's action (exhausted: it takes longer), then run the world until the
// player can act again.
function endTurn(world, player, cost) {
  spend(player, Math.round(cost * (needLevel(player, 'fatigue') >= 3 && !player.Asleep ? CONFIG.needs.exhaustedCost : 1)));
  delete player.Actor.nextCost;
  world.turn++;
  advance(world, act, onTick);
  const weatherChanged = tickWeather(world);
  updateLight(world, weatherChanged); // the hour's light, weather, torches carried about: refreshes vision if changed
  updateSightings(world);
  world.events.emit('turn_ended', { turn: world.turn });
}

const WATER = new Set([TILE.STREAM, TILE.LAKE, TILE.POND]);
const isWater = (t) => WATER.has(t);
export const canDrinkHere = (world, e) => !!(e.Needs && e.Needs.thirst > 0 && waterNearby(world, e, isWater));
export const canSleep = (e) => !!(e.Needs && needLevel(e, 'fatigue') >= 1);

// Rebuild a run exactly from its seed and recorded inputs.
export function replay(createWorld, seed, inputs) {
  const world = createWorld(seed);
  for (const { action } of inputs) playerAct(world, action);
  return world;
}
