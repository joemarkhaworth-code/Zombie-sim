// Items and inventory.
//  - An item is an entity with Item { type, slots }, plus Glyph and Name. On the map it
//    has a Position; carried, it has none and its id is in the carrier's Inventory.
//  - Inventory { items: [ids], capacity } - capacity is in slots (each item uses Item.slots).
//  - What using an item does comes from its type in CONFIG.items (data, not special cases):
//      heal: n     - eat/drink it: restore n health, used up
//      stanch: true - bandage: stops bleeding, used up
//      weapon: {...} - wield it (or put it away); wielded weapon replaces your bare-hands
//                      melee damage/hit chance. Wielded = Inventory.wielded holds its id.
// Picking up: walking onto an item picks it up for free if it fits; tapping yourself
// while standing on one picks it up (takes a turn). Use, drop, wield take a turn.
import { CONFIG } from '../../config.js';
import { addEntity, isPassable, query } from '../world.js';

export function makeItem(world, type, x, y) {
  const def = CONFIG.items[type];
  return addEntity(world, {
    Position: { x, y },
    Item: def.ammo !== undefined ? { type, slots: def.slots, ammo: def.ammo } : { type, slots: def.slots },
    Glyph: { char: def.char, fg: def.fg, bg: def.bg },
    Name: { name: def.name },
  });
}

export function itemDef(item) {
  return CONFIG.items[item.Item.type];
}

export function usedSlots(world, carrier) {
  return carrier.Inventory.items.reduce((n, id) => n + world.entities.get(id).Item.slots, 0);
}

export function itemsAt(world, x, y) {
  return query(world, 'Item', 'Position').filter((i) => i.Position.x === x && i.Position.y === y);
}

// Pick up the top item at the carrier's feet. Returns true if something was picked up.
export function pickUp(world, carrier) {
  const items = itemsAt(world, carrier.Position.x, carrier.Position.y);
  if (!items.length) return false;
  const item = items[items.length - 1];
  if (usedSlots(world, carrier) + item.Item.slots > carrier.Inventory.capacity) {
    world.events.emit('pickup_failed', { id: carrier.id, itemId: item.id, reason: 'full' });
    return false;
  }
  delete item.Position;
  carrier.Inventory.items.push(item.id);
  world.events.emit('item_picked_up', { id: carrier.id, itemId: item.id });
  return true;
}

export function drop(world, carrier, itemId) {
  const inv = carrier.Inventory;
  const i = inv.items.indexOf(itemId);
  if (i < 0) return false;
  inv.items.splice(i, 1);
  if (inv.wielded === itemId) inv.wielded = null;
  const item = world.entities.get(itemId);
  item.Position = { x: carrier.Position.x, y: carrier.Position.y };
  world.events.emit('item_dropped', { id: carrier.id, itemId });
  return true;
}

// Use an item: eat, bandage, or wield/put away. Returns true if it did anything.
export function useItem(world, carrier, itemId) {
  const inv = carrier.Inventory;
  if (!inv.items.includes(itemId)) return false;
  const item = world.entities.get(itemId);
  const def = itemDef(item);
  if (def.weapon) {
    inv.wielded = inv.wielded === itemId ? null : itemId;
    world.events.emit(inv.wielded ? 'item_wielded' : 'item_unwielded', { id: carrier.id, itemId });
    return true;
  }
  if (def.heal) {
    if (carrier.Health) carrier.Health.hp = Math.min(carrier.Health.max, carrier.Health.hp + def.heal);
    consume(world, carrier, item, 'eaten');
    return true;
  }
  if (def.stanch) {
    if (!carrier.Bleeding || carrier.Bleeding.level <= 0) { // don't waste it
      world.events.emit('use_failed', { id: carrier.id, itemId, reason: 'not_bleeding' });
      return false;
    }
    carrier.Bleeding.level = 0;
    consume(world, carrier, item, 'bandaged');
    return true;
  }
  return false;
}

function consume(world, carrier, item, how) {
  const inv = carrier.Inventory;
  inv.items.splice(inv.items.indexOf(item.id), 1);
  world.entities.delete(item.id);
  world.events.emit('item_used', { id: carrier.id, itemId: item.id, name: item.Name.name, how });
}

// Melee stats for an attacker: a wielded weapon replaces bare-hands damage and hit chance.
export function meleeStats(world, e) {
  const base = e.Melee;
  const wid = e.Inventory && e.Inventory.wielded;
  const weapon = wid && world.entities.get(wid) && itemDef(world.entities.get(wid)).weapon;
  return weapon ? { ...base, ...weapon } : base;
}

// Test map: scatter the configured items on random open tiles.
export function scatterTestItems(world) {
  for (const [type, count] of Object.entries(CONFIG.testGrid.items)) {
    for (let n = 0; n < count; n++) {
      for (let tries = 0; tries < 200; tries++) {
        const x = 1 + world.rng.int(world.width - 2), y = 1 + world.rng.int(world.height - 2);
        if (isPassable(world, x, y) && !itemsAt(world, x, y).length) { makeItem(world, type, x, y); break; }
      }
    }
  }
}
