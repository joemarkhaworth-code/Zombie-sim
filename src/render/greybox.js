// Greybox map: plain coloured squares and letters. Only reads world state.
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testscreen.js';
import { canNotice } from '../sim/systems/vision.js';
import { cameraRect } from '../sim/world.js';

// The camera: the screen you're looking at (flip-screen: it jumps to the next screen when you
// step onto the last tile of this one). It's sim state (world.cam): sight depends on it.
export function camera(world) {
  return cameraRect(world);
}

// inspect: { x, y } of a long-pressed tile to outline, or null. debug: draw the noise heatmap.
// aim: tiles you can throw to (while aiming), tinted yellow, orange with a creature on them.
export function drawMap(ctx, world, L, inspect, debug, aim) {
  const c = CONFIG.colours, t = L.tile, m = c.memory;
  const p = world.entities.get(world.playerId);
  const live = { floor: c.floor, floorMark: c.floorMark, wall: c.wall, wallMark: c.wallMark };
  const { ox, oy } = camera(world);
  const sx = x => L.mapX + (x - ox) * t, sy = y => L.mapY + (y - oy) * t; // world tile -> screen pixel
  for (let y = oy; y < oy + world.screenH; y++) {
    for (let x = ox; x < ox + world.screenW; x++) {
      const px = sx(x), py = sy(y);
      const i = y * world.w + x;
      if (world.view[i]) { drawTile(ctx, world.tiles[i], px, py, t, live); continue; }
      // Out of sight: draw what you remember, greyed; never seen stays black.
      const snap = p.Memory && p.Memory.tiles[i];
      if (!snap) continue;
      drawTile(ctx, snap.t, px, py, t, m);
      for (const th of snap.things) drawGlyph(ctx, th.ch, px, py, t, m.thing);
    }
  }
  // Creatures and things you notice, player last so it's always on top.
  const onScreen = e => e.Position.x >= ox && e.Position.x < ox + world.screenW && e.Position.y >= oy && e.Position.y < oy + world.screenH;
  const ents = [...world.entities.values()].filter(e => e.Position && e.Glyph && onScreen(e)
    && (e === p || (e.Actor ? canNotice(world, p, e) : world.view[e.Position.y * world.w + e.Position.x])));
  // Draw order: things (corpses, items) first, then creatures, then you on top.
  const layer = e => (e.Player ? 2 : e.Actor ? 1 : 0);
  ents.sort((a, b) => layer(a) - layer(b));
  for (const e of ents) {
    const px = sx(e.Position.x), py = sy(e.Position.y);
    if (e.Player) {
      ctx.fillStyle = e.Glyph.colour;
      ctx.fillRect(px + 2, py + 2, t - 4, t - 4);
      drawGlyph(ctx, e.Glyph.ch, px, py, t, c.playerText);
    } else {
      drawGlyph(ctx, e.Glyph.ch, px, py, t, e.Glyph.colour);
    }
  }
  // Dim tiles in view by visibility: 3 full colour, 2 and 1 darker.
  const alpha = CONFIG.render.dimAlpha;
  for (let y = oy; y < oy + world.screenH; y++) {
    for (let x = ox; x < ox + world.screenW; x++) {
      const vis = world.view[y * world.w + x];
      if (!vis) continue;
      const a = alpha[vis];
      if (a <= 0 || a >= 1) continue;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(sx(x), sy(y), t, t);
    }
  }
  // Badges over zombies you can see: ! it's after you, ? it's lost you and is looking.
  for (const e of ents) {
    const b = e.Brain;
    if (!b) continue;
    const mark = b.tracking ? '!' : (b.goal || b.search) ? '?' : null;
    if (mark) drawBadge(ctx, mark, sx(e.Position.x), sy(e.Position.y), t,
      mark === '!' ? c.alert : c.puzzled);
  }
  if (aim) {
    for (const { x, y } of aim) {
      const c2 = ents.some(e => e.Actor && !e.Player && e.Position.x === x && e.Position.y === y);
      ctx.fillStyle = c2 ? CONFIG.colours.aimCreature : CONFIG.colours.aimTile;
      ctx.fillRect(sx(x), sy(y), t, t);
    }
  }
  // A creature right next to you across the screen's edge: a red arrow at the edge, pointing at it.
  for (const e of world.entities.values()) {
    if (!e.Actor || e === p || !e.Position || onScreen(e) || !canNotice(world, p, e)) continue;
    const ex = Math.min(Math.max(e.Position.x, ox), ox + world.screenW - 1);
    const ey = Math.min(Math.max(e.Position.y, oy), oy + world.screenH - 1);
    drawEdgeArrow(ctx, sx(ex), sy(ey), t, Math.sign(e.Position.x - ex), Math.sign(e.Position.y - ey), c.edgeArrow);
  }
  if (debug) drawNoise(ctx, world, L, ox, oy);
  if (inspect) drawOutline(ctx, L, inspect.x - ox, inspect.y - oy);
}

// Debug: noise since your last action, everywhere (out of sight too), with strength numbers.
function drawNoise(ctx, world, L, ox, oy) {
  const t = L.tile, top = CONFIG.noise.radiusByLevel[3];
  ctx.font = `bold ${Math.floor(t * 0.35)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let y = oy; y < oy + world.screenH; y++) {
    for (let x = ox; x < ox + world.screenW; x++) {
      const s = world.noise[y * world.w + x];
      if (s <= 0) continue;
      const px = L.mapX + (x - ox) * t, py = L.mapY + (y - oy) * t;
      ctx.fillStyle = `rgba(${CONFIG.colours.noise},${0.15 + 0.5 * s / top})`;
      ctx.fillRect(px, py, t, t);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(s), px + t / 2, py + t / 2);
    }
  }
}

// A small mark at the top right of a tile, outlined in black so it reads on any colour.
function drawBadge(ctx, mark, px, py, t, colour) {
  const size = Math.floor(t * 0.45);
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const x = px + t - size * 0.35, y = py + size * 0.45;
  ctx.lineWidth = 3; ctx.strokeStyle = '#000000';
  ctx.strokeText(mark, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(mark, x, y);
}

// A small triangle on the side of a tile, pointing off the screen (dx, dy).
function drawEdgeArrow(ctx, px, py, t, dx, dy, colour) {
  const cx = px + t / 2 + dx * t * 0.36, cy = py + t / 2 + dy * t * 0.36, s = t * 0.18;
  ctx.fillStyle = colour;
  ctx.beginPath();
  if (dx) { ctx.moveTo(cx + dx * s, cy); ctx.lineTo(cx - dx * s, cy - s); ctx.lineTo(cx - dx * s, cy + s); }
  else { ctx.moveTo(cx, cy + dy * s); ctx.lineTo(cx - s, cy - dy * s); ctx.lineTo(cx + s, cy - dy * s); }
  ctx.closePath(); ctx.fill();
}

// One terrain tile in a palette (live colours or remembered greys).
function drawTile(ctx, tile, px, py, t, pal) {
  if (tile === TILE.WALL) {
    ctx.fillStyle = pal.wall; ctx.fillRect(px, py, t, t);
    ctx.fillStyle = pal.wallMark; // stone courses
    ctx.fillRect(px, py + Math.floor(t / 2), t, 1);
    ctx.fillRect(px + Math.floor(t / 2), py, 1, Math.floor(t / 2));
  } else {
    ctx.fillStyle = pal.floor; ctx.fillRect(px, py, t, t);
    ctx.fillStyle = pal.floorMark;
    ctx.fillRect(px + Math.floor(t / 2), py + Math.floor(t / 2), 2, 2);
  }
}

function drawGlyph(ctx, ch, px, py, t, colour) {
  ctx.fillStyle = colour;
  ctx.font = `bold ${Math.floor(t * 0.7)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, px + t / 2, py + t / 2 + 1);
}

function drawOutline(ctx, L, x, y) {
  ctx.strokeStyle = CONFIG.colours.inspectOutline; ctx.lineWidth = 2;
  ctx.strokeRect(L.mapX + x * L.tile + 1, L.mapY + y * L.tile + 1, L.tile - 2, L.tile - 2);
}
