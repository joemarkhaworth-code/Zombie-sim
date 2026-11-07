// Items. An item is an entity with Item { type } + Glyph + Name. On the map it has a Position;
// carried, it has none and its id is in the carrier's Inventory.items. Item types are data
// (CONFIG.items): slots, heal (half-hearts), weapon { damage, knockback, noise }.
//   Inventory { items: [ids], capacity (slots), wielded: id | 0 }
// Walking onto an item picks it up as part of the step (free). If the bag is full it stays put;
// tapping yourself on it picks it up later (a turn).
import { CONFIG } from '../../config.js';
import { addEntity } from '../world.js';

export function itemType(e) {
  return e && e.Item ? CONFIG.items[e.Item.type] : null;
}

export function makeItem(world, type, x, y) {
  const t = CONFIG.items[type];
  const e = addEntity(world, {
    Item: { type },
    Glyph: { ch: t.glyph, colour: t.colour },
    Name: { name: t.name },
  });
  if (x !== undefined) e.Position = { x, y };
  return e;
}

export function slotsUsed(world, holder) {
  let n = 0;
  for (const id of holder.Inventory.items) n += itemType(world.entities.get(id)).slots;
  return n;
}

// Items lying on a tile (top one last).
export function itemsAt(world, x, y) {
  const out = [];
  for (const e of world.entities.values()) {
    if (e.Item && e.Position && e.Position.x === x && e.Position.y === y) out.push(e);
  }
  return out;
}

// Put an item in the holder's bag (from the map, or newly made). Returns false if it won't fit.
export function give(world, holder, item) {
  const inv = holder.Inventory;
  if (slotsUsed(world, holder) + itemType(item).slots > inv.capacity) return false;
  delete item.Position;
  inv.items.push(item.id);
  return true;
}

// Pick up the top item on the holder's tile. Returns 'picked', 'full' or 'none'.
export function pickUp(world, holder) {
  const here = itemsAt(world, holder.Position.x, holder.Position.y);
  if (!here.length) return 'none';
  const item = here[here.length - 1];
  if (!give(world, holder, item)) {
    world.events.emit('bag_full', { id: holder.id, itemId: item.id });
    return 'full';
  }
  world.events.emit('item_picked_up', { id: holder.id, itemId: item.id });
  return 'picked';
}

export function drop(world, holder, itemId) {
  const inv = holder.Inventory, i = inv.items.indexOf(itemId);
  if (i < 0) return false;
  inv.items.splice(i, 1);
  if (inv.wielded === itemId) inv.wielded = 0;
  const item = world.entities.get(itemId);
  item.Position = { x: holder.Position.x, y: holder.Position.y };
  world.events.emit('item_dropped', { id: holder.id, itemId });
  return true;
}

// Use an item from the bag: eat/apply (heal), or wield/stow a weapon. Returns true if it took
// a turn (refusals don't).
export function useItem(world, holder, itemId) {
  const inv = holder.Inventory;
  if (!inv.items.includes(itemId)) return false;
  const item = world.entities.get(itemId), t = itemType(item);
  if (t.weapon) {
    inv.wielded = inv.wielded === itemId ? 0 : itemId;
    world.events.emit(inv.wielded ? 'item_wielded' : 'item_stowed', { id: holder.id, itemId });
    return true;
  }
  if (t.heal) {
    const h = holder.Health;
    if (!h || h.hp >= h.max) {
      world.events.emit('use_refused', { id: holder.id, itemId, why: 'not_hurt' });
      return false;
    }
    h.hp = Math.min(h.max, h.hp + t.heal);
    inv.items.splice(inv.items.indexOf(itemId), 1);
    world.entities.delete(itemId); // used up
    world.events.emit('item_used', { id: holder.id, itemId, type: item.Item.type, healed: t.heal });
    return true;
  }
  world.events.emit('use_refused', { id: holder.id, itemId, why: 'no_use' });
  return false;
}

// A creature's melee numbers: its wielded weapon's, else its own Melee (bare hands, a bite).
export function meleeStats(world, e) {
  const inv = e.Inventory;
  if (inv && inv.wielded) {
    const t = itemType(world.entities.get(inv.wielded));
    if (t && t.weapon) return t.weapon;
  }
  return e.Melee;
}
