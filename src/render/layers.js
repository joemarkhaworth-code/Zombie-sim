// Drawing the layers of an editor map, greybox style, for the game and the editor alike. The
// ground is drawn by tiles.js (it's an ordinary tile); this adds height, structures, objects,
// markers and roofs. `src` is anything with w, h and the layer arrays: a world (height, struct,
// obj, roof) or an editor map (height, struct, object, roof).
//
// Height is a Pokémon-style trick for depth: each level is a shade lighter, and wherever the
// next tile up is higher, a cliff face is drawn on this, the lower tile, on that side (tall on
// the north side, where you look at the face; a lip on the others).
import { CONFIG } from '../config.js';
import { S, O, M, STRUCT } from '../sim/map.js';
import { drawSign } from './tiles.js';

const C = CONFIG.colours.layers;
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
const col = (hex, mem) => (mem ? grey(hex) : hex);
const rect = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h)); };

// Height shading and cliff faces, then the structure, on one tile.
export function drawHeightAndStruct(ctx, src, x, y, px, py, t, mem) {
  const { w, h } = src, i = y * w + x;
  const hgt = src.height ? src.height[i] : 0;
  if (hgt) rect(ctx, `rgba(255,255,255,${0.06 * hgt})`, px, py, t, t);
  if (src.height) {
    const up = (dx, dy) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h ? src.height[ny * w + nx] - hgt : 0;
    };
    const face = col(C.cliff[0], mem), line = col(C.cliff[1], mem);
    const n = up(0, -1), s = up(0, 1), e = up(1, 0), wv = up(-1, 0);
    if (n > 0) {                      // the face of the cliff above you, seen from the south
      const fh = Math.min(t * 0.85, t * 0.4 * n);
      rect(ctx, face, px, py, t, fh);
      for (let k = 1; k < 4; k++) rect(ctx, line, px + (k * t) / 4, py, 1, fh);
      rect(ctx, line, px, py + fh - 2, t, 2);
    }
    if (s > 0) rect(ctx, line, px, py + t - 3, t, 3);
    if (e > 0) { rect(ctx, face, px + t * 0.82, py, t * 0.18, t); rect(ctx, line, px + t * 0.82, py, 1, t); }
    if (wv > 0) { rect(ctx, face, px, py, t * 0.18, t); rect(ctx, line, px + t * 0.18, py, 1, t); }
  }
  const st = src.struct ? src.struct[i] : 0;
  if (!st) return;
  const near = (dx, dy, kinds) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < w && ny < h && kinds.includes(src.struct[ny * w + nx]);
  };
  switch (st) {
    case S.WALL: {
      rect(ctx, col(C.wall[0], mem), px, py, t, t);
      for (let k = 1; k < 3; k++) rect(ctx, col(C.wall[1], mem), px, py + (k * t) / 3, t, 1);
      rect(ctx, col(C.wall[1], mem), px + ((x + y) & 1 ? t / 2 : t / 4), py, 1, t);
      break;
    }
    case S.DOOR: {
      const vert = near(0, -1, [S.WALL]) || near(0, 1, [S.WALL]);
      const c = col(C.door[0], mem);
      if (vert) rect(ctx, c, px + t * 0.3, py, t * 0.4, t);
      else rect(ctx, c, px, py + t * 0.3, t, t * 0.4);
      rect(ctx, col(C.door[1], mem), px + t * 0.45, py + t * 0.45, 3, 3);
      break;
    }
    case S.FENCE: {
      const c = col(C.fence, mem);
      const vert = (near(0, -1, [S.FENCE]) || near(0, 1, [S.FENCE])) && !(near(-1, 0, [S.FENCE]) || near(1, 0, [S.FENCE]));
      if (vert) { rect(ctx, c, px + t * 0.45, py, 2, t); rect(ctx, c, px + t * 0.3, py + t * 0.45, t * 0.4, 2); }
      else { rect(ctx, c, px, py + t * 0.35, t, 2); rect(ctx, c, px, py + t * 0.65, t, 2); rect(ctx, c, px + 1, py + t * 0.25, 2, t * 0.55); }
      break;
    }
    case S.HEDGE: {
      rect(ctx, col(C.hedge[0], mem), px, py, t, t);
      ctx.fillStyle = col(C.hedge[1], mem);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(px + t * (0.2 + 0.3 * k), py + t * (0.35 + 0.3 * ((x + k) & 1)), t * 0.18, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case S.BRIDGE: {
      rect(ctx, col(C.bridge[0], mem), px, py, t, t);
      const vert = near(0, -1, [S.BRIDGE]) || near(0, 1, [S.BRIDGE]);
      for (let k = 1; k < 4; k++) {
        if (vert) rect(ctx, col(C.bridge[1], mem), px, py + (k * t) / 4, t, 1);
        else rect(ctx, col(C.bridge[1], mem), px + (k * t) / 4, py, 1, t);
      }
      break;
    }
    case S.STEPS: {
      rect(ctx, col(C.steps[0], mem), px + 1, py + 1, t - 2, t - 2);
      for (let k = 1; k < 4; k++) rect(ctx, col(C.steps[1], mem), px + 1, py + (k * t) / 4, t - 2, 2);
      break;
    }
    case S.LEDGE: {
      // A lip on the side it drops away: a one-way hop down.
      const down = (dx, dy) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && src.height && src.height[ny * w + nx] < hgt;
      };
      const c = col(C.ledge, mem);
      if (down(0, 1) || !(down(0, -1) || down(1, 0) || down(-1, 0))) { rect(ctx, c, px, py + t * 0.72, t, t * 0.16); rect(ctx, col(C.cliff[1], mem), px, py + t * 0.88, t, 2); }
      if (down(0, -1)) rect(ctx, c, px, py + t * 0.12, t, t * 0.14);
      if (down(1, 0)) rect(ctx, c, px + t * 0.74, py, t * 0.14, t);
      if (down(-1, 0)) rect(ctx, c, px + t * 0.12, py, t * 0.14, t);
      break;
    }
    default:
  }
}

// A whole object at its top-left pixel; t is the tile size.
export function drawObject(ctx, o, px, py, t, mem) {
  const W = o.w * t, H = o.h * t;
  switch (o.kind) {
    case O.CAR: case O.VAN: {
      const body = col(o.kind === O.CAR ? C.car : C.van, mem);
      ctx.fillStyle = body; ctx.strokeStyle = col('#111111', mem); ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px + 3, py + 3, W - 6, H - 6, t * 0.3); else ctx.rect(px + 3, py + 3, W - 6, H - 6);
      ctx.fill(); ctx.stroke();
      const glass = col(C.glass, mem);
      if (W >= H) { rect(ctx, glass, px + W - t * 0.85, py + t * 0.3, t * 0.3, H - t * 0.6); if (o.kind === O.CAR) rect(ctx, glass, px + t * 0.5, py + t * 0.3, t * 0.25, H - t * 0.6); }
      else { rect(ctx, glass, px + t * 0.3, py + t * 0.55, W - t * 0.6, t * 0.3); if (o.kind === O.CAR) rect(ctx, glass, px + t * 0.3, py + H - t * 0.75, W - t * 0.6, t * 0.25); }
      break;
    }
    case O.TREE: {
      ctx.fillStyle = col(C.tree[0], mem);
      ctx.beginPath(); ctx.arc(px + W / 2, py + H / 2, Math.min(W, H) * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col(C.tree[1], mem);
      ctx.beginPath(); ctx.arc(px + W * 0.4, py + H * 0.4, Math.min(W, H) * 0.18, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case O.BENCH: {
      const c = col(C.bench, mem);
      if (W >= H) { rect(ctx, c, px + 2, py + t * 0.3, W - 4, t * 0.14); rect(ctx, c, px + 2, py + t * 0.55, W - 4, t * 0.14); }
      else { rect(ctx, c, px + t * 0.3, py + 2, t * 0.14, H - 4); rect(ctx, c, px + t * 0.55, py + 2, t * 0.14, H - 4); }
      break;
    }
    case O.CRATE: {
      rect(ctx, col(C.crate[0], mem), px + 3, py + 3, W - 6, H - 6);
      ctx.strokeStyle = col(C.crate[1], mem); ctx.lineWidth = 2;
      ctx.strokeRect(px + 3, py + 3, W - 6, H - 6);
      ctx.beginPath(); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + W - 3, py + H - 3); ctx.moveTo(px + W - 3, py + 3); ctx.lineTo(px + 3, py + H - 3); ctx.stroke();
      break;
    }
    case O.SIGN: drawSign(ctx, (o.text || 'SIGN').slice(0, 10).toUpperCase(), px, py, t, mem); break;
    case O.FISHING: {
      ctx.strokeStyle = col(C.fishing, mem); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px + t / 2, py + t / 2, t * 0.3, 0, Math.PI * 2); ctx.stroke();
      rect(ctx, col('#d03030', mem), px + t * 0.44, py + t * 0.3, t * 0.12, t * 0.2);
      break;
    }
    default:
  }
}

// One roof tile: its colour, slate courses, and an eave line where the roof ends.
export function drawRoofTile(ctx, src, x, y, px, py, t, mem) {
  const { w, h } = src, i = y * w + x;
  const r = src.roof[i];
  if (!r) return;
  const pal = C.roofs[r] || C.roofs[1];
  rect(ctx, col(pal[0], mem), px, py, t, t);
  for (let k = 1; k < 3; k++) rect(ctx, col(pal[1], mem), px, py + (k * t) / 3, t, 1);
  const edge = col(pal[1], mem);
  const off = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= w || ny >= h || !src.roof[ny * w + nx]; };
  if (off(0, -1)) rect(ctx, edge, px, py, t, 2);
  if (off(0, 1)) rect(ctx, edge, px, py + t - 3, t, 3);
  if (off(-1, 0)) rect(ctx, edge, px, py, 2, t);
  if (off(1, 0)) rect(ctx, edge, px + t - 2, py, 2, t);
}

// Markers (the editor shows them; the game doesn't).
export function drawMarker(ctx, m, px, py, t) {
  const glyph = m.kind === M.START ? '@' : m.kind === M.ZOMBIE ? 'Z' : 'L';
  const bg = m.kind === M.START ? CONFIG.colours.player : m.kind === M.ZOMBIE ? 'rgba(0,0,0,0.5)' : '#1d2a6b';
  rect(ctx, bg, px + 2, py + 2, t - 4, t - 4);
  ctx.fillStyle = m.kind === M.START ? '#000' : m.kind === M.ZOMBIE ? CONFIG.colours.zombie : '#fff';
  ctx.font = `bold ${Math.floor(t * 0.6)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(glyph, px + t / 2, py + t / 2 + 1);
  if (m.kind === M.LABEL && m.text) {
    ctx.font = `bold ${Math.max(9, Math.floor(t * 0.35))}px monospace`;
    const tw = ctx.measureText(m.text).width;
    rect(ctx, 'rgba(255,255,255,0.85)', px + t / 2 - tw / 2 - 3, py - t * 0.45, tw + 6, t * 0.42);
    ctx.fillStyle = '#1d2a6b';
    ctx.fillText(m.text, px + t / 2, py - t * 0.24);
  }
}

export const structName = s => STRUCT[s][2];
