// Joe's tile art, for the new kinds he makes in the tile art builder (tileart/). The game, the
// editor and the builder load it the same way: the repo's art/tiles.json, then the builder's
// autosave on this phone over it (the same site, so the same storage), and register the kinds it
// defines (map.js registerKind). The built-in kinds keep their greybox look until the art pass;
// a new kind is drawn from its pixels, or as a labelled placeholder until it has some.
import { CONFIG } from '../config.js';
import { registerKind, forgetKind, kinds } from '../sim/map.js';
import { parseArt, emptyArt, decode, versionAt, PALETTE, PX } from '../artdata.js';

let ART = emptyArt();
export const currentArt = () => ART;

// Merges art b over art a (b's tiles and kinds win).
export function mergeArt(a, b) {
  const out = emptyArt();
  out.tiles = { ...a.tiles, ...b.tiles };
  const ks = new Map();
  for (const d of [...a.kinds, ...b.kinds]) ks.set(`${d.layer}:${d.key}`, d);
  out.kinds = [...ks.values()];
  return out;
}
// Uses this art: registers its kinds. Returns the messages for any that couldn't be added.
export function useArt(art) {
  ART = art;
  cache.clear();
  const errs = [], keep = new Set(art.kinds.map(d => `${d.layer}:${d.key}`));
  for (const id of [...kinds.keys()]) if (!keep.has(id)) forgetKind(id);
  for (const d of art.kinds) { const e = registerKind(d); if (e) errs.push(e); }
  return errs;
}
// Loads the art (base: the site's root, relative to the page). Never throws.
export async function loadArt(base = './') {
  let repo = emptyArt(), local = null;
  try {
    const r = await fetch(`${base}${CONFIG.art.file}`, { cache: 'no-store' });
    if (r.ok) repo = parseArt(await r.text());
  } catch (e) { /* no art yet */ }
  try { const t = localStorage.getItem(CONFIG.art.key); if (t) local = parseArt(t); } catch (e) { /* storage blocked */ }
  useArt(local ? mergeArt(repo, local) : repo);
  return ART;
}

// --- Drawing -----------------------------------------------------------------------------------------
const cache = new Map();
const greyOf = hex => { const n = parseInt(hex.slice(1), 16); const g = Math.round(18 + (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) * 0.36); return `rgb(${g},${g},${g})`; };
function picture(id, variant, k, mem) {
  const ck = `${id}|${variant}|${k}|${mem ? 1 : 0}`;
  if (cache.has(ck)) return cache.get(ck);
  const t = ART.tiles[id], list = t && t.variants[variant];
  let out = null;
  if (list && list[k] && typeof document !== 'undefined') {
    const turned = variant === 'turned';
    const w = (turned ? t.h : t.w) * PX, h = (turned ? t.w : t.h) * PX;
    const px = decode(list[k], w * h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let i = 0; i < w * h; i++) {
      if (px[i] < 0) continue;
      const hex = PALETTE[px[i]] || '#ff00ff';
      g.fillStyle = mem ? greyOf(hex) : hex;
      g.fillRect(i % w, (i / w) | 0, 1, 1);
    }
    out = c;
  }
  cache.set(ck, out);
  return out;
}
// How many versions a tile's variant has.
export function versionsOf(id, variant) {
  const t = ART.tiles[id], list = t && t.variants[variant];
  return list ? list.length : 0;
}
// Draws a tile's art at (px, py), tw x th pixels; (x, y) picks the version. False if it has none.
export function drawArt(ctx, id, variant, x, y, px, py, tw, th, mem) {
  let n = versionsOf(id, variant);
  if (!n && variant !== 'main') { const t = ART.tiles[id]; const v = t && Object.keys(t.variants)[0]; if (v && variant !== 'turned') { variant = v; n = versionsOf(id, v); } }
  if (!n) return false;
  const pic = picture(id, variant, versionAt(n, x, y), mem);
  if (!pic) return false;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pic, Math.floor(px), Math.floor(py), Math.ceil(tw), Math.ceil(th));
  ctx.imageSmoothingEnabled = smooth;
  return true;
}

// A new kind with no art yet: a block in a colour from its key, with its first letter.
export function placeholderColour(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360},45%,45%)`;
}
export function drawPlaceholder(ctx, d, px, py, tw, th, mem) {
  const c = mem ? '#3a3a3a' : placeholderColour(d.key);
  ctx.fillStyle = c;
  if (d.layer === 'ground' || d.layer === 'roof') ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(tw), Math.ceil(th));
  else ctx.fillRect(Math.floor(px + 2), Math.floor(py + 2), Math.ceil(tw - 4), Math.ceil(th - 4));
  ctx.strokeStyle = mem ? '#222' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
  if (d.layer === 'roof') { for (let k = 1; k < 3; k++) ctx.fillRect(px, py + (k * th) / 3, tw, 1); return; }
  if (d.layer === 'ground') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + tw * 0.25, py + th * 0.3, 2, 2); ctx.fillRect(px + tw * 0.65, py + th * 0.7, 2, 2); return; }
  ctx.strokeRect(Math.floor(px + 2) + 0.5, Math.floor(py + 2) + 0.5, Math.ceil(tw - 4) - 1, Math.ceil(th - 4) - 1);
  ctx.fillStyle = mem ? '#777' : '#fff';
  ctx.font = `bold ${Math.floor(Math.min(tw, th) * 0.5)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(d.name[0].toUpperCase(), px + tw / 2, py + th / 2 + 1);
}
// A new kind: its art, else the placeholder.
export function drawKind(ctx, d, variant, x, y, px, py, tw, th, mem) {
  if (!drawArt(ctx, `${d.layer}:${d.key}`, variant, x, y, px, py, tw, th, mem)) drawPlaceholder(ctx, d, px, py, tw, th, mem);
}
