// The tile art builder (tileart/index.html): draw the game's tiles one by one as pixel art.
// The list of what's needed comes from the game's own data (catalogue.js). Each tile is
// 16 x 16 pixels per map tile (a car 48 x 32), with variants where a tile needs them. The art
// autosaves on the phone; Copy art gives the text that goes into the repo as art/tiles.json.
import { CONFIG } from '../src/config.js';
import { TILE } from '../src/sim/tiles.js';
import { createMap, S, O, G } from '../src/sim/map.js';
import { drawTile } from '../src/render/tiles.js';
import { drawHeightAndStruct, drawObject, drawRoofTile } from '../src/render/layers.js';
import { PX, catalogue, emptyArt, encode, decode, serializeArt, parseArt } from './catalogue.js';

const KEY = 'zombie-tile-art';
const $ = id => document.getElementById(id);
const items = catalogue();
let art = load() || emptyArt();
let index = 0, variant = 0;
let colour = 7;           // palette index; -1 = transparent (the eraser)
let tool = 'pencil', mirror = false, grid = true;
let zoom = 1, pan = { x: 0, y: 0 };
const undo = [], redo = [];

function load() { try { const t = localStorage.getItem(KEY); return t ? parseArt(t) : null; } catch (e) { return null; } }
let saveTimer = 0;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, serializeArt(art)); } catch (e) { say('Not saved: storage full or blocked.'); } }, 250); }
let sayTimer = 0;
function say(t) { const el = $('status'); el.textContent = t; el.style.display = t ? 'block' : 'none'; clearTimeout(sayTimer); if (t) sayTimer = setTimeout(() => { el.style.display = 'none'; }, 2400); }

// --- The current tile's pixels ---------------------------------------------------------------------
const item = () => items[index];
const vname = () => item().variants[variant];
// The turned variant of an object is h x w.
const dimsOf = v => { const it = item(); const turned = v === 'turned'; return { w: (turned ? it.h : it.w) * PX, h: (turned ? it.w : it.h) * PX }; };
const dims = () => dimsOf(vname());
function pixels() {
  const it = item(), { w, h } = dims();
  const t = art.tiles[it.id];
  const text = t && t.variants[vname()];
  return text ? decode(text, w * h) : new Array(w * h).fill(-1);
}
function store(px) {
  const it = item();
  if (!art.tiles[it.id]) art.tiles[it.id] = { w: it.w, h: it.h, variants: {} };
  if (px.every(p => p < 0)) delete art.tiles[it.id].variants[vname()];
  else art.tiles[it.id].variants[vname()] = encode(px);
  if (!Object.keys(art.tiles[it.id].variants).length) delete art.tiles[it.id];
  save();
}
const isDone = it => !!(art.tiles[it.id] && Object.keys(art.tiles[it.id].variants).length);
function snapshot() { undo.push({ id: item().id, v: vname(), px: pixels() }); if (undo.length > 200) undo.shift(); redo.length = 0; }
function restore(from, to) {
  const e = from.pop();
  if (!e) return say(from === undo ? 'Nothing to undo.' : 'Nothing to redo.');
  const i = items.findIndex(q => q.id === e.id);
  if (i !== index || vname() !== e.v) { index = i; variant = Math.max(0, item().variants.indexOf(e.v)); }
  to.push({ id: e.id, v: e.v, px: pixels() });
  store(e.px); refresh();
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
  const g = art.tiles['ground:GRASS'] && art.tiles['ground:GRASS'].variants.main;
  for (let ty = 0; ty < h / PX; ty++) for (let tx = 0; tx < w / PX; tx++) {
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
  if (w === PX && h === PX) fig('tiled', w * 3, h * 3, g => { for (let k = 0; k < 9; k++) paint(g, px, w, h, 1, (k % 3) * w, ((k / 3) | 0) * h); });
  fig('remembered', w * s, h * s, g => { g.fillStyle = '#000'; g.fillRect(0, 0, w * s, h * s); paint(g, px, w, h, s, 0, 0, true); });
  if (!item().id.startsWith('ground:')) fig('on grass', w * s, h * s, g => { grassUnder(g, w, h, s); paint(g, px, w, h, s); });
}

// --- Start from the current look: the game's greybox drawing, traced into pixels --------------------------
function nearest(r, g, b) {
  let best = 0, bd = Infinity;
  art.palette.forEach((hex, i) => {
    const n = parseInt(hex.slice(1), 16), d = (r - (n >> 16)) ** 2 + (g - ((n >> 8) & 255)) ** 2 + (b - (n & 255)) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
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
    const cx = 4, cy = 4, k = ['', 'RED', 'SLATE', 'BROWN', 'GREEN', 'TIN', 'WHITE'].indexOf(key);
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
  const vr = $('variants'); vr.innerHTML = '';
  if (it.variants.length > 1) it.variants.forEach((v, k) => {
    const b = document.createElement('button');
    const has = art.tiles[it.id] && art.tiles[it.id].variants[v];
    b.textContent = (has ? '● ' : '○ ') + v; if (k === variant) b.className = 'on';
    b.onclick = () => { variant = k; refresh(); }; vr.append(b);
  });
  vr.style.display = it.variants.length > 1 ? 'flex' : 'none';
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
  const picker = document.createElement('input'); picker.type = 'color'; picker.style.display = 'none';
  const edit = document.createElement('button'); edit.textContent = 'Edit';
  edit.onclick = () => { if (colour < 0) return say('Pick a colour to edit.'); picker.value = art.palette[colour]; picker.oninput = () => { art.palette[colour] = picker.value; save(); buildPalette(); refresh(); }; picker.click(); };
  const plus = document.createElement('button'); plus.textContent = '+ Colour';
  plus.onclick = () => { if (art.palette.length >= 62) return say('The palette is full (62).'); picker.value = '#888888'; picker.oninput = null; picker.onchange = () => { art.palette.push(picker.value); colour = art.palette.length - 1; picker.onchange = null; save(); buildPalette(); }; picker.click(); };
  el.append(edit, plus, picker);
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
function go(i) { index = (i + items.length) % items.length; variant = 0; zoom = 1; pan = { x: 0, y: 0 }; refresh(); }
$('prev').onclick = () => go(index - 1);
$('next').onclick = () => go(index + 1);
$('nextTodo').onclick = () => {
  for (let k = 1; k <= items.length; k++) { const i = (index + k) % items.length; if (!isDone(items[i])) return go(i); }
  say('Every tile has art. Well done.');
};
$('title').onclick = () => {
  const el = $('list'); el.innerHTML = '';
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
  el.style.display = 'block';
};

// --- The menu ------------------------------------------------------------------------------------------------------
$('close').onclick = () => { $('menu').style.display = 'none'; refresh(); };
const edit = fn => { const px = pixels(); snapshot(); fn(px); store(px); refresh(); };
$('fromLook').onclick = () => { snapshot(); store(traceLook()); $('menu').style.display = 'none'; refresh(); say('Traced from the game. Now make it yours.'); };
$('fromVariant').onclick = () => {
  const it = item();
  const other = it.variants.find(v => v !== vname() && art.tiles[it.id] && art.tiles[it.id].variants[v]);
  if (!other) return say('No other variant drawn yet.');
  const { w, h } = dims(), so = dimsOf(other);
  const src = decode(art.tiles[it.id].variants[other], so.w * so.h);
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
  try { art = parseArt(text); save(); buildPalette(); $('menu').style.display = 'none'; refresh(); say('Art pasted.'); } catch (e) { say(e.message); }
};
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serializeArt(art)], { type: 'application/json' }));
  a.download = 'tiles.json'; a.click();
};

window.addEventListener('resize', refresh);
buildPalette(); buildTools(); refresh();
