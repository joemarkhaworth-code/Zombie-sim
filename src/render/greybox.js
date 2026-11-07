// Greybox map: plain coloured squares and letters. Only reads world state.
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testscreen.js';
import { canNotice } from '../sim/systems/vision.js';

// inspect: { x, y } of a long-pressed tile to outline, or null.
export function drawMap(ctx, world, L, inspect) {
  const c = CONFIG.colours, t = L.tile, m = c.memory;
  const p = world.entities.get(world.playerId);
  const live = { floor: c.floor, floorMark: c.floorMark, wall: c.wall, wallMark: c.wallMark };
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const px = L.mapX + x * t, py = L.mapY + y * t;
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
  const ents = [...world.entities.values()].filter(e => e.Position && e.Glyph
    && (e === p || canNotice(world, p, e)));
  ents.sort((a, b) => (a.Player ? 1 : 0) - (b.Player ? 1 : 0));
  for (const e of ents) {
    const px = L.mapX + e.Position.x * t, py = L.mapY + e.Position.y * t;
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
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const vis = world.view[y * world.w + x];
      if (!vis) continue;
      const a = alpha[vis];
      if (a <= 0 || a >= 1) continue;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(L.mapX + x * t, L.mapY + y * t, t, t);
    }
  }
  // Badges over zombies you can see: ! it's after you, ? it's lost you and is looking.
  for (const e of ents) {
    const b = e.Brain;
    if (!b) continue;
    const mark = b.tracking ? '!' : (b.goal || b.search) ? '?' : null;
    if (mark) drawBadge(ctx, mark, L.mapX + e.Position.x * t, L.mapY + e.Position.y * t, t,
      mark === '!' ? c.alert : c.puzzled);
  }
  if (inspect) drawOutline(ctx, L, inspect.x, inspect.y);
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
