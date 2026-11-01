// Shove: push an adjacent creature one tile directly away from you.
//  - If the tile behind it is free, it's pushed there (pushEntity).
//  - If it's blocked (wall, another creature, map edge), it slams into it instead
//    and takes CONFIG.shove.slamDamage.
//  - Either way it's staggered: it loses its next action (Staggered component).
//  - Shoving makes noise, and the target notices who shoved it.
//
// Forced movement hook: anything that moves an entity by force (shoves now; later
// knockback, explosions, currents, slides) goes through pushEntity(), which emits
// entity_pushed { id, by, from, to, dx, dy }. Later systems react to where things
// land by subscribing to it: water (pushed into a lake), fire (into flames), ledges
// (off a crag). The destination tile is in the event, so they don't need to know
// who pushed or why.
import { CONFIG } from '../../config.js';
import { blockerAt, tryMove } from '../world.js';
import { makeNoise } from './noise.js';
import { damage } from './combat.js';

export function isShoveable(e) {
  return !!(e && e.Actor && e.Position);
}

// The pusher shoves the creature at pusher + (dx, dy). Returns false if there's
// nothing shoveable there (no turn should be spent).
export function shove(world, pusher, dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
  const tx = pusher.Position.x + dx, ty = pusher.Position.y + dy;
  const b = blockerAt(world, tx, ty);
  const target = b && b.entity;
  if (!isShoveable(target)) return false;

  makeNoise(world, tx, ty, CONFIG.shove.noise, pusher.id);
  world.events.emit('entity_shoved', { id: target.id, by: pusher.id, dx, dy });
  if (target.Brain) target.Brain.goal = { x: pusher.Position.x, y: pusher.Position.y, why: 'seen' }; // it knows who did it
  stagger(world, target, CONFIG.shove.staggerActions);
  if (!pushEntity(world, target, dx, dy, pusher.id)) {
    const behind = blockerAt(world, tx + dx, ty + dy);
    world.events.emit('entity_slammed', { id: target.id, x: tx + dx, y: ty + dy, blockerId: behind && behind.entity ? behind.entity.id : null });
    damage(world, target, CONFIG.shove.slamDamage, { killerId: pusher.id, cause: 'shove' });
  }
  return true;
}

// Forced movement. Returns true if the entity moved.
export function pushEntity(world, e, dx, dy, byId = null) {
  const from = { x: e.Position.x, y: e.Position.y };
  if (!tryMove(world, e, dx, dy)) return false;
  world.events.emit('entity_pushed', { id: e.id, by: byId, from, to: { x: e.Position.x, y: e.Position.y }, dx, dy });
  return true;
}

// Lose the next n actions (the scheduler still charges energy for them).
export function stagger(world, e, n) {
  if (!e.Actor) return;
  e.Staggered = { actions: Math.max(n, e.Staggered ? e.Staggered.actions : 0) };
  world.events.emit('entity_staggered_hit', { id: e.id, actions: e.Staggered.actions });
}
