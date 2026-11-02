// Light (step 15): day and night, and things that give light.
//
// world.light is a 0-3 level per tile (vision.js reads it: a tile's visibility is its
// light level, and noticing distance shrinks with it). Two parts:
//  - Ambient: by the hour (CONFIG.light.byHour: a November day in the Lakes, dark
//    before 7, full light 8-15, dusk at 4, moonlight at night). Indoor floors
//    (TILE_INFO indoor) are CONFIG.light.indoorDim darker, so houses are pitch black at
//    night.
//  - Sources: any item with a `light` property that is lit (Item.lit). Carried, it lights
//    its carrier's tile and around; dropped or thrown, it lights where it lies. It lights
//    every tile it has a clear line to (light goes out of windows, not through walls):
//    level `level` within `radius`, one less for `falloff` tiles beyond. A lit tile is
//    also a lit target: whoever carries a torch is seen from much further away.
// Lit items burn down (Item.charge, ticks); at 0 they go out (candles are used up).
// Recomputed at the end of each turn, but only when the hour's light or the sources change
// (then everyone's vision is refreshed).
import { CONFIG } from '../../config.js';
import { TILE_INFO } from '../gen/testgrid.js';
import { minutesAt } from '../time.js';
import { ambientFor } from './weather.js';
import { fireLights } from './fire.js';
import { lineClear, refreshAllVision, updateVision, solidAt } from './vision.js';

export function ambientAt(tick) {
  const hour = Math.floor(minutesAt(tick) / 60) % 24;
  return CONFIG.light.byHour[hour];
}

// Where each lit light is: [{ x, y, radius, level, falloff }].
export function lightSources(world) {
  const holder = new Map(); // item id -> carrier
  for (const e of world.entities.values()) {
    if (e.Inventory && e.Position) for (const id of e.Inventory.items) holder.set(id, e);
  }
  const out = [];
  for (const e of world.entities.values()) {
    if (!e.Item || !e.Item.lit) continue;
    const def = CONFIG.items[e.Item.type].light;
    const at = e.Position || (holder.get(e.id) && holder.get(e.id).Position);
    if (def && at) out.push({ x: at.x, y: at.y, radius: def.radius, level: def.level, falloff: CONFIG.light.falloff });
  }
  if (world.fire) for (const f of fireLights(world)) out.push({ ...f, falloff: CONFIG.light.falloff }); // fires light up (step 19)
  return out;
}

// Bring world.light up to date. force: recompute even if nothing seems to have changed.
export function updateLight(world, force = false) {
  const amb = ambientFor(world, ambientAt(world.tick)); // the hour's light as the weather leaves it
  const sources = lightSources(world);
  const key = sources.map((s) => `${s.x},${s.y},${s.radius},${s.level}`).join(';');
  const hourChanged = amb !== world.ambient;
  if (!force && !hourChanged && key === world.lightKey) return false;
  world.ambient = amb;
  world.lightKey = key;
  // The hour's light (lightBase) only changes with the hour; lights are laid over it.
  if (force || hourChanged || !world.lightBase) {
    const dim = CONFIG.light.indoorDim;
    world.lightBase = new Uint8Array(world.tiles.length);
    for (let i = 0; i < world.tiles.length; i++) world.lightBase[i] = TILE_INFO[world.tiles[i]].indoor ? Math.max(0, amb - dim) : amb;
  }
  world.light.set(world.lightBase);
  for (const s of sources) {
    const R = s.radius + s.falloff;
    for (let y = s.y - R; y <= s.y + R; y++) for (let x = s.x - R; x <= s.x + R; x++) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
      const lv = d2 <= s.radius * s.radius + s.radius ? s.level : d2 <= R * R + R ? s.level - 1 : 0;
      const i = y * world.width + x;
      if (lv <= world.light[i] || !lineClear(world, s.x, s.y, x, y, solidAt)) continue;
      world.light[i] = lv;
    }
  }
  // Whose view changed: everyone at a change of hour; otherwise only those near a light
  // that moved, came on or went out.
  const near = [...sources, ...(world.lastLights || [])];
  world.lastLights = sources.map((q) => ({ x: q.x, y: q.y }));
  if (force || hourChanged) refreshAllVision(world);
  else {
    const reach = CONFIG.light.range + 10;
    for (const e of world.entities.values()) {
      if (e.Vision && e.Position && near.some((q) => Math.abs(q.x - e.Position.x) <= reach && Math.abs(q.y - e.Position.y) <= reach)) updateVision(world, e);
    }
  }
  // Dusk and dawn come from the clock, not the weather (a downpour isn't nightfall).
  const daylight = ambientAt(world.tick);
  if (world.daylight !== undefined && daylight !== world.daylight) world.events.emit('ambient_changed', { from: world.daylight, to: daylight });
  world.daylight = daylight;
  return true;
}

// Every tick: lit things burn down. A torch goes flat; a candle burns away.
export function tickLight(world) {
  for (const e of world.entities.values()) {
    if (!e.Item || !e.Item.lit) continue;
    e.Item.charge = Math.max(0, (e.Item.charge || 0) - 1);
    if (e.Item.charge > 0) continue;
    e.Item.lit = false;
    const def = CONFIG.items[e.Item.type].light;
    let holderId = null;
    for (const h of world.entities.values()) if (h.Inventory && h.Inventory.items.includes(e.id)) holderId = h.id;
    world.events.emit('light_out', { itemId: e.id, holderId, name: e.Name.name, burnsOut: !!def.burnsOut });
    if (def.burnsOut) { // nothing left of it
      if (holderId !== null) { const inv = world.entities.get(holderId).Inventory; inv.items.splice(inv.items.indexOf(e.id), 1); }
      world.entities.delete(e.id);
    }
  }
}

// Switch a light on or off (from the bag). Fails if it's spent.
export function toggleLight(world, carrier, item) {
  if (!item.Item.lit && !(item.Item.charge > 0)) {
    world.events.emit('use_failed', { id: carrier.id, itemId: item.id, reason: 'spent' });
    return false;
  }
  item.Item.lit = !item.Item.lit;
  world.events.emit(item.Item.lit ? 'light_on' : 'light_off', { id: carrier.id, itemId: item.id });
  return true;
}
