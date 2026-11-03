// Boot, input and render loop.
import { CONFIG } from './config.js';
import { createWorld } from './sim/world.js';
import { playerAct } from './sim/turn.js';
import { drawWorld } from './render/greybox.js';
import { drawReplay, landSpot } from './render/replay.js';
import { drawStatus, drawButtons, drawDeath, deathButtons, drawBag, bagLayout, drawTuneButton, tuneButtonRect, drawTuning, tuningLayout, drawMapButton, mapButtonRect } from './render/ui.js';
import { createMessageLog, describeTile, deathText } from './render/messages.js';
import { validTargets, wieldedGun } from './sim/systems/ranged.js';
import { serialize, deserialize } from './sim/save.js';
import { TUNABLES, getPath, nudge, applyOverrides, currentOverrides, resetAll, syncWorld, defaultOf } from './sim/tuning.js';
import { refreshAllVision } from './sim/systems/vision.js';
import { stairsAt } from './sim/systems/floors.js';
import { WEATHER_KINDS } from './sim/systems/weather.js';
import { beckLevel, iceLevel } from './sim/systems/water.js';
import { applyDebug, createReplay } from './sim/replay.js';
import { updateLight } from './sim/systems/light.js';
import { clockOf } from './sim/time.js';
import { canDrinkHere, canSleep } from './sim/turn.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Saving: the sim turns the world into a string (src/sim/save.js); this file keeps it
// in localStorage. Saved after every action; loaded on start. ?seed=N always starts
// that seed fresh. A save that won't load (older version, corrupt) is discarded.
const params = new URLSearchParams(location.search);
let bootNote = null;

// Tuning overrides (debug overlay -> TUNE) live in their own localStorage key and are
// applied to CONFIG before the world is built or loaded.
const TUNING_KEY = 'zombie-sim-tuning';
try { applyOverrides(JSON.parse(localStorage.getItem(TUNING_KEY) || '{}')); } catch (e) { /* ignore bad tuning */ }
function saveTuning() {
  try { localStorage.setItem(TUNING_KEY, JSON.stringify(currentOverrides())); } catch (e) { /* storage blocked */ }
}

function readSave() {
  try { return localStorage.getItem(CONFIG.save.key); } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(CONFIG.save.key); } catch (e) { /* storage blocked */ }
}

// Which map new games use: ?map=testgrid|village, else the choice saved by the debug MAP
// button, else CONFIG.world.map.
const MAP_KEY = 'zombie-sim-map';
function chosenMap() {
  if (params.has('map')) return params.get('map') === 'testgrid' ? 'testgrid' : 'village';
  try { const m = localStorage.getItem(MAP_KEY); if (m === 'testgrid' || m === 'village') return m; } catch (e) { /* ignore */ }
  return CONFIG.world.map;
}

function boot() {
  if (params.has('seed')) return createWorld(Number(params.get('seed')) >>> 0, { map: chosenMap() });
  const saved = readSave();
  if (saved) {
    try { return deserialize(saved, createWorld); } catch (e) {
      clearSave();
      bootNote = 'Old save lost. New game.';
    }
  }
  return createWorld(Math.floor(Math.random() * 1e9), { map: chosenMap() });
}

const world = boot();
syncWorld(world); // a loaded save picks up the current tuning
window.world = world; // handy for debugging from the console

// Save after every action (dead runs aren't kept: reopening after death starts fresh).
function persist() {
  if (world.gameOver) { clearSave(); return; }
  try { localStorage.setItem(CONFIG.save.key, serialize(world)); } catch (e) { /* storage full/blocked: play on */ }
}

// All player actions go through here so every one is saved.
function act(action) {
  const result = playerAct(world, action);
  persist();
  return result;
}
const messages = createMessageLog(world, {
  onScreen: (x, y) => {
    updateCamera(); // the player may have just moved
    return x >= layout.camX && y >= layout.camY && x < layout.camX + layout.cols && y < layout.camY + layout.rows;
  },
});

let layout;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const statusHeight = 32;
  const barHeight = CONFIG.ui.barHeight; // bottom button bar
  const tileSize = Math.floor(w / CONFIG.view.tilesAcross);
  const cols = CONFIG.view.tilesAcross;
  const mapHeight = h - statusHeight - barHeight;
  const rows = Math.floor(mapHeight / tileSize);
  const pad = 8;
  layout = {
    width: w, height: h, statusHeight, barHeight, tileSize, cols, rows,
    offsetX: Math.floor((w - tileSize * cols) / 2),
    offsetY: statusHeight + Math.floor((mapHeight - tileSize * rows) / 2),
  };
  render();
}

// Keep the player centred; stop at the map edges when the map is bigger than the view.
function updateCamera() {
  const p = (world.entities.get(world.playerId) || world.fallenPlayer).Position;
  const clamp = (v, size, view) => (size <= view ? Math.floor((size - view) / 2) : Math.max(0, Math.min(v, size - view)));
  layout.camX = clamp(p.x - (layout.cols >> 1), world.width, layout.cols);
  layout.camY = clamp(p.y - (layout.rows >> 1), world.height, layout.rows);
}

// Standing on stairs or a ladder: UP / DOWN to climb, and at the top of a ladder PULL / LOWER.
function stairButtons(p) {
  const s = p && p.Position && stairsAt(world, p.Position.x, p.Position.y);
  if (!s) return [];
  const out = [s.Stairs.top ? 'down' : 'up'];
  if (s.Stairs.kind === 'ladder' && s.Stairs.top) out.push(s.Stairs.pulled ? 'lower' : 'pull');
  return out;
}

// Action bar buttons for the current state: while aiming, one big CANCEL; otherwise
// SNEAK, SHOVE, BAG, plus FIRE when you're holding a gun, plus stairs buttons.
function currentButtons() {
  const pad = 8, w = layout.width, h = layout.height, barH = layout.barHeight;
  const p = world.entities.get(world.playerId);
  const ids = aim ? ['cancel'] : ['sneak', 'shove', 'bag', ...(p && wieldedGun(world, p) ? ['fire'] : []), ...stairButtons(p), ...(p && canDrinkHere(world, p) ? ['drink'] : []), ...(p && canSleep(p) ? ['sleep'] : [])];
  const bw = Math.floor((w - pad * (ids.length + 1)) / ids.length);
  return ids.map((id, i) => ({ id, x: pad + i * (bw + pad), y: h - barH + pad, w: bw, h: barH - pad * 2 }));
}

// Death replay (step 21): the run rebuilt from seed + inputs and played back from above.
let replaying = null; // { r, trail, perFrame }
function startReplay() {
  const r = createReplay(createWorld, { seed: world.seed, map: world.map, inputs: world.inputs.slice() });
  // Time-based: long runs fit in about replay.seconds; short ones play no faster than minRate.
  const rate = Math.max(CONFIG.replay.minRate, r.total / CONFIG.replay.seconds); // inputs a second
  replaying = { r, trail: [] };
  let last = performance.now(), owed = 0;
  const frame = (now) => {
    if (!replaying || replaying.r !== r) return;
    owed += Math.min(0.1, (now - last) / 1000) * rate; last = now;
    const n = Math.floor(owed); owed -= n;
    r.step(n);
    const p = r.world.entities.get(r.world.playerId) || r.world.fallenPlayer;
    const at = p && p.Position && landSpot(r.world, p.Position.x, p.Position.y);
    const prev = replaying.trail[replaying.trail.length - 1];
    if (at && (!prev || prev.x !== at.x || prev.y !== at.y)) replaying.trail.push({ x: at.x, y: at.y });
    render();
    if (!r.done) requestAnimationFrame(frame);
  };
  requestAnimationFrame((t) => { last = t; frame(t); });
}

function render() {
  if (replaying) { drawReplay(ctx, layout, replaying.r.world, { trail: replaying.trail, index: replaying.r.index, total: replaying.r.total, flash: blink }); return; }
  updateCamera();
  layout.buttons = currentButtons();
  ctx.fillStyle = CONFIG.colours.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawWorld(ctx, world, layout, inspect, debug, aim ? aim.targets : null);
  drawStatus(ctx, world, layout, messages.message, blink);
  if (bagOpen) drawBag(ctx, world, layout, { confirmNew });
  if (debug.noise && !tuneOpen) { drawTuneButton(ctx, layout); drawMapButton(ctx, layout, world.map); }
  if (tuneOpen) drawTuning(ctx, layout, tuneRows());
  drawButtons(ctx, world, layout, { armed, bagOpen, ammo: gunAmmo() });
  if (world.gameOver) {
    if (!diedAt) diedAt = performance.now();
    drawDeath(ctx, layout, deathText(world), blink);
  }
}

// Touch: a quick tap acts. Holding still for longPressMs inspects the tile under
// the finger (shown in the status bar, with an outline). Inspecting takes no turn
// and isn't recorded as input.
let down = null;
let inspect = null; // { x, y } of the last inspected tile, until the next action
const debug = { noise: false }; // tap the top bar to toggle the noise heatmap
let armed = null; // one-shot action waiting for a target: 'shove' or null
let tuneOpen = false; // tuning panel (opened from the debug overlay's TUNE button)
let bagOpen = false; // inventory panel showing (opening it takes no turn)
let confirmNew = false; // the bag's NEW GAME button asked "are you sure?"
let aim = null;      // aiming: { kind: 'throw', itemId, targets } or { kind: 'fire', targets } - targets = valid tile set

function gunAmmo() {
  const p = world.entities.get(world.playerId);
  const g = p && wieldedGun(world, p);
  return g ? g.Item.ammo : null;
}

function startAim(kind, itemId = null) {
  const p = world.entities.get(world.playerId);
  const range = kind === 'throw' ? CONFIG.throw.range : CONFIG.items[wieldedGun(world, p).Item.type].ranged.range;
  aim = { kind, itemId, targets: validTargets(world, p, range) };
  bagOpen = false; armed = null; inspect = null;
  messages.show(aim.targets.size ? (kind === 'throw' ? 'Throw: tap a lit tile.' : 'Fire: tap a lit tile.') : 'Nothing in range.');
  if (!aim.targets.size) aim = null;
  render();
}

canvas.addEventListener('pointerdown', (e) => {
  const at = { x: e.clientX, y: e.clientY };
  down = {
    ...at, moved: false, longPressed: false,
    timer: setTimeout(() => {
      if (!down || down.moved) return;
      down.longPressed = true;
      onLongPress(at.x, at.y);
    }, CONFIG.input.longPressMs),
  };
});
canvas.addEventListener('pointermove', (e) => {
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CONFIG.input.tapMaxMovePx) {
    down.moved = true;
    clearTimeout(down.timer);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const d = down;
  down = null;
  clearTimeout(d.timer);
  if (replaying) { replaying = null; render(); return; } // any tap leaves the replay
  if (world.gameOver) {
    if (performance.now() - diedAt < CONFIG.ui.deathTapDelayMs) return; // a moment to read the page
    const B = deathButtons(layout), hit = (b) => e.clientX >= b.x && e.clientX < b.x + b.w && e.clientY >= b.y && e.clientY < b.y + b.h;
    if (hit(B.replay)) startReplay();
    else if (hit(B.newGame)) restart();
    return;
  }
  if (d.longPressed || d.moved) return;
  if (e.clientY < layout.statusHeight) { toggleNoiseMap(); return; }
  if (e.clientY >= layout.height - layout.barHeight) { onButton(e.clientX, e.clientY); return; }
  if (tuneOpen) { onTuneTap(e.clientX, e.clientY); return; }
  if (debug.noise && inRect(tuneButtonRect(layout), e.clientX, e.clientY)) { tuneOpen = true; render(); return; }
  if (debug.noise && inRect(mapButtonRect(layout), e.clientX, e.clientY)) { switchMap(); return; }
  if (bagOpen) { onBagTap(e.clientX, e.clientY); return; }
  if (aim) { onAimTap(e.clientX, e.clientY); return; }
  onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', () => { if (down) clearTimeout(down.timer); down = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function screenToTile(px, py) {
  return {
    x: layout.camX + Math.floor((px - layout.offsetX) / layout.tileSize),
    y: layout.camY + Math.floor((py - layout.offsetY) / layout.tileSize),
  };
}

const inRect = (b, px, py) => px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h;

// Tuning panel rows: label, current value (as text), and whether it differs from default.
// The first rows change the world rather than CONFIG (debug only: the run won't replay):
// Weather (cycle the kinds; holds 24 h), Time (an hour back or on), Give, and the Beck
// and Ice levels (step 20).
const WORLD_ROWS = 5;
let giveType = 'lighter'; // TUNE: the item the Give row hands you
function tuneRows() {
  return [
    { label: 'Weather', value: world.weather ? ({ overcast: 'cloudy', heavyRain: 'pour' }[world.weather.kind] || world.weather.kind) : '-', changed: true },
    { label: 'Time', value: clockOf(world.tick), changed: true },
    { label: 'Give (- next, + give)', value: giveType, changed: true },
    { label: 'Beck', value: ['', 'normal', 'spate', 'flood'][beckLevel(world)], changed: true },
    { label: 'Ice', value: ['none', 'thin', 'ice', 'thick'][iceLevel(world)], changed: true },
    ...TUNABLES.map((t) => {
      const v = getPath(t.path);
      return { label: t.label, value: t.pct ? `${Math.round(v * 100)}%` : String(v), changed: v !== defaultOf(t.path) };
    }),
  ];
}

// Tuning panel taps: -/+ per row, RESET, CLOSE. Changes apply at once (zombies on the map
// are updated, sight recomputed) and are saved locally.
function onTuneTap(px, py) {
  const L = tuningLayout(layout, TUNABLES.length + WORLD_ROWS);
  if (inRect(L.close, px, py)) { tuneOpen = false; render(); return; }
  if (inRect(L.reset, px, py)) resetAll();
  else {
    const i = L.rows.findIndex((r) => inRect(r.minus, px, py) || inRect(r.plus, px, py));
    if (i < 0) return;
    const dir = inRect(L.rows[i].plus, px, py) ? 1 : -1;
    if (i === 0) { // weather: the next / previous kind, held for a day
      const kinds = WEATHER_KINDS(), at = kinds.indexOf(world.weather.kind);
      applyDebug(world, { kind: 'weather', to: kinds[(at + dir + kinds.length) % kinds.length] }); // recorded, so replays match
      persist(); render(); return;
    }
    if (i === 2) { // give: '-' picks the next item type, '+' puts one in your bag (or at your feet)
      const types = Object.keys(CONFIG.items).filter((k) => k !== 'key');
      if (dir < 0) { giveType = types[(types.indexOf(giveType) + 1) % types.length]; render(); return; }
      if (applyDebug(world, { kind: 'give', type: giveType }) === 'bag') messages.show(`Given: ${CONFIG.items[giveType].name}.`);
      else messages.show('Bag full: left at your feet.');
      persist(); render(); return;
    }
    if (i === 3 || i === 4) { // beck / ice: a level up or down now
      const what = i === 3 ? 'beck' : 'ice';
      applyDebug(world, { kind: 'water', what, level: (what === 'beck' ? beckLevel(world) : iceLevel(world)) + dir });
      persist(); render(); return;
    }
    if (i === 1) { // time: an hour on or back
      applyDebug(world, { kind: 'time', hours: dir });
      persist(); render(); return;
    }
    nudge(TUNABLES[i - WORLD_ROWS], dir);
  }
  syncWorld(world);
  refreshAllVision(world);
  saveTuning();
  persist();
  render();
}

// Debug: switch between the village and the phase-1 test grid. Starts a new game.
function switchMap() {
  const next = world.map === 'village' ? 'testgrid' : 'village';
  try { localStorage.setItem(MAP_KEY, next); } catch (e) { /* ignore */ }
  clearSave();
  location.href = location.pathname;
}

// After death, any tap starts a new run with a fresh random seed.
function restart() {
  clearSave();
  location.href = location.pathname;
}

// Health blocks blink while you're bleeding; the death page's prompt flashes.
let blink = false;
let diedAt = 0;
setInterval(() => {
  const p = world.entities.get(world.playerId);
  if (world.gameOver || (p && p.Bleeding && p.Bleeding.level > 0)) { blink = !blink; render(); }
  else if (blink) { blink = false; render(); }
}, CONFIG.ui.blinkMs);

// Debug: tapping the top bar toggles the noise heatmap. Takes no turn.
function toggleNoiseMap() {
  debug.noise = !debug.noise;
  messages.show(debug.noise ? 'Debug map on.' : 'Debug map off.');
  render();
}

// Bottom bar buttons. SNEAK toggles sneaking (takes no turn, but is recorded).
function onButton(px, py) {
  const b = layout.buttons.find((b) => px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h);
  if (!b) return;
  if (b.id === 'cancel') {
    aim = null;
    messages.show('Cancelled.');
    render();
    return;
  }
  if (b.id === 'up' || b.id === 'down') { act({ type: 'climb' }); render(); return; }
  if (b.id === 'drink') { act({ type: 'drink' }); render(); return; }
  if (b.id === 'sleep') { act({ type: 'sleep' }); render(); return; }
  if (b.id === 'pull' || b.id === 'lower') { act({ type: 'ladder', up: b.id === 'pull' }); render(); return; }
  if (b.id === 'fire') {
    if (gunAmmo() <= 0) { act({ type: 'fire', x: -1, y: -1 }); render(); return; } // shows "Out of ammo."
    startAim('fire');
    return;
  }
  if (b.id === 'bag') {
    inspect = null;
    armed = null;
    confirmNew = false;
    bagOpen = !bagOpen;
    render();
    return;
  }
  if (b.id === 'shove') {
    bagOpen = false;
    inspect = null;
    armed = armed === 'shove' ? null : 'shove';
    messages.show(armed ? 'Shove: tap a creature by you.' : 'Shove cancelled.');
    if (navigator.vibrate) navigator.vibrate(10);
    render();
    return;
  }
  if (b.id === 'sneak') {
    const p = world.entities.get(world.playerId);
    inspect = null;
    act({ type: 'sneak', on: !p.Stealth.sneaking });
    if (navigator.vibrate) navigator.vibrate(10);
    render();
  }
}

// Inventory panel taps: CLOSE, or a row's use/drop button. Using or dropping takes a
// turn and closes the bag so you can see what the world did meanwhile.
function onBagTap(px, py) {
  const bag = bagLayout(world, layout, { confirmNew });
  const hit = (b) => px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h;
  if (confirmNew) {
    if (hit(bag.yes)) { restart(); return; }
    if (hit(bag.no)) { confirmNew = false; render(); }
    return;
  }
  if (hit(bag.newGame)) { confirmNew = true; render(); return; }
  if (hit(bag.close)) { bagOpen = false; render(); return; }
  for (const r of bag.rows) {
    if (hit(r.toss)) { startAim('throw', r.itemId); return; }
    const type = hit(r.use) ? 'use' : hit(r.drop) ? 'drop' : null;
    if (!type) continue;
    act({ type, itemId: r.itemId });
    bagOpen = false;
    if (navigator.vibrate) navigator.vibrate(10);
    render();
    return;
  }
}

// Aiming: tap a highlighted tile to throw/fire there. Tapping yourself cancels;
// anything else just says so and keeps aiming.
function onAimTap(px, py) {
  const t = screenToTile(px, py);
  const p = world.entities.get(world.playerId).Position;
  if (t.x === p.x && t.y === p.y) { aim = null; messages.show('Cancelled.'); render(); return; }
  if (!aim.targets.has(t.y * world.width + t.x)) { messages.show("Can't aim there."); render(); return; }
  const a = aim;
  aim = null;
  act(a.kind === 'throw' ? { type: 'throw', itemId: a.itemId, x: t.x, y: t.y } : { type: 'fire', x: t.x, y: t.y });
  if (navigator.vibrate) navigator.vibrate(a.kind === 'fire' ? 30 : 10);
  render();
}

function onLongPress(px, py) {
  if (bagOpen || aim) return;
  if (py < layout.statusHeight || py >= layout.height - layout.barHeight) return; // bars aren't tiles
  inspect = screenToTile(px, py);
  messages.show(describeTile(world, inspect.x, inspect.y));
  if (navigator.vibrate) navigator.vibrate(15); // small buzz so you know it registered
  render();
}

// Tap anywhere: step one tile in that direction (8-way). Tap on yourself: wait.
function onTap(px, py) {
  const p = world.entities.get(world.playerId).Position;
  const s = layout.tileSize;
  const cx = layout.offsetX + (p.x - layout.camX + 0.5) * s;
  const cy = layout.offsetY + (p.y - layout.camY + 0.5) * s;
  const ddx = px - cx, ddy = py - cy;
  let action;
  const onSelf = Math.hypot(ddx, ddy) < s * CONFIG.input.waitRadiusTiles;
  let dx = 0, dy = 0;
  if (!onSelf) {
    const sector = Math.round(Math.atan2(ddy, ddx) / (Math.PI / 4)); // -4..4
    const dirs = { 0: [1, 0], 1: [1, 1], 2: [0, 1], 3: [-1, 1], 4: [-1, 0], '-4': [-1, 0], '-3': [-1, -1], '-2': [0, -1], '-1': [1, -1] };
    [dx, dy] = dirs[sector];
  }
  inspect = null;
  if (armed === 'shove') {
    // One-shot: this tap picks the direction. Nothing there (or tapping yourself) cancels.
    armed = null;
    if (onSelf || !act({ type: 'shove', dx, dy })) messages.show(onSelf ? 'Shove cancelled.' : 'Nothing to shove there.');
    render();
    return;
  }
  // Tapping exactly on an adjacent door toggles it (open/close); tapping further in
  // that direction walks (through an open doorway, or into a closed door to open it).
  const exact = screenToTile(px, py);
  // Tapping exactly on an adjacent window, locked door or barricade bashes it - the only
  // way to break things, so a stray tap in that direction never smashes a window.
  const st = [...world.entities.values()].find((e) => e.Structure && e.Position.x === exact.x && e.Position.y === exact.y);
  if (st && Math.max(Math.abs(exact.x - p.x), Math.abs(exact.y - p.y)) === 1) {
    const toggles = st.Door && !st.Door.locked && !st.Barricade && !st.Door.broken;
    if (toggles || st.Blocks) {
      act(toggles ? { type: 'door', x: exact.x, y: exact.y } : { type: 'bash', x: exact.x, y: exact.y });
      render();
      return;
    }
  }
  const underfoot = onSelf && [...world.entities.values()].some((e) => e.Item && e.Position && e.Position.x === p.x && e.Position.y === p.y);
  action = underfoot ? { type: 'pickup' } : onSelf ? { type: 'wait' } : { type: 'move', dx, dy };
  act(action);
  render(); // even a failed move (bump) shows a message
}

window.addEventListener('resize', resize);
resize();
if (bootNote) { messages.show(bootNote); render(); }
persist(); // a brand-new game is saved straight away
