// Village life (step 14d): what's in the village when you arrive. Loot by room, the keys
// to locked buildings, and the zombies. All from the seed; numbers in CONFIG.loot and
// CONFIG.village.zombies. (The phone box and allotments are land: gen/village.js.)
//
// Loot: each room gets items from the table for its name (kitchens: food and knives,
// bedrooms: bandages and the odd air rifle, cellars: ale and planks, sheds: tools...),
// plus per-building extras (a farmer's shotgun). Upstairs, cellars and lofts count too.
// Zombies:
//   residents - inside houses, the pub, the shop, the church (upstairs too), often shut
//               in behind a locked door, bashing their way out when they hear you;
//   streets   - about the roads, pavements, lanes, ginnels, yards and the green;
//   fields    - a few out in the fields and on the fell.
// None start within minDistance of you (off screen, since your view is ~9 tiles).
// Keys: one per locked building. A resident usually carries it (kill them and it drops),
// else it's often left by the front door, else it's lost.
import { CONFIG } from '../../config.js';
import { TILE } from './testgrid.js';
import { makeItem, itemsAt } from '../systems/items.js';
import { makeZombie, isPassable, query, tileAt } from '../world.js';
import { structureAt } from '../systems/structures.js';
import { stairsAt } from '../systems/floors.js';
import { makeAnimal } from '../systems/animals.js';

const weighted = (rng, table) => {
  const entries = Object.entries(table);
  let r = rng.next() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { r -= w; if (r < 0) return k; }
  return entries[entries.length - 1][0];
};
const HOMES = new Set(['terracedCottage', 'detachedCottage', 'farmhouse', 'pub', 'cornerShop', 'church']);
const OUTDOORS = new Set([TILE.ROAD, TILE.PAVEMENT, TILE.LANE, TILE.GINNEL, TILE.YARD, TILE.GRASS, TILE.PATH]);

export function populateVillage(world) {
  const rng = world.rng, L = CONFIG.loot, Z = CONFIG.village.zombies;
  const open = (x, y) => isPassable(world, x, y) && !structureAt(world, x, y) && !stairsAt(world, x, y) && !itemsAt(world, x, y).length;
  const spotIn = (r) => {
    for (let i = 0; i < 25; i++) {
      const x = r.x + rng.int(r.w), y = r.y + rng.int(r.h);
      if (open(x, y)) return { x, y };
    }
    return null;
  };
  const far = (p, d) => Math.max(Math.abs(p.x - world.start.x), Math.abs(p.y - world.start.y)) >= d;

  // Every room, ground floor and up/down, with its building.
  const rooms = [];
  world.buildings.forEach((b, bi) => {
    for (const r of b.rooms) rooms.push({ ...r, bi });
    for (const f of b.floors || []) for (const r of f.rooms) rooms.push({ ...r, bi });
  });

  // Loot by room, then the per-building extras.
  for (const r of rooms) {
    const t = L.rooms[r.name];
    if (!t) continue;
    const n = t.n[0] + rng.int(t.n[1] - t.n[0] + 1);
    for (let i = 0; i < n; i++) { const p = spotIn(r); if (p) makeItem(world, weighted(rng, t.items), p.x, p.y); }
  }
  world.buildings.forEach((b, bi) => {
    for (const [type, chance] of L.extras[b.building] || []) {
      if (!rng.chance(chance)) continue;
      const mine = rooms.filter((r) => r.bi === bi);
      const p = mine.length && spotIn(mine[rng.int(mine.length)]);
      if (p) makeItem(world, type, p.x, p.y);
    }
  });

  // Zombies.
  const residentOf = new Map(); // building index -> a zombie living there
  const homes = rooms.filter((r) => HOMES.has(world.buildings[r.bi].building));
  for (let i = 0, tries = 0; i < Z.residents && tries < Z.residents * 20; tries++) {
    const r = homes[rng.int(homes.length)];
    const p = spotIn(r);
    if (!p || !far(p, Z.minDistance)) continue;
    const id = makeZombie(world, p);
    if (!residentOf.has(r.bi)) residentOf.set(r.bi, id);
    i++;
  }
  const scatter = (count, ok, minD) => {
    for (let i = 0, tries = 0; i < count && tries < count * 200; tries++) {
      const p = { x: rng.int(world.width), y: rng.int(world.landHeight) };
      if (!ok(p) || !open(p.x, p.y) || !far(p, minD)) continue;
      makeZombie(world, p);
      i++;
    }
  };
  const inVillage = (p) => Math.abs(p.y - world.bridgeRow) <= CONFIG.village.streetRows[1] + 6;
  scatter(Z.streets, (p) => inVillage(p) && OUTDOORS.has(tileAt(world, p.x, p.y)), Z.minDistance);
  scatter(Z.fields, (p) => !inVillage(p) && [TILE.GRASS, TILE.FELL, TILE.BRACKEN].includes(tileAt(world, p.x, p.y)), Z.minDistance * 2);

  // Keys to the locked buildings.
  const lockedIds = new Set(query(world, 'Door').filter((d) => d.Door.locked && d.Door.lockId).map((d) => d.Door.lockId));
  world.buildings.forEach((b, bi) => {
    if (!lockedIds.has(b.lockId)) return;
    const extra = { lockId: b.lockId, name: `${CONFIG.buildingTypes[b.building].name} key` };
    const resident = residentOf.has(bi) && world.entities.get(residentOf.get(bi));
    if (resident && rng.chance(L.keyResident)) {
      const id = makeItem(world, 'key', null, null, extra); // in its pocket: drops when it dies
      resident.Inventory = { items: [id], capacity: CONFIG.inventory.capacity, wielded: null };
    } else if (rng.chance(L.keyDoorstep)) {
      const f = world.plots[bi].front;
      if (open(f.x, f.y)) makeItem(world, 'key', f.x, f.y, extra);
    }
  });
}

// Animals (step 23): groups of each species where they'd live (CONFIG.animals.spawn), away
// from where you start. Each group is a herd; its spot is every member's home.
export function populateAnimals(world) {
  const rng = world.rng, AN = CONFIG.animals, W = world.width, H = world.landHeight || world.height;
  const t = (x, y) => tileAt(world, x, y);
  const near = (x, y, r, set) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && set.has(t(xx, yy))) return true; } return false; };
  const inVillage = (y) => Math.abs(y - world.bridgeRow) <= CONFIG.village.streetRows[1] + 6;
  const inFarm = (x, y) => (world.farms || []).some((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
  const TREES = new Set([TILE.TREE]), WATER = new Set([TILE.LAKE, TILE.STREAM]);
  const WHERE = {
    fields: (x, y) => t(x, y) === TILE.GRASS && !inVillage(y) && !near(x, y, 2, new Set([TILE.ROAD])),
    wood: (x, y) => t(x, y) === TILE.GRASS && near(x, y, 2, TREES) && !inVillage(y),
    water: (x, y) => (t(x, y) === TILE.SHORE || t(x, y) === TILE.GRASS) && near(x, y, 2, WATER),
    wild: (x, y) => [TILE.BRACKEN, TILE.FELL].includes(t(x, y)) || (t(x, y) === TILE.GRASS && near(x, y, 1, TREES)),
    farm: (x, y) => inFarm(x, y) && [TILE.YARD, TILE.LANE, TILE.GRASS].includes(t(x, y)),
    any: (x, y) => [TILE.GRASS, TILE.FELL].includes(t(x, y)),
  };
  const far = (x, y) => Math.max(Math.abs(x - world.start.x), Math.abs(y - world.start.y)) >= AN.minDistance;
  let herds = 0;
  for (const sp of AN.spawn) {
    const ok = WHERE[sp.where];
    const spots = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ok(x, y) && far(x, y) && isPassable(world, x, y)) spots.push({ x, y });
    if (!spots.length) continue;
    for (let g = 0; g < sp.groups; g++) {
      const a = spots[rng.int(spots.length)];
      const n = sp.size[0] + rng.int(sp.size[1] - sp.size[0] + 1), herd = n > 1 ? `${sp.species}-${++herds}` : null;
      for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
        const x = a.x + rng.int(7) - 3, y = a.y + rng.int(7) - 3;
        if (x < 0 || y < 0 || x >= W || y >= H || !ok(x, y) || !isPassable(world, x, y)) continue;
        makeAnimal(world, sp.species, x, y, herd);
        i++;
      }
    }
  }
}
