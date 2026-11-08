// What needs drawing: every tile, structure, object, roof, creature and item the game uses,
// built from the game's own data (so a new kind shows up here by itself). Pure: no DOM.
// Each entry: { id, group, name, char, w, h (in tiles), variants: [names], notes }.
import { CONFIG } from '../src/config.js';
import { TILE_INFO } from '../src/sim/tiles.js';
import { GROUND, STRUCT, OBJECT, ROOF } from '../src/sim/map.js';

export const PX = 16; // pixels per tile side

const T = Object.fromEntries(TILE_INFO.map(t => [t.key, t]));
const DIRECTIONAL = new Set(['rail', 'picket', 'chain', 'barbed', 'board', 'gate', 'guard', 'bridge', 'dock', 'tracks', 'hedge', 'stonewall']);

export function catalogue() {
  const out = [];
  for (const [c, k, name] of GROUND) {
    const t = T[k];
    const notes = [t.blocks ? 'blocks movement' : 'walkable', t.opaque ? 'blocks sight' : '', t.step ? `${t.step} footsteps` : '', 'fills the whole tile; should tile seamlessly'].filter(Boolean).join(', ');
    out.push({ id: `ground:${k}`, group: 'Ground', name, char: c, w: 1, h: 1, variants: ['main'], notes });
  }
  out.push({ id: 'height:cliff', group: 'Height', name: 'cliff face', char: '', w: 1, h: 1, variants: ['north face (tall)', 'east/west side', 'south lip'],
    notes: 'drawn over the lower tile wherever the next tile up is higher; leave the rest transparent' });
  for (const [c, k, name, info] of STRUCT.slice(1)) {
    let variants = ['main'];
    if (DIRECTIONAL.has(info.look)) variants = ['east-west', 'north-south'];
    else if (info.opening) variants = ['in an east-west wall', 'in a north-south wall'];
    else if (k === 'LEDGE') variants = ['drop to the south', 'drop to the east or west'];
    const notes = [info.blocks ? 'blocks movement' : 'walkable', info.opaque ? 'blocks sight' : 'see-through', info.wall ? 'a building wall (seen from above: draw the wall top and south face)' : '',
      info.pass ? 'over water or anything' : '', 'transparent pixels show the ground under it'].filter(Boolean).join(', ');
    out.push({ id: `struct:${k}`, group: 'Structures', name, char: c, w: 1, h: 1, variants, notes });
  }
  for (const [c, k, name, info] of OBJECT.slice(1)) {
    const variants = info.w !== info.h ? ['main', 'turned'] : ['main'];
    const notes = [`${info.w} x ${info.h} tiles`, info.blocks ? 'blocks movement' : 'walkable', info.opaque ? 'blocks sight' : 'see-through',
      variants.length > 1 ? `turned is ${info.h} x ${info.w}` : '', 'transparent pixels show the ground'].filter(Boolean).join(', ');
    out.push({ id: `object:${k}`, group: 'Objects', name, char: c, w: info.w, h: info.h, variants, notes });
  }
  for (const [c, k, name] of ROOF.slice(1)) {
    out.push({ id: `roof:${k}`, group: 'Roofs', name, char: c, w: 1, h: 1, variants: ['middle', 'edge (eaves)'], notes: 'covers a building; should tile seamlessly' });
  }
  out.push({ id: 'creature:player', group: 'Creatures and items', name: 'you', char: '@', w: 1, h: 1, variants: ['main'], notes: 'always on top; transparent background' });
  out.push({ id: 'creature:zombie', group: 'Creatures and items', name: 'zombie', char: 'Z', w: 1, h: 1, variants: ['main'], notes: 'the slow shambler; transparent background' });
  out.push({ id: 'creature:corpse', group: 'Creatures and items', name: 'zombie corpse', char: '%', w: 1, h: 1, variants: ['main'], notes: 'lies on the ground, walkable' });
  for (const [k, it] of Object.entries(CONFIG.items)) out.push({ id: `item:${k}`, group: 'Creatures and items', name: it.name, char: it.glyph, w: 1, h: 1, variants: ['main'], notes: 'an item lying on the ground; small, transparent background' });
  return out;
}

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
  return { version: 2, px: PX, palette: PALETTE.slice(), tiles: {} };
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
    tiles[id] = { w: t.w, h: t.h, variants: {} };
    const rowLen = t.w * art.px;
    for (const [v, versions] of Object.entries(t.variants)) {
      tiles[id].variants[v] = versions.map(text => {
        const rows = [];
        for (let i = 0; i < text.length; i += rowLen) rows.push(text.slice(i, i + rowLen));
        return rows;
      });
    }
  }
  return JSON.stringify({ version: art.version, px: art.px, palette: art.palette, tiles }, null, 1);
}
// Reads version 1 (one picture per variant, any palette) too: its colours are mapped to the three.
export function parseArt(text) {
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.palette) || typeof j.tiles !== 'object') throw new Error("That isn't tile art.");
  const art = emptyArt();
  art.px = j.px || PX;
  const same = j.palette.length === PALETTE.length && j.palette.every((c, i) => c.toLowerCase() === PALETTE[i]);
  const remap = j.palette.map(hex => { const n = parseInt(hex.slice(1), 16); return nearestColour(n >> 16, (n >> 8) & 255, n & 255); });
  const fix = str => (same ? str : [...str].map(ch => (ch === '.' ? '.' : CHARS[remap[CHARS.indexOf(ch)] ?? 0])).join(''));
  for (const [id, t] of Object.entries(j.tiles)) {
    art.tiles[id] = { w: t.w, h: t.h, variants: {} };
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
