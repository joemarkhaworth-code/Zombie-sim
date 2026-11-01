// Greybox renderer: plain coloured squares and letters. Only reads world state.
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testgrid.js';
import { query } from '../sim/world.js';

const C = CONFIG.colours;
const TILE_COLOUR = { [TILE.FLOOR]: C.floor, [TILE.WALL]: C.wall };

export function drawWorld(ctx, world, layout) {
  const { tileSize: s, offsetX: ox, offsetY: oy } = layout;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      ctx.fillStyle = TILE_COLOUR[world.tiles[y * world.width + x]];
      ctx.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
    }
  }
  ctx.font = `bold ${Math.floor(s * 0.8)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of query(world, 'Position', 'Glyph')) {
    const px = ox + e.Position.x * s;
    const py = oy + e.Position.y * s;
    ctx.fillStyle = e.Glyph.bg;
    ctx.fillRect(px, py, s - 1, s - 1);
    ctx.fillStyle = e.Glyph.fg;
    ctx.fillText(e.Glyph.char, px + s / 2, py + s / 2 + 1);
  }
}
