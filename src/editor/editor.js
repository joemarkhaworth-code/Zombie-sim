// The map editor (editor.html): Joe designs the maps here; the game plays them from maps/*.txt.
// Six layers per tile (height, ground, structure, objects, markers, roof: src/sim/map.js),
// painted separately, each can be hidden. Tools: paint (tap or drag), fill, rectangle, building
// (walls + floor + roof in one go), erase; undo and redo; pinch to zoom and two fingers to pan.
// Nonsense placements are refused with a short message (map.js checkPlace). The map autosaves
// to localStorage; Copy / Paste move it as text; Play from here opens the game on it.
import { CONFIG } from '../config.js';
import {
  GROUND, STRUCT, OBJECT, MARKER, ROOF, LAYERS, S, O, M, G, createMap, resizeMap, cloneMap, parseMap, serializeMap,
  checkPlace, placeObject, removeObject, objectAt, placeMarker, removeMarker, markerAt, footprint, groundTile,
  screensForSize, cellBlocks,
} from '../sim/map.js';
import { drawTile } from '../render/tiles.js';
import { drawHeightAndStruct, drawObject, drawRoofTile, drawMarker } from '../render/layers.js';

const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
const E = CONFIG.editor;

// --- State ------------------------------------------------------------------------------------
let map = loadSaved() || createMap(...E.screens);
let layer = 'ground';
const brush = { height: 1, ground: G.ROAD, struct: S.WALL, object: O.TREE, marker: M.START, roof: 1 };
let tool = 'paint';
let rot = 0;                                 // objects: turned 90 degrees
const shown = Object.fromEntries(LAYERS.map(l => [l, true]));
let hideRoofs = false;
const view = { scale: 16, ox: 0, oy: 0 };   // pixels per tile; the map pixel at the canvas's top-left
let cssW = 0, cssH = 0;
const undo = [], redo = [];

function loadSaved() {
  try { const t = localStorage.getItem(E.saveKey); return t ? parseMap(t) : null; } catch (e) { return null; }
}
let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(E.saveKey, serializeMap(map)); } catch (e) { say('Not saved: storage is full or blocked.'); } }, 300);
}

let sayTimer = 0;
function say(text) {
  const el = $('status');
  el.textContent = text; el.style.display = text ? 'block' : 'none';
  clearTimeout(sayTimer);
  if (text) sayTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

// --- Strokes, undo, redo --------------------------------------------------------------------------
// A stroke is everything one finger does between down and up. It records each changed cell's
// old value, and the object and marker lists before, so it can be undone or cancelled (when a
// second finger lands, it was a pinch, not paint).
let stroke = null;
function beginStroke() {
  stroke = { cells: new Map(), objects: map.objects.map(o => ({ ...o })), markers: map.markers.map(m => ({ ...m })), touched: new Set(), start: null, last: null };
}
function setCell(l, i, v) {
  const key = l + ':' + i;
  if (!stroke.cells.has(key)) stroke.cells.set(key, [l, i, map[l][i]]);
  map[l][i] = v;
}
function restoreLists(objects, markers) {
  map.objects = []; map.markers = [];
  map.object.fill(0); map.marker.fill(0);
  for (const o of objects) placeObject(map, { ...o });
  for (const m of markers) placeMarker(map, { ...m });
}
function endStroke() {
  if (!stroke) return;
  const cells = [...stroke.cells.values()].map(([l, i, old]) => [l, i, old, map[l][i]]).filter(c => c[2] !== c[3]);
  const listsChanged = JSON.stringify(stroke.objects) !== JSON.stringify(map.objects) || JSON.stringify(stroke.markers) !== JSON.stringify(map.markers);
  if (cells.length || listsChanged) {
    undo.push({ cells, before: { objects: stroke.objects, markers: stroke.markers }, after: { objects: map.objects.map(o => ({ ...o })), markers: map.markers.map(m => ({ ...m })) } });
    if (undo.length > E.undoLevels) undo.shift();
    redo.length = 0;
    autosave();
  }
  stroke = null;
  render();
}
function cancelStroke() {
  if (!stroke) return;
  for (const [l, i, old] of stroke.cells.values()) map[l][i] = old;
  restoreLists(stroke.objects, stroke.markers);
  stroke = null;
  render();
}
function step(from, to, useAfter) {
  const e = from.pop();
  if (!e) return say(useAfter ? 'Nothing to redo.' : 'Nothing to undo.');
  for (const [l, i, old, now] of e.cells) map[l][i] = useAfter ? now : old;
  const lists = useAfter ? e.after : e.before;
  restoreLists(lists.objects, lists.markers);
  to.push(e);
  autosave(); render();
}

// --- Painting -------------------------------------------------------------------------------------
const inb = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h;

function paintAt(x, y) {
  if (!inb(x, y)) return;
  const i = y * map.w + x;
  if (tool === 'erase') return eraseAt(x, y);
  if (layer === 'height') {
    if (stroke.touched.has(i)) return;
    stroke.touched.add(i);
    const b = brush.height;
    setCell('height', i, b === 'raise' ? Math.min(3, map.height[i] + 1) : b === 'lower' ? Math.max(0, map.height[i] - 1) : b);
    return;
  }
  if (layer === 'object') {
    if (objectAt(map, x, y)) return;
    const msg = checkPlace(map, 'object', brush.object, x, y, rot);
    if (msg) return say(msg);
    const fp = footprint(brush.object, rot);
    const o = { kind: brush.object, x, y, w: fp.w, h: fp.h };
    if (OBJECT[brush.object][3].text) { const t = prompt('What does the sign say?', 'DINER'); if (t === null) return; o.text = t.trim().slice(0, 24) || 'SIGN'; }
    placeObject(map, o);
    return;
  }
  if (layer === 'marker') {
    const m = markerAt(map, x, y);
    if (m && m.kind === brush.marker) return;
    const msg = checkPlace(map, 'marker', brush.marker, x, y);
    if (msg) return say(msg);
    const mk = { kind: brush.marker, x, y };
    if (MARKER[brush.marker][3].text) { const t = prompt('Landmark label:', 'Haverly'); if (t === null) return; mk.text = t.trim().slice(0, 28) || 'Here'; }
    placeMarker(map, mk);
    return;
  }
  const v = brush[layer];
  if (map[layer][i] === v) return;
  const msg = checkPlace(map, layer, v, x, y);
  if (msg) return say(msg);
  setCell(layer, i, v);
}

function eraseAt(x, y) {
  const i = y * map.w + x;
  if (layer === 'object') { const o = objectAt(map, x, y); if (o) removeObject(map, o); return; }
  if (layer === 'marker') { const m = markerAt(map, x, y); if (m) removeMarker(map, m); return; }
  if (layer === 'ground') {
    if (map.struct[i] === S.BRIDGE) return say('Remove the bridge first.');
    return setCell('ground', i, G.GRASS);
  }
  setCell(layer, i, 0);
}

// Flood fill (4 ways) of the tiles like the one tapped, on the current layer.
function fillAt(x, y) {
  if (layer === 'object' || layer === 'marker') return say('Fill works on height, ground, structures and roofs.');
  if (!inb(x, y)) return;
  const l = layer, from = map[l][y * map.w + x];
  const v = tool === 'erase' ? (l === 'ground' ? G.GRASS : 0) : brush[l];
  if (v === 'raise' || v === 'lower') return say('Pick a height level to fill with.');
  if (from === v) return;
  const seen = new Uint8Array(map.w * map.h), stack = [y * map.w + x];
  seen[stack[0]] = 1;
  let refused = null, done = 0;
  while (stack.length) {
    const i = stack.pop(), cx = i % map.w, cy = (i / map.w) | 0;
    const msg = l === 'height' ? null : checkPlace(map, l, v, cx, cy);
    if (msg) refused = msg; else { setCell(l, i, v); done++; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, j = ny * map.w + nx;
      if (!inb(nx, ny) || seen[j] || map[l][j] !== from) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  if (refused && !done) say(refused);
}

function rectCells(a, b) {
  return { x0: Math.max(0, Math.min(a.x, b.x)), y0: Math.max(0, Math.min(a.y, b.y)), x1: Math.min(map.w - 1, Math.max(a.x, b.x)), y1: Math.min(map.h - 1, Math.max(a.y, b.y)) };
}
function rectFill(a, b) {
  if (layer === 'object' || layer === 'marker') return say('Rect works on height, ground, structures and roofs.');
  const r = rectCells(a, b), l = layer;
  const v = tool === 'erase' ? (l === 'ground' ? G.GRASS : 0) : brush[l];
  if (v === 'raise' || v === 'lower') {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = y * map.w + x; setCell(l, i, Math.max(0, Math.min(3, map[l][i] + (v === 'raise' ? 1 : -1)))); }
    return;
  }
  let refused = null;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const msg = l === 'height' ? null : checkPlace(map, l, v, x, y);
      if (msg) refused = msg; else setCell(l, y * map.w + x, v);
    }
  }
  if (refused) say(refused);
}

// A building: walls round the edge, floor inside, a roof over all of it. Add the door after.
function building(a, b) {
  const r = rectCells(a, b);
  if (r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) return say('A building needs at least 3 x 3.');
  const h0 = map.height[r.y0 * map.w + r.x0];
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * map.w + x;
      if (map.ground[i] === G.WATER) return say("Can't build on the water.");
      if (map.object[i]) return say('Something is in the way.');
      if (map.height[i] !== h0) return say('A building needs flat ground.');
    }
  }
  const roof = brush.roof || 1;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * map.w + x, edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
      setCell('ground', i, G.FLOOR);
      setCell('struct', i, edge ? S.WALL : 0);
      setCell('roof', i, roof);
    }
  }
  say('Building drawn. Add a door in a wall.');
}

// --- Drawing ----------------------------------------------------------------------------------------
const tileAtCss = (cx, cy) => ({ x: Math.floor((cx + view.ox) / view.scale), y: Math.floor((cy + view.oy) / view.scale) });
const SIMPLE = { GRASS: '#5d8a3c', ROAD: '#2e2f33', PAVEMENT: '#8d8b83', PATH: '#b0a07c', GRAVEL: '#9a948a', FIELD: '#a89a52', WATER: '#2f62a8', FLOOR: '#5a4a38' };

let pending = false;
function render() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; draw(); });
}

function draw() {
  const t = view.scale;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cssW, cssH);
  const x0 = Math.max(0, Math.floor(view.ox / t)), y0 = Math.max(0, Math.floor(view.oy / t));
  const x1 = Math.min(map.w - 1, Math.floor((view.ox + cssW) / t)), y1 = Math.min(map.h - 1, Math.floor((view.oy + cssH) / t));
  const px = x => x * t - view.ox, py = y => y * t - view.oy;
  const src = { w: map.w, h: map.h, height: shown.height ? map.height : null, struct: shown.struct ? map.struct : null, roof: map.roof };
  const detail = t >= 7;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * map.w + x;
      if (shown.ground) {
        if (detail) drawTile(ctx, null, groundTile(map.ground[i]), x, y, px(x), py(y), t, false);
        else { ctx.fillStyle = SIMPLE[GROUND[map.ground[i]][1]]; ctx.fillRect(px(x), py(y), t, t); }
      } else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(px(x), py(y), t, t); }
      if (detail) drawHeightAndStruct(ctx, src, x, y, px(x), py(y), t, false);
      else if (shown.struct && map.struct[i]) { ctx.fillStyle = map.struct[i] === S.WALL ? '#c9b48e' : '#888'; ctx.fillRect(px(x), py(y), t, t); }
    }
  }
  if (shown.object) for (const o of map.objects) if (o.x + o.w > x0 && o.x <= x1 && o.y + o.h > y0 && o.y <= y1) drawObject(ctx, o, px(o.x), py(o.y), t, false);
  if (shown.roof && !hideRoofs) {
    ctx.globalAlpha = 0.92;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (map.roof[y * map.w + x]) drawRoofTile(ctx, map, x, y, px(x), py(y), t, false);
    ctx.globalAlpha = 1;
  }
  if (shown.marker) for (const m of map.markers) if (m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1) drawMarker(ctx, m, px(m.x), py(m.y), t);
  // The screens (where the camera flips), and a tile grid when zoomed in.
  const ov = CONFIG.world.flipAt + CONFIG.world.landIn + 1, stepX = CONFIG.screen.w - ov, stepY = CONFIG.screen.h - ov;
  if (t >= 14) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = x0; x <= x1 + 1; x++) ctx.fillRect(px(x), py(y0), 1, (y1 - y0 + 1) * t);
    for (let y = y0; y <= y1 + 1; y++) ctx.fillRect(px(x0), py(y), (x1 - x0 + 1) * t, 1);
  }
  ctx.fillStyle = 'rgba(255,221,51,0.45)';
  for (let k = 0; k * stepX + 2 <= map.w; k++) ctx.fillRect(px(k * stepX + 2), py(0), 1, map.h * t);
  for (let k = 0; k * stepY + 2 <= map.h; k++) ctx.fillRect(px(0), py(k * stepY + 2), map.w * t, 1);
  ctx.strokeStyle = '#ffdd33'; ctx.lineWidth = 2; ctx.strokeRect(px(0), py(0), map.w * t, map.h * t);
  // Rectangle / building preview.
  if (stroke && stroke.start && stroke.last && (tool === 'rect' || tool === 'building')) {
    const r = rectCells(stroke.start, stroke.last);
    ctx.strokeStyle = '#ffdd33'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(px(r.x0), py(r.y0), (r.x1 - r.x0 + 1) * t, (r.y1 - r.y0 + 1) * t);
    ctx.setLineDash([]);
  }
  const { sx, sy } = screensForSize(map.w, map.h);
  $('info').textContent = `${map.w}x${map.h} tiles, ${sx}x${sy} screens`;
}

// --- Input: one finger paints, two fingers zoom and pan --------------------------------------------
const pointers = new Map();
let gesture = null, ignore = false;

canvas.addEventListener('pointerdown', ev => {
  canvas.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
  if (ev.pointerType === 'mouse' && ev.button !== 0) { gesture = { mouse: true, last: { x: ev.offsetX, y: ev.offsetY } }; return; }
  if (pointers.size === 2) {
    cancelStroke();
    const [a, b] = [...pointers.values()];
    gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.scale, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, o0: { ...view } };
    return;
  }
  if (pointers.size > 2 || ignore) return;
  const tl = tileAtCss(ev.offsetX, ev.offsetY);
  beginStroke();
  stroke.start = tl; stroke.last = tl;
  if (tool === 'paint' || tool === 'erase') paintAt(tl.x, tl.y);
  else if (tool === 'fill') fillAt(tl.x, tl.y);
  render();
});

canvas.addEventListener('pointermove', ev => {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
  if (gesture && gesture.mouse) {
    view.ox -= ev.offsetX - gesture.last.x; view.oy -= ev.offsetY - gesture.last.y;
    gesture.last = { x: ev.offsetX, y: ev.offsetY }; render(); return;
  }
  if (gesture && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const scale = Math.max(3, Math.min(72, gesture.s0 * d / gesture.d0));
    // Keep the map point that was under the fingers' midpoint under it now.
    const wx = (gesture.m0.x + gesture.o0.ox) / gesture.s0, wy = (gesture.m0.y + gesture.o0.oy) / gesture.s0;
    view.scale = scale; view.ox = wx * scale - mid.x; view.oy = wy * scale - mid.y;
    render(); return;
  }
  if (!stroke || ignore) return;
  const tl = tileAtCss(ev.offsetX, ev.offsetY);
  if (tl.x === stroke.last.x && tl.y === stroke.last.y) return;
  if (tool === 'paint' || tool === 'erase') {
    // Every tile between the last one and this, so a fast drag leaves no gaps.
    let { x, y } = stroke.last;
    while (x !== tl.x || y !== tl.y) {
      if (Math.abs(tl.x - x) >= Math.abs(tl.y - y)) x += Math.sign(tl.x - x); else y += Math.sign(tl.y - y);
      paintAt(x, y);
    }
  }
  stroke.last = tl;
  render();
});

function pointerUp(ev) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.delete(ev.pointerId);
  if (gesture) {
    if (gesture.mouse || pointers.size === 0) { gesture = null; ignore = pointers.size > 0; }
    else ignore = true;
    if (pointers.size === 0) ignore = false;
    return;
  }
  if (ignore) { if (pointers.size === 0) ignore = false; return; }
  if (!stroke) return;
  if (tool === 'rect') rectFill(stroke.start, stroke.last);
  if (tool === 'building') building(stroke.start, stroke.last);
  endStroke();
}
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', ev => { cancelStroke(); pointerUp(ev); });
canvas.addEventListener('contextmenu', ev => ev.preventDefault());
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
  const scale = Math.max(3, Math.min(72, view.scale * f));
  const wx = (ev.offsetX + view.ox) / view.scale, wy = (ev.offsetY + view.oy) / view.scale;
  view.scale = scale; view.ox = wx * scale - ev.offsetX; view.oy = wy * scale - ev.offsetY;
  render();
}, { passive: false });
window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? step(redo, undo, true) : step(undo, redo, false); }
  else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); step(redo, undo, true); }
});

// --- The bars --------------------------------------------------------------------------------------
const LAYER_NAMES = { height: 'Height', ground: 'Ground', struct: 'Struct', object: 'Objects', marker: 'Markers', roof: 'Roof' };
function swatch(colour) { return colour ? `<span class="sw" style="background:${colour}"></span>` : ''; }
const C = CONFIG.colours;
function brushColour(l, k) {
  if (l === 'ground') { const key = GROUND[k][1]; return (C.tiles[key] && C.tiles[key][0]) || SIMPLE[key]; }
  if (l === 'roof') return C.layers.roofs[k][0];
  if (l === 'struct') return { [S.WALL]: C.layers.wall[0], [S.DOOR]: C.layers.door[0], [S.FENCE]: C.layers.fence, [S.HEDGE]: C.layers.hedge[0], [S.BRIDGE]: C.layers.bridge[0], [S.STEPS]: C.layers.steps[0], [S.LEDGE]: C.layers.ledge }[k];
  if (l === 'object') return { [O.CAR]: C.layers.car, [O.VAN]: C.layers.van, [O.TREE]: C.layers.tree[0], [O.BENCH]: C.layers.bench, [O.CRATE]: C.layers.crate[0], [O.SIGN]: C.tiles.sign[0], [O.FISHING]: '#5a8ad0' }[k];
  if (l === 'marker') return { [M.START]: C.player, [M.ZOMBIE]: C.zombie, [M.LABEL]: '#1d2a6b' }[k];
  return null;
}

function buildLayers() {
  const el = $('layers');
  el.innerHTML = '';
  for (const l of LAYERS) {
    const g = document.createElement('div'); g.className = 'layer';
    const b = document.createElement('button');
    b.textContent = LAYER_NAMES[l];
    b.className = (l === layer ? 'on ' : '') + (shown[l] ? '' : 'off');
    b.onclick = () => { layer = l; if (!shown[l]) shown[l] = true; buildAll(); render(); };
    const eye = document.createElement('button');
    eye.className = 'eye' + (shown[l] ? '' : ' off');
    eye.textContent = shown[l] ? '◉' : '○';
    eye.title = 'Show or hide this layer';
    eye.onclick = () => { shown[l] = !shown[l]; buildAll(); render(); };
    g.append(b, eye); el.append(g);
  }
}

function buildPalette() {
  const el = $('palette');
  el.innerHTML = '';
  const add = (label, colour, active, fn) => {
    const b = document.createElement('button');
    b.innerHTML = swatch(colour) + label;
    if (active) b.className = 'on';
    b.onclick = fn; el.append(b);
  };
  if (layer === 'height') {
    for (const h of [0, 1, 2, 3]) add(`Level ${h}`, `rgb(${90 + h * 40},${110 + h * 35},${70 + h * 30})`, brush.height === h, () => { brush.height = h; pickPaint(); });
    add('Raise ▲', null, brush.height === 'raise', () => { brush.height = 'raise'; pickPaint(); });
    add('Lower ▼', null, brush.height === 'lower', () => { brush.height = 'lower'; pickPaint(); });
    return;
  }
  const table = { ground: GROUND, struct: STRUCT, object: OBJECT, marker: MARKER, roof: ROOF }[layer];
  table.forEach(([, , label], k) => {
    if (layer !== 'ground' && k === 0) return;
    add(label, brushColour(layer, k), brush[layer] === k, () => { brush[layer] = k; pickPaint(); });
  });
  if (layer === 'object') add(rot ? 'Turned ↻' : 'Turn ↻', null, !!rot, () => { rot = rot ? 0 : 1; buildAll(); });
}
function pickPaint() { if (tool === 'erase' || ((layer === 'object' || layer === 'marker') && (tool === 'fill' || tool === 'rect'))) tool = 'paint'; buildAll(); }

function buildTools() {
  const el = $('tools');
  el.innerHTML = '';
  const add = (label, id, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (id && tool === id) b.className = 'on';
    b.onclick = fn || (() => { tool = id; buildAll(); });
    el.append(b);
  };
  add('Paint', 'paint'); add('Fill', 'fill'); add('Rect', 'rect'); add('Bldg', 'building'); add('Erase', 'erase');
  add('Undo', null, () => step(undo, redo, false));
  add('Redo', null, () => step(redo, undo, true));
  add('Menu', null, openMenu);
}
function buildAll() { buildLayers(); buildPalette(); buildTools(); }

// --- The menu: size, new, roofs, play, copy, paste, open ------------------------------------------
function openMenu() {
  const { sx, sy } = screensForSize(map.w, map.h);
  $('sx').value = sx; $('sy').value = sy;
  $('hideRoofs').className = hideRoofs ? 'on' : '';
  $('menu').style.display = 'block';
}
const closeMenu = () => { $('menu').style.display = 'none'; render(); };
$('close').onclick = closeMenu;
function replaceMap(m, note) {
  map = m; undo.length = 0; redo.length = 0;
  autosave(); fitView(); closeMenu(); say(note);
}
$('resize').onclick = () => {
  const sx = Math.max(1, Math.min(25, +$('sx').value || 1)), sy = Math.max(1, Math.min(25, +$('sy').value || 1));
  replaceMap(resizeMap(map, sx, sy), `Map is now ${sx} x ${sy} screens.`);
};
$('new').onclick = () => { if (confirm('Start a new, empty map? (Copy this one first if you want it.)')) replaceMap(createMap(...E.screens), 'New map.'); };
$('hideRoofs').onclick = () => { hideRoofs = !hideRoofs; $('hideRoofs').className = hideRoofs ? 'on' : ''; render(); };
$('copy').onclick = async () => {
  const text = serializeMap(map);
  $('text').value = text;
  try { await navigator.clipboard.writeText(text); say('Map copied.'); }
  catch (e) { $('text').select(); say('Copy it from the box below.'); }
};
$('paste').onclick = async () => {
  let text = $('text').value;
  if (!text.trim()) { try { text = await navigator.clipboard.readText(); } catch (e) { /* use the box */ } }
  if (!text.trim()) return say('Paste a map into the box first.');
  try { replaceMap(parseMap(text), 'Map pasted.'); } catch (e) { say(e.message); }
};
$('open').onclick = async () => {
  const name = $('mapName').value.trim();
  try {
    const r = await fetch(`maps/${encodeURIComponent(name)}.txt`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`No maps/${name}.txt.`);
    replaceMap(parseMap(await r.text()), `Opened maps/${name}.txt.`);
  } catch (e) { say(e.message); }
};
// Play from here: the game opens on this map. With no start marker, you start at the middle of
// the view (the nearest open tile).
$('play').onclick = () => {
  const m = cloneMap(map);
  if (!m.markers.some(k => k.kind === M.START)) {
    const c = tileAtCss(cssW / 2, cssH / 2);
    let best = null, bd = Infinity;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const d = Math.abs(x - c.x) + Math.abs(y - c.y);
      if (d < bd && !cellBlocks(m, y * m.w + x)) { bd = d; best = { x, y }; }
    }
    if (!best) return say('Nowhere to stand on this map.');
    placeMarker(m, { kind: M.START, x: best.x, y: best.y });
  }
  try { localStorage.setItem(E.playKey, serializeMap(m)); } catch (e) { return say("Couldn't hand the map over: storage is blocked."); }
  window.open('index.html?map=editor', '_blank');
};

// --- Size and start ---------------------------------------------------------------------------------
function fitView() {
  view.scale = Math.max(3, Math.min(40, cssW / map.w));
  view.ox = (map.w * view.scale - cssW) / 2;
  view.oy = Math.min(0, (map.h * view.scale - cssH) / 2);
  if (map.h * view.scale > cssH) view.oy = 0;
}
function resize() {
  const box = $('view').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cssW = box.width; cssH = box.height;
  canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
window.addEventListener('resize', resize);
buildAll();
resize();
fitView();
render();
