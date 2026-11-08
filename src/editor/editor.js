// The map editor (editor.html): Joe designs the maps here; the game plays them from maps/*.txt.
// Six layers per tile (height, ground, structure, objects, markers, roof: src/sim/map.js),
// painted separately, each can be hidden.
// Tools: Paint (tap or drag, size 1-3), Line (snaps straight), Rect (filled), Box (outline), Fill,
// Bldg (a whole building from a rectangle, by preset; or Demolish), Pick (copy a tile), Erase,
// Hand (look around). Objects: tap to place, drag to move, tap a sign or label to change its words.
// Undo and redo; two fingers pinch to zoom and pan. Nonsense placements are refused with a short
// message (map.js checkPlace). The map autosaves; Copy / Paste move it as text; Play from here
// opens the game on it.
import { CONFIG } from '../config.js';
import {
  GROUND, STRUCT, OBJECT, MARKER, ROOF, LAYERS, BUILDINGS, S, O, M, G, kindOf, kinds, createMap, resizeMap, cloneMap, parseMap, serializeMap,
  checkPlace, placeObject, removeObject, objectAt, placeMarker, removeMarker, markerAt, footprint, groundTile,
  screensForSize, cellBlocks, buildBuilding, demolish,
} from '../sim/map.js';
import { drawTile } from '../render/tiles.js';
import { loadArt, placeholderColour } from '../render/art.js';
import { drawHeightAndStruct, drawObject, drawRoofTile, drawMarker } from '../render/layers.js';

const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
const E = CONFIG.editor;
const TABLES = { ground: GROUND, struct: STRUCT, object: OBJECT, marker: MARKER, roof: ROOF };

// Joe's new kinds (made in the tile art builder) and their art, before the palettes are built.
await loadArt();

// --- State ------------------------------------------------------------------------------------
let map = loadSaved() || createMap(...E.screens);
let layer = 'ground';
const brush = { height: 1, ground: G.ROAD, struct: S.CLAPBOARD, object: O.PINE, marker: M.START, roof: 1 };
let tool = 'paint';
let size = 1;                 // brush size (Paint, Line, Erase)
let preset = 'house';         // Bldg: a building preset, or 'demolish'
let rot = 0;                  // objects: turned 90 degrees
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

// --- Strokes, undo, redo ------------------------------------------------------------------------
// A stroke is everything one finger does between down and up. It records each changed cell's
// old value and the object and marker lists before, so it can be undone, or cancelled (when a
// second finger lands, it was a pinch, not paint).
let stroke = null;
function beginStroke(at) {
  stroke = { cells: new Map(), objects: map.objects.map(o => ({ ...o })), markers: map.markers.map(m => ({ ...m })), touched: new Set(), start: at, last: at, moved: false };
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
  hint(); render();
}
// Undo what this stroke has done so far, but keep the stroke going (Bldg redraws as you drag).
function resetStroke() {
  for (const [l, i, old] of stroke.cells.values()) map[l][i] = old;
  stroke.cells.clear();
  restoreLists(stroke.objects, stroke.markers);
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
const label = (l, k) => (l === 'height' ? (k === 'raise' ? 'raise' : k === 'lower' ? 'lower' : `level ${k}`) : TABLES[l][k][2]);
const gridLayer = () => layer !== 'object' && layer !== 'marker';

// One tile of the current brush (or erase) on the current layer.
function paintTile(x, y, erase) {
  if (!inb(x, y)) return;
  const i = y * map.w + x;
  if (erase) return eraseAt(x, y);
  if (layer === 'height') {
    if (stroke.touched.has(i)) return;
    stroke.touched.add(i);
    const b = brush.height;
    setCell('height', i, b === 'raise' ? Math.min(3, map.height[i] + 1) : b === 'lower' ? Math.max(0, map.height[i] - 1) : b);
    return;
  }
  if (layer === 'object') return placeObjectAt(x, y);
  if (layer === 'marker') return placeMarkerAt(x, y);
  const v = brush[layer];
  if (map[layer][i] === v) return;
  const msg = checkPlace(map, layer, v, x, y);
  if (msg) return say(msg);
  setCell(layer, i, v);
}
// The brush's square (size 1-3) round a tile.
function paintAt(x, y, erase) {
  const n = gridLayer() ? size : 1, o = (n - 1) >> 1;
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) paintTile(x - o + dx, y - o + dy, erase);
}
function placeObjectAt(x, y) {
  if (objectAt(map, x, y)) return;
  const msg = checkPlace(map, 'object', brush.object, x, y, rot);
  if (msg) return say(msg);
  const fp = footprint(brush.object, rot);
  const o = { kind: brush.object, x, y, w: fp.w, h: fp.h };
  if (OBJECT[brush.object][3].text) { const t = prompt('What does the sign say?', 'DINER'); if (t === null) return; o.text = t.trim().slice(0, 24) || 'SIGN'; }
  placeObject(map, o);
}
function placeMarkerAt(x, y) {
  const m = markerAt(map, x, y);
  if (m && m.kind === brush.marker) return;
  const msg = checkPlace(map, 'marker', brush.marker, x, y);
  if (msg) return say(msg);
  const mk = { kind: brush.marker, x, y };
  if (MARKER[brush.marker][3].text) { const t = prompt('Landmark label:', 'Haverly'); if (t === null) return; mk.text = t.trim().slice(0, 28) || 'Here'; }
  placeMarker(map, mk);
}
function eraseAt(x, y) {
  const i = y * map.w + x;
  if (layer === 'object') { const o = objectAt(map, x, y); if (o) removeObject(map, o); return; }
  if (layer === 'marker') { const m = markerAt(map, x, y); if (m) removeMarker(map, m); return; }
  if (layer === 'ground') {
    if (map.struct[i] === S.BRIDGE || map.struct[i] === S.DOCK) return say('Remove the bridge or dock first.');
    if (map.ground[i] !== G.GRASS) setCell('ground', i, G.GRASS);
    return;
  }
  if (map[layer][i]) setCell(layer, i, 0);
}

// Flood fill (4 ways) of the tiles like the one tapped, on the current layer.
function fillAt(x, y) {
  if (!gridLayer()) return say('Fill works on height, ground, structures and roofs.');
  if (!inb(x, y)) return;
  const l = layer, from = map[l][y * map.w + x];
  const v = brush[l];
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
// Line: from the start, straight along whichever way the finger has gone furthest.
function lineEnd(a, b) {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}
function lineTiles(a, b) {
  const e = lineEnd(a, b), out = [];
  const n = Math.max(Math.abs(e.x - a.x), Math.abs(e.y - a.y));
  for (let k = 0; k <= n; k++) out.push({ x: a.x + Math.sign(e.x - a.x) * k, y: a.y + Math.sign(e.y - a.y) * k });
  return out;
}
function rectTiles(a, b, outline) {
  const r = rectCells(a, b), out = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (!outline || x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1) out.push({ x, y });
  }
  return out;
}
// A line, rectangle or outline of the current brush (a refusal says why, once per stroke).
function shapeApply(tiles, erase) {
  for (const t of tiles) paintTile(t.x, t.y, erase);
}

// The building for the rectangle a..b, laid out for its size. Returns a message if it can't be
// built there. While you drag, it's rebuilt every time the rectangle changes, so you see the
// rooms and furniture rearrange as you size it.
function doBuilding(a, b) {
  const r = rectCells(a, b);
  if (preset === 'demolish') {
    demolish(map, r, setCell);
    for (const o of [...map.objects]) if (o.x >= r.x0 && o.x + o.w - 1 <= r.x1 && o.y >= r.y0 && o.y + o.h - 1 <= r.y1) removeObject(map, o);
    return null;
  }
  return buildBuilding(map, r, BUILDINGS.find(q => q.key === preset), setCell);
}

// Pick: copy what's on a tile into the current layer's brush.
function pickAt(x, y) {
  if (!inb(x, y)) return;
  const i = y * map.w + x;
  if (layer === 'object') { const o = objectAt(map, x, y); if (!o) return say('No object there.'); brush.object = o.kind; rot = o.w !== OBJECT[o.kind][3].w ? 1 : 0; }
  else if (layer === 'marker') { const m = markerAt(map, x, y); if (!m) return say('No marker there.'); brush.marker = m.kind; }
  else if (layer === 'struct' && !map.struct[i]) return say('No structure there.');
  else if (layer === 'roof' && !map.roof[i]) return say('No roof there.');
  else brush[layer] = map[layer][i];
  tool = 'paint';
  say(`Picked ${label(layer, brush[layer])}.`);
  buildAll();
}

// --- Drawing ----------------------------------------------------------------------------------------
const tileAtCss = (cx, cy) => ({ x: Math.floor((cx + view.ox) / view.scale), y: Math.floor((cy + view.oy) / view.scale) });
const SIMPLE = { GRASS: '#5d8a3c', ROAD: '#2e2f33', PAVEMENT: '#8d8b83', PATH: '#b0a07c', GRAVEL: '#9a948a', FIELD: '#a89a52', WATER: '#2f62a8', FLOOR: '#8a6a44' };
const simpleColour = g => { const k = GROUND[g][1]; const kd = kindOf('ground', g); if (kd) return placeholderColour(kd.key); return (CONFIG.colours.tiles[k] && CONFIG.colours.tiles[k][0]) || SIMPLE[k] || '#555'; };

let pending = false;
function render() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; draw(); });
}

function preview() {
  if (!stroke || !stroke.start || !stroke.last) return null;
  if (tool === 'line') return lineTiles(stroke.start, stroke.last);
  if (tool === 'rect' || (tool === 'building' && preset === 'demolish')) return rectTiles(stroke.start, stroke.last, false);
  if (tool === 'building') return [];
  if (tool === 'box') return rectTiles(stroke.start, stroke.last, true);
  return null;
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
        else { ctx.fillStyle = simpleColour(map.ground[i]); ctx.fillRect(px(x), py(y), t, t); }
      } else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(px(x), py(y), t, t); }
      if (detail) drawHeightAndStruct(ctx, src, x, y, px(x), py(y), t, false);
      else if (shown.struct && map.struct[i]) { ctx.fillStyle = STRUCT[map.struct[i]][3].wall ? '#d8ccb0' : '#888'; ctx.fillRect(px(x), py(y), t, t); }
    }
  }
  if (shown.object) for (const o of map.objects) if (o.x + o.w > x0 && o.x <= x1 && o.y + o.h > y0 && o.y <= y1) drawObject(ctx, o, px(o.x), py(o.y), t, false);
  // Roofs: solid on the roof layer, see-through while you work on what's under them.
  if (shown.roof && !hideRoofs) {
    ctx.globalAlpha = layer === 'roof' && tool !== 'building' ? 0.95 : 0.35;
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
  // Shape preview (line, rect, box, building), and the object being moved.
  const pv = preview();
  if (pv) {
    ctx.fillStyle = tool === 'building' && preset === 'demolish' ? 'rgba(255,60,60,0.3)' : 'rgba(255,221,51,0.3)';
    for (const p of pv) ctx.fillRect(px(p.x), py(p.y), t, t);
    if (tool === 'rect' || tool === 'building' || tool === 'box') {
      const r = rectCells(stroke.start, stroke.last);
      ctx.strokeStyle = '#ffdd33'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.strokeRect(px(r.x0), py(r.y0), (r.x1 - r.x0 + 1) * t, (r.y1 - r.y0 + 1) * t);
      ctx.setLineDash([]);
    }
  }
  if (stroke && stroke.moving) {
    const mv = stroke.moving, at = moveTarget();
    ctx.globalAlpha = 0.7;
    if (mv.object) drawObject(ctx, { ...mv.object, x: at.x, y: at.y }, px(at.x), py(at.y), t, false);
    else drawMarker(ctx, { ...mv.marker, x: at.x, y: at.y }, px(at.x), py(at.y), t);
    ctx.globalAlpha = 1;
  }
  const { sx, sy } = screensForSize(map.w, map.h);
  $('info').textContent = `${map.w}x${map.h} tiles, ${sx}x${sy} screens`;
}

// --- The hint line: what the tool in your hand does -------------------------------------------------
function hint(extra) {
  const b = layer === 'height' || gridLayer() || layer === 'object' || layer === 'marker' ? label(layer, brush[layer]) : '';
  const p = BUILDINGS.find(q => q.key === preset);
  const text = {
    paint: layer === 'object' ? `Tap to place a ${b}. Drag one to move it.` : layer === 'marker' ? `Tap to place a ${b}. Drag one to move it.` : `Tap or drag to paint ${b}.`,
    line: `Drag a straight line of ${b}.`,
    rect: `Drag a rectangle of ${b}.`,
    box: `Drag the outline of a rectangle in ${b}.`,
    fill: `Tap to fill an area with ${b}.`,
    building: preset === 'demolish' ? 'Drag over buildings to clear them.' : `Drag out a ${p ? p.label.toLowerCase() : 'building'}: the rooms fit the size you draw.`,
    pick: `Tap a tile to copy its ${layer === 'struct' ? 'structure' : layer}.`,
    erase: `Tap or drag to clear the ${LAYER_NAMES[layer].toLowerCase()} layer.`,
    hand: 'Drag to look around. Pinch to zoom.',
  }[tool];
  $('hint').textContent = extra ? `${text}  ${extra}` : text;
}

// --- Input: one finger uses the tool, two fingers zoom and pan --------------------------------------
const pointers = new Map();
let gesture = null, ignore = false;

// Moving an object or marker: where it would land.
function moveTarget() {
  const mv = stroke.moving;
  return { x: stroke.last.x - mv.grab.x, y: stroke.last.y - mv.grab.y };
}
function finishMove() {
  const mv = stroke.moving, at = moveTarget();
  if (!stroke.moved) {
    // A tap, not a drag: change a sign's or a label's words.
    const thing = mv.object || mv.marker;
    const table = mv.object ? OBJECT : MARKER;
    if (table[thing.kind][3].text) {
      const t = prompt(mv.object ? 'What does the sign say?' : 'Landmark label:', thing.text || '');
      if (t !== null) thing.text = t.trim().slice(0, 28) || thing.text;
    }
    return;
  }
  if (mv.object) {
    const o = mv.object;
    removeObject(map, o);
    const turned = o.w !== OBJECT[o.kind][3].w ? 1 : 0;
    const msg = checkPlace(map, 'object', o.kind, at.x, at.y, turned);
    placeObject(map, msg ? o : { ...o, x: at.x, y: at.y });
    if (msg) say(msg);
  } else {
    const m = mv.marker;
    removeMarker(map, m);
    const msg = checkPlace(map, 'marker', m.kind, at.x, at.y) || (markerAt(map, at.x, at.y) ? 'Something is already there.' : null);
    placeMarker(map, msg ? m : { ...m, x: at.x, y: at.y });
    if (msg) say(msg);
  }
}

canvas.addEventListener('pointerdown', ev => {
  canvas.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
  if ((ev.pointerType === 'mouse' && ev.button !== 0) || (tool === 'hand' && pointers.size === 1)) { gesture = { pan: true, last: { x: ev.offsetX, y: ev.offsetY } }; return; }
  if (pointers.size === 2) {
    cancelStroke();
    const [a, b] = [...pointers.values()];
    gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.scale, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, o0: { ...view } };
    return;
  }
  if (pointers.size > 2 || ignore) return;
  const tl = tileAtCss(ev.offsetX, ev.offsetY);
  beginStroke(tl);
  if (tool === 'paint' && (layer === 'object' || layer === 'marker')) {
    const thing = layer === 'object' ? objectAt(map, tl.x, tl.y) : markerAt(map, tl.x, tl.y);
    if (thing) { stroke.moving = layer === 'object' ? { object: thing, grab: { x: tl.x - thing.x, y: tl.y - thing.y } } : { marker: thing, grab: { x: 0, y: 0 } }; render(); return; }
  }
  if (tool === 'paint' || tool === 'erase') paintAt(tl.x, tl.y, tool === 'erase');
  else if (tool === 'building') stroke.refused = doBuilding(tl, tl);
  else if (tool === 'fill') fillAt(tl.x, tl.y);
  else if (tool === 'pick') pickAt(tl.x, tl.y);
  render();
});

canvas.addEventListener('pointermove', ev => {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
  if (gesture && gesture.pan) {
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
  stroke.moved = true;
  if (!stroke.moving && (tool === 'paint' || tool === 'erase')) {
    // Every tile between the last one and this, so a fast drag leaves no gaps.
    let { x, y } = stroke.last;
    while (x !== tl.x || y !== tl.y) {
      if (Math.abs(tl.x - x) >= Math.abs(tl.y - y)) x += Math.sign(tl.x - x); else y += Math.sign(tl.y - y);
      paintAt(x, y, tool === 'erase');
    }
  }
  stroke.last = tl;
  if (tool === 'building') { resetStroke(); stroke.refused = doBuilding(stroke.start, tl); }
  if (tool === 'rect' || tool === 'box' || tool === 'building' || tool === 'line') {
    const r = rectCells(stroke.start, tl);
    const sizeText = tool === 'line' ? `${lineTiles(stroke.start, tl).length} long.` : `${r.x1 - r.x0 + 1} x ${r.y1 - r.y0 + 1}.`;
    hint(tool === 'building' && stroke.refused ? `${sizeText} ${stroke.refused}` : sizeText);
  }
  render();
});

function pointerUp(ev) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.delete(ev.pointerId);
  if (gesture) {
    if (gesture.pan || pointers.size === 0) { gesture = null; ignore = pointers.size > 0; }
    else ignore = true;
    if (pointers.size === 0) ignore = false;
    return;
  }
  if (ignore) { if (pointers.size === 0) ignore = false; return; }
  if (!stroke) return;
  if (stroke.moving) finishMove();
  else if (tool === 'line') shapeApply(lineTiles(stroke.start, stroke.last), false);
  else if (tool === 'rect') { if (!gridLayer()) say('Rect works on height, ground, structures and roofs.'); else shapeApply(rectTiles(stroke.start, stroke.last, false), false); }
  else if (tool === 'box') shapeApply(rectTiles(stroke.start, stroke.last, true), false);
  else if (tool === 'building') {
    if (stroke.refused) { say(stroke.refused); resetStroke(); }
    else if (preset !== 'demolish') { const r = rectCells(stroke.start, stroke.last); say(`${BUILDINGS.find(q => q.key === preset).label}: ${r.x1 - r.x0 + 1} x ${r.y1 - r.y0 + 1}.`); }
  }
  stroke.moving = null;
  endStroke();
}
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', ev => { cancelStroke(); pointerUp(ev); });
canvas.addEventListener('contextmenu', ev => ev.preventDefault());
function zoomAt(f, cx, cy) {
  const scale = Math.max(3, Math.min(72, view.scale * f));
  const wx = (cx + view.ox) / view.scale, wy = (cy + view.oy) / view.scale;
  view.scale = scale; view.ox = wx * scale - cx; view.oy = wy * scale - cy;
  render();
}
canvas.addEventListener('wheel', ev => { ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.offsetX, ev.offsetY); }, { passive: false });
window.addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? step(redo, undo, true) : step(undo, redo, false); }
  else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); step(redo, undo, true); }
});
$('undo').onclick = () => step(undo, redo, false);
$('redo').onclick = () => step(redo, undo, true);
$('zoomIn').onclick = () => zoomAt(1.35, cssW / 2, cssH / 2);
$('zoomOut').onclick = () => zoomAt(1 / 1.35, cssW / 2, cssH / 2);
$('fit').onclick = () => { fitView(); render(); };

// --- The bars ------------------------------------------------------------------------------------------
const LAYER_NAMES = { height: 'Height', ground: 'Ground', struct: 'Struct', object: 'Objects', marker: 'Markers', roof: 'Roof' };
const swatch = colour => (colour ? `<span class="sw" style="background:${colour}"></span>` : '');
const C = CONFIG.colours;
function brushColour(l, k) {
  const kd = l !== 'height' && l !== 'marker' && kindOf(l, k);
  if (kd) return placeholderColour(kd.key);   // a new kind (made in the tile art builder)
  if (l === 'ground') return simpleColour(k);
  if (l === 'roof') return C.layers.roofs[k] && C.layers.roofs[k][0];
  if (l === 'struct') {
    const info = STRUCT[k][3];
    if (info.look === 'wall') return C.layers.walls[info.colour][0];
    return { window: C.layers.glass, door: C.layers.door[0], garage: '#9aa0a6', stonewall: '#8a847c', rail: '#8a6a44', picket: '#f0f0e8',
      chain: '#9aa0a6', barbed: '#7a7a7a', board: '#8a6a44', gate: '#9a6a3a', hedge: C.layers.hedge[0], guard: '#b8bcc0',
      bridge: C.layers.bridge[0], dock: '#9a7a52', tracks: '#6a4a30', steps: C.layers.steps[0], ledge: C.layers.ledge }[info.look];
  }
  if (l === 'object') return OBJECT[k][3].colour || { sign: C.tiles.sign[0], fishing: '#5a8ad0', fire: '#7a7470' }[OBJECT[k][3].look];
  if (l === 'marker') return { [M.START]: C.player, [M.ZOMBIE]: C.zombie, [M.LABEL]: '#1d2a6b', [M.LOOT]: '#1f7a3a', [M.KEYITEM]: '#8a5a10', [M.WRECKSPOT]: '#7a1f2b', [M.NPC]: '#5a3a8a' }[k];
  return null;
}

function buildLayers() {
  const el = $('layers');
  el.innerHTML = '';
  for (const l of LAYERS) {
    const g = document.createElement('div'); g.className = 'layer';
    const b = document.createElement('button');
    b.textContent = LAYER_NAMES[l];
    b.className = (l === layer && tool !== 'building' ? 'on ' : '') + (shown[l] ? '' : 'off');
    b.onclick = () => { layer = l; if (!shown[l]) shown[l] = true; if (tool === 'building') tool = 'paint'; fixTool(); buildAll(); render(); };
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
  const add = (text, colour, active, fn) => {
    const b = document.createElement('button');
    b.innerHTML = swatch(colour) + text;
    if (active) b.className = 'on';
    b.onclick = fn; el.append(b);
  };
  if (tool === 'building') {
    for (const p of BUILDINGS) add(p.label, C.layers.walls[STRUCT[S[p.wall]][3].colour][0], preset === p.key, () => { preset = p.key; buildAll(); });
    add('Demolish', '#c03030', preset === 'demolish', () => { preset = 'demolish'; buildAll(); });
    return;
  }
  if (tool === 'hand') { add('Fit map', null, false, () => { fitView(); render(); }); return; }
  if ((tool === 'paint' || tool === 'line' || tool === 'erase') && gridLayer()) {
    for (const n of [1, 2, 3]) add(`${n}×`, null, size === n, () => { size = n; buildAll(); });
  }
  if (tool === 'erase') return;
  if (layer === 'height') {
    for (const hgt of [0, 1, 2, 3]) add(`Level ${hgt}`, `rgb(${90 + hgt * 40},${110 + hgt * 35},${70 + hgt * 30})`, brush.height === hgt, () => { brush.height = hgt; buildAll(); });
    add('Raise ▲', null, brush.height === 'raise', () => { brush.height = 'raise'; buildAll(); });
    add('Lower ▼', null, brush.height === 'lower', () => { brush.height = 'lower'; buildAll(); });
    return;
  }
  if (layer === 'object') add(rot ? 'Turned ↻' : 'Turn ↻', null, !!rot, () => { rot = rot ? 0 : 1; buildAll(); });
  TABLES[layer].forEach(([, , text], k) => {
    if (k === 0) return;
    if (layer !== 'marker' && kindOf(layer, k) && !kinds.has(`${layer}:${kindOf(layer, k).key}`)) return;   // deleted in the builder
    add((layer !== 'marker' && kindOf(layer, k) ? '★ ' : '') + text, brushColour(layer, k), brush[layer] === k, () => { brush[layer] = k; buildAll(); });
  });
}
// Fill and Rect only make sense on the grid layers.
function fixTool() { if (!gridLayer() && (tool === 'fill' || tool === 'rect' || tool === 'box' || tool === 'line')) tool = 'paint'; }

function buildTools() {
  const el = $('tools');
  el.innerHTML = '';
  const add = (text, id) => {
    const b = document.createElement('button');
    b.textContent = text;
    if (tool === id) b.className = 'on';
    b.onclick = () => {
      tool = id;
      if (!gridLayer() && (id === 'fill' || id === 'rect' || id === 'box' || id === 'line')) { say(`${text} works on height, ground, structures and roofs.`); layer = 'ground'; }
      buildAll();
    };
    el.append(b);
  };
  add('Paint', 'paint'); add('Line', 'line'); add('Rect', 'rect'); add('Box', 'box'); add('Fill', 'fill');
  add('Bldg', 'building'); add('Pick', 'pick'); add('Erase', 'erase'); add('Hand', 'hand');
}
function buildAll() { buildLayers(); buildPalette(); buildTools(); hint(); }

// --- The menu: size, new, roofs, play, copy, paste, open ----------------------------------------------
function openMenu() {
  const { sx, sy } = screensForSize(map.w, map.h);
  $('sx').value = sx; $('sy').value = sy;
  $('hideRoofs').className = hideRoofs ? 'on' : '';
  $('menu').style.display = 'block';
}
$('menuBtn').onclick = openMenu;
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

// --- Size and start ------------------------------------------------------------------------------------
function fitView() {
  view.scale = Math.max(3, Math.min(40, Math.min(cssW / map.w, (cssH - 26) / map.h)));
  view.ox = (map.w * view.scale - cssW) / 2;
  view.oy = (map.h * view.scale - (cssH - 26)) / 2;
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
