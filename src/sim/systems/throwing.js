// Throwing. Any carried item can be thrown (from the bag or your hand). It lands on the target
// tile and clatters there (makeNoise at the landing spot, throw.landNoise), so zombies that hear
// it go to look: a tin of beans is a lure. A creature on the target tile is hit for the item's
// throwDamage (default 0) and notices the thrower. The item stays where it lands.
// validThrowTargets() is the one rule, for the sim and for the aiming highlight.
import { CONFIG } from '../../config.js';
import { tileBlocks } from '../world.js';
import { lineClear } from './vision.js';
import { makeNoise } from './noise.js';
import { creatureAt, damage } from './combat.js';
import { itemType, carried, takeOut } from './items.js';

export function canThrowTo(world, e, x, y) {
  const { x: ex, y: ey } = e.Position;
  if (x === ex && y === ey) return false;
  if (tileBlocks(world, x, y)) return false; // not into walls
  if (Math.hypot(x - ex, y - ey) > CONFIG.throw.range) return false;
  if (e.Player && !world.view[y * world.w + x]) return false; // only where you can see
  return lineClear(world, ex, ey, x, y);
}

export function validThrowTargets(world, e) {
  const out = [], r = Math.ceil(CONFIG.throw.range), { x: ex, y: ey } = e.Position;
  for (let y = Math.max(0, ey - r); y <= Math.min(world.h - 1, ey + r); y++) {
    for (let x = Math.max(0, ex - r); x <= Math.min(world.w - 1, ex + r); x++) if (canThrowTo(world, e, x, y)) out.push({ x, y });
  }
  return out;
}

// Returns true if it took a turn.
export function throwItem(world, thrower, itemId, x, y) {
  if (!carried(thrower).includes(itemId) || !canThrowTo(world, thrower, x, y)) return false;
  const item = world.entities.get(itemId), t = itemType(item);
  takeOut(thrower, itemId);
  item.Position = { x, y };
  world.events.emit('item_thrown', { id: thrower.id, itemId, x, y });
  // It clatters where it lands first (distracting zombies that hear it), then a creature it hit
  // turns on the thrower.
  makeNoise(world, x, y, CONFIG.throw.landNoise, thrower.id);
  const target = creatureAt(world, x, y);
  if (target) {
    world.events.emit('thrown_hit', { id: thrower.id, itemId, targetId: target.id });
    const dmg = t.throwDamage || 0;
    if (dmg) damage(world, target, dmg, 'thrown', thrower.id);
    if (world.entities.has(target.id) && target.Brain && thrower.Prey) {
      target.Brain.tracking = thrower.id; target.Brain.glimpsed = 0; target.Brain.search = null;
      target.Brain.goal = { x: thrower.Position.x, y: thrower.Position.y, why: 'seen' };
      target.Brain.distracted = null;
    }
  }
  return true;
}
