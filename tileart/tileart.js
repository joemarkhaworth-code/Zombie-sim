// The tile art builder (tileart/index.html): draw the game's tiles one by one as pixel art.
// The list of what's needed comes from the game's own data (catalogue.js). Each tile is
// 16 x 16 pixels per map tile (a car 48 x 32), with variants where a tile needs them. The art
// autosaves on the phone; Copy art gives the text that goes into the repo as art/tiles.json.
import { CONFIG } from '../src/config.js';
import { TILE } from '../src/sim/tiles.js';
import { createMap, S, O, G, ROOF, kinds, registerKind, forgetKind, freeChar, freeKey, cleanKind, KIND_LAYERS } from '../src/sim/map.js';
import { loadArt, useArt, artChanged, drawTileArt, pieceAt } from '../src/render/art.js';
import { PIECES, INNER, pieceMask, turnPiece, turnPixels } from '../src/artdata.js';
import { GROUND, STRUCT, OBJECT, groundTile, parseMap, serializeMap, placeObject, removeObject, objectAt } from '../src/sim/map.js';
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
function save() { artChanged(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, serializeArt(art)); } catch (e) { say('Not saved: storage full or blocked.'); } }, 250); }
let sayTimer = 0;
function say(t) { const el = $('status'); el.textContent = t; el.style.display = t ? 'block' : 'none'; clearTimeout(sayTimer); if (t) sayTimer = setTimeout(() => { el.style.display = 'none'; }, 2400); }

// --- The current tile's pixels ---------------------------------------------------------------------
const item = () => items[index];
// A ground, structure or roof tile can be set to join up: then its variants are the 16 pieces and
// 4 inner corners (artdata.js), picked by its neighbours.
const canConnect = it => /^(ground|struct|roof):/.test(it.id) && it.w === 1 && it.h === 1;
const connected = (it = item()) => canConnect(it) && !!(art.tiles[it.id] && art.tiles[it.id].connect);
const vlist = (it = item()) => (connected(it) ? [...PIECES, ...INNER] : it.variants);
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
  if (!Object.keys(art.tiles[it.id].variants).length && !art.tiles[it.id].connect) delete art.tiles[it.id];
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
  if (!Object.keys(art.tiles[it.id].variants).length && !art.tiles[it.id].connect) delete art.tiles[it.id];
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
const it0 = () => item();
function drawPreviews() {
  const el = $('previews'); el.innerHTML = '';
  const { w, h } = dims(), px = pixels();
  const fig = (label, cw, ch, fn) => {
    const f = document.createElement('figure'), c2 = document.createElement('canvas');
    c2.width = cw; c2.height = ch; const g = c2.getContext('2d'); g.imageSmoothingEnabled = false; fn(g);
    f.append(c2); f.append(label); el.append(f);
  };
  const tryB = document.createElement('button'); tryB.textContent = 'Try it ▶'; tryB.style.cssText = 'height:56px;align-self:center';
  tryB.title = 'Paint a screen with your tiles and see how they work together'; tryB.onclick = openTry; el.append(tryB);
  const s = w > PX * 2 ? 1 : 2;
  fig('size', w * s, h * s, g => paint(g, px, w, h, s));
  if (connected()) {
    // A little plan with every way of joining: a wide area, a straight, corners, a T, a crossing, ends.
    const plan = ['.........', '.####....', '.#######.', '.####..#.', '...#...#.', '.#####.#.', '...#..##.', '.........'];
    const on = (x, y) => y >= 0 && y < plan.length && x >= 0 && x < plan[0].length && plan[y][x] === '#';
    fig('joined up', 9 * PX, 8 * PX, g => {
      grassUnder(g, 9 * PX, 8 * PX, 1);
      for (let y = 0; y < plan.length; y++) for (let x = 0; x < plan[0].length; x++) {
        if (on(x, y)) drawTileArt(g, it0().id, 'main', x, y, x * PX, y * PX, PX, PX, false, (dx, dy) => on(x + dx, y + dy));
      }
    });
  } else if (w === PX && h === PX) {
    const vs = versions().map(t => decode(t, w * h));
    if (!vs.length) vs.push(px);
    vs[version] = px;
    fig(vs.length > 1 ? `tiled, ${vs.length} versions mixed` : 'tiled', w * 4, h * 4, g => {
      for (let k = 0; k < 16; k++) { const tx = k % 4, ty = (k / 4) | 0; paint(g, vs[versionAt(vs.length, tx, ty)], w, h, 1, tx * w, ty * h); }
    });
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
  const nv = versions().length;
  $('info').textContent = `${it.char ? `'${it.char}'  ` : ''}${w} x ${h} px${nv > 1 ? `, ${nv} versions` : ''}. ${it.notes}.   ${done} of ${items.length} drawn.`;
  $('kindRow').style.display = it.custom ? 'flex' : 'none';
  if (it.custom) $('kindNote').textContent = 'Your kind: in the map editor\'s lists.';
  const vr = $('variants'); vr.innerHTML = '';
  const vl = vlist();
  if (vl.length > 1) vl.forEach((v, k) => {
    const b = document.createElement('button');
    const has = versions(v).length;
    if (connected()) { b.append(pieceIcon(v)); b.title = pieceLabel(v); b.style.padding = '0 4px'; }
    else b.textContent = (has ? '● ' : '○ ') + v;
    if (k === variant) b.className = 'on';
    b.onclick = () => { variant = k; version = 0; refresh(); }; vr.append(b);
  });
  vr.style.display = vl.length > 1 ? 'flex' : 'none';
  // Joining up: a switch, and helpers to fill the pieces.
  const cr = $('connRow'); cr.innerHTML = '';
  cr.style.display = canConnect(it) ? 'flex' : 'none';
  if (canConnect(it)) {
    const on = connected();
    const b = document.createElement('button'); b.textContent = on ? 'Joins up: on' : 'Joins up: off'; if (on) b.className = 'on';
    b.onclick = () => toggleConnect(); cr.append(b);
    if (on) {
      const t1 = document.createElement('button'); t1.textContent = 'Turn copies'; t1.onclick = turnCopies; cr.append(t1);
      const t2 = document.createElement('button'); t2.textContent = 'Fill empty pieces'; t2.onclick = fillEmpty; cr.append(t2);
      const n = document.createElement('span'); n.style.cssText = 'color:#aab;font-size:12px;white-space:nowrap';
      n.textContent = `${pieceLabel(vname())}. ${vl.filter(v => versions(v).length).length} of 20 drawn.`; cr.append(n);
    }
  }
  // Versions: duplicates to change a little, so the map doesn't repeat.
  const vs = $('versions'); vs.innerHTML = '';
  const n = Math.max(1, versions().length);
  for (let k = 0; k < n; k++) {
    const b = document.createElement('button'); b.textContent = `#${k + 1}`; if (k === version) b.className = 'on';
    b.onclick = () => { version = k; refresh(); }; vs.append(b);
  }
  const dup = document.createElement('button'); dup.textContent = '+ Duplicate';
  dup.onclick = () => {
    const px = pixels(); if (px.every(p => p < 0)) return say('Draw this one first, then duplicate it.');
    snapshot(); const list = art.tiles[it.id].variants[vname()]; list.splice(version + 1, 0, encode(px)); version++; save(); refresh();
    say(`Version #${version + 1}: change it a little.`);
  };
  vs.append(dup);
  if (versions().length > 1) {
    const del = document.createElement('button'); del.textContent = 'Delete #' + (version + 1);
    del.onclick = () => { if (!confirm(`Delete version #${version + 1}?`)) return; snapshot(); versions().splice(version, 1); version = Math.max(0, version - 1); save(); refresh(); };
    vs.append(del);
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
$('newKind').onclick = () => kindForm(null);
$('newKind2').onclick = () => { $('menu').style.display = 'none'; kindForm(null); };
$('editKind').onclick = () => { const [l, k] = item().id.split(':'); const d = kinds.get(`${l}:${k}`); if (d) kindForm(d); };
void KIND_LAYERS; void emptyArt;

// --- Joining up ------------------------------------------------------------------------------------------------
const SIDE_WORD = { N: 'north', E: 'east', S: 'south', W: 'west' };
function pieceLabel(v) {
  if (!v) return '';
  if (v.startsWith('i')) return `inner corner, ${v.slice(1)} (drawn over the piece)`;
  const sides = v.slice(1) === '-' ? [] : [...v.slice(1)];
  const k = sides.length;
  if (k === 0) return 'on its own';
  if (k === 4) return 'the middle: joins all four sides';
  const w = sides.map(c => SIDE_WORD[c]);
  if (k === 1) return `an end: joins ${w[0]}`;
  if (k === 2) return (v === 'jNS' || v === 'jEW') ? `a straight: ${w.join('-')}` : `a corner: joins ${w.join(' and ')}`;
  const open = Object.keys(SIDE_WORD).find(c => !sides.includes(c));
  return `a T, or the ${SIDE_WORD[open]} edge of a wide area`;
}
// A small picture of a piece: its art if drawn, else which sides join.
function pieceIcon(v) {
  const c = document.createElement('canvas'); c.width = 24; c.height = 24; c.style.cssText = 'width:24px;height:24px;image-rendering:pixelated;display:block';
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const list = versions(v);
  if (list.length) { const px = decode(list[0], PX * PX); g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 24, 24); paint(g, px, PX, PX, 1.5); return c; }
  g.fillStyle = '#333'; g.fillRect(0, 0, 24, 24);
  g.fillStyle = '#777';
  if (v.startsWith('i')) {
    g.fillRect(0, 0, 24, 24); g.fillStyle = '#333';
    const cx = v.includes('E') ? 18 : 0, cy = v.includes('S') ? 18 : 0; g.fillRect(cx, cy, 6, 6);
    return c;
  }
  const m = pieceMask(v);
  g.fillRect(8, 8, 8, 8);
  if (m & 1) g.fillRect(8, 0, 8, 8);
  if (m & 2) g.fillRect(16, 8, 8, 8);
  if (m & 4) g.fillRect(8, 16, 8, 8);
  if (m & 8) g.fillRect(0, 8, 8, 8);
  return c;
}
function toggleConnect() {
  const it = item();
  if (!art.tiles[it.id]) art.tiles[it.id] = { w: 1, h: 1, variants: {} };
  const t = art.tiles[it.id];
  snapshot();
  if (t.connect) { delete t.connect; if (!Object.keys(t.variants).length) delete art.tiles[it.id]; variant = 0; say('Joins up: off. One picture again.'); }
  else {
    t.connect = true;
    // Start the middle piece from the plain picture, if there is one.
    const plain = t.variants[it.variants[0]];
    if (plain && plain.length && !(t.variants.jNESW && t.variants.jNESW.length)) t.variants.jNESW = plain.slice();
    variant = 0; say('Joins up: draw the middle first, then the edges and ends.');
  }
  version = 0; save(); refresh();
}
// Fills the empty pieces you get by turning this one (an end north makes the ends east, south
// and west; a corner makes the other corners).
function turnCopies() {
  const v = vname(), list = versions(v);
  if (!list.length) return say('Draw this piece first.');
  snapshot();
  const t = art.tiles[item().id];
  const turns = [];
  let px = list.map(x => decode(x, PX * PX)), name = v;
  for (let k = 0; k < 3; k++) { name = turnPiece(name); px = px.map(p => turnPixels(p, PX)); if (name !== v && !turns.some(q => q[0] === name)) turns.push([name, px]); }
  const empty = turns.filter(([n]) => !(t.variants[n] && t.variants[n].length));
  const todo = empty.length ? empty : turns.length && confirm('The turned pieces are drawn already. Replace them with this one turned?') ? turns : [];
  for (const [n, p2] of todo) t.variants[n] = p2.map(encode);
  const made = todo.length;
  save(); refresh();
  say(made ? `Made ${made} turned piece${made > 1 ? 's' : ''}. Check them: light from the top won't turn.` : 'Nothing turned.');
}
function fillEmpty() {
  const list = versions();
  if (!list.length) return say('Draw this piece first.');
  snapshot();
  const t = art.tiles[item().id];
  let made = 0;
  for (const v of PIECES) if (!(t.variants[v] && t.variants[v].length)) { t.variants[v] = list.slice(); made++; }
  save(); refresh(); say(made ? `Copied into ${made} empty pieces: now change their edges.` : 'Every piece is drawn.');
}

// --- Try it: a screen to paint with your tiles, to see how they work together ---------------------------------
// Drawn the way the game will draw them: art where there is some (pieces that join up picked by
// their neighbours), else the game's current look.
const TRY_KEY = 'zombie-tile-try';
let tryMap = null, tryTool = 'paint';
function loadTry() {
  try { const t = localStorage.getItem(TRY_KEY); if (t) return parseMap(t); } catch (e) { /* a fresh one */ }
  return createMap(1, 1);
}
const saveTry = () => { try { localStorage.setItem(TRY_KEY, serializeMap(tryMap)); } catch (e) { /* not kept */ } };
const tryCv = () => $('tryCanvas');
let tryT = 32;
function tryJoins(layer, m, i, j) {
  const a = m[layer][i], b = m[layer][j];
  if (layer !== 'struct') return a === b;
  const ia = STRUCT[a][3], ib = STRUCT[b][3];
  return a === b || (ia.wall && (ib.wall || ib.opening)) || (ia.fence && (ib.fence || STRUCT[b][1] === 'GATE'));
}
const sameFn = (layer, x, y) => (dx, dy) => {
  const nx = x + dx, ny = y + dy, m = tryMap;
  if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return layer !== 'roof';
  return tryJoins(layer, m, y * m.w + x, ny * m.w + nx);
};
function variantFor(id, layer, x, y) {
  const it = items.find(q => q.id === id); if (!it) return 'main';
  if (layer === 'roof') return y + 1 < tryMap.h && tryMap.roof[(y + 1) * tryMap.w + x] ? 'middle' : 'edge (eaves)';
  if (it.variants.includes('north-south')) { const s = sameFn(layer, x, y); return (s(0, -1) || s(0, 1)) && !(s(-1, 0) || s(1, 0)) ? 'north-south' : 'east-west'; }
  if (it.variants.length > 1 && /wall/.test(it.variants[1])) { const s = sameFn(layer, x, y); return (s(0, -1) && s(0, 1)) ? it.variants[1] : it.variants[0]; }
  return it.variants[0];
}
function drawTry() {
  const c = tryCv(), m = tryMap, box = $('tryStage').getBoundingClientRect();
  tryT = Math.max(8, Math.floor(Math.min(box.width / m.w, box.height / m.h)));
  c.width = m.w * tryT; c.height = m.h * tryT; c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const t = tryT;
  const src = { w: m.w, h: m.h, height: null, struct: m.struct, roof: m.roof, tileAt: (x, y) => groundTile(m.ground[y * m.w + x]) };
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x, px = x * t, py = y * t;
    const gid = `ground:${GROUND[m.ground[i]][1]}`;
    if (!drawTileArt(g, gid, 'main', x, y, px, py, t, t, false, sameFn('ground', x, y))) drawTile(g, src, groundTile(m.ground[i]), x, y, px, py, t, false);
    const st = m.struct[i];
    if (st) {
      const sid = `struct:${STRUCT[st][1]}`;
      if (!drawTileArt(g, sid, variantFor(sid, 'struct', x, y), x, y, px, py, t, t, false, sameFn('struct', x, y))) drawHeightAndStruct(g, src, x, y, px, py, t, false);
    }
  }
  for (const o of m.objects) {
    const oid = `object:${OBJECT[o.kind][1]}`, turned = o.w !== OBJECT[o.kind][3].w || o.h !== OBJECT[o.kind][3].h;
    if (!drawTileArt(g, oid, turned ? 'turned' : 'main', o.x, o.y, o.x * t, o.y * t, o.w * t, o.h * t, false, null)) drawObject(g, o, o.x * t, o.y * t, t, false);
  }
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const r = m.roof[y * m.w + x];
    if (!r) continue;
    const rid = `roof:${ROOF[r][1]}`;
    if (!drawTileArt(g, rid, variantFor(rid, 'roof', x, y), x, y, x * t, y * t, t, t, false, sameFn('roof', x, y))) drawRoofTile(g, src, x, y, x * t, y * t, t, false);
  }
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = 1; x < m.w; x++) g.fillRect(x * t, 0, 1, m.h * t);
  for (let y = 1; y < m.h; y++) g.fillRect(0, y * t, m.w * t, 1);
}
function tryBar() {
  const el = $('tryBar'); el.innerHTML = '';
  const add = (label, on, fn) => { const b = document.createElement('button'); b.textContent = label; if (on) b.className = 'on'; b.onclick = fn; el.append(b); };
  add(`Paint: ${item().name}`, tryTool === 'paint', () => { tryTool = 'paint'; tryBar(); });
  add('Erase', tryTool === 'erase', () => { tryTool = 'erase'; tryBar(); });
  add('Edit a piece', tryTool === 'pick', () => { tryTool = 'pick'; tryBar(); });
  add('Clear', false, () => { if (confirm('Clear the board?')) { tryMap = createMap(1, 1); saveTry(); drawTry(); } });
  add('Done', true, () => { $('try').style.display = 'none'; refresh(); });
}
function openTry() {
  if (!tryMap) tryMap = loadTry();
  tryTool = 'paint';
  $('try').style.display = 'flex';
  tryBar(); drawTry();
  $('tryHint').textContent = 'Paint with the tile you were on (go back and pick another to mix them). Edit a piece: tap a square to draw the piece it uses.';
}
function tryCell(ev) { const r = tryCv().getBoundingClientRect(); return { x: Math.floor((ev.clientX - r.left) / tryT), y: Math.floor((ev.clientY - r.top) / tryT) }; }
function tryAt(p, first) {
  const m = tryMap, it = item();
  if (p.x < 0 || p.y < 0 || p.x >= m.w || p.y >= m.h) return;
  const i = p.y * m.w + p.x;
  const [layer, key] = it.id.split(':');
  if (tryTool === 'erase') {
    const o = objectAt(m, p.x, p.y);
    if (o) removeObject(m, o); else if (m.roof[i]) m.roof[i] = 0; else if (m.struct[i]) m.struct[i] = 0; else m.ground[i] = 0;
  } else if (tryTool === 'pick') {
    if (!first) return;
    const o = objectAt(m, p.x, p.y);
    let id, v, k = 0;
    const pickOf = (lay, name) => {
      id = `${lay}:${name}`;
      if (art.tiles[id] && art.tiles[id].connect) { const pc = pieceAt(id, p.x, p.y, sameFn(lay, p.x, p.y)); v = pc.wanted; k = pc.piece === pc.wanted ? pc.version : 0; }
      else { v = variantFor(id, lay, p.x, p.y); const n = (art.tiles[id] && art.tiles[id].variants[v] || []).length; k = versionAt(n, p.x, p.y); }
    };
    if (m.roof[i]) pickOf('roof', ROOF[m.roof[i]][1]);
    else if (o) { id = `object:${OBJECT[o.kind][1]}`; v = o.w !== OBJECT[o.kind][3].w ? 'turned' : 'main'; const n = (art.tiles[id] && art.tiles[id].variants[v] || []).length; k = versionAt(n, o.x, o.y); }
    else if (m.struct[i]) pickOf('struct', STRUCT[m.struct[i]][1]);
    else pickOf('ground', GROUND[m.ground[i]][1]);
    const n = items.findIndex(q => q.id === id);
    if (n < 0) return;
    $('try').style.display = 'none';
    index = n; zoom = 1; pan = { x: 0, y: 0 };
    variant = Math.max(0, vlist().indexOf(v)); version = k;
    refresh(); say(`${item().name}: ${connected() ? pieceLabel(vname()) : vname()}${versions().length > 1 ? `, version #${version + 1}` : ''}.`);
    return;
  } else if (layer === 'ground') m.ground[i] = G[key];
  else if (layer === 'struct') m.struct[i] = S[key];
  else if (layer === 'roof') m.roof[i] = ROOF.findIndex(e => e[1] === key);
  else if (layer === 'object') {
    if (!first) return;
    const info = OBJECT[O[key]][3];
    const w = info.w, h = info.h, x = Math.min(p.x, m.w - w), y = Math.min(p.y, m.h - h);
    for (const o of m.objects.slice()) if (o.x < x + w && x < o.x + o.w && o.y < y + h && y < o.y + o.h) removeObject(m, o);
    placeObject(m, { kind: O[key], x, y, w, h, ...(info.text ? { text: 'DINER' } : {}) });
  } else { if (first) say('Only ground, structures, objects and roofs go on the board.'); return; }
  drawTry();
}
let tryDown = false;
$('tryCanvas').addEventListener('pointerdown', ev => { $('tryCanvas').setPointerCapture(ev.pointerId); tryDown = true; tryAt(tryCell(ev), true); });
$('tryCanvas').addEventListener('pointermove', ev => { if (tryDown) tryAt(tryCell(ev), false); });
const tryUp = () => { if (tryDown) { tryDown = false; saveTry(); } };
$('tryCanvas').addEventListener('pointerup', tryUp);
$('tryCanvas').addEventListener('pointercancel', tryUp);
$('tryOpen').onclick = () => { $('menu').style.display = 'none'; openTry(); };

window.addEventListener('resize', () => { refresh(); if ($('try').style.display === 'flex') drawTry(); });
buildPalette(); buildTools(); refresh();
