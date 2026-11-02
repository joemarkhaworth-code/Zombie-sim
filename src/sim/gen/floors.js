// Upstairs, cellars and lofts (step 14c).
//
// Each extra floor is a small separate map: a walled pocket laid out in the void band
// below the valley (rows landHeight.. of the world), packed left to right in shelves with
// void between them. A pocket keeps its building's facing, and its stairs or ladder sits
// on the same spot (u, v) in the building's frame as the end on the ground floor, so the
// two line up as if one were above the other.
//
// Plans (in the building's frame; see gen/buildings.js): which part of the footprint the
// floor covers (rect, walls included), where the link is (at), the link (stairs/ladder),
// partitions, inside doors and rooms. Which buildings get which floors: CONFIG.floors.chance.
// Upper floors have no windows yet (you'd look out over the void: a view out of an
// upstairs window needs sight across maps, later).
import { CONFIG } from '../../config.js';
import { TILE, WALL_OF, FLOOR_OF } from './testgrid.js';
import { frameOf } from './buildings.js';
import { makeDoor } from '../systems/structures.js';
import { makeStairs } from '../systems/floors.js';

// (W, L, mid) -> { upstairs?, cellar?, loft? }, each { rect: [u0, v0, u1, v1], at: [u, v],
// via, floor, walls: [[u0, v0, u1, v1]], inner: [[u, v]], rooms: [[name, u0, v0, u1, v1]] }.
// Links are placed clear of the ground floor's door approaches.
const PLANS = {
  terracedCottage: (W, L, mid, rng) => {
    const m = L >> 1, side = mid === W - 2 ? 1 : W - 2, d = rng.chance(0.5) ? 1 : W - 2;
    return {
      upstairs: { rect: [0, 0, W - 1, L - 1], at: [side, 1], via: 'stairs', floor: 'wood', walls: [[1, m, W - 2, m]], inner: [[d, m]], rooms: [['front bedroom', 1, 1, W - 2, m - 1], ['back bedroom', 1, m + 1, W - 2, L - 2]] },
    };
  },
  detachedCottage: (W, L, mid) => {
    const m = L >> 1;
    return {
      upstairs: {
        rect: [0, 0, W - 1, L - 1], at: [W - 2, m - 1], via: 'stairs', floor: 'wood',
        walls: [[1, m, W - 2, m], [mid, m + 1, mid, L - 2]], inner: [[mid - 1, m], [mid + 1, m]],
        rooms: [['front bedroom', 1, 1, W - 2, m - 1], ['back bedroom', 1, m + 1, mid - 1, L - 2], ['bathroom', mid + 1, m + 1, W - 2, L - 2]],
      },
      cellar: { rect: [0, 0, W - 1, m], at: [1, m - 1], via: 'ladder', floor: 'flags', walls: [], inner: [], rooms: [['cellar', 1, 1, W - 2, m - 1]] },
    };
  },
  cornerShop: (W, L) => ({
    upstairs: { rect: [0, 0, W - 1, L - 1], at: [1, L - 2], via: 'stairs', floor: 'wood', walls: [[1, L - 4, W - 2, L - 4]], inner: [[W - 2, L - 4]], rooms: [['flat', 1, 1, W - 2, L - 5], ['bedroom', 1, L - 3, W - 2, L - 2]] },
    cellar: { rect: [0, 0, W - 1, L - 4], at: [W - 2, 1], via: 'ladder', floor: 'flags', walls: [], inner: [], rooms: [['stock cellar', 1, 1, W - 2, L - 5]] },
  }),
  pub: (W, L, mid) => {
    const m = L >> 1;
    return {
      upstairs: {
        rect: [0, 0, W - 1, L - 1], at: [W - 2, L - 2], via: 'stairs', floor: 'wood',
        walls: [[1, m, W - 2, m], [mid, m + 1, mid, L - 2]], inner: [[2, m], [W - 3, m]],
        rooms: [['sitting room', 1, 1, W - 2, m - 1], ['bedroom', 1, m + 1, mid - 1, L - 2], ['back bedroom', mid + 1, m + 1, W - 2, L - 2]],
      },
      cellar: { rect: [0, 0, W - 1, m], at: [W - 2, m - 1], via: 'ladder', floor: 'flags', walls: [], inner: [], rooms: [['beer cellar', 1, 1, W - 2, m - 1]] },
    };
  },
  church: (W, L) => { // a loft over the vestry, up a ladder: the bell loft
    const p = W - 5;
    return { loft: { rect: [p, 0, W - 1, L - 1], at: [W - 2, L - 2], via: 'ladder', floor: 'wood', walls: [], inner: [], rooms: [['bell loft', p + 1, 1, W - 2, L - 2]] } };
  },
  barn: (W, L) => ({ // a hayloft over the back half, up a ladder
    loft: { rect: [0, L >> 1, W - 1, L - 1], at: [1, L - 2], via: 'ladder', floor: 'wood', walls: [], inner: [], rooms: [['hayloft', 1, (L >> 1) + 1, W - 2, L - 2]] },
  }),
};
PLANS.farmhouse = PLANS.detachedCottage;

// Lay out every building's extra floors in the void band and link them up.
export function buildFloors(world, plots, landHeight) {
  const rng = world.rng, V = CONFIG.floors;
  const set = (x, y, t) => { world.tiles[y * world.width + x] = t; };
  for (let i = landHeight * world.width; i < world.tiles.length; i++) world.tiles[i] = TILE.VOID;
  // Shelf packer for pockets in the band.
  let cx = V.gap, cy = landHeight + V.gap, shelfH = 0;
  const place = (w, h) => {
    if (cx + w + V.gap > world.width) { cx = V.gap; cy += shelfH + V.gap; shelfH = 0; }
    if (cy + h + V.gap > world.height) throw new Error('floor band full: raise CONFIG.village.floorRows');
    const at = { x: cx, y: cy };
    cx += w + V.gap; shelfH = Math.max(shelfH, h);
    return at;
  };
  world.floors = [];
  plots.forEach((p, bi) => {
    const chance = V.chance[p.building];
    if (!chance) return;
    const b = world.buildings[bi], frame = frameOf(p);
    const { W, L } = frame;
    let mid = W >> 1;
    for (let u = 0; u < W; u++) { const o = frame.at(u, -1); if (o.x === p.front.x && o.y === p.front.y) mid = u; }
    const plans = PLANS[p.building](W, L, mid, rng);
    b.floors = [];
    for (const [name, plan] of Object.entries(plans)) {
      if (!rng.chance(chance[name] || 0)) continue;
      const [u0, v0, u1, v1] = plan.rect, Wp = u1 - u0 + 1, Lp = v1 - v0 + 1;
      const sideways = p.facing === 'W' || p.facing === 'E';
      const pw = sideways ? Lp : Wp, ph = sideways ? Wp : Lp;
      const pos = place(pw, ph);
      const pocket = frameOf({ x: pos.x, y: pos.y, w: pw, h: ph, facing: p.facing });
      const at = (u, v) => pocket.at(u - u0, v - v0); // building frame -> pocket tile
      const wallT = WALL_OF[b.walls], floorT = FLOOR_OF[plan.floor];
      for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
        const { x, y } = at(u, v);
        set(x, y, u === u0 || v === v0 || u === u1 || v === v1 ? wallT : floorT);
      }
      for (const [a0, b0, a1, b1] of plan.walls) for (let u = a0; u <= a1; u++) for (let v = b0; v <= b1; v++) { const { x, y } = at(u, v); set(x, y, wallT); }
      for (const [u, v] of plan.inner) {
        const { x, y } = at(u, v);
        set(x, y, floorT);
        makeDoor(world, x, y, { material: 'wood', open: rng.chance(CONFIG.innerDoorOpen) });
      }
      // The link: the ground-floor end in the building, the other end in the pocket.
      const ground = frame.at(...plan.at), here = at(...plan.at);
      const [lower, upper] = name === 'cellar' ? [here, ground] : [ground, here];
      makeStairs(world, lower, upper, plan.via);
      const rooms = plan.rooms.map(([rn, a0, b0, a1, b1]) => {
        const a = at(a0, b0), c = at(a1, b1);
        return { name: rn, x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x) + 1, h: Math.abs(c.y - a.y) + 1 };
      });
      const f = { building: bi, name, via: plan.via, x: pos.x, y: pos.y, w: pw, h: ph, rooms };
      b.floors.push(f);
      world.floors.push(f);
    }
  });
}
