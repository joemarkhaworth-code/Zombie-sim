// Greybox renderer: plain coloured squares and letters. Only reads world state.
// Each tile is drawn according to the player's visibility level for it:
//   3 = full colour, 2 and 1 = slightly darker, 0 = black (not drawn).
// Tiles out of sight but in the player's map memory are drawn from their snapshot
// (terrain + things as last seen, not the live tile), greyed out. Creatures are
// never drawn from memory.
// (The art pass will use dithering for levels 2 and 1 instead of plain darkening.)
import { CONFIG } from '../config.js';
import { TILE } from '../sim/gen/testgrid.js';
import { query } from '../sim/world.js';
import { rememberedAt } from '../sim/systems/memory.js';
import { canSee } from '../sim/systems/vision.js';

const C = CONFIG.colours;
const TILE_COLOUR = { [TILE.FLOOR]: C.floor, [TILE.WALL]: C.wall, [TILE.BUSH]: C.bush };
const MEMORY_COLOUR = { [TILE.FLOOR]: C.memoryFloor, [TILE.WALL]: C.memoryWall, [TILE.BUSH]: C.memoryBush };

// Blood: red spots, more for higher levels (1-3).
const BLOOD_SPOTS = [[0.2, 0.6], [0.65, 0.3], [0.45, 0.75], [0.3, 0.25], [0.75, 0.7], [0.5, 0.45]];
function drawBlood(ctx, px, py, s, level, colour) {
  if (!level) return;
  ctx.fillStyle = colour;
  const d = Math.max(3, Math.floor(s / 6));
  for (const [fx, fy] of BLOOD_SPOTS.slice(0, level * 2)) {
    ctx.fillRect(px + Math.floor(fx * s), py + Math.floor(fy * s), d, d);
  }
}

// Small mark so a bush reads as a bush, not just a green square.
function drawBushMark(ctx, px, py, s) {
  ctx.fillStyle = C.bushMark;
  const d = Math.max(2, Math.floor(s / 8));
  for (const [fx, fy] of [[0.3, 0.35], [0.6, 0.3], [0.45, 0.6], [0.72, 0.65], [0.25, 0.7]]) {
    ctx.fillRect(px + Math.floor(fx * s), py + Math.floor(fy * s), d, d);
  }
}

// layout: { tileSize, offsetX, offsetY, camX, camY, cols, rows }
// camX/camY = world tile shown at the top-left of the view.
// inspect: optional { x, y } tile to outline (long-press).
// debug: { noise } toggles debug overlays.
// aimTargets: optional Set of tile indexes to highlight while aiming (throw/fire).
export function drawWorld(ctx, world, layout, inspect = null, debug = {}, aimTargets = null) {
  const { tileSize: s, offsetX: ox, offsetY: oy, camX, camY, cols, rows } = layout;
  const player = world.entities.get(world.playerId) || world.fallenPlayer; // after death: the last view
  const visible = player ? player.Vision.visible : new Map();
  const levelAt = (x, y) => visible.get(y * world.width + x) || 0;
  const onScreen = (x, y) => {
    const vx = x - camX, vy = y - camY;
    return vx >= 0 && vy >= 0 && vx < cols && vy < rows && x >= 0 && y >= 0 && x < world.width && y < world.height;
  };

  // 1. Tiles: live if in sight, else the remembered snapshot greyed out.
  ctx.font = `bold ${Math.floor(s * 0.75)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let vy = 0; vy < rows; vy++) {
    for (let vx = 0; vx < cols; vx++) {
      const x = camX + vx, y = camY + vy;
      if (!onScreen(x, y)) continue;
      const px = ox + vx * s, py = oy + vy * s;
      if (levelAt(x, y)) {
        const t = world.tiles[y * world.width + x];
        ctx.fillStyle = TILE_COLOUR[t];
        ctx.fillRect(px, py, s - 1, s - 1);
        if (t === TILE.BUSH) drawBushMark(ctx, px, py, s);
        if (world.blood) drawBlood(ctx, px, py, s, world.blood[y * world.width + x], C.blood);
        continue;
      }
      const snap = player ? rememberedAt(world, player, x, y) : null;
      if (!snap) continue;
      ctx.fillStyle = MEMORY_COLOUR[snap.tile];
      ctx.fillRect(px, py, s - 1, s - 1);
      drawBlood(ctx, px, py, s, snap.blood || 0, C.memoryBlood);
      const thing = snap.things[snap.things.length - 1]; // top-most remembered thing
      if (thing) {
        ctx.fillStyle = C.memoryThing;
        ctx.fillText(thing.char, px + s / 2, py + s / 2 + 1);
      }
    }
  }

  // 2. Entities on visible tiles. Creatures only if you've noticed them (a zombie
  // hiding in a bush stays hidden); things like items whenever their tile is in sight.
  // Draw order: things (corpses, items) first, then creatures, then the player on top.
  const layer = (e) => (e.id === world.playerId ? 2 : e.Actor ? 1 : 0);
  const drawables = query(world, 'Position', 'Glyph').sort((a, b) => layer(a) - layer(b));
  for (const e of drawables) {
    const { x, y } = e.Position;
    if (!onScreen(x, y) || !levelAt(x, y)) continue;
    if (e.Actor && player && e.id !== player.id && !canSee(world, player, e)) continue;
    const px = ox + (x - camX) * s, py = oy + (y - camY) * s;
    ctx.fillStyle = e.Glyph.bg;
    ctx.fillRect(px, py, s - 1, s - 1);
    ctx.fillStyle = e.Glyph.fg;
    ctx.fillText(e.Glyph.char, px + s / 2, py + s / 2 + 1);
    if (e.Stealth && e.Stealth.sneaking) { // sneaking: drawn dimmer
      ctx.fillStyle = C.sneakDim;
      ctx.fillRect(px, py, s - 1, s - 1);
    }
    if (world.tiles[y * world.width + x] === TILE.BUSH) drawBushMark(ctx, px, py, s); // in cover: leaves over it
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

  // 4. Debug: noise heatmap (the truth, including tiles you can't see).
  if (debug.noise && world.noise) {
    const maxR = Math.max(...CONFIG.noise.radiusByLevel);
    ctx.font = `bold ${Math.floor(s * 0.35)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let vy = 0; vy < rows; vy++) {
      for (let vx = 0; vx < cols; vx++) {
        const x = camX + vx, y = camY + vy;
        if (!onScreen(x, y)) continue;
        const n = world.noise[y * world.width + x];
        if (!n) continue;
        const px = ox + vx * s, py = oy + vy * s;
        ctx.fillStyle = `rgba(${C.debugNoise},${(0.2 + 0.6 * n / maxR).toFixed(2)})`;
        ctx.fillRect(px, py, s - 1, s - 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(n), px + 2, py + 2);
      }
    }
  }

  // 5. Aiming: highlight valid target tiles (stronger where there's a creature).
  if (aimTargets) {
    const creatureTiles = new Set(query(world, 'Actor', 'Position').map((e) => e.Position.y * world.width + e.Position.x));
    for (const idx of aimTargets) {
      const x = idx % world.width, y = Math.floor(idx / world.width);
      if (!onScreen(x, y)) continue;
      ctx.fillStyle = creatureTiles.has(idx) ? C.aimCreature : C.aimTile;
      ctx.fillRect(ox + (x - camX) * s, oy + (y - camY) * s, s - 1, s - 1);
    }
  }

  // 6. Inspect outline
  if (inspect && onScreen(inspect.x, inspect.y)) {
    ctx.strokeStyle = C.inspect;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + (inspect.x - camX) * s + 1, oy + (inspect.y - camY) * s + 1, s - 3, s - 3);
  }
}
