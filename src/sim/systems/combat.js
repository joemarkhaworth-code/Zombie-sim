// Combat. Health is a whole number of half-hearts (Health { hp, max }); every hit takes `damage`
// half-hearts. Any creature with Melee can attack any creature with Health; there are no
// sneak attacks, no misses and no bleeding (kept simple, Zelda-style).
//   Melee { damage, knockback, noise }: knockback hits push the target a tile directly away (if
//   that tile is free) and stagger it: it loses its next action. Every swing makes noise.
// Forced movement goes through pushEntity(), which emits entity_pushed, so later systems (water,
// fire) can react to where something lands without knowing why it moved.
import { CONFIG } from '../../config.js';
import { tileBlocks, blockerAt, addEntity } from '../world.js';
import { makeNoise } from './noise.js';
import { lineClear } from './vision.js';

// Attacks and shoves reach all 8 neighbours (movement is 4-way), but not through a gap
// squeezed between two walls meeting at a corner (the same rule as sight).
export function inReach(world, a, b) {
  const dx = Math.abs(a.Position.x - b.Position.x), dy = Math.abs(a.Position.y - b.Position.y);
  return dx <= 1 && dy <= 1 && dx + dy > 0 && lineClear(world, a.Position.x, a.Position.y, b.Position.x, b.Position.y);
}

export function stagger(world, e, actions) {
  if (!e.Actor) return;
  e.Staggered = { actions: Math.max(actions, e.Staggered ? e.Staggered.actions : 0) };
}

// Push e one tile by (dx, dy). Returns null if it moved, or { blockerId } (0 = a wall) if not.
export function pushEntity(world, e, dx, dy, byId) {
  const from = { ...e.Position }, nx = from.x + dx, ny = from.y + dy;
  const blocker = tileBlocks(world, nx, ny) ? null : blockerAt(world, nx, ny);
  if (tileBlocks(world, nx, ny) || blocker) return { blockerId: blocker ? blocker.id : 0, x: nx, y: ny };
  e.Position.x = nx; e.Position.y = ny;
  world.events.emit('entity_pushed', { id: e.id, by: byId, from, to: { x: nx, y: ny }, dx, dy });
  world.events.emit('entity_moved', { id: e.id, from, to: { x: nx, y: ny } });
  return null;
}

export function damage(world, target, amount, cause, byId) {
  if (!target.Health || amount <= 0) return;
  target.Health.hp = Math.max(0, target.Health.hp - amount);
  world.events.emit('entity_hurt', { id: target.id, amount, cause, by: byId, hp: target.Health.hp });
  if (target.Health.hp <= 0) kill(world, target, cause, byId);
}

// Death: the creature is removed and leaves a corpse (a thing: walkable, remembered,
// inspectable). If it's the player, the game is over (the body stays where it fell).
export function kill(world, e, cause, byId) {
  const killer = byId ? world.entities.get(byId) : null;
  world.events.emit('entity_died', { id: e.id, cause, by: byId, x: e.Position.x, y: e.Position.y });
  if (e.Player) {
    world.gameOver = { cause, killerName: killer && killer.Name ? killer.Name.name : '', turn: world.turn };
    e.Glyph = { ch: '%', colour: CONFIG.colours.corpse };
    delete e.Actor;
    return;
  }
  world.entities.delete(e.id);
  addEntity(world, {
    Position: { x: e.Position.x, y: e.Position.y },
    Glyph: { ch: '%', colour: CONFIG.colours.corpse },
    Name: { name: `${e.Name ? e.Name.name : 'thing'} corpse` },
    Corpse: {},
  });
}

// attacker hits target (they must be next to each other).
export function attack(world, attacker, target) {
  const m = attacker.Melee;
  if (!m || !target.Health) return;
  const dx = Math.sign(target.Position.x - attacker.Position.x), dy = Math.sign(target.Position.y - attacker.Position.y);
  world.events.emit('attacked', { id: attacker.id, targetId: target.id, damage: m.damage });
  makeNoise(world, attacker.Position.x, attacker.Position.y, m.noise, attacker.id);
  damage(world, target, m.damage, attacker.Player ? 'hit' : 'bite', attacker.id);
  if (!world.entities.has(target.id) || target.Health.hp <= 0) return;
  // A hit always makes it notice who hit it.
  if (target.Brain && attacker.Prey) {
    target.Brain.tracking = attacker.id; target.Brain.glimpsed = 0; target.Brain.search = null;
    target.Brain.goal = { x: attacker.Position.x, y: attacker.Position.y, why: 'seen' };
  }
  if (m.knockback) {
    pushEntity(world, target, dx, dy, attacker.id); // into a wall: it just stays put
    if (CONFIG.knockback.staggerActions > 0) stagger(world, target, CONFIG.knockback.staggerActions);
  }
}

// Shove: push the creature a tile directly away and stagger it. If the tile behind is blocked,
// it slams into it instead and takes slamDamage (whatever's behind is unhurt).
export function shove(world, actor, target) {
  const cfg = CONFIG.shove;
  const dx = Math.sign(target.Position.x - actor.Position.x), dy = Math.sign(target.Position.y - actor.Position.y);
  world.events.emit('shoved', { id: actor.id, targetId: target.id });
  makeNoise(world, actor.Position.x, actor.Position.y, cfg.noise, actor.id);
  const blocked = pushEntity(world, target, dx, dy, actor.id);
  if (blocked) {
    world.events.emit('entity_slammed', { id: target.id, x: blocked.x, y: blocked.y, blockerId: blocked.blockerId });
    damage(world, target, cfg.slamDamage, 'shove', actor.id);
  }
  if (!world.entities.has(target.id) || target.Health.hp <= 0) return;
  stagger(world, target, cfg.staggerActions);
  if (target.Brain && actor.Prey) {
    target.Brain.tracking = actor.id; target.Brain.glimpsed = 0; target.Brain.search = null;
    target.Brain.goal = { x: actor.Position.x, y: actor.Position.y, why: 'seen' };
  }
}

// The creature with Health on a tile, if any.
export function creatureAt(world, x, y) {
  for (const e of world.entities.values()) {
    if (e.Health && e.Position && e.Position.x === x && e.Position.y === y) return e;
  }
  return null;
}
