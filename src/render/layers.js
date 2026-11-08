// Drawing the layers of an editor map, greybox style, for the game and the editor alike. The
// ground is drawn by tiles.js (it's an ordinary tile); this adds height, structures, objects,
// markers and roofs. `src` is anything with w, h and the layer arrays: a world (height, struct,
// obj, roof) or an editor map (height, struct, object, roof).
//
// Height is a Pokémon-style trick for depth: each level is a shade lighter, and wherever the
// next tile up is higher, a cliff face is drawn on this, the lower tile, on that side (tall on
// the north side, where you look at the face; a lip on the others).
import { CONFIG } from '../config.js';
import { S, O, M, STRUCT, OBJECT, MARKER } from '../sim/map.js';
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
  const info = STRUCT[st][3];
  const near = (dx, dy, test) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < w && ny < h && test(src.struct[ny * w + nx]);
  };
  const same = v => v === st;
  const lineVert = test => (near(0, -1, test) || near(0, 1, test)) && !(near(-1, 0, test) || near(1, 0, test));
  const wallish = v => v > 0 && (STRUCT[v][3].wall || STRUCT[v][3].opening);
  switch (info.look) {
    case 'wall': {
      const [b, m] = C.walls[info.colour];
      rect(ctx, col(b, mem), px, py, t, t);
      const mc = col(m, mem);
      if (info.colour === 'log') { for (let k = 0; k < 3; k++) { ctx.fillStyle = mc; ctx.fillRect(px, py + (k * t) / 3 + t / 3 - 2, t, 2); } }
      else if (info.colour === 'clapboard') { for (let k = 1; k < 5; k++) rect(ctx, mc, px, py + (k * t) / 5, t, 1); }
      else if (info.colour === 'barn') { for (let k = 1; k < 4; k++) rect(ctx, mc, px + (k * t) / 4, py, 1, t); }
      else if (info.colour === 'cinder') { rect(ctx, mc, px, py + t / 2, t, 1); rect(ctx, mc, px + ((x + y) & 1 ? t / 2 : 0), py, 1, t / 2); rect(ctx, mc, px + ((x + y) & 1 ? 0 : t / 2), py + t / 2, 1, t / 2); }
      else { for (let k = 1; k < 3; k++) rect(ctx, mc, px, py + (k * t) / 3, t, 1); rect(ctx, mc, px + ((x + y) & 1 ? t / 2 : t / 4), py, 1, t); }
      break;
    }
    case 'window': {
      // Glass in a frame, set in whatever wall it's next to.
      let wallKind = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && STRUCT[src.struct[ny * w + nx]][3].wall) { wallKind = src.struct[ny * w + nx]; break; }
      }
      const wb = wallKind ? C.walls[STRUCT[wallKind][3].colour][0] : C.walls.plaster[0];
      rect(ctx, col(wb, mem), px, py, t, t);
      rect(ctx, col('#ece8e0', mem), px + t * 0.16, py + t * 0.16, t * 0.68, t * 0.68);
      rect(ctx, col(C.glass, mem), px + t * 0.22, py + t * 0.22, t * 0.56, t * 0.56);
      rect(ctx, col('#ece8e0', mem), px + t / 2 - 1, py + t * 0.22, 2, t * 0.56);
      break;
    }
    case 'door': {
      const vert = near(0, -1, wallish) || near(0, 1, wallish);
      const c = col(C.door[0], mem);
      if (vert) rect(ctx, c, px + t * 0.3, py, t * 0.4, t);
      else rect(ctx, c, px, py + t * 0.3, t, t * 0.4);
      rect(ctx, col(C.door[1], mem), px + t * 0.45, py + t * 0.45, 3, 3);
      break;
    }
    case 'garage': {
      rect(ctx, col('#9aa0a6', mem), px, py, t, t);
      for (let k = 1; k < 5; k++) rect(ctx, col('#6e747a', mem), px, py + (k * t) / 5, t, 1);
      break;
    }
    case 'stonewall': {
      ctx.fillStyle = col('#8a847c', mem);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(px + t * (0.2 + 0.3 * k), py + t * (0.45 + 0.12 * ((x + k) & 1)), t * 0.2, t * 0.17, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = col('#6a645c', mem);
      ctx.beginPath(); ctx.ellipse(px + t * 0.5, py + t * 0.3, t * 0.18, t * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rail': case 'picket': case 'chain': case 'barbed': case 'board': case 'gate': case 'guard': {
      const colour = col({ rail: '#8a6a44', picket: '#f0f0e8', chain: '#9aa0a6', barbed: '#7a7a7a', board: '#8a6a44', gate: '#9a6a3a', guard: '#b8bcc0' }[info.look], mem);
      const fenceLike = v => v > 0 && (STRUCT[v][3].fence || v === S.GATE);
      const vert = lineVert(info.look === 'gate' ? fenceLike : same);
      if (info.look === 'board') { if (vert) rect(ctx, colour, px + t * 0.35, py, t * 0.3, t); else rect(ctx, colour, px, py + t * 0.35, t, t * 0.3); break; }
      if (info.look === 'gate') {
        if (vert) { rect(ctx, colour, px + t * 0.42, py, t * 0.16, 3); rect(ctx, colour, px + t * 0.42, py + t - 3, t * 0.16, 3); }
        else { rect(ctx, colour, px, py + t * 0.42, 3, t * 0.16); rect(ctx, colour, px + t - 3, py + t * 0.42, 3, t * 0.16); }
        break;
      }
      const n = info.look === 'picket' ? 4 : info.look === 'chain' ? 6 : 2;
      if (vert) {
        rect(ctx, colour, px + t * 0.45, py, 2, t);
        if (info.look === 'picket') for (let k = 0; k < n; k++) rect(ctx, colour, px + t * 0.3, py + (k * t) / n + 1, t * 0.4, 2);
        if (info.look === 'chain') for (let k = 0; k < n; k++) rect(ctx, colour, px + t * 0.38, py + (k * t) / n, t * 0.24, 1);
      } else {
        rect(ctx, colour, px, py + t * 0.4, t, 2);
        if (info.look === 'rail' || info.look === 'guard') rect(ctx, colour, px, py + t * 0.62, t, 2);
        if (info.look === 'picket') for (let k = 0; k < n; k++) rect(ctx, colour, px + (k * t) / n + 2, py + t * 0.22, 3, t * 0.5);
        if (info.look === 'chain') for (let k = 0; k < n; k++) rect(ctx, colour, px + (k * t) / n, py + t * 0.3, 1, t * 0.4);
        if (info.look === 'barbed') { for (let k = 0; k < 3; k++) rect(ctx, colour, px + (k + 0.5) * t / 3 - 1, py + t * 0.34, 2, t * 0.14); rect(ctx, colour, px + 1, py + t * 0.25, 2, t * 0.5); }
        if (info.look !== 'barbed' && info.look !== 'chain') rect(ctx, colour, px + 1, py + t * 0.22, 3, t * 0.56);
      }
      break;
    }
    case 'hedge': {
      rect(ctx, col(C.hedge[0], mem), px, py, t, t);
      ctx.fillStyle = col(C.hedge[1], mem);
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(px + t * (0.2 + 0.3 * k), py + t * (0.35 + 0.3 * ((x + k) & 1)), t * 0.18, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'bridge': case 'dock': {
      const pal = info.look === 'dock' ? ['#9a7a52', '#6a5034'] : C.bridge;
      rect(ctx, col(pal[0], mem), px, py, t, t);
      const vert = lineVert(same);
      for (let k = 1; k < 4; k++) {
        if (vert) rect(ctx, col(pal[1], mem), px, py + (k * t) / 4, t, 1);
        else rect(ctx, col(pal[1], mem), px + (k * t) / 4, py, 1, t);
      }
      break;
    }
    case 'tracks': {
      const vert = lineVert(same);
      const sl = col('#6a4a30', mem), rl = col('#b8b8b8', mem);
      if (vert) { for (let k = 0; k < 3; k++) rect(ctx, sl, px + t * 0.12, py + k * t / 3 + 2, t * 0.76, t / 8); rect(ctx, rl, px + t * 0.28, py, 2, t); rect(ctx, rl, px + t * 0.68, py, 2, t); }
      else { for (let k = 0; k < 3; k++) rect(ctx, sl, px + k * t / 3 + 2, py + t * 0.12, t / 8, t * 0.76); rect(ctx, rl, px, py + t * 0.28, t, 2); rect(ctx, rl, px, py + t * 0.68, t, 2); }
      break;
    }
    case 'steps': {
      rect(ctx, col(C.steps[0], mem), px + 1, py + 1, t - 2, t - 2);
      for (let k = 1; k < 4; k++) rect(ctx, col(C.steps[1], mem), px + 1, py + (k * t) / 4, t - 2, 2);
      break;
    }
    case 'ledge': {
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
  const info = OBJECT[o.kind][3];
  const W = o.w * t, H = o.h * t, cx = px + W / 2, cy = py + H / 2;
  const c = col(info.colour || '#888888', mem), dark = col('#1a1a1a', mem);
  const circle = (x0, y0, r, colour) => { ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(x0, y0, r, 0, Math.PI * 2); ctx.fill(); };
  const horiz = W >= H;
  switch (info.look) {
    case 'vehicle': {
      ctx.fillStyle = c; ctx.strokeStyle = dark; ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px + 3, py + 3, W - 6, H - 6, t * 0.3); else ctx.rect(px + 3, py + 3, W - 6, H - 6);
      ctx.fill(); ctx.stroke();
      const glass = col(info.wreck ? '#4a5a60' : C.glass, mem);
      // The windscreen at the front (east, or south when turned), the rest the body.
      if (horiz) {
        rect(ctx, glass, px + W - t * 0.9, py + t * 0.3, t * 0.3, H - t * 0.6);
        if (info.bed) rect(ctx, col('#2a2a2a', mem), px + t * 0.3, py + t * 0.35, W - t * 1.5, H - t * 0.7);
        else if (info.logs) for (let k = 0; k < 3; k++) circle(px + t * (0.6 + k * 0.9), cy, t * 0.35, col('#a8804a', mem));
        else rect(ctx, glass, px + t * 0.4, py + t * 0.3, t * 0.25, H - t * 0.6);
        if (info.wood) rect(ctx, col('#a8784a', mem), px + t * 0.8, py + H - t * 0.45, W - t * 2, t * 0.12);
      } else {
        rect(ctx, glass, px + t * 0.3, py + H - t * 0.9, W - t * 0.6, t * 0.3);
        if (info.bed) rect(ctx, col('#2a2a2a', mem), px + t * 0.35, py + t * 0.3, W - t * 0.7, H - t * 1.5);
        else rect(ctx, glass, px + t * 0.3, py + t * 0.4, W - t * 0.6, t * 0.25);
      }
      if (info.wreck) { ctx.strokeStyle = col('#2a1a10', mem); ctx.beginPath(); ctx.moveTo(px + t * 0.6, py + t * 0.4); ctx.lineTo(px + W * 0.5, cy); ctx.lineTo(px + W - t * 0.6, py + H - t * 0.4); ctx.stroke(); }
      break;
    }
    case 'canoe': {
      ctx.fillStyle = c; ctx.beginPath();
      if (horiz) ctx.ellipse(cx, cy, W * 0.46, H * 0.28, 0, 0, Math.PI * 2); else ctx.ellipse(cx, cy, W * 0.28, H * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'tree': {
      circle(cx, cy, Math.min(W, H) * 0.48, c);
      circle(px + W * 0.4, py + H * 0.38, Math.min(W, H) * 0.16, mem ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)');
      if (info.fruit) for (let k = 0; k < 3; k++) circle(px + W * (0.3 + 0.2 * k), py + H * (0.4 + 0.15 * (k & 1)), t * 0.06, col(info.fruit, mem));
      if (info.trunk) rect(ctx, col(info.trunk, mem), cx - t * 0.06, cy + t * 0.18, t * 0.12, t * 0.28);
      break;
    }
    case 'pine': {
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(cx, py + 1); ctx.lineTo(px + W - 2, py + H - 3); ctx.lineTo(px + 2, py + H - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col('#2e6a32', mem); ctx.beginPath();
      ctx.moveTo(cx, py + H * 0.2); ctx.lineTo(px + W * 0.78, py + H * 0.7); ctx.lineTo(px + W * 0.22, py + H * 0.7); ctx.closePath(); ctx.fill();
      break;
    }
    case 'shrub': {
      circle(cx - t * 0.12, cy + t * 0.05, t * 0.26, c); circle(cx + t * 0.14, cy - t * 0.04, t * 0.24, c);
      if (info.fruit) for (let k = 0; k < 4; k++) circle(px + t * (0.25 + 0.17 * k), py + t * (0.4 + 0.12 * (k & 1)), t * 0.05, col(info.fruit, mem));
      break;
    }
    case 'round': {
      circle(cx, cy, Math.min(W, H) * 0.36, c);
      ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.36, 0, Math.PI * 2); ctx.stroke();
      if (o.kind === O.STUMP) { ctx.beginPath(); ctx.arc(cx, cy, t * 0.18, 0, Math.PI * 2); ctx.stroke(); }
      if (o.kind === O.HAY) { rect(ctx, col('#b09040', mem), cx - t * 0.3, cy - 1, t * 0.6, 2); }
      break;
    }
    case 'logs': {
      for (let k = 0; k < 2 * o.w; k++) circle(px + t * 0.25 + k * t * 0.5, cy + ((k & 1) ? -t * 0.15 : t * 0.15), t * 0.2, c);
      break;
    }
    case 'box': {
      rect(ctx, c, px + 3, py + 3, W - 6, H - 6);
      ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.strokeRect(px + 3, py + 3, W - 6, H - 6);
      const m = info.mark;
      if (m === 'pump') { rect(ctx, col('#f0f0f0', mem), px + t * 0.3, py + t * 0.25, t * 0.4, t * 0.2); rect(ctx, dark, px + t * 0.72, py + t * 0.5, t * 0.12, t * 0.3); }
      if (m === 'phone') { rect(ctx, col('#2a4a8a', mem), px + 3, py + 3, W - 6, t * 0.22); rect(ctx, dark, px + t * 0.4, py + t * 0.45, t * 0.2, t * 0.3); }
      if (m === 'stove') { circle(cx, cy, t * 0.15, col('#d0601a', mem)); }
      if (m === 'moon') { circle(cx, py + t * 0.35, t * 0.1, col('#f0e0a0', mem)); }
      if (!m && W > H) for (let k = 1; k < o.w; k++) rect(ctx, dark, px + k * t, py + 3, 1, H - 6);
      break;
    }
    case 'post': {
      rect(ctx, c, cx - t * 0.06, py + t * 0.3, t * 0.12, t * 0.62);
      if (info.light) circle(cx, py + t * 0.25, t * 0.14, col('#f0e0a0', mem));
      else rect(ctx, c, cx - t * 0.22, py + t * 0.18, t * 0.44, t * 0.22);
      break;
    }
    case 'billboard': {
      rect(ctx, dark, px + t * 0.5, py + t * 0.6, 3, t * 0.4); rect(ctx, dark, px + W - t * 0.5, py + t * 0.6, 3, t * 0.4);
      rect(ctx, c, px + 2, py + t * 0.1, W - 4, t * 0.55);
      rect(ctx, col('#c03030', mem), px + t * 0.3, py + t * 0.25, W * 0.4, t * 0.1);
      break;
    }
    case 'flag': {
      rect(ctx, col('#c8c8c8', mem), cx - 1, py + 2, 2, t - 4);
      rect(ctx, c, cx + 1, py + 3, t * 0.34, t * 0.22);
      break;
    }
    case 'tent': {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx, py + 3); ctx.lineTo(px + W - 3, py + H - 3); ctx.lineTo(px + 3, py + H - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx, py + H * 0.45); ctx.lineTo(cx + t * 0.25, py + H - 3); ctx.lineTo(cx - t * 0.25, py + H - 3); ctx.closePath(); ctx.fill();
      break;
    }
    case 'fire': {
      ctx.strokeStyle = col('#7a7470', mem); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, t * 0.3, 0, Math.PI * 2); ctx.stroke();
      circle(cx, cy, t * 0.1, col('#3a2a1a', mem));
      break;
    }
    case 'crate': {
      rect(ctx, c, px + 3, py + 3, W - 6, H - 6);
      ctx.strokeStyle = col('#6a4a22', mem); ctx.lineWidth = 2; ctx.strokeRect(px + 3, py + 3, W - 6, H - 6);
      for (let k = 1; k < 3; k++) rect(ctx, col('#6a4a22', mem), px + 3, py + (k * H) / 3, W - 6, 2);
      break;
    }
    case 'bench': {
      if (horiz) { rect(ctx, c, px + 2, py + t * 0.3, W - 4, t * 0.14); rect(ctx, c, px + 2, py + t * 0.55, W - 4, t * 0.14); }
      else { rect(ctx, c, px + t * 0.3, py + 2, t * 0.14, H - 4); rect(ctx, c, px + t * 0.55, py + 2, t * 0.14, H - 4); }
      break;
    }
    case 'bed': {
      rect(ctx, col('#8a6a44', mem), px + 2, py + 2, W - 4, H - 4);
      rect(ctx, c, px + 4, py + (horiz ? 4 : t * 0.6), W - (horiz ? t * 0.6 : 8), H - (horiz ? 8 : t * 0.6 + 4));
      rect(ctx, col('#f0f0f0', mem), horiz ? px + W - t * 0.55 : px + 5, horiz ? py + 5 : py + 5, horiz ? t * 0.4 : W - 10, horiz ? H - 10 : t * 0.4);
      break;
    }
    case 'bath': {
      ctx.fillStyle = c; ctx.strokeStyle = col('#9a9a9a', mem); ctx.lineWidth = 2;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px + 3, py + 3, W - 6, H - 6, t * 0.25); else ctx.rect(px + 3, py + 3, W - 6, H - 6); ctx.fill(); ctx.stroke();
      rect(ctx, col('#bcd8e4', mem), px + 7, py + 7, W - 14, H - 14);
      break;
    }
    case 'furniture': {
      rect(ctx, c, px + 3, py + 3, W - 6, H - 6);
      rect(ctx, mem ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)', px + 3, py + 3, W - 6, 2);
      ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.strokeRect(px + 3, py + 3, W - 6, H - 6);
      break;
    }
    case 'sign': drawSign(ctx, (o.text || 'SIGN').slice(0, 10).toUpperCase(), px, py, t, mem); break;
    case 'fishing': {
      ctx.strokeStyle = col(C.fishing, mem); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, t * 0.3, 0, Math.PI * 2); ctx.stroke();
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
const MARK_LOOK = { [M.START]: ['@', null, '#000'], [M.ZOMBIE]: ['Z', 'rgba(0,0,0,0.5)', null], [M.LABEL]: ['L', '#1d2a6b', '#fff'],
  [M.LOOT]: ['$', '#1f7a3a', '#fff'], [M.KEYITEM]: ['K', '#8a5a10', '#fff'], [M.WRECKSPOT]: ['X', '#7a1f2b', '#fff'], [M.NPC]: ['N', '#5a3a8a', '#fff'] };
export function drawMarker(ctx, m, px, py, t) {
  const [glyph, bg, fg] = MARK_LOOK[m.kind] || ['?', '#333', '#fff'];
  rect(ctx, bg || CONFIG.colours.player, px + 2, py + 2, t - 4, t - 4);
  ctx.fillStyle = fg || CONFIG.colours.zombie;
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
void MARKER;

export const structName = s => STRUCT[s][2];
