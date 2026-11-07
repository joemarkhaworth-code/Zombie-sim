// Our own small energy scheduler (deterministic: no outside RNG, actors in id order).
// Each tick every Actor gains `speed` energy; while it has actionCost or more, it acts.
// The player's actions are spent by input (turn.js); the scheduler runs the world until
// the player has enough energy to act again.
import { CONFIG } from '../config.js';
import { player } from './world.js';
import { shamble } from './systems/shamble.js';

const BRAINS = { shamble };

export function tick(world) {
  const cost = CONFIG.scheduler.actionCost;
  const actors = [...world.entities.values()].filter(e => e.Actor).sort((a, b) => a.id - b.id);
  for (const e of actors) {
    if (!world.entities.has(e.id)) continue; // removed earlier this tick
    e.Actor.energy += e.Actor.speed;
    if (e.Player) continue;
    while (e.Actor.energy >= cost) {
      e.Actor.energy -= cost;
      const brain = BRAINS[e.Actor.brain];
      if (brain) brain(world, e);
    }
  }
  world.tick++;
}

// Run ticks until the player can act again.
export function advance(world) {
  const p = player(world), cost = CONFIG.scheduler.actionCost;
  let guard = 0;
  while (p.Actor.energy < cost && guard++ < 1000) tick(world);
}
