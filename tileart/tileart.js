// The tile art builder (tileart/index.html): draw the game's tiles one by one as pixel art.
// The list of what's needed comes from the game's own data (catalogue.js). Each tile is
// 16 x 16 pixels per map tile (a car 48 x 32), with variants where a tile needs them. The art
// autosaves on the phone; Copy art gives the text that goes into the repo as art/tiles.json.
import { CONFIG } from '../src/config.js';
import { TILE } from '../src/sim/tiles.js';
import { createMap, S, O, G, ROOF, kinds, registerKind, forgetKind, freeChar, freeKey, cleanKind, KIND_LAYERS } from '../src/sim/map.js';
import { loadArt, useArt } from '../src/render/art.js';
import { drawTile } from '../src/render/tiles.js';
import { drawHeightAndStruct, drawObject, drawRoofTile } from '../src/render/layers.js';
import { PX, catalogue, emptyArt, encode, decode, serializeArt, parseArt, nearestColour, versionAt } from './catalogue.js';

const KEY = CONFIG.art.key;
const $ = id => document.getElementById(id);
// The art: the repo's art/tiles.json with this phone's autosave over it; its new kinds registered.
let art = await loadArt('../');
let items = catalogue();
let index = 0, variant = 0, version = 0;
let colour = 0;           // palette index (black, white, red); -1 = transparent (the eraser)
let tool = 'pencil', mirror = false, grid = true;
let zoom = 1, pan = { x: 0, y: 0 };
const undo = [], redo = [];

let saveTimer = 0;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, serializeArt(art)); } catch (e) { say('Not saved: storage full or blocked.'); } }, 250); }
let sayTimer = 0;
function say(t) { const el = $('status'); el.textContent = t; el.style.display = t ? 'block' : 'none'; clearTimeout(sayTimer); if (t) sayTimer = setTimeout(() => { el.style.display = 'none'; }, 2400); }

// --- The current tile's pixels ---------------------------------------------------------------------
const item = () => items[index];
// A tile's variants: the ones the game needs, then any Joe adds (+ Variant: a road corner, a
// fence end...). Each is a picture (older art may hold a few versions of one: shown as their own).
const vlist = (it = item()) => {
  const t = art.tiles[it.id], extra = t ? Object.keys(t.variants).filter(v => !it.variants.includes(v)) : [];
  return [...it.variants, ...extra];
};
const vname = () => vlist()[variant];
// The turned variant of an object is h x w.
const dimsOf = v => { const it = item(); const turned = v === 'turned'; return { w: (turned ? it.h : it.w) * PX, h: (turned ? it.w : it.h) * PX }; };
const dims = () => dimsOf(vname());
// The versions (duplicates) of the current variant: encoded pictures.
const versions = (v = vname()) => { const t = art.tiles[item().id]; return (t && t.variants[v]) || []; };
function pixels(v = vname(), k = version) {
  const { w, h } = dimsOf(v);
  const text = versions(v)[k];
  return text ? decode(text, w * h) : new Array(w * h).fill(-1);
}
function store(px) {
  const it = item();
  if (!art.tiles[it.id]) art.tiles[it.id] = { w: it.w, h: it.h, variants: {} };
  const list = art.tiles[it.id].variants[vname()] || (art.tiles[it.id].variants[vname()] = []);
  list[version] = encode(px);
  // An empty picture isn't kept (its version goes, unless it's the only one).
  if (px.every(p => p < 0)) { list.splice(version, 1); version = Math.max(0, Math.min(version, list.length - 1)); }
  if (!list.length) delete art.tiles[it.id].variants[vname()];
  if (!Object.keys(art.tiles[it.id].variants).length) delete art.tiles[it.id];
  save();
}
const isDone = it => !!(art.tiles[it.id] && Object.keys(art.tiles[it.id].variants).length);
function snapshot() { undo.push({ id: item().id, v: vname(), k: version, list: versions().slice() }); if (undo.length > 200) undo.shift(); redo.length = 0; }
function restore(from, to) {
  const e = from.pop();
  if (!e) return say(from === undo ? 'Nothing to undo.' : 'Nothing to redo.');
  const i = items.findIndex(q => q.id === e.id);
  if (i !== index || vname() !== e.v) { index = i; variant = Math.max(0, vlist().indexOf(e.v)); }
  to.push({ id: e.id, v: e.v, k: version, list: versions().slice() });
  const it = item();
  if (!art.tiles[it.id]) art.tiles[it.id] = { w: it.w, h: it.h, variants: {} };
  if (e.list.length) art.tiles[it.id].variants[e.v] = e.list.slice(); else delete art.tiles[it.id].variants[e.v];
  if (!Object.keys(art.tiles[it.id].variants).length) delete art.tiles[it.id];
  version = Math.min(e.k, Math.max(0, versions().length - 1));
  save(); refresh();
}

// --- Drawing on the pixels ---------------------------------------------------------------------------
let cur = null, stroke = null;
function setPx(px, x, y, c) {
  const { w, h } = dims();
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  px[y * w + x] = c;
  if (mirror) px[y * w + (w - 1 - x)] = c;
}
function fill(px, x, y, c) {
  const { w, h } = dims(), from = px[y * w + x];
  if (from === c) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h || px[cy * w + cx] !== from) continue;
    px[cy * w + cx] = c;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
function linePx(px, a, b, c) {
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPx(px, x0, y0, c);
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function rectPx(px, a, b, c) {
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
    if (x === a.x || x === b.x || y === a.y || y === b.y) setPx(px, x, y, c);
  }
}

// --- The editor canvas ---------------------------------------------------------------------------------
const cv = $('edit'), ctx = cv.getContext('2d');
let cell = 16;
function layoutCanvas() {
  const st = $('stage').getBoundingClientRect(), { w, h } = dims();
  const fit = Math.max(2, Math.floor(Math.min((st.width - 16) / w, (st.height - 16) / h)));
  cell = Math.max(2, Math.round(fit * zoom));
  cv.width = w * cell; cv.height = h * cell;
  cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  cv.style.left = Math.round((st.width - cv.width) / 2 + pan.x) + 'px';
  cv.style.top = Math.round((st.height - cv.height) / 2 + pan.y) + 'px';
}
function drawEditor() {
  const { w, h } = dims(), px = stroke ? stroke.px : pixels();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px[y * w + x];
    ctx.fillStyle = p < 0 ? (((x >> 1) + (y >> 1)) & 1 ? '#3a3a3a' : '#2a2a2a') : art.palette[p];
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  if (grid && cell >= 6) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x <= w; x++) ctx.fillRect(x * cell, 0, 1, h * cell);
    for (let y = 0; y <= h; y++) ctx.fillRect(0, y * cell, w * cell, 1);
    ctx.fillStyle = 'rgba(255,221,51,0.5)';   // the tile edges, for objects bigger than a tile
    for (let x = 0; x <= w; x += PX) ctx.fillRect(x * cell, 0, 1, h * cell);
    for (let y = 0; y <= h; y += PX) ctx.fillRect(0, y * cell, w * cell, 1);
    if (mirror) { ctx.fillStyle = 'rgba(255,80,80,0.6)'; ctx.fillRect((w / 2) * cell - 1, 0, 2, h * cell); }
  }
}
const pxAt = ev => { const r = cv.getBoundingClientRect(); return { x: Math.floor((ev.clientX - r.left) / cell), y: Math.floor((ev.clientY - r.top) / cell) }; };
const pointers = new Map();
let gesture = null;
cv.addEventListener('pointerdown', ev => {
  cv.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) { if (stroke) { stroke = null; drawEditor(); } gesture = { last: mid() }; return; }
  if (pointers.size > 2) return;
  const p = pxAt(ev);
  if (tool === 'pick') {
    const px = pixels(), { w } = dims(), c = px[p.y * w + p.x];
    if (c !== undefined) { colour = c; tool = 'pencil'; buildPalette(); buildTools(); say(c < 0 ? 'Picked: transparent.' : 'Picked a colour.'); }
    return;
  }
  stroke = { px: pixels(), start: p, last: p, base: null };
  const c = tool === 'erase' ? -1 : colour;
  if (tool === 'fill') fill(stroke.px, p.x, p.y, c);
  else if (tool === 'line' || tool === 'rect') { stroke.base = stroke.px.slice(); setPx(stroke.px, p.x, p.y, c); }
  else setPx(stroke.px, p.x, p.y, c);
  drawEditor();
});
const mid = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
cv.addEventListener('pointermove', ev => {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (gesture && pointers.size >= 2) { const m = mid(); pan.x += m.x - gesture.last.x; pan.y += m.y - gesture.last.y; gesture.last = m; layoutCanvas(); drawEditor(); return; }
  if (!stroke) return;
  const p = pxAt(ev), c = tool === 'erase' ? -1 : colour;
  if (p.x === stroke.last.x && p.y === stroke.last.y) return;
  if (tool === 'pencil' || tool === 'erase') linePx(stroke.px, stroke.last, p, c);
  else if (tool === 'line') { stroke.px = stroke.base.slice(); linePx(stroke.px, stroke.start, p, c); }
  else if (tool === 'rect') { stroke.px = stroke.base.slice(); rectPx(stroke.px, stroke.start, p, c); }
  stroke.last = p;
  drawEditor();
});
function up(ev) {
  pointers.delete(ev.pointerId);
  if (gesture) { if (!pointers.size) gesture = null; return; }
  if (!stroke) return;
  const px = stroke.px; stroke = null;
  snapshot(); store(px); refresh();
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', ev => { stroke = null; up(ev); });

// --- Previews: at size, tiled, in grey, on grass ---------------------------------------------------------
function paint(c2, px, w, h, scale, ox = 0, oy = 0, greyed = false) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = px[y * w + x];
    if (p < 0) continue;
    let hex = art.palette[p];
    if (greyed) { const n = parseInt(hex.slice(1), 16); const g = Math.round(18 + (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) * 0.36); hex = `rgb(${g},${g},${g})`; }
    c2.fillStyle = hex; c2.fillRect(ox + x * scale, oy + y * scale, scale, scale);
  }
}
function grassUnder(c2, w, h, scale) {
  const gs = art.tiles['ground:GRASS'] && art.tiles['ground:GRASS'].variants.main;
  for (let ty = 0; ty < h / PX; ty++) for (let tx = 0; tx < w / PX; tx++) {
    const g = gs && gs[versionAt(gs.length, tx, ty)];
    if (g) paint(c2, decode(g, PX * PX), PX, PX, scale, tx * PX * scale, ty * PX * scale);
    else { c2.fillStyle = CONFIG.colours.tiles.GRASS[0]; c2.fillRect(tx * PX * scale, ty * PX * scale, PX * scale, PX * scale); }
  }
}
function drawPreviews() {
  const el = $('previews'); el.innerHTML = '';
  const { w, h } = dims(), px = pixels();
  const fig = (label, cw, ch, fn) => {
    const f = document.createElement('figure'), c2 = document.createElement('canvas');
    c2.width = cw; c2.height = ch; const g = c2.getContext('2d'); g.imageSmoothingEnabled = false; fn(g);
    f.append(c2); f.append(label); el.append(f);
  };
  const s = w > PX * 2 ? 1 : 2;
  fig('size', w * s, h * s, g => paint(g, px, w, h, s));
  if (w === PX && h === PX) {
    fig('tiled', w * 4, h * 4, g => { for (let k = 0; k < 16; k++) paint(g, px, w, h, 1, (k % 4) * w, ((k / 4) | 0) * h); });
  }
  fig('remembered', w * s, h * s, g => { g.fillStyle = '#000'; g.fillRect(0, 0, w * s, h * s); paint(g, px, w, h, s, 0, 0, true); });
  if (!item().id.startsWith('ground:')) fig('on grass', w * s, h * s, g => { grassUnder(g, w, h, s); paint(g, px, w, h, s); });
}

// --- Start from the current look: the game's greybox drawing, traced into pixels --------------------------
const nearest = nearestColour;
function traceLook() {
  const it = item(), { w, h } = dims(), v = vname();
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const g = off.getContext('2d');
  const [kind, key] = it.id.split(':');
  const m = createMap(1, 1), W = m.w;
  const vert = /north-south/.test(v);
  if (kind === 'ground') drawTile(g, null, TILE[key], 0, 0, 0, 0, PX, false);
  else if (kind === 'struct') {
    const k = S[key], cx = 4, cy = 4;
    for (let d = -1; d <= 1; d++) m.struct[(vert ? cy + d : cy) * W + (vert ? cx : cx + d)] = k;
    if (/wall/.test(v)) { for (const d of [-1, 1]) m.struct[(vert ? cy + d : cy) * W + (vert ? cx : cx + d)] = S.WALL; }
    if (key === 'BRIDGE' || key === 'DOCK') m.ground[cy * W + cx] = G.WATER;
    if (key === 'LEDGE') { m.height[cy * W + cx] = 1; if (/south/.test(v)) m.height[(cy - 1) * W + cx] = 1; else { m.height[cy * W + cx - 1] = 1; } }
    drawHeightAndStruct(g, m, cx, cy, 0, 0, PX, false);
  } else if (kind === 'object') {
    drawObject(g, { kind: O[key], x: 0, y: 0, w: w / PX, h: h / PX, text: 'GAS' }, 0, 0, PX, false);
  } else if (kind === 'roof') {
    const cx = 4, cy = 4, k = ROOF.findIndex(e => e[1] === key);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m.roof[(cy + dy) * W + cx + dx] = k;
    if (/edge/.test(v)) m.roof[(cy + 1) * W + cx] = 0;
    drawRoofTile(g, m, cx, cy, 0, 0, PX, false);
  } else if (kind === 'height') {
    const cx = 4, cy = 4;
    if (/north/.test(v)) m.height[(cy - 1) * W + cx] = 1; else if (/east/.test(v)) m.height[cy * W + cx + 1] = 1; else m.height[(cy + 1) * W + cx] = 1;
    drawHeightAndStruct(g, m, cx, cy, 0, 0, PX, false);
  } else {
    const glyph = it.char || '?';
    const c = key === 'player' ? '#000' : key === 'zombie' ? CONFIG.colours.zombie : key === 'corpse' ? CONFIG.colours.corpse : (CONFIG.items[key] || {}).colour || '#fff';
    if (key === 'player') { g.fillStyle = CONFIG.colours.player; g.fillRect(1, 1, 14, 14); }
    g.fillStyle = c; g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 8, 9);
  }
  const d = g.getImageData(0, 0, w, h).data, px = new Array(w * h);
  for (let i = 0; i < w * h; i++) px[i] = d[i * 4 + 3] < 128 ? -1 : nearest(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  return px;
}

// --- The bars -----------------------------------------------------------------------------------------------
function refresh() {
  const it = item(), { w, h } = dims();
  $('title').textContent = `${isDone(it) ? '● ' : '○ '}${it.name}  (${it.group})`;
  const done = items.filter(isDone).length;
  $('info').textContent = `${it.char ? `'${it.char}'  ` : ''}${w} x ${h} px. ${it.notes}.   ${done} of ${items.length} drawn.`;
  $('kindRow').style.display = it.custom ? 'flex' : 'none';
  if (it.custom) $('kindNote').textContent = 'Your kind: in the map editor\'s lists.';
  // One row: every picture of this tile (its variants), + Variant to add one, Delete for the extras.
  if (variant >= vlist().length) { variant = Math.max(0, vlist().length - 1); version = 0; }
  const vr = $('variants'); vr.innerHTML = '';
  vlist().forEach((v, k) => {
    const n = Math.max(1, versions(v).length);
    for (let q = 0; q < n; q++) {
      const b = document.createElement('button');
      b.textContent = (versions(v)[q] ? '● ' : '○ ') + v + (q ? ` ${q + 1}` : '');
      if (k === variant && q === version) b.className = 'on';
      b.onclick = () => { variant = k; version = q; refresh(); }; vr.append(b);
    }
  });
  const add = document.createElement('button'); add.textContent = '+ Variant';
  add.onclick = () => {
    const px = pixels(); if (px.every(p => p < 0)) return say('Draw this one first: a new variant starts as a copy of it.');
    let name = prompt('Name the new variant (e.g. corner, end, edge north):', `variant ${vlist().length + 1}`);
    if (name === null) return;
    name = name.trim().slice(0, 24) || `variant ${vlist().length + 1}`;
    if (vlist().includes(name)) return say('That name is taken.');
    snapshot(); art.tiles[it.id].variants[name] = [encode(px)];
    variant = vlist().indexOf(name); version = 0; save(); refresh(); say(`New variant: ${name}. Change it.`);
  };
  vr.append(add);
  const extra = !it.variants.includes(vname()) || versions().length > 1;
  if (extra && versions().length) {
    const del = document.createElement('button'); del.textContent = 'Delete';
    del.onclick = () => {
      if (!confirm(`Delete ${vname()}${version ? ' ' + (version + 1) : ''}?`)) return;
      snapshot(); const t = art.tiles[it.id], v = vname();
      t.variants[v].splice(version, 1); if (!t.variants[v].length) delete t.variants[v];
      version = 0; variant = Math.min(variant, vlist().length - 1); save(); refresh();
    };
    vr.append(del);
  }
  layoutCanvas(); drawEditor(); drawPreviews();
}
function buildPalette() {
  const el = $('palette'); el.innerHTML = '';
  const add = (i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i < 0 ? ' clear' : '') + (colour === i ? ' on' : '');
    if (i >= 0) b.style.background = art.palette[i];
    b.title = i < 0 ? 'transparent' : art.palette[i];
    b.onclick = () => { colour = i; if (tool === 'erase' || tool === 'pick') tool = 'pencil'; buildPalette(); buildTools(); };
    el.append(b);
  };
  add(-1);
  art.palette.forEach((_, i) => add(i));
}
function buildTools() {
  const el = $('tools'); el.innerHTML = '';
  const add = (label, id, fn) => {
    const b = document.createElement('button'); b.textContent = label;
    if (id && (id === tool || (id === 'mirror' && mirror))) b.className = 'on';
    b.onclick = fn || (() => { tool = id; buildTools(); }); el.append(b);
  };
  add('Pencil', 'pencil'); add('Erase', 'erase'); add('Fill', 'fill'); add('Line', 'line'); add('Rect', 'rect'); add('Pick', 'pick');
  add('Mirror', 'mirror', () => { mirror = !mirror; buildTools(); drawEditor(); });
  add('↶', null, () => restore(undo, redo)); add('↷', null, () => restore(redo, undo));
  add('+', null, () => { zoom = Math.min(6, zoom * 1.4); refresh(); }); add('−', null, () => { zoom = Math.max(0.5, zoom / 1.4); if (zoom <= 1) pan = { x: 0, y: 0 }; refresh(); });
  add('☰', null, () => { $('menu').style.display = 'block'; });
}

// --- Moving through the list ---------------------------------------------------------------------------------
function go(i) { index = (i + items.length) % items.length; variant = 0; version = 0; zoom = 1; pan = { x: 0, y: 0 }; refresh(); }
$('prev').onclick = () => go(index - 1);
$('next').onclick = () => go(index + 1);
function nextTodo() {
  for (let k = 1; k <= items.length; k++) { const i = (index + k) % items.length; if (!isDone(items[i])) return go(i); }
  say('Every tile has art. Well done.');
}
// The list of every tile to make, by group, ticked off as they're drawn.
function openList() {
  const el = $('list'); el.innerHTML = '';
  const top = document.createElement('div');
  const h2 = document.createElement('h3'); h2.textContent = `Tiles to make: ${items.filter(isDone).length} of ${items.length} drawn`; top.append(h2);
  const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { el.style.display = 'none'; fn(); }; top.append(b); };
  mk('Next to do', nextTodo); mk('+ New tile or object', () => kindForm(null)); mk('Close', () => {});
  el.append(top);
  let group = null;
  items.forEach((it, i) => {
    if (it.group !== group) { group = it.group; const h3 = document.createElement('h3'); h3.textContent = `${group} (${items.filter(q => q.group === group && isDone(q)).length} / ${items.filter(q => q.group === group).length})`; el.append(h3); }
    const b = document.createElement('button'); b.className = isDone(it) ? 'done' : '';
    b.innerHTML = `<span class="dot"></span>${it.name}`;
    b.onclick = () => { el.style.display = 'none'; go(i); };
    el.append(b);
  });
  const close = document.createElement('button'); close.textContent = 'Close'; close.className = 'on'; close.style.display = 'block'; close.style.marginTop = '12px';
  close.onclick = () => { el.style.display = 'none'; }; el.append(close);
  el.scrollTop = 0;
  el.style.display = 'block';
}
$('title').onclick = openList;
$('listBtn').onclick = openList;

// --- The menu ------------------------------------------------------------------------------------------------------
$('close').onclick = () => { $('menu').style.display = 'none'; refresh(); };
const edit = fn => { const px = pixels(); snapshot(); fn(px); store(px); refresh(); };
$('fromLook').onclick = () => { snapshot(); store(traceLook()); $('menu').style.display = 'none'; refresh(); say('Traced from the game. Now make it yours.'); };
$('fromVariant').onclick = () => {
  const it = item();
  const other = vlist().find(v => v !== vname() && versions(v).length);
  if (!other) return say('No other variant drawn yet.');
  const { w, h } = dims(), so = dimsOf(other);
  const src = pixels(other, 0);
  let px;
  if (it.id.startsWith('roof:')) px = src.slice(0, w * h);   // middle and edge: the same way round
  else {
    // A different direction (east-west / north-south, main / turned): a quarter turn.
    px = new Array(w * h).fill(-1);
    for (let y = 0; y < so.h; y++) for (let x = 0; x < so.w; x++) { const nx = so.h - 1 - y, ny = x; if (nx < w && ny < h) px[ny * w + nx] = src[y * so.w + x]; }
  }
  snapshot(); store(px); $('menu').style.display = 'none'; refresh(); say(`Copied from ${other}${it.id.startsWith('roof:') ? '' : ', turned'}.`);
};
$('clear').onclick = () => { if (confirm('Clear this tile?')) { edit(px => px.fill(-1)); $('menu').style.display = 'none'; } };
for (const b of document.querySelectorAll('[data-shift]')) b.onclick = () => {
  const [dx, dy] = b.dataset.shift.split(',').map(Number), { w, h } = dims();
  edit(px => { const src = px.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[((y + dy + h) % h) * w + ((x + dx + w) % w)] = src[y * w + x]; });
};
$('flipH').onclick = () => { const { w, h } = dims(); edit(px => { const s = px.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = s[y * w + w - 1 - x]; }); };
$('flipV').onclick = () => { const { w, h } = dims(); edit(px => { const s = px.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = s[(h - 1 - y) * w + x]; }); };
$('grid').onclick = () => { grid = !grid; drawEditor(); };
$('copy').onclick = async () => {
  const text = serializeArt(art); $('text').value = text;
  try { await navigator.clipboard.writeText(text); say('Art copied.'); } catch (e) { $('text').select(); say('Copy it from the box.'); }
};
$('paste').onclick = async () => {
  let text = $('text').value;
  if (!text.trim()) { try { text = await navigator.clipboard.readText(); } catch (e) { /* use the box */ } }
  if (!text.trim()) return say('Paste the art into the box first.');
  try { art = parseArt(text); useArt(art); rebuildItems(); save(); buildPalette(); $('menu').style.display = 'none'; refresh(); say('Art pasted.'); } catch (e) { say(e.message); }
};
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serializeArt(art)], { type: 'application/json' }));
  a.download = 'tiles.json'; a.click();
};

// --- New kinds: ground, structures, objects and roofs of Joe's own ----------------------------------------
const GROUP_OF = { ground: 'Ground', struct: 'Structure', object: 'Object', roof: 'Roof' };
function rebuildItems(keepId) {
  const id = keepId || (items[index] && items[index].id);
  items = catalogue();
  const i = items.findIndex(q => q.id === id);
  index = i >= 0 ? i : Math.min(index, items.length - 1);
  variant = Math.min(variant, vlist().length - 1);
}
const syncKinds = () => { art.kinds = [...kinds.values()].map(cleanKind); };
// An object's pictures when its size changes: what fits is kept, from the top-left.
function resizeArt(id, w, h) {
  const t = art.tiles[id];
  if (!t || (t.w === w && t.h === h)) return;
  for (const [v, list] of Object.entries(t.variants)) {
    const turned = v === 'turned';
    const ow = (turned ? t.h : t.w) * PX, oh = (turned ? t.w : t.h) * PX, nw = (turned ? h : w) * PX, nh = (turned ? w : h) * PX;
    t.variants[v] = list.map(text => {
      const src = decode(text, ow * oh), out = new Array(nw * nh).fill(-1);
      for (let y = 0; y < Math.min(oh, nh); y++) for (let x = 0; x < Math.min(ow, nw); x++) out[y * nw + x] = src[y * ow + x];
      return encode(out);
    });
  }
  t.w = w; t.h = h;
}
function kindForm(existing) {
  const el = $('kindForm');
  const d = existing ? { ...existing } : { layer: 'object', name: '', w: 1, h: 1, blocks: true, opaque: false, step: '', type: 'plain', text: '' };
  const draw = () => {
    el.innerHTML = '';
    const h2 = document.createElement('h2'); h2.textContent = existing ? `Edit: ${existing.name}` : 'A new tile or object'; el.append(h2);
    const grp = (label) => { const g = document.createElement('div'); g.className = 'grp'; if (label) { const p = document.createElement('p'); p.innerHTML = label; g.append(p); } el.append(g); return g; };
    const btn = (g, label, on, fn) => { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; b.onclick = () => { fn(); draw(); }; g.append(b); return b; };
    if (!existing) {
      const g = grp('What is it?');
      btn(g, 'Ground', d.layer === 'ground', () => { d.layer = 'ground'; d.blocks = false; d.opaque = false; });
      btn(g, 'Structure', d.layer === 'struct', () => { d.layer = 'struct'; });
      btn(g, 'Object', d.layer === 'object', () => { d.layer = 'object'; });
      btn(g, 'Roof', d.layer === 'roof', () => { d.layer = 'roof'; });
      const p = document.createElement('p'); p.style.fontSize = '12px';
      p.textContent = { ground: 'What you walk on: fills the whole tile (grass, a floor, a road).', struct: 'One tile on top of the ground: walls, fences, doors, a bridge.',
        object: 'A thing with a footprint: a car, a tree, furniture.', roof: 'Covers a building; hidden while you\'re inside.' }[d.layer];
      g.append(p);
    }
    const gn = grp('Name (what the editor calls it):');
    const name = document.createElement('input'); name.type = 'text'; name.maxLength = 30; name.value = d.name; name.placeholder = 'e.g. hay wagon';
    name.oninput = () => { d.name = name.value; }; gn.append(name);
    if (d.layer === 'object') {
      const g = grp('Size in tiles (width x height):');
      const num = (f) => { const n = document.createElement('input'); n.type = 'number'; n.min = 1; n.max = 8; n.value = d[f]; n.oninput = () => { d[f] = Math.max(1, Math.min(8, n.value | 0 || 1)); }; return n; };
      g.append(num('w'), ' x ', num('h'));
    }
    if (d.layer !== 'roof') {
      const g = grp('Rules:');
      btn(g, d.blocks ? 'Blocks walking ✓' : 'Walkable', d.blocks, () => { d.blocks = !d.blocks; });
      btn(g, d.opaque ? 'Blocks sight ✓' : 'See-through', d.opaque, () => { d.opaque = !d.opaque; });
      const p = document.createElement('p'); p.style.fontSize = '12px'; p.textContent = 'Blocking sight also muffles noise.'; g.append(p);
    }
    if (d.layer === 'ground' || d.layer === 'struct') {
      const g = grp('Footsteps on it:');
      btn(g, 'Normal', !d.step, () => { d.step = ''; });
      btn(g, 'Loud (gravel)', d.step === 'loud', () => { d.step = 'loud'; });
      btn(g, 'Quiet (moss)', d.step === 'quiet', () => { d.step = 'quiet'; });
    }
    if (d.layer === 'struct') {
      const g = grp('What sort of structure?');
      btn(g, 'Plain', d.type === 'plain', () => { d.type = 'plain'; });
      btn(g, 'A wall (doors and windows go in it)', d.type === 'wall', () => { d.type = 'wall'; d.blocks = true; d.opaque = true; });
      btn(g, 'A fence (gates go in it)', d.type === 'fence', () => { d.type = 'fence'; d.blocks = true; });
      btn(g, 'Walk over anything (like a bridge)', d.type === 'over', () => { d.type = 'over'; d.blocks = false; });
    }
    const gt = grp('What a long-press says (30 letters at most, dry):');
    const text = document.createElement('input'); text.type = 'text'; text.maxLength = 30; text.value = d.text || ''; text.placeholder = 'e.g. A hay wagon. No horse.';
    text.oninput = () => { d.text = text.value; }; gt.append(text);
    const gb = grp('');
    btn(gb, existing ? 'Save' : 'Make it', true, () => {
      d.name = d.name.trim().toLowerCase(); d.text = (d.text || '').trim();
      if (!d.name) return say('Give it a name first.');
      if (!existing) {
        d.char = freeChar(d.layer); d.key = freeKey(d.layer, d.name);
        if (!d.char) return say(`No characters left for more ${GROUP_OF[d.layer].toLowerCase()} kinds.`);
      }
      const err = registerKind(d);
      if (err) return say(err);
      const id = `${d.layer}:${d.key}`;
      if (d.layer === 'object') resizeArt(id, d.w, d.h);
      syncKinds(); save();
      el.style.display = 'none';
      rebuildItems(id); variant = 0; version = 0; zoom = 1; pan = { x: 0, y: 0 }; refresh();
      say(existing ? 'Saved.' : `Made the ${d.name}. Now draw it.`);
    });
    btn(gb, 'Cancel', false, () => { el.style.display = 'none'; });
    if (existing) btn(gb, 'Delete this kind', false, () => {
      if (!confirm(`Delete the ${existing.name} and its art? Maps that use it keep their own copy.`)) return;
      const id = `${existing.layer}:${existing.key}`;
      forgetKind(id); delete art.tiles[id]; syncKinds(); save();
      el.style.display = 'none'; rebuildItems(); go(index); say('Deleted.');
    });
  };
  draw();
  el.style.display = 'block';
}
$('newKind2').onclick = () => { $('menu').style.display = 'none'; kindForm(null); };
$('editKind').onclick = () => { const [l, k] = item().id.split(':'); const d = kinds.get(`${l}:${k}`); if (d) kindForm(d); };
void KIND_LAYERS; void emptyArt;

// --- The board: put tiles down one by one, to see how they build up ----------------------------------------------
// An 11 x 15 screen. Each square takes a ground picture and one on top (a fence, a wall, an
// object, a roof: its transparent pixels show the ground). Place puts down exactly the tile and
// variant you're on; Edit jumps to the picture on a square. Kept on the phone.
const BOARD_KEY = 'zombie-tile-board', BW = CONFIG.screen.w, BH = CONFIG.screen.h;
let board = null, boardTool = 'place', boardT = 32;
function loadBoard() {
  try { const b = JSON.parse(localStorage.getItem(BOARD_KEY)); if (b && Array.isArray(b.cells) && b.cells.length === BW * BH) return b; } catch (e) { /* a new one */ }
  return { cells: Array.from({ length: BW * BH }, () => ({ g: null, t: null })) };
}
const saveBoard = () => { try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch (e) { /* not kept */ } };
// A stamp is [tile id, variant, version]. Undrawn pictures show the tile's name on grey.
function drawStamp(g, st, x, y, t) {
  const [id, v, k] = st, it = items.find(q => q.id === id);
  if (!it) return;
  const turned = v === 'turned', tw = (turned ? it.h : it.w), th = (turned ? it.w : it.h);
  const text = art.tiles[id] && art.tiles[id].variants[v] && art.tiles[id].variants[v][k];
  if (text) {
    const w = tw * PX, h = th * PX, px = decode(text, w * h), sc = t / PX;
    for (let i = 0; i < w * h; i++) { if (px[i] < 0) continue; g.fillStyle = art.palette[px[i]]; g.fillRect(x * t + (i % w) * sc, y * t + ((i / w) | 0) * sc, Math.ceil(sc), Math.ceil(sc)); }
  } else {
    g.fillStyle = '#555'; g.fillRect(x * t + 2, y * t + 2, tw * t - 4, th * t - 4);
    g.fillStyle = '#ddd'; g.font = `bold ${Math.floor(t * 0.28)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(it.name.slice(0, 8), x * t + (tw * t) / 2, y * t + (th * t) / 2);
  }
}
function drawBoard() {
  const c = $('boardCanvas'), box = $('boardStage').getBoundingClientRect();
  boardT = Math.max(8, Math.floor(Math.min(box.width / BW, box.height / BH)));
  const t = boardT; c.width = BW * t; c.height = BH * t; c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height);
  board.cells.forEach((cell, i) => { if (cell.g) drawStamp(g, cell.g, i % BW, (i / BW) | 0, t); });
  board.cells.forEach((cell, i) => { if (cell.t) drawStamp(g, cell.t, i % BW, (i / BW) | 0, t); });
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 1; x < BW; x++) g.fillRect(x * t, 0, 1, BH * t);
  for (let y = 1; y < BH; y++) g.fillRect(0, y * t, BW * t, 1);
}
function boardBar() {
  const el = $('boardBar'); el.innerHTML = '';
  const add = (label, on, fn) => { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; b.onclick = fn; el.append(b); };
  add(`Place: ${item().name}${vlist().length > 1 || version ? ` (${vname()}${version ? ' ' + (version + 1) : ''})` : ''}`, boardTool === 'place', () => { boardTool = 'place'; boardBar(); });
  add('Erase', boardTool === 'erase', () => { boardTool = 'erase'; boardBar(); });
  add('Edit', boardTool === 'edit', () => { boardTool = 'edit'; boardBar(); });
  add('Clear', false, () => { if (confirm('Clear the board?')) { board = loadBoard(); board.cells.forEach(c => { c.g = null; c.t = null; }); saveBoard(); drawBoard(); } });
  add('Done', true, () => { $('board').style.display = 'none'; refresh(); });
}
function openBoard() {
  if (!board) board = loadBoard();
  boardTool = 'place';
  $('board').style.display = 'flex';
  boardBar(); drawBoard();
}
function boardAt(ev, first) {
  const r = $('boardCanvas').getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / boardT), y = Math.floor((ev.clientY - r.top) / boardT);
  if (x < 0 || y < 0 || x >= BW || y >= BH) return;
  const cell = board.cells[y * BW + x], it = item();
  if (boardTool === 'edit') {
    if (!first) return;
    // The stamp on top, or one reaching over this square from up and left (a big object).
    let st = cell.t || cell.g;
    for (let i = 0; i < board.cells.length && !cell.t; i++) {
      const s2 = board.cells[i].t; if (!s2) continue;
      const o = items.find(q => q.id === s2[0]); if (!o) continue;
      const ox = i % BW, oy = (i / BW) | 0, turned = s2[1] === 'turned', w = turned ? o.h : o.w, h = turned ? o.w : o.h;
      if (x >= ox && x < ox + w && y >= oy && y < oy + h) st = s2;
    }
    if (!st) return say('Nothing there.');
    const n = items.findIndex(q => q.id === st[0]); if (n < 0) return;
    $('board').style.display = 'none';
    index = n; zoom = 1; pan = { x: 0, y: 0 };
    variant = Math.max(0, vlist().indexOf(st[1])); version = st[2] || 0; refresh();
    return;
  }
  if (boardTool === 'erase') { if (cell.t) cell.t = null; else cell.g = null; }
  else {
    if (!first && (it.w > 1 || it.h > 1)) return;   // big things: one per tap
    if (!/^(ground|struct|object|roof|creature|item):/.test(it.id) || it.id === 'height:cliff') { if (first) say("The cliff goes on the map's height, not the board."); return; }
    const st = [it.id, vname(), version];
    if (it.id.startsWith('ground:')) cell.g = st; else cell.t = st;
  }
  drawBoard();
}
let boardDown = false;
$('boardCanvas').addEventListener('pointerdown', ev => { $('boardCanvas').setPointerCapture(ev.pointerId); boardDown = true; boardAt(ev, true); });
$('boardCanvas').addEventListener('pointermove', ev => { if (boardDown) boardAt(ev, false); });
const boardUp = () => { if (boardDown) { boardDown = false; saveBoard(); } };
$('boardCanvas').addEventListener('pointerup', boardUp);
$('boardCanvas').addEventListener('pointercancel', boardUp);
$('boardBtn').onclick = openBoard;

window.addEventListener('resize', () => { refresh(); if ($('board').style.display === 'flex') drawBoard(); });
buildPalette(); buildTools(); refresh();
