// Greybox renderer: plain coloured squares and letters. Only reads world state.
// Each tile is drawn according to the player's visibility level for it:
//   3 = full colour, 2 and 1 = slightly darker, 0 = black (not drawn).
// (The art pass will use dithering for levels 2 and 1 instead of plain darkening.)
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testgrid.js';
import { query } from '../sim/world.js';

const C = CONFIG.colours;
const TILE_COLOUR = { [TILE.FLOOR]: C.floor, [TILE.WALL]: C.wall };

// layout: { tileSize, offsetX, offsetY, camX, camY, cols, rows }
// camX/camY = world tile shown at the top-left of the view.
export function drawWorld(ctx, world, layout) {
  const { tileSize: s, offsetX: ox, offsetY: oy, camX, camY, cols, rows } = layout;
  const player = world.entities.get(world.playerId);
  const visible = player ? player.Vision.visible : new Map();
  const levelAt = (x, y) => visible.get(y * world.width + x) || 0;
  const onScreen = (x, y) => {
    const vx = x - camX, vy = y - camY;
    return vx >= 0 && vy >= 0 && vx < cols && vy < rows && x >= 0 && y >= 0 && x < world.width && y < world.height;
  };

  // 1. Tiles
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const x = camX + vx, y = camY + vy;
      if (!onScreen(x, y) || !levelAt(x, y)) continue;
      ctx.fillStyle = TILE_COLOUR[world.tiles[y * world.width + x]];
      ctx.fillRect(ox + vx * s, oy + vy * s, s - 1, s - 1);
    }
  }

  // 2. Entities on visible tiles
  ctx.font = `bold ${Math.floor(s * 0.75)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of query(world, 'Position', 'Glyph')) {
    const { x, y } = e.Position;
    if (!onScreen(x, y) || !levelAt(x, y)) continue;
    const px = ox + (x - camX) * s, py = oy + (y - camY) * s;
    ctx.fillStyle = e.Glyph.bg;
    ctx.fillRect(px, py, s - 1, s - 1);
    ctx.fillStyle = e.Glyph.fg;
    ctx.fillText(e.Glyph.char, px + s / 2, py + s / 2 + 1);
  }

  // 3. Darken dimly seen tiles (levels 1-2), entities included
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const x = camX + vx, y = camY + vy;
      if (!onScreen(x, y)) continue;
      const lv = levelAt(x, y);
      const a = CONFIG.render.dimAlpha[lv];
      if (!lv || !a) continue;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(ox + vx * s, oy + vy * s, s - 1, s - 1);
    }
  }
}
