// Buildings on the town map: tokens at outside size (CLAUDE.md, Scale), drawn with the one
// camera angle (looking north). Every row but the bottom one or two is roof; the bottom rows
// are the south-facing wall. A building that faces south shows its front door and windows; one
// that faces away shows its back wall, with a doorstep (and a hanging sign, for shops and pubs)
// on the street side; one that faces east or west shows a north-south ridge and its south gable.
//
// Every building is recorded in layout.buildings ({ x, y, w, h, kind, name, facing, entry })
// and layout.buildingAt (index + 1 per tile), for inspecting, for interiors (step 14) and for
// loot and zombies by building (13d). `entry` is the tile you stand on to go in.
import { TILE, roofTile, wallTile } from '../tiles.js';

// Kinds: outside size (frontage w x depth d), storeys (wall rows), chimneys, and how the ground
// floor looks from the street.
export const KINDS = {
  terrace:   { w: 4, d: 5, storeys: 2 },
  cottage:   { w: 4, d: 4, storeys: 2 },
  semi:      { w: 5, d: 6, storeys: 2 },
  detached:  { w: 6, d: 6, storeys: 2 },
  bighouse:  { w: 8, d: 7, storeys: 2 },
  bungalow:  { w: 5, d: 5, storeys: 1 },
  farmhouse: { w: 6, d: 7, storeys: 2 },
  shop:      { w: 5, d: 6, storeys: 2, front: 'shop' },
  bank:      { w: 6, d: 6, storeys: 2, front: 'grand' },
  postoffice:{ w: 6, d: 6, storeys: 2, front: 'shop' },
  pub:       { w: 8, d: 8, storeys: 2, front: 'pub' },
  chapel:    { w: 6, d: 8, storeys: 2, front: 'grand', chimney: false },
  hall:      { w: 10, d: 8, storeys: 2, front: 'grand' },
  school:    { w: 12, d: 7, storeys: 2, front: 'grand' },
  factory:   { w: 10, d: 8, storeys: 1, chimney: false },
  barn:      { w: 6, d: 9, storeys: 1, chimney: false },
  shed:      { w: 3, d: 3, storeys: 1, chimney: false },
  garage:    { w: 3, d: 4, storeys: 1, chimney: false },
  greenhouse:{ w: 3, d: 4, storeys: 1, chimney: false },
  station:   { w: 12, d: 5, storeys: 1, front: 'grand' },
  superstore:{ w: 16, d: 12, storeys: 1, front: 'shop', chimney: false },
  church:    { w: 14, d: 8, storeys: 2, front: 'grand', chimney: false },
  cinema:    { w: 8, d: 8, storeys: 2, front: 'grand', chimney: false },
  pavilion:  { w: 6, d: 4, storeys: 1, chimney: false },
  gardencentre: { w: 6, d: 4, storeys: 1, front: 'shop', chimney: false },
};

export function createLayout(w, h) {
  return { buildings: [], buildingAt: new Int16Array(w * h), signs: [], streets: [] };
}

function record(c, L, b) {
  L.buildings.push(b);
  const n = L.buildings.length;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (c.inb(x, y)) L.buildingAt[y * c.w + x] = n;
  return b;
}

// One building facing N or S (an east-west ridge), at its absolute rectangle.
// o: { kind, roof, wall, storeys, name, sign, facing, chimney }
export function stampNS(c, L, x, y, w, h, o) {
  const k = KINDS[o.kind] || {};
  const storeys = Math.min(h, o.storeys ?? k.storeys ?? 2);
  const roofRows = h - storeys;
  const ridge = Math.floor((roofRows - 1) / 2);
  const chim = o.chimney ?? k.chimney ?? true;
  for (let r = 0; r < roofRows; r++) {
    const slope = r < ridge ? 'N' : r === ridge ? 'R' : 'S';
    for (let i = 0; i < w; i++) c.set(x + i, y + r, roofTile(o.roof, slope, chim && r === ridge && i === 0), { use: true });
  }
  const front = o.facing === 'S';
  const style = front ? (o.front ?? k.front ?? 'house') : 'back';
  const door = Math.min(w - 1, style === 'grand' || style === 'pub' ? w >> 1 : 1);
  const lower = y + h - 1, upper = y + h - 2;
  for (let i = 0; i < w; i++) {
    let part = 'WALL';
    if (style === 'shop') part = i === door ? 'DOOR' : 'SHOP';
    else if (style === 'back') part = i === w - 2 ? 'DOOR' : i === 0 ? 'WIN' : 'WALL';
    else if (i === door) part = 'DOOR';
    else if ((i - door) % 2 !== 0) part = 'WIN';
    c.set(x + i, lower, wallTile(o.wall, part), { use: true });
    if (storeys >= 2) c.set(x + i, upper, wallTile(o.wall, i % 2 === 0 || style === 'grand' ? 'WIN' : 'WALL'), { use: true });
  }
  // The way in: below the front door, or the doorstep on the far side for a building facing away.
  const entry = front ? { x: x + door, y: y + h } : { x: x + door, y: y - 1 };
  return record(c, L, { x, y, w, h, kind: o.kind, name: o.name || null, facing: o.facing, entry, sign: o.sign || null });
}

// A row of buildings facing E or W along a north-south street: one roof with a north-south
// ridge, chimney stacks on the party walls, and the south gable of the last one showing.
// units: [{ len, kind, name, sign }] from north to south.
export function stampEW(c, L, x, y, w, units, o) {
  const k = KINDS[units[0].kind] || {};
  const h = units.reduce((s, u) => s + u.len, 0);
  const storeys = Math.min(h, o.storeys ?? k.storeys ?? 2);
  const ridge = Math.floor((w - 1) / 2);
  const chim = o.chimney ?? k.chimney ?? true;
  const tops = new Set();
  let yy = y;
  for (const u of units) { tops.add(yy); yy += u.len; }
  for (let r = 0; r < h - storeys; r++) {
    for (let i = 0; i < w; i++) {
      const slope = i < ridge ? 'W' : i === ridge ? 'V' : 'E';
      c.set(x + i, y + r, roofTile(o.roof, slope, chim && i === ridge && tops.has(y + r)), { use: true });
    }
  }
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < w; i++) c.set(x + i, y + h - 1 - s, wallTile(o.wall, i === ridge ? 'WIN' : 'WALL'), { use: true });
  }
  const out = [];
  yy = y;
  for (const u of units) {
    const mid = yy + (u.len >> 1);
    const entry = o.facing === 'E' ? { x: x + w, y: mid } : { x: x - 1, y: mid };
    out.push(record(c, L, { x, y: yy, w, h: u.len, kind: u.kind, name: u.name || null, facing: o.facing, entry, sign: u.sign || null }));
    yy += u.len;
  }
  return out;
}

// Buildings along one side of a straight street.
//   seg: { horiz, u0, u1 (inclusive range along the street), line (the street's outer row or
//         column, which the fronts touch), side: -1 (north / west of it) or +1 (south / east) }
//   spec: see SPECS in town.js. Buildings only go where their whole plot (front garden,
//         building, back yard) is unclaimed, so roads, rivers and landmarks are never built on.
export function frontage(c, L, rng, seg, spec) {
  const { horiz, line, side } = seg;
  const facing = horiz ? (side < 0 ? 'S' : 'N') : (side < 0 ? 'E' : 'W');
  // Street space (u along the street, v away from it) to the map.
  const at = (u, v) => (horiz ? [u, line + side * (1 + v)] : [line + side * (1 + v), u]);
  const rectUV = (u, len, v, depth) => {
    const a = at(u, v), b = at(u + len - 1, v + depth - 1);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]) + 1, h: Math.abs(b[1] - a[1]) + 1 };
  };
  const setT = (u, v, key) => { const [x, y] = at(u, v); if (key) c.set(x, y, TILE[key], { use: true }); };
  const queue = spec.units ? spec.units.map(u => ({ ...u })) : null;
  let u = seg.u0;
  while (u <= seg.u1) {
    // The next group: named units in order, else a run of the spec's kind.
    let group;
    if (queue) {
      if (!queue.length) break;
      group = [queue[0]];
    } else {
      const [lo, hi] = spec.count || [1, 1];
      const n = lo + rng.int(hi - lo + 1);
      group = Array.from({ length: n }, () => ({ kind: spec.kind }));
    }
    const width = un => un.w ?? KINDS[un.kind].w;
    const depthOf = un => un.d ?? spec.depth ?? KINDS[un.kind].d;
    // Shorten a run to fit what's left of the street and the free ground here; drop the back
    // yard if that's all that's in the way.
    const setback = spec.setback || 0;
    const minRun = Math.min(spec.minRun || 1, group.length);
    const lenOf = gr => gr.reduce((s, g) => s + width(g), 0);
    const tryPlot = (gr, back) => {
      const r = rectUV(u, lenOf(gr), 0, setback + Math.max(...gr.map(depthOf)) + back);
      return u + lenOf(gr) - 1 <= seg.u1 && c.free(r.x, r.y, r.w, r.h) ? r : null;
    };
    let back = 0, plot = null;
    for (const b of spec.back ? [spec.back, 0] : [0]) {
      for (let n = group.length; n >= minRun && !plot; n--) {
        plot = tryPlot(group.slice(0, n), b);
        if (plot) { group = group.slice(0, n); back = b; }
      }
      if (plot) break;
    }
    if (!plot) { u++; continue; }
    const len = lenOf(group);
    const depth = Math.max(...group.map(depthOf));
    if (queue) queue.shift();
    // The buildings.
    const made = [];
    const look = { roof: pick(rng, spec.roof), wall: pick(rng, spec.wall), storeys: spec.storeys, facing };
    if (horiz) {
      let uu = u;
      for (const g of group) {
        const r = rectUV(uu, width(g), setback, depthOf(g));
        made.push(stampNS(c, L, r.x, r.y, r.w, r.h, { ...look, ...g, roof: g.roof || look.roof, wall: g.wall || look.wall }));
        uu += width(g);
      }
    } else {
      const r = rectUV(u, len, setback, depth);
      const units = group.map(g => ({ ...g, len: width(g) }));
      made.push(...stampEW(c, L, r.x, r.y, r.w, units, { ...look, ...group[0], facing }));
    }
    // Front gardens: a boundary along the street with a gate on each path, the path to the door.
    if (setback) {
      for (let uu = u; uu < u + len; uu++) for (let v = 0; v < setback; v++) setT(uu, v, v === 0 && spec.boundary ? spec.boundary : 'GRASS');
    }
    for (const b of made) {
      const eu = horiz ? b.entry.x : b.entry.y;
      if (setback) for (let v = 0; v < setback; v++) setT(eu, v, v === 0 && spec.boundary ? 'GATE' : 'DRIVE');
      // Doorsteps for buildings facing away (their door is on the street side, out of view).
      if (facing !== 'S') {
        const [dx, dy] = setback ? at(eu, setback - 1) : at(eu, -1);
        if (c.get(dx, dy) === TILE.PAVEMENT || c.get(dx, dy) === TILE.DRIVE || c.get(dx, dy) === TILE.SETTS) c.set(dx, dy, TILE.DOORSTEP, { use: true });
        b.entry = { x: dx, y: dy };
        if (b.sign) {
          const [sx, sy] = at(eu + 1, setback ? setback - 1 : -1);
          L.signs.push({ x: sx, y: sy, text: b.sign });
        }
      } else if (setback) {
        b.entry = { x: b.entry.x, y: b.entry.y };
      }
    }
    // Back yards or gardens, divided between the buildings, with a wall or fence at the end.
    if (back) {
      const v0 = setback + depth;
      for (let uu = u; uu < u + len; uu++) for (let v = v0; v < v0 + back; v++) setT(uu, v, v === v0 + back - 1 && spec.backEdge ? spec.backEdge : spec.backTile || 'GRASS');
      if (spec.divide) {
        let uu = u;
        for (let i = 0; i < group.length; i++) {
          if (i > 0) for (let v = v0; v < v0 + back; v++) setT(uu, v, spec.divide);
          uu += width(group[i]);
        }
      }
    }
    // Shorter buildings in a row leave a gap behind them: their yard.
    if (horiz) {
      let uu = u;
      for (const g of group) {
        for (let i = 0; i < width(g); i++) for (let v = setback + depthOf(g); v < setback + depth; v++) setT(uu + i, v, spec.backTile || 'YARD');
        uu += width(g);
      }
    }
    c.claim(plot.x, plot.y, plot.w, plot.h);
    u += len;
    // The gap to the next group: a ginnel, a drive, or nothing.
    const gap = spec.gap || 0;
    if (gap) {
      for (let k = 0; k < gap && u <= seg.u1; k++, u++) {
        const r = rectUV(u, 1, 0, setback + depth + back);
        if (!c.free(r.x, r.y, r.w, r.h)) continue;
        for (let v = 0; v < setback + depth + back; v++) setT(u, v, spec.gapTile || 'GRASS');
      }
    }
  }
}

function pick(rng, v) {
  return Array.isArray(v) ? v[rng.int(v.length)] : v;
}
