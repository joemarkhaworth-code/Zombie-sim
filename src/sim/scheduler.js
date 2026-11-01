// Energy/speed scheduler. Each tick, every entity with an Actor component gains
// `speed` energy. Anything with at least `actionCost` energy acts and pays the cost.
// Slow things (speed 50) act every other tick; fast things (200) act twice.
// The loop stops as soon as the player has enough energy, to wait for input.
import { CONFIG } from '../config.js';
import { query } from './world.js';

export function advance(world, act) {
  const { actionCost, maxTicksPerTurn } = CONFIG.scheduler;
  const player = world.entities.get(world.playerId);
  for (let i = 0; i < maxTicksPerTurn; i++) {
    if (player && player.Actor.energy >= actionCost) return;
    world.tick++;
    const actors = query(world, 'Actor').sort((a, b) => a.id - b.id); // fixed order = deterministic
    for (const e of actors) e.Actor.energy += e.Actor.speed;
    for (const e of actors) {
      if (e.id === world.playerId) continue;
      while (e.Actor.energy >= actionCost && world.entities.has(e.id)) {
        act(world, e);
        spend(e);
      }
    }
  }
  throw new Error(`Scheduler ran ${maxTicksPerTurn} ticks without the player getting a turn`);
}

export function spend(e) {
  e.Actor.energy -= CONFIG.scheduler.actionCost;
  e.Actor.actions++;
}
