// Greybox renderer: plain coloured squares and letters. Only reads world state.
// Each tile is drawn according to the player's visibility level for it:
//   3 = full colour, 2 and 1 = slightly darker, 0 = black (not drawn).
// Tiles out of sight but in the player's map memory are drawn from their snapshot
// (terrain + things as last seen, not the live tile), greyed out. Creatures are
// never drawn from memory.
// (The art pass will use dithering for levels 2 and 1 instead of plain darkening.)
import { CONFIG } from '../config.js';
import { TILE, TILE_INFO } from '../sim/gen/testgrid.js';
import { query } from '../sim/world.js';
import { rememberedAt } from '../sim/systems/memory.js';
import { canSee } from '../sim/systems/vision.js';
import { trackAt, snowLevel, holdsSnow } from '../sim/systems/tracks.js';
import { scentLevel } from '../sim/systems/scent.js';
import { indoorAt } from '../sim/systems/weather.js';
import { iceLevel } from '../sim/systems/water.js';

const C = CONFIG.colours;
export const TILE_COLOUR = {
  [TILE.FLOOR]: C.floor, [TILE.WALL]: C.wall, [TILE.BUSH]: C.bush,
  [TILE.GRASS]: C.grass, [TILE.LANE]: C.lane, [TILE.STREAM]: C.stream, [TILE.BRIDGE]: C.bridge,
  [TILE.DRYSTONE]: C.drystone, [TILE.HEDGE]: C.hedge, [TILE.TREE]: C.tree, [TILE.POND]: C.pond,
  [TILE.FELL]: C.fell, [TILE.BRACKEN]: C.bracken, [TILE.ROCK]: C.rock, [TILE.SCREE]: C.scree,
  [TILE.LAKE]: C.lake, [TILE.SHORE]: C.shore,
  [TILE.ROAD]: C.road, [TILE.PAVEMENT]: C.pavement, [TILE.GINNEL]: C.ginnel, [TILE.YARD]: C.yard,
  [TILE.GATE]: C.gate, [TILE.PATH]: C.path, [TILE.PLOT]: C.plot, [TILE.GRAVE]: C.grass,
  [TILE.WALL_STONE]: C.wallStone, [TILE.WALL_BRICK]: C.wallBrick, [TILE.WALL_WOOD]: C.wallWood,
  [TILE.WALL_METAL]: C.wallMetal, [TILE.WALL_GLASS]: C.wallGlass,
  [TILE.PHONEBOX]: C.phoneBox, [TILE.ALLOTMENT]: C.allotment, [TILE.VOID]: C.background,
  [TILE.ASH]: C.ash, [TILE.CHARRED]: C.charred, [TILE.RUBBLE]: C.rubble,
  [TILE.TORRENT]: C.torrent, [TILE.FLOODWATER]: C.floodwater, [TILE.FLOOD_IN]: C.floodwater, [TILE.ICE]: C.ice,
  [TILE.FALLEN_TREE]: C.fallenTree, [TILE.STUMP]: C.stump, [TILE.SILT]: C.silt, [TILE.SILT_FLOOR]: C.silt,
  [TILE.FLOOR_WOOD]: C.floorWood, [TILE.FLOOR_FLAGS]: C.floorFlags, [TILE.FLOOR_CONCRETE]: C.floorConcrete, [TILE.FLOOR_EARTH]: C.floorEarth,
};
// Remembered tiles: a dark grey version of each tile's colour (keeps brightness differences).
const greyOf = (hex) => {
  const n = parseInt(hex.slice(1), 16), l = Math.round((0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) * 0.45);
  return `rgb(${l},${l},${l})`;
};
const MEMORY_COLOUR = Object.fromEntries(Object.entries(TILE_COLOUR).map(([k, v]) => [k, greyOf(v)]));
MEMORY_COLOUR[TILE.FLOOR] = C.memoryFloor; MEMORY_COLOUR[TILE.WALL] = C.memoryWall; MEMORY_COLOUR[TILE.BUSH] = C.memoryBush;

// Road centre line: one faded line down the middle of the tarmac, however wide the road.
// line: 1 = on this tile's east edge (even width), 0.5 = through its middle (odd width), 0 = none.
function roadLine(world, x, y) {
  const road = (xx) => xx >= 0 && xx < world.width && world.tiles[y * world.width + xx] === TILE.ROAD;
  let l = 0, r = 0;
  while (road(x - l - 1)) l++;
  while (road(x + r + 1)) r++;
  const n = l + r + 1;
  return { line: n < 2 ? 0 : n % 2 === 0 ? (l === n / 2 - 1 ? 1 : 0) : (l === (n - 1) / 2 ? 0.5 : 0) };
}
const markInfo = (world, t, x, y) => (t === TILE.BRIDGE ? waterSides(world, x, y) : t === TILE.ROAD ? roadLine(world, x, y) : t === TILE.ICE ? { thin: iceLevel(world) <= 1 } : null);

// Which sides of (x, y) touch water - a bridge draws its parapets there.
const WATER = new Set([TILE.STREAM, TILE.LAKE, TILE.POND, TILE.TORRENT, TILE.FLOODWATER, TILE.FLOOD_IN, TILE.ICE]);
function waterSides(world, x, y) {
  const w = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < world.width && ny < world.height && WATER.has(world.tiles[ny * world.width + nx]); };
  return { n: w(0, -1), s: w(0, 1), e: w(1, 0), w: w(-1, 0) };
}

// Marks so tiles read as what they are (greybox: simple shapes, no art yet).
// water: { n, s, e, w } - which sides of a bridge face water (parapets go there).
function drawTileMark(ctx, t, px, py, s, memory, water = null) {
  const dim = (c) => (memory ? 'rgba(0,0,0,0.35)' : c);
  if (t === TILE.BUSH) { if (!memory) drawBushMark(ctx, px, py, s); return; }
  if (t === TILE.HEDGE) { ctx.fillStyle = dim(C.hedgeMark); for (const [fx, fy] of [[0.15, 0.2], [0.55, 0.15], [0.35, 0.5], [0.75, 0.55], [0.2, 0.75], [0.6, 0.8]]) ctx.fillRect(px + fx * s, py + fy * s, s / 6, s / 6); return; }
  if (t === TILE.TREE) {
    ctx.fillStyle = dim(C.treeCrown);
    ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (t === TILE.BRACKEN) { ctx.fillStyle = dim(C.brackenMark); for (const [fx, fy] of [[0.2, 0.25], [0.6, 0.2], [0.4, 0.55], [0.75, 0.6], [0.15, 0.7]]) { ctx.fillRect(px + fx * s, py + fy * s, s / 12, s / 4); ctx.fillRect(px + fx * s - s / 12, py + fy * s + s / 12, s / 4, s / 14); } return; }
  if (t === TILE.ROCK) { ctx.fillStyle = dim(C.rockMark); ctx.beginPath(); ctx.moveTo(px + s * 0.15, py + s * 0.8); ctx.lineTo(px + s * 0.45, py + s * 0.2); ctx.lineTo(px + s * 0.85, py + s * 0.8); ctx.fill(); return; }
  if (t === TILE.SCREE) { ctx.fillStyle = dim(C.screeMark); for (const [fx, fy] of [[0.15, 0.2], [0.5, 0.15], [0.8, 0.3], [0.3, 0.5], [0.65, 0.6], [0.2, 0.8], [0.55, 0.85]]) ctx.fillRect(px + fx * s, py + fy * s, s / 9, s / 11); return; }
  if (t === TILE.LAKE) { ctx.fillStyle = dim(C.streamMark); ctx.fillRect(px + s * 0.2, py + s * 0.4, s * 0.25, s / 14); ctx.fillRect(px + s * 0.6, py + s * 0.7, s * 0.25, s / 14); return; }
  if (t === TILE.TORRENT) { ctx.fillStyle = dim(C.torrentMark); for (const [fx, fy, w] of [[0.1, 0.2, 0.35], [0.5, 0.15, 0.3], [0.25, 0.5, 0.4], [0.6, 0.55, 0.3], [0.15, 0.8, 0.3], [0.55, 0.85, 0.35]]) ctx.fillRect(px + fx * s, py + fy * s, w * s, s / 10); return; } // white water
  if (t === TILE.FALLEN_TREE) { // a trunk lying across, with a tangle of branches
    ctx.fillStyle = dim(C.fallenLeaf); for (const [fx, fy] of [[0.15, 0.15], [0.6, 0.1], [0.1, 0.6], [0.7, 0.65], [0.35, 0.75]]) ctx.fillRect(px + fx * s, py + fy * s, s / 4, s / 5);
    ctx.fillStyle = dim(C.fallenTrunk); ctx.fillRect(px, py + s * 0.4, s - 1, s * 0.22); return;
  }
  if (t === TILE.STUMP) { ctx.fillStyle = dim(C.stumpMark); ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.18, 0, Math.PI * 2); ctx.fill(); return; }
  if (t === TILE.SILT || t === TILE.SILT_FLOOR) { ctx.fillStyle = dim(C.siltMark); for (const [fx, fy, w] of [[0.1, 0.25, 0.35], [0.5, 0.5, 0.4], [0.2, 0.75, 0.3]]) ctx.fillRect(px + fx * s, py + fy * s, w * s, s / 10); return; }
  if (t === TILE.FLOODWATER || t === TILE.FLOOD_IN) { ctx.fillStyle = dim(C.floodMark); ctx.fillRect(px + s * 0.15, py + s * 0.35, s * 0.3, s / 12); ctx.fillRect(px + s * 0.55, py + s * 0.65, s * 0.3, s / 12); return; }
  if (t === TILE.ICE) { // pale ice with a crack; thin ice shows the dark water through it
    if (water && water.thin && !memory) { ctx.fillStyle = C.iceThin; ctx.fillRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6); }
    ctx.fillStyle = dim(C.iceMark); const h = Math.max(1, Math.floor(s / 16));
    ctx.fillRect(px + s * 0.15, py + s * 0.3, s * 0.35, h); ctx.fillRect(px + s * 0.45, py + s * 0.3, h, s * 0.4); ctx.fillRect(px + s * 0.45, py + s * 0.7, s * 0.35, h);
    return;
  }
  if (t === TILE.STREAM) { ctx.fillStyle = dim(C.streamMark); ctx.fillRect(px + s * 0.15, py + s * 0.35, s * 0.3, s / 12); ctx.fillRect(px + s * 0.55, py + s * 0.65, s * 0.3, s / 12); return; }
  // Building walls: neat courses (stone), offset bricks, vertical boards, ridges, a glazing bar.
  if (t === TILE.WALL_STONE || t === TILE.WALL_BRICK) {
    ctx.fillStyle = dim(t === TILE.WALL_STONE ? C.wallStoneMark : C.wallBrickMark); const h = Math.max(1, Math.floor(s / 16));
    const rows = t === TILE.WALL_STONE ? 2 : 4;
    for (let r = 1; r < rows; r++) ctx.fillRect(px, py + (s * r) / rows, s - 1, h);
    for (let r = 0; r < rows; r++) ctx.fillRect(px + (r % 2 ? s * 0.25 : s * 0.75), py + (s * r) / rows, h, s / rows);
    return;
  }
  if (t === TILE.WALL_WOOD || t === TILE.WALL_METAL) {
    ctx.fillStyle = dim(t === TILE.WALL_WOOD ? C.wallWoodMark : C.wallMetalMark); const h = Math.max(1, Math.floor(s / 14));
    for (const f of t === TILE.WALL_WOOD ? [0.33, 0.66] : [0.2, 0.4, 0.6, 0.8]) ctx.fillRect(px + f * s, py, h, s - 1);
    return;
  }
  if (t === TILE.WALL_GLASS) { ctx.fillStyle = dim(C.wallGlassMark); const h = Math.max(2, Math.floor(s / 10)); ctx.fillRect(px + s / 2 - h / 2, py, h, s - 1); ctx.fillRect(px, py + s / 2 - h / 2, s - 1, h); return; }
  if (t === TILE.FLOOR_WOOD) { ctx.fillStyle = dim(C.floorWoodMark); const h = Math.max(1, Math.floor(s / 16)); for (const f of [0.33, 0.66]) ctx.fillRect(px, py + f * s, s - 1, h); return; }
  if (t === TILE.FLOOR_FLAGS) { ctx.fillStyle = dim(C.floorFlagsMark); const h = Math.max(1, Math.floor(s / 16)); ctx.fillRect(px, py + s / 2, s - 1, h); ctx.fillRect(px + s / 2, py, h, s - 1); return; }
  if (t === TILE.FLOOR_EARTH) { ctx.fillStyle = dim(C.floorEarthMark); const d = Math.max(2, Math.floor(s / 12)); for (const [fx, fy] of [[0.25, 0.3], [0.65, 0.6], [0.4, 0.8]]) ctx.fillRect(px + fx * s, py + fy * s, d, d); return; }
  if (t === TILE.ASH || t === TILE.CHARRED) { ctx.fillStyle = dim(C.ashMark); const d = Math.max(2, Math.floor(s / 12)); for (const [fx, fy] of [[0.2, 0.3], [0.55, 0.2], [0.7, 0.6], [0.35, 0.7]]) ctx.fillRect(px + fx * s, py + fy * s, d, d); return; }
  if (t === TILE.RUBBLE) { ctx.fillStyle = dim(C.rubbleMark); for (const [fx, fy, w] of [[0.15, 0.2, 0.3], [0.55, 0.15, 0.25], [0.3, 0.55, 0.35], [0.7, 0.65, 0.2]]) ctx.fillRect(px + fx * s, py + fy * s, w * s, s * 0.18); return; }
  if (t === TILE.PHONEBOX) { // red box, glazed panes in a grid
    ctx.fillStyle = dim(C.phoneBoxMark); const g = s * 0.14;
    for (const fx of [0.22, 0.56]) for (const fy of [0.22, 0.56]) ctx.fillRect(px + fx * s, py + fy * s, g * 1.6, g * 1.6);
    return;
  }
  if (t === TILE.ALLOTMENT) { ctx.fillStyle = dim(C.allotmentMark); const h = Math.max(2, Math.floor(s / 10)); for (const f of [0.2, 0.5, 0.8]) ctx.fillRect(px, py + f * s - h / 2, s - 1, h); return; }
  if (t === TILE.ROAD) { // faded centre line between the two lanes of tarmac
    if (water && water.line) { ctx.fillStyle = dim(C.roadMark); ctx.fillRect(water.line === 1 ? px + s - 2 : px + s / 2 - 1, py + s * 0.2, 2, s * 0.4); }
    return;
  }
  if (t === TILE.PAVEMENT || t === TILE.GINNEL) { // flagstones: big square slabs
    ctx.fillStyle = dim(C.pavementMark); const h = Math.max(1, Math.floor(s / 16));
    ctx.fillRect(px, py + s * 0.5, s - 1, h); ctx.fillRect(px + s * 0.5, py, h, s - 1); return;
  }
  if (t === TILE.YARD) { ctx.fillStyle = dim(C.yardMark); const d = Math.max(2, Math.floor(s / 10)); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.fillRect(px + (0.17 + i * 0.33) * s - d / 2, py + (0.17 + j * 0.33) * s - d / 2, d, d); return; }
  if (t === TILE.LANE) { ctx.fillStyle = dim(C.laneMark); const d = Math.max(2, Math.floor(s / 12)); for (const [fx, fy] of [[0.25, 0.3], [0.7, 0.55], [0.4, 0.8]]) ctx.fillRect(px + fx * s, py + fy * s, d, d); return; }
  if (t === TILE.PATH) { ctx.fillStyle = dim(C.pathMark); const d = Math.max(2, Math.floor(s / 12)); for (const [fx, fy] of [[0.3, 0.25], [0.6, 0.5], [0.35, 0.75]]) ctx.fillRect(px + fx * s, py + fy * s, d, d); return; }
  if (t === TILE.PLOT) { ctx.fillStyle = dim(C.plotMark); const d = Math.max(2, Math.floor(s / 10)); ctx.fillRect(px + s / 2 - d / 2, py + s / 2 - d / 2, d, d); return; }
  if (t === TILE.GATE) { // a five-bar gate: wooden bars and a brace
    ctx.fillStyle = dim(C.gateMark); const h = Math.max(2, Math.floor(s / 10));
    for (const fy of [0.25, 0.5, 0.75]) ctx.fillRect(px + s * 0.1, py + fy * s - h / 2, s * 0.8, h);
    ctx.fillRect(px + s * 0.1, py + s * 0.2, h, s * 0.6); ctx.fillRect(px + s * 0.9 - h, py + s * 0.2, h, s * 0.6);
    return;
  }
  if (t === TILE.GRAVE) { // headstone on grass
    ctx.fillStyle = dim(C.graveStone);
    ctx.fillRect(px + s * 0.3, py + s * 0.35, s * 0.4, s * 0.45);
    ctx.beginPath(); ctx.arc(px + s * 0.5, py + s * 0.35, s * 0.2, Math.PI, 0); ctx.fill();
    return;
  }
  if (t === TILE.BRIDGE) {
    // Plain road surface (walkable, like the lane) with a low parapet on each side over the water.
    if (water) {
      const p = Math.max(3, Math.floor(s / 7));
      ctx.fillStyle = dim(C.parapet);
      if (water.n) ctx.fillRect(px, py, s - 1, p);
      if (water.s) ctx.fillRect(px, py + s - 1 - p, s - 1, p);
      if (water.w) ctx.fillRect(px, py, p, s - 1);
      if (water.e) ctx.fillRect(px + s - 1 - p, py, p, s - 1);
    }
    return;
  }
  if (t === TILE.DRYSTONE) {
    ctx.fillStyle = dim(C.drystoneMark);
    const h = Math.max(1, Math.floor(s / 14));
    ctx.fillRect(px, py + s * 0.33, s - 1, h); ctx.fillRect(px, py + s * 0.66, s - 1, h);
    ctx.fillRect(px + s * 0.5, py, h, s * 0.33); ctx.fillRect(px + s * 0.25, py + s * 0.33, h, s * 0.33); ctx.fillRect(px + s * 0.7, py + s * 0.66, h, s * 0.33);
  }
}

// Fire (step 19): an orange-red glow by intensity, with flames that flicker each turn.
function drawFire(ctx, lv, px, py, s, flick) {
  ctx.fillStyle = C.fire[lv];
  ctx.fillRect(px, py, s - 1, s - 1);
  ctx.fillStyle = C.flame;
  const tips = [[0.25, 0.35], [0.5, 0.2], [0.72, 0.4]];
  for (let k = 0; k < lv; k++) {
    const [fx, fy] = tips[(k + flick) % 3];
    ctx.beginPath(); ctx.moveTo(px + (fx - 0.1) * s, py + 0.8 * s); ctx.lineTo(px + fx * s, py + fy * s); ctx.lineTo(px + (fx + 0.1) * s, py + 0.8 * s); ctx.fill();
  }
}

// Prints (step 18): boots are a pair of dots side by side, a zombie's drag a streak, both
// laid along the direction of travel (dx, dy) so you can tell which way it went.
function drawTrack(ctx, tr, px, py, s, memory) {
  if (!tr) return;
  ctx.fillStyle = memory ? 'rgba(0,0,0,0.45)' : tr.in === 'snow' ? C.trackSnow : C.trackMud;
  const cx = px + s / 2, cy = py + s / 2, d = Math.max(3, Math.floor(s / 8));
  const ax = tr.dx || 0, ay = tr.dy || 0, nx = -ay, ny = ax; // along / across the way it went
  if (tr.mark === 'boots') {
    for (const [a, n] of [[-0.18, -0.15], [0.18, 0.15]]) ctx.fillRect(cx + (ax * a + nx * n) * s - d / 2, cy + (ay * a + ny * n) * s - d / 2, d, d);
  } else if (tr.mark === 'hoof' || tr.mark === 'paw') { // animals: a little cluster of small prints
    const q = Math.max(2, d - 1);
    for (const [a, n] of [[-0.2, -0.1], [-0.2, 0.1], [0.15, -0.1], [0.15, 0.1]]) ctx.fillRect(cx + (ax * a + nx * n) * s - q / 2, cy + (ay * a + ny * n) * s - q / 2, q, q);
  } else {
    for (let k = -2; k <= 2; k++) ctx.fillRect(cx + ax * k * 0.1 * s - d / 2, cy + ay * k * 0.1 * s - d / 2, d, d);
  }
}

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

// Broken glass: small light-blue shards.
const GLASS_SPOTS = [[0.15, 0.2], [0.7, 0.15], [0.4, 0.5], [0.8, 0.6], [0.2, 0.8], [0.6, 0.85]];
function drawGlass(ctx, px, py, s, level, colour) {
  if (!level) return;
  ctx.fillStyle = colour;
  const d = Math.max(2, Math.floor(s / 10));
  for (const [fx, fy] of GLASS_SPOTS.slice(0, level * 2)) ctx.fillRect(px + Math.floor(fx * s), py + Math.floor(fy * s), d * 2, d);
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
        drawTileMark(ctx, t, px, py, s, false, markInfo(world, t, x, y));
        const snow = snowLevel(world);
        if (snow && holdsSnow(world, t, y * world.width + x)) { ctx.fillStyle = C.snow[snow]; ctx.fillRect(px, py, s - 1, s - 1); } // settled snow
        drawTrack(ctx, trackAt(world, x, y), px, py, s, false);
        const fi = y * world.width + x;
        if (world.petrol && world.petrol[fi]) { ctx.fillStyle = C.petrol; ctx.fillRect(px + s * 0.15, py + s * 0.55, s * 0.5, s * 0.25); }
        if (world.fire && world.fire[fi]) drawFire(ctx, world.fire[fi], px, py, s, (x * 31 + y * 17 + world.turn) % 3);
        if (world.blood) drawBlood(ctx, px, py, s, world.blood[y * world.width + x], C.blood);
        if (world.glass) drawGlass(ctx, px, py, s, world.glass[y * world.width + x], C.glass);
        continue;
      }
      const snap = player ? rememberedAt(world, player, x, y) : null;
      if (!snap) continue;
      ctx.fillStyle = MEMORY_COLOUR[snap.tile];
      ctx.fillRect(px, py, s - 1, s - 1);
      drawTileMark(ctx, snap.tile, px, py, s, true, markInfo(world, snap.tile, x, y));
      drawTrack(ctx, snap.track, px, py, s, true);
      drawBlood(ctx, px, py, s, snap.blood || 0, C.memoryBlood);
      drawGlass(ctx, px, py, s, snap.glass || 0, C.memoryGlass);
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
    const under = world.tiles[y * world.width + x];
    if (under === TILE.BUSH || under === TILE.HEDGE) drawBushMark(ctx, px, py, s); // in cover / pushing through: leaves over it
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

  // 3b. Weather over the outdoor tiles you can see: rain streaks, snowflakes, fog haze.
  // The marks shift each turn (seeded by tile and turn), so it reads as falling.
  const wk = world.weather && world.weather.kind;
  if (wk && wk !== 'clear' && wk !== 'overcast') {
    const R = CONFIG.render.weather;
    for (let vy = 0; vy < rows; vy++) for (let vx = 0; vx < cols; vx++) {
      const x = camX + vx, y = camY + vy;
      if (!onScreen(x, y) || !levelAt(x, y) || indoorAt(world, y * world.width + x)) continue;
      const px = ox + vx * s, py = oy + vy * s;
      if (wk === 'fog') { ctx.fillStyle = R.fog; ctx.fillRect(px, py, s - 1, s - 1); continue; }
      const h = ((x * 73856093) ^ (y * 19349663) ^ (world.turn * 83492791)) >>> 0;
      const n = wk === 'heavyRain' ? 3 : wk === 'gale' ? 4 : 2;
      ctx.fillStyle = wk === 'snow' ? R.snow : R.rain;
      for (let i = 0; i < n; i++) {
        const fx = ((h >> (i * 5)) & 31) / 32, fy = ((h >> (i * 5 + 15)) & 31) / 32;
        if (wk === 'snow') ctx.fillRect(px + fx * (s - 4), py + fy * (s - 4), 3, 3);
        else if (wk === 'gale') { ctx.fillRect(px + fx * (s * 0.6), py + fy * (s - 3), s * 0.4, 2); } // driven sideways
        else { ctx.fillRect(px + fx * (s - 3), py + fy * (s * 0.6), 2, s * 0.35); }
      }
    }
  }

  // 3c. Smoke over tiles in sight (and the thick smoke at the edge of what you can see).
  if (world.smoke) for (let vy = 0; vy < rows; vy++) for (let vx = 0; vx < cols; vx++) {
    const x = camX + vx, y = camY + vy;
    if (!onScreen(x, y)) continue;
    const sm = world.smoke[y * world.width + x];
    if (!sm || !levelAt(x, y)) continue;
    ctx.fillStyle = C.smoke[sm];
    ctx.fillRect(ox + vx * s, oy + vy * s, s - 1, s - 1);
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
    // ...and the scent trail (green, by level), bottom-right of each tile.
    for (let vy = 0; vy < rows; vy++) for (let vx = 0; vx < cols; vx++) {
      const x = camX + vx, y = camY + vy;
      if (!onScreen(x, y)) continue;
      const lv = scentLevel(world, x, y);
      if (!lv) continue;
      const px = ox + vx * s, py = oy + vy * s;
      ctx.fillStyle = `rgba(${C.debugScent},${(0.15 + 0.2 * lv).toFixed(2)})`;
      ctx.fillRect(px + s / 2, py + s / 2, s / 2 - 1, s / 2 - 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(lv), px + s / 2 + 2, py + s / 2 + 2);
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
