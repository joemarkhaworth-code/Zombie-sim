// Greybox map: plain coloured squares and letters. Only reads world state.
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testscreen.js';

export function drawMap(ctx, world, L) {
  const c = CONFIG.colours, t = L.tile;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const px = L.mapX + x * t, py = L.mapY + y * t;
      const tile = world.tiles[y * world.w + x];
      if (tile === TILE.WALL) {
        ctx.fillStyle = c.wall; ctx.fillRect(px, py, t, t);
        ctx.fillStyle = c.wallMark; // stone courses
        ctx.fillRect(px, py + Math.floor(t / 2), t, 1);
        ctx.fillRect(px + Math.floor(t / 2), py, 1, Math.floor(t / 2));
      } else {
        ctx.fillStyle = c.floor; ctx.fillRect(px, py, t, t);
        ctx.fillStyle = c.floorMark;
        ctx.fillRect(px + Math.floor(t / 2), py + Math.floor(t / 2), 2, 2);
      }
    }
  }
  // Creatures and things, player last so it's always on top.
  const ents = [...world.entities.values()].filter(e => e.Position && e.Glyph);
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
}

function drawGlyph(ctx, ch, px, py, t, colour) {
  ctx.fillStyle = colour;
  ctx.font = `bold ${Math.floor(t * 0.7)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, px + t / 2, py + t / 2 + 1);
}
