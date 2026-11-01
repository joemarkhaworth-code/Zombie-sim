// Boot, input and render loop.
import { CONFIG } from './config.js';
import { createWorld } from './sim/world.js';
import { playerAct } from './sim/turn.js';
import { drawWorld } from './render/greybox.js';
import { drawStatus, drawButtons, drawDeath, drawBag, bagLayout } from './render/ui.js';
import { createMessageLog, describeTile, deathText } from './render/messages.js';
import { validTargets, wieldedGun } from './sim/systems/ranged.js';
import { serialize, deserialize } from './sim/save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Saving: the sim turns the world into a string (src/sim/save.js); this file keeps it
// in localStorage. Saved after every action; loaded on start. ?seed=N always starts
// that seed fresh. A save that won't load (older version, corrupt) is discarded.
const params = new URLSearchParams(location.search);
let bootNote = null;

function readSave() {
  try { return localStorage.getItem(CONFIG.save.key); } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(CONFIG.save.key); } catch (e) { /* storage blocked */ }
}

function boot() {
  if (params.has('seed')) return createWorld(Number(params.get('seed')) >>> 0);
  const saved = readSave();
  if (saved) {
    try { return deserialize(saved, createWorld); } catch (e) {
      clearSave();
      bootNote = 'Old save lost. New game.';
    }
  }
  return createWorld(Math.floor(Math.random() * 1e9));
}

const world = boot();
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

// Action bar buttons for the current state: while aiming, one big CANCEL; otherwise
// SNEAK, SHOVE, BAG, plus FIRE when you're holding a gun.
function currentButtons() {
  const pad = 8, w = layout.width, h = layout.height, barH = layout.barHeight;
  const p = world.entities.get(world.playerId);
  const ids = aim ? ['cancel'] : ['sneak', 'shove', 'bag', ...(p && wieldedGun(world, p) ? ['fire'] : [])];
  const bw = Math.floor((w - pad * (ids.length + 1)) / ids.length);
  return ids.map((id, i) => ({ id, x: pad + i * (bw + pad), y: h - barH + pad, w: bw, h: barH - pad * 2 }));
}

function render() {
  updateCamera();
  layout.buttons = currentButtons();
  ctx.fillStyle = CONFIG.colours.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawWorld(ctx, world, layout, inspect, debug, aim ? aim.targets : null);
  drawStatus(ctx, world, layout, messages.message, blink);
  if (bagOpen) drawBag(ctx, world, layout, { confirmNew });
  drawButtons(ctx, world, layout, { armed, bagOpen, ammo: gunAmmo() });
  if (world.gameOver) drawDeath(ctx, layout, deathText(world.gameOver));
}

// Touch: a quick tap acts. Holding still for longPressMs inspects the tile under
// the finger (shown in the status bar, with an outline). Inspecting takes no turn
// and isn't recorded as input.
let down = null;
let inspect = null; // { x, y } of the last inspected tile, until the next action
const debug = { noise: false }; // tap the top bar to toggle the noise heatmap
let armed = null; // one-shot action waiting for a target: 'shove' or null
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
  if (world.gameOver) { restart(); return; }
  if (d.longPressed || d.moved) return;
  if (e.clientY < layout.statusHeight) { toggleNoiseMap(); return; }
  if (e.clientY >= layout.height - layout.barHeight) { onButton(e.clientX, e.clientY); return; }
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

// After death, any tap starts a new run with a fresh random seed.
function restart() {
  clearSave();
  location.href = location.pathname;
}

// Health blocks blink while you're bleeding.
let blink = false;
setInterval(() => {
  const p = world.entities.get(world.playerId);
  if (p && p.Bleeding && p.Bleeding.level > 0) { blink = !blink; render(); }
  else if (blink) { blink = false; render(); }
}, CONFIG.ui.blinkMs);

// Debug: tapping the top bar toggles the noise heatmap. Takes no turn.
function toggleNoiseMap() {
  debug.noise = !debug.noise;
  messages.show(debug.noise ? 'Noise map on.' : 'Noise map off.');
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
