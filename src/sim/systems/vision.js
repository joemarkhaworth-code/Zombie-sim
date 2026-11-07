// Vision has two separate parts:
//   Line of sight: a straight line between tile centres, blocked by opaque tiles in between.
//     A line squeezing exactly between two diagonal walls is blocked. Symmetric: if A can see
//     B's tile, B can see A's. No distance limit of its own.
//   Light: light.range sets how far anyone sees in the open; eyesight (0-3) scales it; each
//     tile's light level (0-3) is its visibility when it's in sight and in range.
import { CONFIG } from '../../config.js';
import { inBounds, tileAt, cameraRect, screenOf, sameScreen } from '../world.js';
import { TILE_INFO } from '../gen/testscreen.js';
import { updateMemory } from './memory.js';

export function opaqueAt(world, x, y) {
  return !inBounds(world, x, y) || !!TILE_INFO[tileAt(world, x, y)].opaque;
}

// True if nothing opaque lies strictly between the two tiles (the end tiles themselves don't count).
// Walks every tile the segment between the centres passes through (supercover).
export function lineClear(world, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  let x = x0, y = y0, err = dx - dy;
  dx *= 2; dy *= 2;
  while (x !== x1 || y !== y1) {
    if (err > 0) { x += sx; err -= dy; }
    else if (err < 0) { y += sy; err += dx; }
    else {
      // Exactly through a corner: blocked only if both side tiles are opaque.
      if (opaqueAt(world, x + sx, y) && opaqueAt(world, x, y + sy)) return false;
      x += sx; y += sy; err += dx - dy;
    }
    if ((x !== x1 || y !== y1) && opaqueAt(world, x, y)) return false;
  }
  return true;
}

export function sightRadius(e) {
  const eyes = e.Vision ? e.Vision.eyesight : 0;
  return CONFIG.light.range * CONFIG.vision.eyesightFactor[eyes];
}

// Visibility (0-3) of tile (x, y) to entity e: its light level if in sight and in range, else 0.
export function tileVisibility(world, e, x, y) {
  const { x: ex, y: ey } = e.Position;
  if (ex === x && ey === y) return Math.max(1, world.light[y * world.w + x]); // you always see your own tile
  if (Math.hypot(x - ex, y - ey) > sightRadius(e)) return 0;
  if (!lineClear(world, ex, ey, x, y)) return 0;
  return world.light[y * world.w + x];
}

// Every tile's visibility for e, as a Uint8Array over the whole map, but only one screen is
// filled in: for you, the screen you're looking at (world.cam; flip-screen). Walls next to a visible open tile
// are shown at that tile's level, so wall faces don't look patchy.
export function computeView(world, e) {
  const { w, h } = world;
  const view = new Uint8Array(w * h);
  const { ox: x0, oy: y0 } = e.Player ? cameraRect(world) : screenOf(world, e.Position.x, e.Position.y);
  const x1 = x0 + world.screenW, y1 = y0 + world.screenH;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) view[y * w + x] = tileVisibility(world, e, x, y);
  const faces = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!opaqueAt(world, x, y) || view[y * w + x]) continue;
      let best = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1 || opaqueAt(world, nx, ny)) continue;
        best = Math.max(best, view[ny * w + nx]);
      }
      if (best) faces.push([y * w + x, best]);
    }
  }
  for (const [i, v] of faces) view[i] = v;
  return view;
}

// Does `viewer` notice `target`? Its tile must be in sight with light >= minLevelToSpot, and
// within sight radius x noticeByLight[light]. Anything right next to you (8 ways) with no wall
// between is always noticed.
// Sight stops at the screen's edge (like Zelda): you only see your screen, and nothing on
// another screen sees you, except right next to each other across the edge (so a zombie can't
// stand beside you unseen; it's shown as an arrow at the edge). Noise does cross screens.
export function canNotice(world, viewer, target) {
  if (!viewer.Position || !target.Position) return false;
  if (!sameScreen(world, viewer, target)) {
    const near = Math.abs(viewer.Position.x - target.Position.x) <= 1 && Math.abs(viewer.Position.y - target.Position.y) <= 1;
    if (!near) return false;
  }
  const { x: vx, y: vy } = viewer.Position, { x, y } = target.Position;
  const ddx = Math.abs(x - vx), ddy = Math.abs(y - vy);
  if (ddx <= 1 && ddy <= 1) return lineClear(world, vx, vy, x, y);
  const level = world.light[y * world.w + x];
  if (level < CONFIG.vision.minLevelToSpot) return false;
  if (Math.hypot(x - vx, y - vy) > sightRadius(viewer) * CONFIG.vision.noticeByLight[level]) return false;
  return lineClear(world, vx, vy, x, y);
}

// The player's view, kept on the world for rendering, inspect and messages. Everything in
// view is snapshotted into the player's map memory.
export function updatePlayerView(world) {
  const p = world.entities.get(world.playerId);
  world.view = computeView(world, p);
  updateMemory(world, p, world.view);
}
