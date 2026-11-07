// Items. An item is an entity with Item { type } + Glyph + Name. On the map it has a Position;
// carried, it has none. Item types are data (CONFIG.items): size [w, h] in bag squares,
// heal (half-hearts), weapon { damage, knockback, noise }.
//   Inventory { cols, rows, items: [{ id, x, y, w, h }], hand: id | 0 }
// The bag is a grid, a little like Tetris: each item takes up its shape (turned on its side if
// that fits better). What you hold is in your hand, not in the bag.
// Walking onto an item picks it up as part of the step (free). If it won't fit it stays put;
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

export function makeInventory(cols, rows) {
  return { cols, rows, items: [], hand: 0 };
}

// ---- The grid ----

function occupied(inv, skipId) {
  const g = new Uint8Array(inv.cols * inv.rows);
  for (const s of inv.items) {
    if (s.id === skipId) continue;
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) g[y * inv.cols + x] = 1;
  }
  return g;
}

function fits(inv, g, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > inv.cols || y + h > inv.rows) return false;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy * inv.cols + xx]) return false;
  return true;
}

// The first free spot for a w x h item (row by row), trying it upright then turned.
function findSpot(inv, g, w, h) {
  for (const [ww, hh] of w === h ? [[w, h]] : [[w, h], [h, w]]) {
    for (let y = 0; y + hh <= inv.rows; y++) {
      for (let x = 0; x + ww <= inv.cols; x++) if (fits(inv, g, x, y, ww, hh)) return { x, y, w: ww, h: hh };
    }
  }
  return null;
}

// Pack all of `ids` from scratch, biggest first. Returns the layout or null if they don't fit.
function packAll(world, inv, ids) {
  const sized = ids.map(id => ({ id, size: CONFIG.items[world.entities.get(id).Item.type].size }))
    .sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1] || a.id - b.id);
  const trial = { cols: inv.cols, rows: inv.rows, items: [] };
  for (const { id, size } of sized) {
    const spot = findSpot(trial, occupied(trial), size[0], size[1]);
    if (!spot) return null;
    trial.items.push({ id, ...spot });
  }
  return trial.items;
}

// Can this item go in the bag (as it is, or after tidying)?
export function canStore(world, holder, item) {
  const inv = holder.Inventory, [w, h] = itemType(item).size;
  return !!findSpot(inv, occupied(inv), w, h) || !!packAll(world, inv, [...inv.items.map(s => s.id), item.id]);
}

// Put an item in the bag: the first free spot, else tidy the whole bag to make room.
// Returns false if it won't fit at all.
export function store(world, holder, item) {
  const inv = holder.Inventory, [w, h] = itemType(item).size;
  const spot = findSpot(inv, occupied(inv), w, h);
  if (spot) {
    inv.items.push({ id: item.id, ...spot });
  } else {
    const packed = packAll(world, inv, [...inv.items.map(s => s.id), item.id]);
    if (!packed) return false;
    inv.items = packed;
    world.events.emit('bag_tidied', { id: holder.id });
  }
  delete item.Position;
  return true;
}

export function inBag(holder, itemId) {
  return holder.Inventory.items.some(s => s.id === itemId);
}

function takeOut(holder, itemId) {
  const inv = holder.Inventory;
  if (inv.hand === itemId) { inv.hand = 0; return true; }
  const i = inv.items.findIndex(s => s.id === itemId);
  if (i < 0) return false;
  inv.items.splice(i, 1);
  return true;
}

// Everything carried: the bag's contents and what's in hand.
export function carried(holder) {
  const inv = holder.Inventory;
  return [...(inv.hand ? [inv.hand] : []), ...inv.items.map(s => s.id)];
}

// ---- Actions ----

// Items lying on a tile (top one last).
export function itemsAt(world, x, y) {
  const out = [];
  for (const e of world.entities.values()) {
    if (e.Item && e.Position && e.Position.x === x && e.Position.y === y) out.push(e);
  }
  return out;
}

// Pick up the top item on the holder's tile: into the bag; a weapon that won't fit goes into
// empty hands. Returns 'picked', 'full' or 'none'.
export function pickUp(world, holder) {
  const here = itemsAt(world, holder.Position.x, holder.Position.y);
  if (!here.length) return 'none';
  const item = here[here.length - 1];
  if (!store(world, holder, item)) {
    if (itemType(item).weapon && !holder.Inventory.hand) {
      holder.Inventory.hand = item.id;
      delete item.Position;
      world.events.emit('item_picked_up', { id: holder.id, itemId: item.id, inHand: true });
      return 'picked';
    }
    world.events.emit('bag_full', { id: holder.id, itemId: item.id });
    return 'full';
  }
  world.events.emit('item_picked_up', { id: holder.id, itemId: item.id });
  return 'picked';
}

// Drop something from the bag or your hand at your feet.
export function drop(world, holder, itemId) {
  if (!takeOut(holder, itemId)) return false;
  world.entities.get(itemId).Position = { x: holder.Position.x, y: holder.Position.y };
  world.events.emit('item_dropped', { id: holder.id, itemId });
  return true;
}

// Use an item: a weapon in the bag is taken in hand (what you held goes into the bag, if it
// fits); the weapon in hand is put away in the bag; healing items are used up.
// Returns true if it took a turn (refusals don't).
export function useItem(world, holder, itemId) {
  const inv = holder.Inventory;
  const inHand = inv.hand === itemId;
  if (!inHand && !inBag(holder, itemId)) return false;
  const item = world.entities.get(itemId), t = itemType(item);
  if (t.weapon) {
    if (inHand) {
      // Stow: into the bag.
      inv.hand = 0;
      if (!store(world, holder, item)) {
        inv.hand = itemId;
        world.events.emit('use_refused', { id: holder.id, itemId, why: 'no_room' });
        return false;
      }
      world.events.emit('item_stowed', { id: holder.id, itemId });
      return true;
    }
    // Hold: out of the bag into your hand; what you held goes into the bag in its place.
    const old = inv.hand;
    const saved = inv.items.map(s => ({ ...s }));
    takeOut(holder, itemId);
    if (old) {
      if (!store(world, holder, world.entities.get(old))) {
        inv.items = saved; // put everything back as it was
        world.events.emit('use_refused', { id: holder.id, itemId: old, why: 'no_room' });
        return false;
      }
    }
    inv.hand = itemId;
    world.events.emit('item_wielded', { id: holder.id, itemId, swappedId: old });
    return true;
  }
  if (t.heal) {
    const h = holder.Health;
    if (!h || h.hp >= h.max) {
      world.events.emit('use_refused', { id: holder.id, itemId, why: 'not_hurt' });
      return false;
    }
    h.hp = Math.min(h.max, h.hp + t.heal);
    takeOut(holder, itemId);
    world.entities.delete(itemId); // used up
    world.events.emit('item_used', { id: holder.id, itemId, type: item.Item.type, healed: t.heal });
    return true;
  }
  world.events.emit('use_refused', { id: holder.id, itemId, why: 'no_use' });
  return false;
}

// A creature's melee numbers: its held weapon's, else its own Melee (bare hands, a bite).
export function meleeStats(world, e) {
  const inv = e.Inventory;
  if (inv && inv.hand) {
    const t = itemType(world.entities.get(inv.hand));
    if (t && t.weapon) return t.weapon;
  }
  return e.Melee;
}
