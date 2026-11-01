// Greybox renderer: plain coloured squares and letters. Only reads world state.
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testgrid.js';
import { query } from '../sim/world.js';

const C = CONFIG.colours;
const TILE_COLOUR = { [TILE.FLOOR]: C.floor, [TILE.WALL]: C.wall };

// layout: { tileSize, offsetX, offsetY, camX, camY, cols, rows }
// camX/camY = world tile shown at the top-left of the view.
export function drawWorld(ctx, world, layout) {
  const { tileSize: s, offsetX: ox, offsetY: oy, camX, camY, cols, rows } = layout;
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const x = camX + vx, y = camY + vy;
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      ctx.fillStyle = TILE_COLOUR[world.tiles[y * world.width + x]];
      ctx.fillRect(ox + vx * s, oy + vy * s, s - 1, s - 1);
    }
  }
  ctx.font = `bold ${Math.floor(s * 0.75)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of query(world, 'Position', 'Glyph')) {
    const vx = e.Position.x - camX, vy = e.Position.y - camY;
    if (vx < 0 || vy < 0 || vx >= cols || vy >= rows) continue;
    const px = ox + vx * s, py = oy + vy * s;
    ctx.fillStyle = e.Glyph.bg;
    ctx.fillRect(px, py, s - 1, s - 1);
    ctx.fillStyle = e.Glyph.fg;
    ctx.fillText(e.Glyph.char, px + s / 2, py + s / 2 + 1);
  }
}
