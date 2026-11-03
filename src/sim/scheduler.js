// Energy/speed scheduler. Each tick, every entity with an Actor component gains
// `speed` energy. Anything with at least `actionCost` energy acts and pays the cost.
// Slow things (speed 50) act every other tick; fast things (200) act twice.
// The loop stops as soon as the player has enough energy, to wait for input
// (or if the player is dead). onTick(world) runs once per tick for per-tick systems
// like bleeding.
import { CONFIG } from '../config.js';
import { query } from './world.js';

export function advance(world, act, onTick = () => {}) {
  const { actionCost, maxTicksPerTurn } = CONFIG.scheduler;
  const player = world.entities.get(world.playerId);
  for (let i = 0; i < maxTicksPerTurn; i++) {
    if (!world.entities.has(world.playerId)) return; // player died
    if (player && player.Actor.energy >= actionCost) return;
    tick(world, act, onTick);
  }
  throw new Error(`Scheduler ran ${maxTicksPerTurn} ticks without the player getting a turn`);
}

// One tick of the world: per-tick systems, then every actor but the player gains energy
// and acts. Also used on its own by watch mode (step 22), with no player at all.
export function tick(world, act, onTick = () => {}) {
  const { actionCost } = CONFIG.scheduler;
  world.tick++;
  onTick(world);
  const actors = query(world, 'Actor').sort((a, b) => a.id - b.id); // fixed order = deterministic
  for (const e of actors) e.Actor.energy += e.Actor.speed;
  for (const e of actors) {
    if (e.id === world.playerId || !world.entities.has(e.id)) continue;
    while (e.Actor.energy >= actionCost && world.entities.has(e.id)) {
      delete e.Actor.nextCost;
      act(world, e);
      spend(e, e.Actor.nextCost || actionCost); // a slow step (hedge, stream) costs more
      delete e.Actor.nextCost;
    }
  }
}

export function spend(e, cost = CONFIG.scheduler.actionCost) {
  e.Actor.energy -= cost;
  e.Actor.actions++;
}
