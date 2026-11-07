// Our own small energy scheduler (deterministic: no outside RNG, actors in id order).
// Each tick every Actor gains `speed` energy; while it has actionCost or more, it acts.
// The player's actions are spent by input (turn.js); the scheduler runs the world until
// the player has enough energy to act again.
import { CONFIG } from '../config.js';
import { player } from './world.js';
import { shamble } from './systems/shamble.js';

const BRAINS = { shamble };

// Only screens near yours run in full (world.activeRadius screens each way); actors further off
// wait where they are (a rough simulation of distant screens can come later).
export function isActive(world, e) {
  const p = world.entities.get(world.playerId);
  if (!p || !p.Position || e === p) return true;
  const r = CONFIG.world.activeRadius;
  return Math.abs(Math.floor(e.Position.x / world.screenW) - Math.floor(p.Position.x / world.screenW)) <= r
    && Math.abs(Math.floor(e.Position.y / world.screenH) - Math.floor(p.Position.y / world.screenH)) <= r;
}

export function tick(world) {
  const cost = CONFIG.scheduler.actionCost;
  const actors = [...world.entities.values()].filter(e => e.Actor && e.Position && isActive(world, e)).sort((a, b) => a.id - b.id);
  for (const e of actors) {
    if (!world.entities.has(e.id)) continue; // removed earlier this tick
    e.Actor.energy += e.Actor.speed;
    if (e.Player) continue;
    while (e.Actor && e.Actor.energy >= cost && world.entities.has(e.id)) {
      e.Actor.energy -= cost;
      // Staggered: the time is spent but the action is wasted.
      if (e.Staggered && e.Staggered.actions > 0) {
        if (--e.Staggered.actions <= 0) delete e.Staggered;
        world.events.emit('entity_lost_action', { id: e.id });
        continue;
      }
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
  while (!world.gameOver && p.Actor.energy < cost && guard++ < 1000) tick(world);
}
