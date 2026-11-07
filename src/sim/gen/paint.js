// Painting on the tile map, for the town generator: rectangles, polygons, orthogonal roads and
// the river's distance field. A canvas wraps world.tiles plus a `used` mask: tiles claimed by
// something (a road, water, a building) that later features mustn't paint over.
import { TILE } from '../tiles.js';

export function createCanvas(w, h) {
  const c = {
    w, h,
    t: new Uint8Array(w * h),
    used: new Uint8Array(w * h),
    inb: (x, y) => x >= 0 && y >= 0 && x < w && y < h,
    get: (x, y) => (c.inb(x, y) ? c.t[y * w + x] : -1),
    isUsed: (x, y) => !c.inb(x, y) || c.used[y * w + x] > 0,
    // Paint a tile. use: mark it claimed. onlyFree: skip tiles already claimed.
    set(x, y, tile, { use = false, onlyFree = false } = {}) {
      if (!c.inb(x, y)) return;
      const i = y * w + x;
      if (onlyFree && c.used[i]) return;
      c.t[i] = tile;
      if (use) c.used[i] = 1;
    },
    rect(x, y, rw, rh, tile, opts) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) c.set(xx, yy, tile, opts);
    },
    // Is every tile of the rectangle on the map and unclaimed?
    free(x, y, rw, rh) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) if (c.isUsed(xx, yy)) return false;
      return true;
    },
    claim(x, y, rw, rh) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) if (c.inb(xx, yy)) c.used[yy * w + xx] = 1;
    },
  };
  return c;
}

// Even-odd test at the tile's centre.
export function inPoly(pts, x, y) {
  const px = x + 0.5, py = y + 0.5;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Calls fn(x, y) for every tile inside the polygon.
export function eachInPoly(c, pts, fn) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(c.h - 1, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(c.w - 1, Math.ceil(x1)); x++) if (inPoly(pts, x, y)) fn(x, y);
  }
}

// A winding way through open country: each diagonal leg becomes a staircase of straight runs
// about `step` tiles long, so roads, lanes and hedges stay on the grid.
export function zigzag(pts, step = 8) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 || dy === 0) { out.push([bx, by]); continue; }
    const k = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / step));
    let [px, py] = [ax, ay];
    for (let j = 1; j <= k; j++) {
      const nx = Math.round(ax + (dx * j) / k), ny = Math.round(ay + (dy * j) / k);
      // Along the longer axis first, then the shorter.
      if (Math.abs(dx) >= Math.abs(dy)) { out.push([nx, py]); out.push([nx, ny]); }
      else { out.push([px, ny]); out.push([nx, ny]); }
      [px, py] = [nx, ny];
    }
  }
  // Drop repeated points.
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

// The rectangles of an orthogonal way of width w through corner points. Each point is the
// top-left tile of the way's cross-section there, so a run from (x0, y) to (x1, y) covers rows
// y..y+w-1. Returns [{ x, y, w, h, horiz }].
export function wayRects(pts, w) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (ax !== bx && ay !== by) throw new Error(`way leg not straight: ${ax},${ay} -> ${bx},${by}`);
    const x = Math.min(ax, bx), y = Math.min(ay, by);
    const horiz = ay === by;
    out.push({ x, y, w: Math.abs(bx - ax) + w, h: Math.abs(by - ay) + w, horiz });
  }
  return out;
}

// Distance from (px, py) to the polyline, signed: negative on its left (north of a river
// flowing east), with t = how far along it the nearest point is (0..length).
export function polyDistance(pts, px, py) {
  let best = Infinity, sign = 1, along = 0, run = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    let u = ((px - ax) * dx + (py - ay) * dy) / len2;
    u = Math.max(0, Math.min(1, u));
    const qx = ax + u * dx, qy = ay + u * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best) {
      best = d;
      sign = dx * (py - ay) - dy * (px - ax) < 0 ? -1 : 1;
      along = run + u * len;
    }
    run += len;
  }
  return { d: best * sign, along };
}

// Bresenham with a square brush: for rails and other ways that may run at a slant.
export function thickLine(c, pts, width, fn) {
  const half = Math.floor((width - 1) / 2);
  for (let i = 1; i < pts.length; i++) {
    let [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let k = 0; k < width; k++) for (let m = 0; m < width; m++) fn(x0 - half + k, y0 - half + m);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

export const WAYS = new Set([TILE.ROAD, TILE.ROAD_LINE_H, TILE.ROAD_LINE_V, TILE.PAVEMENT, TILE.SETTS, TILE.TRACK,
  TILE.PATH, TILE.BRIDGE, TILE.STEPS, TILE.CROSSING, TILE.CARPARK, TILE.DOORSTEP, TILE.ARCH]);
