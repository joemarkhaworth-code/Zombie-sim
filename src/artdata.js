// The tile art's format, shared by the tile art builder (tileart/), the map editor and the game.
// Pure: no DOM. The art text is JSON: the palette, the new kinds Joe has made (map.js
// registerKind), then per tile and variant a list of versions, each its rows of pixels.
import { cleanKind } from './sim/map.js';

export const PX = 16; // pixels per tile side

// --- Art data: a palette (hex colours) and, per tile and variant, one character per pixel ----------
// Characters index the palette: 0-9 a-z A-Z (62 colours); '.' is transparent.
export const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The palette (Joe): bright red, black and white only (plus transparent).
export const PALETTE = ['#000000', '#ffffff', '#ff0000'];

// The nearest of the three: reds stay red, then dark to black and light to white.
export function nearestColour(r, g, b) {
  if (r > 140 && r > g * 1.6 && r > b * 1.6) return 2;
  return 0.299 * r + 0.587 * g + 0.114 * b < 110 ? 0 : 1;
}

export function emptyArt() {
  return { version: 2, px: PX, palette: PALETTE.slice(), kinds: [], tiles: {} };
}

// Pixels (palette indices, -1 transparent) <-> the text.
export function encode(pixels) {
  return pixels.map(p => (p < 0 ? '.' : CHARS[p])).join('');
}
export function decode(text, n) {
  const out = new Array(n).fill(-1);
  for (let i = 0; i < n && i < text.length; i++) out[i] = text[i] === '.' ? -1 : CHARS.indexOf(text[i]);
  return out;
}

// The art file as text (copy and paste it; art/tiles.json in the repo). Each tile has its
// variants; each variant a list of versions (duplicates the game picks between, so a field of
// grass doesn't repeat); each version its rows of pixels, one line a row, so it reads as a picture.
export function serializeArt(art) {
  const tiles = {};
  for (const [id, t] of Object.entries(art.tiles)) {
    tiles[id] = { w: t.w, h: t.h, ...(t.connect ? { connect: true } : {}), variants: {} };
    const rowLen = t.w * art.px;
    for (const [v, versions] of Object.entries(t.variants)) {
      tiles[id].variants[v] = versions.map(text => {
        const rows = [];
        for (let i = 0; i < text.length; i += rowLen) rows.push(text.slice(i, i + rowLen));
        return rows;
      });
    }
  }
  return JSON.stringify({ version: art.version, px: art.px, palette: art.palette, kinds: (art.kinds || []).map(cleanKind).filter(Boolean), tiles }, null, 1);
}
// Reads version 1 (one picture per variant, any palette) too: its colours are mapped to the three.
export function parseArt(text) {
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.palette) || typeof j.tiles !== 'object') throw new Error("That isn't tile art.");
  const art = emptyArt();
  art.px = j.px || PX;
  art.kinds = (Array.isArray(j.kinds) ? j.kinds : []).map(cleanKind).filter(Boolean);
  const same = j.palette.length === PALETTE.length && j.palette.every((c, i) => c.toLowerCase() === PALETTE[i]);
  const remap = j.palette.map(hex => { const n = parseInt(hex.slice(1), 16); return nearestColour(n >> 16, (n >> 8) & 255, n & 255); });
  const fix = str => (same ? str : [...str].map(ch => (ch === '.' ? '.' : CHARS[remap[CHARS.indexOf(ch)] ?? 0])).join(''));
  for (const [id, t] of Object.entries(j.tiles)) {
    art.tiles[id] = { w: t.w, h: t.h, ...(t.connect ? { connect: true } : {}), variants: {} };
    for (const [v, val] of Object.entries(t.variants)) {
      // v2: [[rows...], [rows...]]; v1: [rows...] or a string.
      const versions = typeof val === 'string' ? [val] : Array.isArray(val[0]) ? val.map(r => r.join('')) : [val.join('')];
      art.tiles[id].variants[v] = versions.map(fix);
    }
  }
  return art;
}

// Which version the game draws at map tile (x, y): fixed per spot, so it never flickers.
export function versionAt(count, x, y) {
  return count <= 1 ? 0 : (((x * 73856093) ^ (y * 19349663)) >>> 0) % count;
}

// --- Pieces that join up (roads, paths, fences, fields, roofs) --------------------------------------
// A tile set to connect has 16 pieces, one for each mix of sides (N, E, S, W) that touch the same
// kind: on its own, an end, a straight, a corner, a T, a crossing, the middle of a wide area. Over
// those go 4 inner corners: where two sides join but the diagonal between them doesn't (the inside
// of a bend in a wide road). The piece names: 'j' + the sides that join ('j-' none, 'jNESW' all).
export const SIDES = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
export const pieceName = m => 'j' + (SIDES.filter((_, k) => (m >> k) & 1).map(s => s[0]).join('') || '-');
export const pieceMask = name => SIDES.reduce((m, [c], k) => (name.includes(c) ? m | (1 << k) : m), 0);
// In a sensible drawing order: the middle first, then edges, corners, straights, ends, T, alone.
export const PIECES = [15, 14, 13, 11, 7, 6, 12, 9, 3, 5, 10, 1, 2, 4, 8, 0].map(pieceName);
export const INNER = ['iNE', 'iSE', 'iSW', 'iNW'];
const CORNERS = [['iNE', 0, 1, 1, -1], ['iSE', 2, 1, 1, 1], ['iSW', 2, 3, -1, 1], ['iNW', 0, 3, -1, -1]];
// Which piece and inner corners a spot uses; same(dx, dy) says if that neighbour is the same kind.
export function piecesFor(same) {
  let m = 0;
  SIDES.forEach(([, dx, dy], k) => { if (same(dx, dy)) m |= 1 << k; });
  const inner = CORNERS.filter(([, a, b, dx, dy]) => (m >> a) & 1 && (m >> b) & 1 && !same(dx, dy)).map(c => c[0]);
  return { piece: pieceName(m), inner };
}
// A piece turned a quarter clockwise (N becomes E...), and its pixels the same way.
export function turnPiece(name) {
  if (name.startsWith('i')) return INNER[(INNER.indexOf(name) + 1) % 4];
  const m = pieceMask(name);
  return pieceName(((m << 1) | (m >> 3)) & 15);
}
export function turnPixels(px, n) {
  const out = new Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x * n + (n - 1 - y)] = px[y * n + x];
  return out;
}
