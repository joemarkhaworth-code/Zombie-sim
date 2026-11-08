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

// A starting palette: PICO-8's sixteen, then earthy Maine tones.
export const DEFAULT_PALETTE = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
  '#2a4d22', '#4e7a32', '#7a9a4a', '#a89a52', '#8e7a58', '#6a4a2a', '#3a2a1a', '#8a847c',
  '#c8b890', '#a8463a', '#e8e4d8', '#5c636b', '#2f62a8', '#c05a28', '#d8b860', '#1e4418',
];

export function emptyArt() {
  return { version: 1, px: PX, palette: DEFAULT_PALETTE.slice(), tiles: {} };
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

// The art file as text (copy and paste it; art/tiles.json in the repo). Rows of pixels are
// split into lines so it reads as a picture.
export function serializeArt(art) {
  const tiles = {};
  for (const [id, t] of Object.entries(art.tiles)) {
    tiles[id] = { w: t.w, h: t.h, variants: {} };
    for (const [v, text] of Object.entries(t.variants)) {
      const rowLen = t.w * art.px, rows = [];
      for (let i = 0; i < text.length; i += rowLen) rows.push(text.slice(i, i + rowLen));
      tiles[id].variants[v] = rows;
    }
  }
  return JSON.stringify({ version: art.version, px: art.px, palette: art.palette, tiles }, null, 1);
}
export function parseArt(text) {
  const j = JSON.parse(text);
  if (!j || !Array.isArray(j.palette) || typeof j.tiles !== 'object') throw new Error("That isn't tile art.");
  const art = { version: j.version || 1, px: j.px || PX, palette: j.palette, tiles: {} };
  for (const [id, t] of Object.entries(j.tiles)) {
    art.tiles[id] = { w: t.w, h: t.h, variants: {} };
    for (const [v, rows] of Object.entries(t.variants)) art.tiles[id].variants[v] = Array.isArray(rows) ? rows.join('') : rows;
  }
  return art;
}
