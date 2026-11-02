// Items and inventory.
//  - An item is an entity with Item { type, slots }, plus Glyph and Name. On the map it
//    has a Position; carried, it has none and its id is in the carrier's Inventory.
//  - Inventory { items: [ids], capacity } - capacity is in slots (each item uses Item.slots).
//  - What using an item does comes from its type in CONFIG.items (data, not special cases):
//      food / drink: n - eat/drink it: n ticks off hunger/thirst (needs.js), used up
//      heal: n     - restore n health (first aid), used up
//      stanch: true - bandage: stops bleeding, used up
//      barricade: true - planks: nail over an adjacent door/window (used up)
//      key: true   - goes on the Keyring { keys: [ids] } instead of the bag (no slot);
//                    opens doors whose Door.lockId matches the key's Item.lockId
//      weapon: {...} - wield it (or put it away); wielded weapon replaces your bare-hands
//                      melee damage/hit chance. Wielded = Inventory.wielded holds its id.
// Picking up: walking onto an item picks it up for free if it fits; tapping yourself
// while standing on one picks it up (takes a turn). Use, drop, wield take a turn.
import { CONFIG } from '../../config.js';
import { addEntity, isPassable, query } from '../world.js';
import { adjacentStructures, addBarricade } from './structures.js';
import { toggleLight } from './light.js';
import { consumeFood } from './needs.js';
import { TILE_INFO } from '../gen/testgrid.js';

// extra: { lockId, name } override the type's (a key to a particular building).
// x === null: made straight into someone's hands (no Position).
export function makeItem(world, type, x, y, extra = {}) {
  const def = CONFIG.items[type];
  const lockId = extra.lockId || def.lockId;
  return addEntity(world, {
    ...(x === null ? {} : { Position: { x, y } }),
    Item: { type, slots: def.slots, ...(def.ammo !== undefined ? { ammo: def.ammo } : {}), ...(lockId ? { lockId } : {}), ...(def.light ? { lit: false, charge: def.charge } : {}) },
    Glyph: { char: def.char, fg: def.fg, bg: def.bg },
    Name: { name: extra.name || def.name },
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
  if (itemDef(item).key && carrier.Keyring) { // keys go on the keyring: no bag space
    delete item.Position;
    carrier.Keyring.keys.push(item.id);
    world.events.emit('item_picked_up', { id: carrier.id, itemId: item.id, keyring: true });
    return true;
  }
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
  if (def.light) return toggleLight(world, carrier, item); // torch, candle: on / off
  if (def.ammoFor) {
    // Load a carried gun of the right type (the emptiest one).
    const guns = inv.items.map((id) => world.entities.get(id)).filter((g) => g.Item.type === def.ammoFor);
    if (!guns.length) {
      world.events.emit('use_failed', { id: carrier.id, itemId, reason: 'no_gun' });
      return false;
    }
    const gun = guns.reduce((a, b) => (b.Item.ammo < a.Item.ammo ? b : a));
    gun.Item.ammo += def.rounds;
    world.events.emit('gun_loaded', { id: carrier.id, gunId: gun.id, rounds: def.rounds, ammo: gun.Item.ammo });
    inv.items.splice(inv.items.indexOf(itemId), 1);
    world.entities.delete(itemId);
    return true;
  }
  if (def.food || def.drink) { // step 16: feeds / waters you; refused if you don't need it
    if (!consumeFood(world, carrier, def)) {
      world.events.emit('use_failed', { id: carrier.id, itemId, reason: def.food ? 'not_hungry' : 'not_thirsty' });
      return false;
    }
    consume(world, carrier, item, def.drink && !def.food ? 'drunk' : 'eaten');
    return true;
  }
  if (def.stanch && def.heal) { // first aid kit: stops bleeding and heals; only if it does something
    if ((!carrier.Bleeding || carrier.Bleeding.level <= 0) && carrier.Health && carrier.Health.hp >= carrier.Health.max) {
      world.events.emit('use_failed', { id: carrier.id, itemId, reason: 'not_hurt' });
      return false;
    }
    if (carrier.Bleeding) carrier.Bleeding.level = 0;
    if (carrier.Health) carrier.Health.hp = Math.min(carrier.Health.max, carrier.Health.hp + def.heal);
    consume(world, carrier, item, 'bandaged');
    return true;
  }
  if (def.heal) {
    if (carrier.Health) carrier.Health.hp = Math.min(carrier.Health.max, carrier.Health.hp + def.heal);
    consume(world, carrier, item, 'eaten');
    return true;
  }
  if (def.barricade) {
    // Nail them over the first adjacent door/window that can take a barricade.
    const target = adjacentStructures(world, carrier, (st) => !st.Barricade && !(st.Door && st.Door.open && !st.Door.broken))[0];
    if (!target || !addBarricade(world, carrier, target)) {
      world.events.emit('use_failed', { id: carrier.id, itemId, reason: 'nothing_to_barricade' });
      return false;
    }
    inv.items.splice(inv.items.indexOf(itemId), 1);
    world.entities.delete(itemId);
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
        const near = world.map === 'village' && world.start; // big map: keep them near the start
        const R = CONFIG.testGrid.itemRadius;
        const x = near ? world.start.x - R + world.rng.int(2 * R + 1) : 1 + world.rng.int(world.width - 2);
        const y = near ? world.start.y - R + world.rng.int(2 * R + 1) : 1 + world.rng.int(world.height - 2);
        if (x < 1 || y < 1 || x >= world.width - 1 || y >= world.height - 1) continue;
        const indoors = world.testBuilding && world.testBuilding.inside(x, y);
        const rough = TILE_INFO[world.tiles[y * world.width + x]].moveCost > 1; // not in streams or hedges
        if (!indoors && !rough && isPassable(world, x, y) && !itemsAt(world, x, y).length) { makeItem(world, type, x, y); break; }
      }
    }
  }
  // Loot inside the locked test building: worth breaking in for.
  const b = world.testBuilding;
  if (b) { makeItem(world, 'beans', b.x + 1, b.y + 1); makeItem(world, 'bandage', b.x + b.w - 2, b.y + 1); }
}
