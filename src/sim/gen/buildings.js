// Buildings (step 14b): every village plot becomes a building at true scale.
//
// One generic builder for all building types. A plot has a facing (the side its front
// faces), so each building is laid out in its own frame: u runs along the front
// (0..W-1), v runs back from it (0..L-1). Walls round the edge (wall tiles of the
// building's material), a floor inside, partition walls between rooms with an inside
// door in each, outside doors and windows (structure entities standing on floor tiles in
// gaps in the wall, like the test building). Materials, roof and locks are picked per
// building from CONFIG.buildingTypes; room layouts are the LAYOUTS below.
//
// world.buildings = [{ kind, building, x, y, w, h, facing, walls, roof, floor, lockId, rooms }]
// rooms: [{ name, x, y, w, h }] (inside, walls excluded) - 14c/14d hang stairs and loot on these.
import { CONFIG } from '../../config.js';
import { TILE_INFO, WALL_OF, FLOOR_OF } from './testgrid.js';
import { makeDoor, makeWindow } from '../systems/structures.js';

const weighted = (rng, table) => {
  const entries = Object.entries(table);
  let r = rng.next() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) { r -= w; if (r < 0) return k; }
  return entries[entries.length - 1][0];
};

// A plot's own frame: at(u, v) -> map tile. v = -1 is just outside the front, v = L just
// outside the back.
export function frameOf(p) {
  switch (p.facing) {
    case 'W': return { W: p.h, L: p.w, at: (u, v) => ({ x: p.x + v, y: p.y + u }) };
    case 'E': return { W: p.h, L: p.w, at: (u, v) => ({ x: p.x + p.w - 1 - v, y: p.y + u }) };
    case 'N': return { W: p.w, L: p.h, at: (u, v) => ({ x: p.x + u, y: p.y + v }) };
    default: return { W: p.w, L: p.h, at: (u, v) => ({ x: p.x + u, y: p.y + p.h - 1 - v }) };
  }
}

// Windows along a wall row: every u in [u0, u1] not in skip.
const along = (v, u0, u1, skip = [], step = 1) => {
  const out = [];
  for (let u = u0; u <= u1; u += step) if (!skip.includes(u)) out.push([u, v]);
  return out;
};
const side = (u, ...vs) => vs.map((v) => [u, v]);

// Room layouts, in the building's frame. Each returns:
//   walls:   partition segments [u0, v0, u1, v1] (straight lines, inside the outer walls)
//   inner:   inside doorways [u, v] (on a partition)
//   front:   u of each front door (on v = 0); the middle one matches the plot's front tile
//   back:    u of the back door (on v = L-1), or null
//   windows: [u, v] on the outer walls
//   rooms:   [name, u0, v0, u1, v1]
// mid: where the front door goes (the u whose outside tile is the plot's front tile; the
// middle of the front, give or take one).
const LAYOUTS = {
  // 5x7: front room, kitchen behind; the inside door at one side.
  terracedCottage: (W, L, rng, walls, mid) => {
    const m = L >> 1, d = rng.chance(0.5) ? 1 : W - 2;
    return {
      walls: [[1, m, W - 2, m]], inner: [[d, m]], front: [mid], back: mid,
      windows: [...along(0, 1, W - 2, [mid]), ...along(L - 1, 1, W - 2, [mid])],
      rooms: [['front room', 1, 1, W - 2, m - 1], ['kitchen', 1, m + 1, W - 2, L - 2]],
    };
  },
  // 7x9: a living room across the front; kitchen and scullery behind, side by side.
  detachedCottage: (W, L, rng, walls, mid) => {
    const m = L >> 1;
    return {
      walls: [[1, m, W - 2, m], [mid, m + 1, mid, L - 2]], inner: [[mid - 1, m], [mid + 1, m]], front: [mid], back: 1,
      windows: [[1, 0], [W - 2, 0], ...side(0, 2, L - 3), ...side(W - 1, 2, L - 3), [W - 2, L - 1]],
      rooms: [['living room', 1, 1, W - 2, m - 1], ['kitchen', 1, m + 1, mid - 1, L - 2], ['scullery', mid + 1, m + 1, W - 2, L - 2]],
    };
  },
  // 6x8: the shop floor at the front with a wide shop window; a stock room behind.
  cornerShop: (W, L, rng, walls, mid) => {
    const m = L - 4;
    return {
      walls: [[1, m, W - 2, m]], inner: [[W - 2, m]], front: [mid], back: mid,
      windows: [...along(0, 1, W - 2, [mid]), [1, L - 1]],
      rooms: [['shop', 1, 1, W - 2, m - 1], ['stock room', 1, m + 1, W - 2, L - 2]],
    };
  },
  // 10x12: the bar across the front; kitchen and cellar-store behind; back door to the yard.
  pub: (W, L, rng, walls, mid) => {
    const m = L >> 1;
    return {
      walls: [[1, m, W - 2, m], [mid, m + 1, mid, L - 2]], inner: [[2, m], [W - 3, m]], front: [mid], back: W - 3,
      windows: [...along(0, 1, W - 2, [mid - 1, mid, mid + 1]), [2, L - 1]],
      rooms: [['bar', 1, 1, W - 2, m - 1], ['kitchen', 1, m + 1, mid - 1, L - 2], ['store', mid + 1, m + 1, W - 2, L - 2]],
    };
  },
  // Lies along the street (18 wide, 9 deep): the nave, and a vestry at one end.
  church: (W, L, rng, walls, mid) => {
    const p = W - 5;
    return {
      walls: [[p, 1, p, L - 2]], inner: [[p, L - 3]], front: [mid], back: null,
      windows: [...along(0, 2, W - 3, [mid, p], 3), ...along(L - 1, 2, W - 3, [p], 3)],
      rooms: [['nave', 1, 1, p - 1, L - 2], ['vestry', p + 1, 1, W - 2, L - 2]],
    };
  },
  // 7x9, facing the farmyard; its back is against the yard wall.
  farmhouse: (W, L, rng, walls, mid) => LAYOUTS.detachedCottage(W, L, rng, walls, mid),
  // 8x12: one big space; double doors onto the yard; slit windows in stone barns.
  barn: (W, L, rng, walls, mid) => ({
    walls: [], inner: [], front: [mid - 1, mid], back: null,
    windows: walls === 'corrugatedMetal' ? [] : [...side(0, 3, L - 4), ...side(W - 1, 3, L - 4)],
    rooms: [['barn', 1, 1, W - 2, L - 2]],
  }),
  shed: (W, L, rng, walls, mid) => ({ walls: [], inner: [], front: [mid], back: null, windows: [], rooms: [['shed', 1, 1, W - 2, L - 2]] }),
  greenhouse: (W, L, rng, walls, mid) => ({ walls: [], inner: [], front: [mid], back: null, windows: [], rooms: [['greenhouse', 1, 1, W - 2, L - 2]] }),
};

export function buildVillage(world, plots) {
  const rng = world.rng;
  const idx = (x, y) => y * world.width + x;
  const set = (x, y, t) => { world.tiles[idx(x, y)] = t; };
  const walkable = ({ x, y }) => x >= 0 && y >= 0 && x < world.width && y < world.height && !TILE_INFO[world.tiles[idx(x, y)]].blocks;
  world.buildings = [];
  for (const p of plots) {
    const type = CONFIG.buildingTypes[p.building];
    const walls = weighted(rng, type.walls);
    const roof = type.roof === 'walls' ? walls : weighted(rng, type.roof);
    const doorMat = type.door === 'walls' ? walls : type.door;
    const { W, L, at } = frameOf(p);
    const put = (u, v, t) => { const { x, y } = at(u, v); set(x, y, t); };
    const wallT = WALL_OF[walls], floorT = FLOOR_OF[type.floor];
    for (let u = 0; u < W; u++) for (let v = 0; v < L; v++) put(u, v, u === 0 || v === 0 || u === W - 1 || v === L - 1 ? wallT : floorT);
    let mid = W >> 1;
    for (let u = 0; u < W; u++) { const o = at(u, -1); if (p.front && o.x === p.front.x && o.y === p.front.y) mid = u; }
    const plan = LAYOUTS[p.building](W, L, rng, walls, mid);
    for (const [u0, v0, u1, v1] of plan.walls) for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) put(u, v, wallT);
    const lockId = `building-${world.buildings.length}`; // one key per building (keys: 14d)
    const opening = (u, v) => { const { x, y } = at(u, v); set(x, y, floorT); return { x, y }; };
    const lockedFront = rng.chance(type.lockFront);
    for (const u of plan.front) {
      const { x, y } = opening(u, 0);
      makeDoor(world, x, y, { material: doorMat, locked: lockedFront, lockId });
    }
    if (plan.back !== null && walkable(at(plan.back, L))) { // never a back door into a wall
      const { x, y } = opening(plan.back, L - 1);
      makeDoor(world, x, y, { material: doorMat, locked: rng.chance(type.lockBack), lockId });
      p.back = at(plan.back, L);
    }
    for (const [u, v] of plan.inner) {
      const { x, y } = opening(u, v);
      makeDoor(world, x, y, { material: 'wood', open: rng.chance(CONFIG.innerDoorOpen) });
    }
    for (const [u, v] of plan.windows) {
      const out = at(u === 0 ? -1 : u === W - 1 ? W : u, v === 0 ? -1 : v === L - 1 ? L : v);
      if (!walkable(out)) continue; // no window onto a wall (a neighbour, a yard wall)
      const { x, y } = opening(u, v);
      makeWindow(world, x, y);
    }
    const rooms = plan.rooms.map(([name, u0, v0, u1, v1]) => {
      const a = at(u0, v0), b = at(u1, v1);
      return { name, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + 1, h: Math.abs(b.y - a.y) + 1 };
    });
    world.buildings.push({ kind: p.kind, building: p.building, x: p.x, y: p.y, w: p.w, h: p.h, facing: p.facing, walls, roof, floor: type.floor, lockId, rooms });
  }
}
