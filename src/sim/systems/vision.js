// Vision = line of sight + light. Two separate things:
//  1. Line of sight: a straight line between tile centres that no opaque tile
//     (wall, later hedges, trees...) blocks. No distance limit of its own.
//     - A line squeezing exactly between two diagonal walls is blocked; grazing
//       one wall's corner is allowed.
//     - Symmetric: if A has line of sight to B, B has it to A.
//     - Wall faces next to visible floor nearer the viewer are shown, so walls
//       don't look patchy.
//  2. Light: how far anyone can see in the open (CONFIG.light.range, scaled by the
//     viewer's eyesight 0-3) and how lit each tile is (world.light, 0-3).
// A seen tile's visibility level = its light level (1-3); 0 = unseen (not stored).
// e.Vision.visible is a Map of tile index -> level. Creatures are only noticed at
// CONFIG.vision.minLevelToSpot or above. Day/night, weather and stealth will lower
// light range and light levels later.
// A viewer's visible set only changes when it moves (or, later, when tiles or light
// change), so it's recomputed on entity_moved.
import { CONFIG } from '../../config.js';
import { inBounds, tileAt, query } from '../world.js';
import { TILE_INFO } from '../gen/testgrid.js';
import { isSneaking, inCover } from './stealth.js';

export function installVision(world) {
  world.sightings = new Set(); // actor ids the player could see at the end of last turn
  world.events.on('entity_moved', (d) => {
    const e = world.entities.get(d.id);
    if (e && e.Vision) updateVision(world, e);
  });
}

const opaqueAt = (world, x, y) => !inBounds(world, x, y) || TILE_INFO[tileAt(world, x, y)].opaque;

// Walk the grid from (x0,y0) to (x1,y1) through every tile the centre line touches.
// True if nothing opaque lies strictly between them.
export function lineClear(world, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let x = x0, y = y0, ix = 0, iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      // exactly through a corner: blocked only if both side tiles are opaque
      if (opaqueAt(world, x + sx, y) && opaqueAt(world, x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if ((x !== x1 || y !== y1) && opaqueAt(world, x, y)) return false;
  }
  return true;
}

// How far this viewer can see in the open: the light range scaled by eyesight.
export function sightRadius(e) {
  return Math.floor(CONFIG.light.range * CONFIG.vision.eyesightFactor[e.Vision.eyesight]);
}

export function updateVision(world, e) {
  const r = sightRadius(e);
  const { x: ox, y: oy } = e.Position;
  const d2 = (x, y) => (x - ox) ** 2 + (y - oy) ** 2;
  const visible = new Map();
  const set = (x, y) => {
    const lv = world.light[y * world.width + x];
    if (lv > 0) visible.set(y * world.width + x, lv);
  };
  const walls = [];
  for (let y = oy - r; y <= oy + r; y++) {
    for (let x = ox - r; x <= ox + r; x++) {
      if (!inBounds(world, x, y) || d2(x, y) > r * r + r) continue; // round-ish circle
      if (lineClear(world, ox, oy, x, y)) set(x, y);
      else if (opaqueAt(world, x, y)) walls.push([x, y]);
    }
  }
  // Reveal wall faces next to visible floor that's closer to the viewer.
  for (const [x, y] of walls) {
    for (const [ax, ay] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!inBounds(world, ax, ay) || opaqueAt(world, ax, ay)) continue;
      if (visible.has(ay * world.width + ax) && d2(ax, ay) < d2(x, y)) { set(x, y); break; }
    }
  }
  // You always know where you are, even in pitch darkness.
  const own = oy * world.width + ox;
  visible.set(own, Math.max(visible.get(own) ?? 0, 1));
  e.Vision.visible = visible;
  world.events.emit('vision_updated', { id: e.id });
}

export function refreshAllVision(world) {
  for (const e of query(world, 'Vision', 'Position')) updateVision(world, e);
}

// Visibility level (0-3) of a tile for this viewer.
export function visibilityAt(world, viewer, x, y) {
  return (viewer.Vision && viewer.Vision.visible.get(y * world.width + x)) || 0;
}

// Can the viewer notice the target? Line of sight + light + distance + stealth:
//  - the target's tile must be in the viewer's sight with light >= minLevelToSpot;
//  - adjacent targets are always noticed;
//  - a target in cover (bush) is only noticed from an adjacent tile;
//  - otherwise it must be within sightRadius x noticeByLight[light] x (sneak factor).
export function canSee(world, viewer, target) {
  const { x, y } = target.Position;
  const lv = visibilityAt(world, viewer, x, y);
  if (lv < CONFIG.vision.minLevelToSpot) return false;
  const dx = x - viewer.Position.x, dy = y - viewer.Position.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) return true;
  if (inCover(world, x, y)) return false;
  let range = sightRadius(viewer) * CONFIG.vision.noticeByLight[lv];
  if (isSneaking(target)) range *= CONFIG.stealth.sneakNoticeFactor;
  return dx * dx + dy * dy <= range * range;
}

// End of turn: emit entity_seen for actors that newly came into the player's view.
export function updateSightings(world) {
  const player = world.entities.get(world.playerId);
  if (!player) return;
  const now = new Set();
  for (const e of query(world, 'Actor', 'Position')) {
    if (e.id !== player.id && canSee(world, player, e)) now.add(e.id);
  }
  for (const id of now) {
    if (!world.sightings.has(id)) world.events.emit('entity_seen', { viewerId: player.id, id });
  }
  world.sightings = now;
}
