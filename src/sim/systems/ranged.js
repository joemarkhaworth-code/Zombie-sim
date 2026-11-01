// Throwing and shooting.
//  - Any item can be thrown at a tile within CONFIG.throw.range that you can see in a
//    clear line. It lands there and clatters (noise at the landing spot - a lure).
//    If a creature is on that tile it may be hit: heavy items (slots >= throw.heavySlots)
//    do throw.heavyDamage, light ones just bounce off.
//  - Guns are items with a `ranged` property (CONFIG.items) and their own ammo count
//    (Item.ammo). Wield one, then fire at a tile in its range and line of sight.
//    The shot makes noise where the shooter stands (quiet air rifle, very loud shotgun)
//    and hits the creature on the target tile, if any. Empty guns refuse to fire.
// validTargets() is the single rule for where you can aim; the UI highlights it.
import { CONFIG } from '../../config.js';
import { inBounds, tileAt, query } from '../world.js';
import { TILE_INFO } from '../gen/testgrid.js';
import { lineClear, visibilityAt } from './vision.js';
import { makeNoise } from './noise.js';
import { damage } from './combat.js';
import { addBlood, wound } from './bleeding.js';
import { itemDef } from './items.js';

// Tiles the shooter can aim at: within range (round), in sight, clear line, not solid.
export function validTargets(world, e, range) {
  const out = new Set();
  const { x: ox, y: oy } = e.Position;
  for (let y = oy - range; y <= oy + range; y++) {
    for (let x = ox - range; x <= ox + range; x++) {
      if ((x === ox && y === oy) || !inBounds(world, x, y)) continue;
      if ((x - ox) ** 2 + (y - oy) ** 2 > range * range + range) continue;
      if (TILE_INFO[tileAt(world, x, y)].blocks) continue;
      if (visibilityAt(world, e, x, y) <= 0 || !lineClear(world, ox, oy, x, y)) continue;
      out.add(y * world.width + x);
    }
  }
  return out;
}

const creatureAt = (world, x, y) => query(world, 'Actor', 'Health', 'Position').find((c) => c.Position.x === x && c.Position.y === y);

export function throwItem(world, thrower, itemId, x, y) {
  const inv = thrower.Inventory;
  if (!inv || !inv.items.includes(itemId)) return false;
  if (!validTargets(world, thrower, CONFIG.throw.range).has(y * world.width + x)) return false;
  const item = world.entities.get(itemId);
  inv.items.splice(inv.items.indexOf(itemId), 1);
  if (inv.wielded === itemId) inv.wielded = null;
  world.events.emit('item_thrown', { id: thrower.id, itemId, x, y });
  const target = creatureAt(world, x, y);
  if (target && world.rng.chance(CONFIG.throw.hitChance)) {
    const heavy = item.Item.slots >= CONFIG.throw.heavySlots;
    world.events.emit('thrown_hit', { id: thrower.id, itemId, targetId: target.id, heavy });
    if (target.Brain) target.Brain.goal = { x: thrower.Position.x, y: thrower.Position.y, why: 'seen' };
    if (heavy) damage(world, target, CONFIG.throw.heavyDamage, { killerId: thrower.id, cause: 'thrown' });
  }
  item.Position = { x, y }; // lands on the tile either way
  makeNoise(world, x, y, CONFIG.throw.landNoise, thrower.id); // clatter: a lure
  return true;
}

export function wieldedGun(world, e) {
  const id = e.Inventory && e.Inventory.wielded;
  const item = id && world.entities.get(id);
  return item && itemDef(item).ranged ? item : null;
}

export function fire(world, shooter, x, y) {
  const gun = wieldedGun(world, shooter);
  if (!gun) return false;
  const r = itemDef(gun).ranged;
  if (gun.Item.ammo <= 0) {
    world.events.emit('fire_failed', { id: shooter.id, itemId: gun.id, reason: 'empty' });
    return false;
  }
  if (!validTargets(world, shooter, r.range).has(y * world.width + x)) return false;
  gun.Item.ammo--;
  makeNoise(world, shooter.Position.x, shooter.Position.y, r.noise, shooter.id); // the bang
  world.events.emit('shot_fired', { id: shooter.id, itemId: gun.id, x, y, ammo: gun.Item.ammo });
  const target = creatureAt(world, x, y);
  if (!target) return true;
  if (target.Brain) target.Brain.goal = { x: shooter.Position.x, y: shooter.Position.y, why: 'seen' };
  if (!world.rng.chance(r.hitChance)) {
    world.events.emit('shot_missed', { id: shooter.id, targetId: target.id });
    return true;
  }
  world.events.emit('shot_hit', { id: shooter.id, targetId: target.id, damage: r.damage });
  addBlood(world, x, y, 1);
  if (world.rng.chance(r.woundChance)) wound(world, target);
  damage(world, target, r.damage, { killerId: shooter.id, cause: 'shot' });
  return true;
}
