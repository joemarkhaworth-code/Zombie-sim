// Drawing one terrain tile, greybox style: a base colour and a simple mark per kind of tile, so
// the town reads at a glance on a phone. Remembered tiles (out of sight) are drawn with the
// same shapes in dark greys worked out from the live colours. Only reads world state.
//
// Buildings follow the one camera angle (looking north, a little from above): roof slopes with
// their ridge and chimney stacks, then the south-facing wall with its door and windows.
import { CONFIG } from '../config.js';
import { TILE, TILE_INFO } from '../sim/tiles.js';

const COL = CONFIG.colours.tiles;

// A colour as a dark grey of about the same lightness, for map memory.
const greyCache = new Map();
function grey(hex) {
  if (greyCache.has(hex)) return greyCache.get(hex);
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const g = Math.round(18 + lum * 0.36);
  const out = `rgb(${g},${g},${g})`;
  greyCache.set(hex, out);
  return out;
}

// [base, mark] for a palette key, live or remembered.
function pal(key, mem) {
  const c = COL[key] || ['#ff00ff', '#000000'];
  return mem ? [grey(c[0]), grey(c[1])] : c;
}

const rect = (ctx, colour, x, y, w, h) => { ctx.fillStyle = colour; ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h)); };

// A little variety without randomness: the same tile always looks the same.
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

const isRail = t => t === TILE.RAIL || t === TILE.CROSSING;

// tile: the tile number; (x, y): its map position (for neighbours and variety); (px, py, t):
// where and how big to draw it. mem: draw it as remembered (greys).
export function drawTile(ctx, world, tile, x, y, px, py, t, mem) {
  const info = TILE_INFO[tile];
  if (!info) { rect(ctx, '#ff00ff', px, py, t, t); return; }
  if (info.part === 'roof') return drawRoof(ctx, info, px, py, t, mem);
  if (info.part) return drawWall(ctx, info, px, py, t, mem);
  const key = info.key;
  const h = hash(x, y);
  const [base, mark] = pal(key, mem);
  const u = t / 8;
  switch (key) {
    case 'FLOOR': {
      const c = mem ? [grey(CONFIG.colours.floor), grey(CONFIG.colours.floorMark)] : [CONFIG.colours.floor, CONFIG.colours.floorMark];
      rect(ctx, c[0], px, py, t, t); rect(ctx, c[1], px + t / 2, py + t / 2, 2, 2); return;
    }
    case 'WALL': case 'RUIN': case 'LOWWALL': case 'PARAPET': {
      const c = key === 'WALL' && !COL.WALL ? (mem ? [grey(CONFIG.colours.wall), grey(CONFIG.colours.wallMark)] : [CONFIG.colours.wall, CONFIG.colours.wallMark]) : [base, mark];
      if (key === 'LOWWALL' || key === 'PARAPET') {
        // A low wall: a band of stone with a coping, the ground showing either side.
        const [gb] = pal(key === 'PARAPET' ? 'BRIDGE' : 'GRASS', mem);
        rect(ctx, gb, px, py, t, t);
        rect(ctx, c[0], px, py + t * 0.2, t, t * 0.6);
        rect(ctx, c[1], px, py + t * 0.5, t, 1);
        rect(ctx, c[1], px + ((h & 3) + 2) * u, py + t * 0.2, 1, t * 0.3);
        rect(ctx, c[1], px, py + t * 0.8 - 1, t, 1);
        return;
      }
      rect(ctx, c[0], px, py, t, t);
      rect(ctx, c[1], px, py + Math.floor(t / 2), t, 1);
      rect(ctx, c[1], px + Math.floor(t / 2), py, 1, Math.floor(t / 2));
      rect(ctx, c[1], px + Math.floor(t / 4), py + t / 2, 1, t / 2);
      if (key === 'RUIN' && (h & 1)) rect(ctx, pal('GRASS', mem)[0], px + t * 0.6, py, t * 0.4, t * 0.3); // broken top
      return;
    }
    case 'GRASS': case 'MOOR': case 'GREEN': case 'SAND': case 'GATE': case 'ROCK': case 'GRAVE': case 'FENCE': case 'TREE': {
      const [gb, gm] = key === 'GATE' || key === 'ROCK' || key === 'GRAVE' || key === 'FENCE' || key === 'TREE' ? pal('GRASS', mem) : [base, mark];
      rect(ctx, gb, px, py, t, t);
      if (key !== 'GREEN' && key !== 'SAND') {
        rect(ctx, gm, px + ((h & 7) + 1) * u * 0.7, py + (((h >> 3) & 7) + 1) * u * 0.7, 2, 2);
        rect(ctx, gm, px + (((h >> 6) & 7) + 1) * u * 0.8, py + (((h >> 9) & 7) + 1) * u * 0.8, 2, 2);
      }
      if (key === 'ROCK') { ctx.fillStyle = mark; ctx.beginPath(); ctx.ellipse(px + t / 2, py + t * 0.55, t * 0.38, t * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
      if (key === 'GRAVE') { rect(ctx, mark, px + t * 0.3, py + t * 0.25, t * 0.4, t * 0.5); rect(ctx, grey('#000000'), px + t * 0.3, py + t * 0.75, t * 0.4, 1); }
      if (key === 'TREE') {
        ctx.fillStyle = mark; ctx.beginPath(); ctx.arc(px + t / 2, py + t / 2, t * 0.48, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = base; ctx.beginPath(); ctx.arc(px + t * 0.4, py + t * 0.4, t * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      if (key === 'FENCE') {
        const vert = world && fenceVertical(world, x, y);
        if (vert) { rect(ctx, mark, px + t * 0.45, py, 2, t); rect(ctx, mark, px + t * 0.3, py + t * 0.45, t * 0.4, 2); }
        else { rect(ctx, mark, px, py + t * 0.35, t, 2); rect(ctx, mark, px, py + t * 0.65, t, 2); rect(ctx, mark, px + 1, py + t * 0.25, 2, t * 0.55); }
      }
      if (key === 'GATE') { rect(ctx, mark, px, py + t * 0.15, 3, t * 0.7); rect(ctx, mark, px + t - 3, py + t * 0.15, 3, t * 0.7); }
      return;
    }
    case 'HEDGE': {
      rect(ctx, base, px, py, t, t);
      ctx.fillStyle = mark;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(px + t * (0.2 + 0.3 * k), py + t * (0.35 + 0.3 * ((h >> k) & 1)), t * 0.18, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    case 'FIELD': case 'BEDS': {
      rect(ctx, base, px, py, t, t);
      for (let k = 1; k < 4; k++) rect(ctx, mark, px, py + k * t / 4, t, Math.max(1, t / 16));
      return;
    }
    case 'ROAD': case 'CARPARK': case 'ROAD_LINE_H': case 'ROAD_LINE_V': case 'CROSSING': {
      const [rb, rm] = pal('ROAD', mem);
      rect(ctx, rb, px, py, t, t);
      rect(ctx, rm, px + ((h & 7) + 1) * u * 0.8, py + (((h >> 3) & 7) + 1) * u * 0.8, 1, 1);
      const white = mem ? grey('#d8d8d0') : '#d8d8d0';
      if (key === 'ROAD_LINE_H') rect(ctx, white, px + t * 0.15, py - 1, t * 0.7, 3);
      if (key === 'ROAD_LINE_V') rect(ctx, white, px - 1, py + t * 0.15, 3, t * 0.7);
      if (key === 'CARPARK' && (x & 1)) rect(ctx, mark, px, py, 1, t * 0.6);
      if (key === 'CROSSING') drawRails(ctx, world, x, y, px, py, t, mark, mark);
      return;
    }
    case 'PAVEMENT': case 'YARD': case 'BRIDGE': case 'DRIVE': case 'PLATFORM': case 'DOORSTEP': case 'PATH': case 'TRACK': {
      rect(ctx, base, px, py, t, t);
      if (key === 'PATH' || key === 'TRACK') {
        rect(ctx, mark, px + ((h & 7) + 1) * u * 0.8, py + (((h >> 3) & 7) + 1) * u * 0.8, 2, 2);
        rect(ctx, mark, px + (((h >> 6) & 7) + 1) * u * 0.8, py + (((h >> 9) & 7) + 1) * u * 0.8, 2, 2);
        return;
      }
      rect(ctx, mark, px, py + t - 1, t, 1);
      rect(ctx, mark, px + ((h & 1) ? t / 2 : 0), py, 1, t);
      if (key === 'PLATFORM') rect(ctx, mark, px, py, t, Math.max(2, t / 10));
      if (key === 'DOORSTEP') { const [, step] = pal('DOORSTEP', mem); rect(ctx, step, px + t * 0.15, py + t * 0.15, t * 0.7, t * 0.7); }
      return;
    }
    case 'SETTS': case 'MARKET_CROSS': case 'STEPS': {
      rect(ctx, base, px, py, t, t);
      if (key === 'STEPS') { for (let k = 1; k < 4; k++) rect(ctx, mark, px, py + k * t / 4, t, 2); return; }
      for (let k = 1; k < 4; k++) rect(ctx, mark, px, py + k * t / 4, t, 1);
      for (let k = 0; k < 4; k++) rect(ctx, mark, px + ((k & 1) ? t / 8 : t * 3 / 8) + (k >> 1) * t / 2, py + (k % 4) * t / 4, 1, t / 4);
      if (key === 'MARKET_CROSS') { rect(ctx, mark, px + t * 0.42, py + t * 0.1, t * 0.16, t * 0.8); rect(ctx, mark, px + t * 0.25, py + t * 0.28, t * 0.5, t * 0.14); }
      return;
    }
    case 'WATER': case 'SHALLOWS': case 'WEIR': {
      rect(ctx, base, px, py, t, t);
      if (key === 'WEIR') { for (let k = 0; k < 3; k++) rect(ctx, mark, px + t * 0.2, py + k * t / 3, t * 0.6, t / 6); return; }
      const o = (h & 3) * u;
      rect(ctx, mark, px + o + u, py + t * 0.3, t * 0.35, 2);
      rect(ctx, mark, px + t * 0.5 - o / 2, py + t * 0.7, t * 0.3, 2);
      if (key === 'SHALLOWS') { rect(ctx, pal('PATH', mem)[0], px + t * 0.6, py + t * 0.15, t * 0.2, t * 0.15); }
      return;
    }
    case 'CRAG': {
      rect(ctx, base, px, py, t, t);
      ctx.strokeStyle = mark; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const o = ((h >> k) & 3) * u; ctx.moveTo(px + k * t / 3 + o / 2, py + 2); ctx.lineTo(px + k * t / 3 + o / 2 + t * 0.2, py + t - 2); }
      ctx.stroke();
      return;
    }
    case 'RAIL': {
      rect(ctx, base, px, py, t, t);
      drawRails(ctx, world, x, y, px, py, t, mark, pal('TRACK', mem)[1]);
      return;
    }
    case 'TUNNEL': case 'ARCH': {
      rect(ctx, mark, px, py, t, t);
      ctx.fillStyle = base; ctx.beginPath(); ctx.arc(px + t / 2, py + t * 0.55, t * 0.42, Math.PI, 0); ctx.lineTo(px + t * 0.92, py + t); ctx.lineTo(px + t * 0.08, py + t); ctx.fill();
      return;
    }
    case 'CARRIAGE': case 'CARRIAGE_END': {
      const [cb, cm] = pal('CARRIAGE', mem);
      rect(ctx, cb, px, py, t, t);
      rect(ctx, cm, px + t * 0.2, py, t * 0.6, t);              // the roof's lighter middle
      if (x === 73) rect(ctx, grey('#000000'), px, py, 1, t);   // the two halves of the roof
      if (key === 'CARRIAGE_END') rect(ctx, mark, px, py + t * 0.8, t, t * 0.2);
      return;
    }
    case 'BARRIER': {
      rect(ctx, base, px, py, t, t);
      for (let k = 0; k < 4; k += 2) rect(ctx, mark, px + k * t / 4, py + t * 0.3, t / 4, t * 0.4);
      return;
    }
    default:
      rect(ctx, base, px, py, t, t);
  }
}

// Rails along the track: east-west if the track carries on east or west, else north-south.
function drawRails(ctx, world, x, y, px, py, t, rail, sleeper) {
  const at = (dx, dy) => (world ? world.tiles[(y + dy) * world.w + x + dx] : -1);
  const horiz = world && (isRail(at(1, 0)) || isRail(at(-1, 0))) && !(isRail(at(0, 1)) && isRail(at(0, -1)));
  if (horiz) {
    for (let k = 0; k < 3; k++) rect(ctx, sleeper, px + k * t / 3 + 2, py + t * 0.15, t / 8, t * 0.7);
    rect(ctx, rail, px, py + t * 0.28, t, 2); rect(ctx, rail, px, py + t * 0.68, t, 2);
  } else {
    for (let k = 0; k < 3; k++) rect(ctx, sleeper, px + t * 0.15, py + k * t / 3 + 2, t * 0.7, t / 8);
    rect(ctx, rail, px + t * 0.28, py, 2, t); rect(ctx, rail, px + t * 0.68, py, 2, t);
  }
}

function fenceVertical(world, x, y) {
  const at = (dx, dy) => world.tiles[(y + dy) * world.w + x + dx];
  const f = t => t === TILE.FENCE || t === TILE.GATE;
  return (f(at(0, 1)) || f(at(0, -1))) && !(f(at(1, 0)) || f(at(-1, 0)));
}

// Roofs: the far slope above the ridge is lit, the near slope below it shaded (east-west
// ridges); west slopes lit, east shaded (north-south ridges). Slate courses, a dark ridge line,
// chimney stacks on the party walls.
function drawRoof(ctx, info, px, py, t, mem) {
  const [lit, shade] = pal(`ROOF_${info.mat}`, mem);
  const [ridgeCol, stackCol] = pal('ridge', mem);
  const s = info.slope;
  const course = mem ? grey('#000000') : 'rgba(0,0,0,0.18)';
  if (s === 'F') {
    rect(ctx, lit, px, py, t, t);
    rect(ctx, shade, px + 2, py + 2, t - 4, t - 4);
    if (info.mat === 'GLASS') { rect(ctx, lit, px + t / 2, py, 1, t); rect(ctx, lit, px, py + t / 2, t, 1); }
    return;
  }
  if (s === 'N' || s === 'S' || s === 'R') {
    if (s === 'R') { rect(ctx, lit, px, py, t, t / 2); rect(ctx, shade, px, py + t / 2, t, t / 2); }
    else rect(ctx, s === 'N' ? lit : shade, px, py, t, t);
    for (let k = 1; k < 3; k++) { const yy = py + k * t / 3; if (s !== 'R' || Math.abs(yy - (py + t / 2)) > 3) rect(ctx, course, px, yy, t, 1); }
    if (s === 'R') {
      rect(ctx, ridgeCol, px, py + t / 2 - 1, t, 3);
      if (info.chimney) {
        rect(ctx, stackCol, px - t * 0.2, py + t * 0.1, t * 0.4, t * 0.5);
        rect(ctx, ridgeCol, px - t * 0.2, py + t * 0.1, t * 0.4, 2);
      }
    }
    return;
  }
  // North-south ridge.
  if (s === 'V') { rect(ctx, lit, px, py, t / 2, t); rect(ctx, shade, px + t / 2, py, t / 2, t); }
  else rect(ctx, s === 'W' ? lit : shade, px, py, t, t);
  for (let k = 1; k < 3; k++) { const xx = px + k * t / 3; if (s !== 'V' || Math.abs(xx - (px + t / 2)) > 3) rect(ctx, course, xx, py, 1, t); }
  if (s === 'V') {
    rect(ctx, ridgeCol, px + t / 2 - 1, py, 3, t);
    if (info.chimney) { rect(ctx, stackCol, px + t * 0.25, py - t * 0.2, t * 0.5, t * 0.4); rect(ctx, ridgeCol, px + t * 0.25, py - t * 0.2, t * 0.5, 2); }
  }
}

// South-facing walls: courses, windows, doors (with a step), shopfronts.
function drawWall(ctx, info, px, py, t, mem) {
  const [wall, course] = pal(info.mat, mem);
  rect(ctx, wall, px, py, t, t);
  for (let k = 1; k < 3; k++) rect(ctx, course, px, py + k * t / 3, t, 1);
  const [glass, frame] = pal('window', mem);
  const [door, knob] = pal('door', mem);
  if (info.part === 'win') {
    rect(ctx, frame, px + t * 0.18, py + t * 0.2, t * 0.64, t * 0.58);
    rect(ctx, glass, px + t * 0.24, py + t * 0.26, t * 0.52, t * 0.46);
    rect(ctx, frame, px + t / 2 - 1, py + t * 0.26, 2, t * 0.46);
  } else if (info.part === 'shop') {
    rect(ctx, frame, px, py + t * 0.12, t, t * 0.76);
    rect(ctx, glass, px + 2, py + t * 0.18, t - 4, t * 0.64);
  } else if (info.part === 'door') {
    rect(ctx, door, px + t * 0.24, py + t * 0.1, t * 0.52, t * 0.9);
    rect(ctx, knob, px + t * 0.62, py + t * 0.52, 3, 3);
    rect(ctx, pal('DOORSTEP', mem)[1], px + t * 0.18, py + t - 3, t * 0.64, 3);
  }
}

// Hanging signs over the pavement (buildings that face away), drawn where the tile is seen or
// remembered.
export function drawSign(ctx, text, px, py, t, mem) {
  const [bg, fg] = pal('sign', mem);
  const bracket = mem ? grey('#222222') : '#222222';
  rect(ctx, bracket, px + t * 0.12, py, 2, t * 0.3);
  rect(ctx, bracket, px + t * 0.12, py + t * 0.12, t * 0.5, 2);
  const w = t * 0.98, hgt = t * 0.42;
  const x0 = px + t * 0.01, y0 = py + t * 0.3;
  rect(ctx, bracket, x0 - 1, y0 - 1, w + 2, hgt + 2);
  rect(ctx, bg, x0, y0, w, hgt);
  ctx.fillStyle = fg;
  const size = Math.max(7, Math.min(t * 0.24, (w - 2) / (text.length * 0.62)));
  ctx.font = `bold ${Math.floor(size)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + w / 2, y0 + hgt / 2 + 1);
}
