// Boot, input, loop.
import { CONFIG } from './config.js';
import { createWorld, player } from './sim/world.js';
import { applyInput } from './sim/turn.js';
import { creatureAt } from './sim/systems/combat.js';
import { canNotice } from './sim/systems/vision.js';
import { computeLayout, tileAtPixel, actionButtonAt } from './render/layout.js';
import { drawMap, camera } from './render/greybox.js';
import { drawTopBar, drawActionBar, drawDeath } from './render/ui.js';
import { drawBag, bagHitAt } from './render/bag.js';
import { itemsAt } from './sim/systems/items.js';
import { validThrowTargets } from './sim/systems/throwing.js';
import { saveWorld, loadWorld } from './sim/save.js';
import { createMessageLog, describeTile } from './render/messages.js';
import { parseMap } from './sim/map.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Saving: after every action that reaches the sim, the whole game goes into localStorage.
// On start, the save is loaded; ?seed=N always starts that seed fresh. A save that can't be read
// (an older version, broken) starts a new game with a note. Dying deletes the save. If storage
// is blocked or full, the game plays on unsaved.
// Which map: ?map=NAME loads maps/NAME.txt (made in the map editor, editor.html), with its own
// save; ?map=editor plays the map the editor just sent ("Play from here"), never saved;
// otherwise CONFIG.world.mapFile if set, else the built-in region.
const params = new URLSearchParams(location.search);
let mapName = params.get('map') || CONFIG.world.mapFile || null;
let mapData = null, mapNote = '';
if (mapName) {
  try {
    const text = mapName === 'editor' ? localStorage.getItem(CONFIG.editor.playKey)
      : await (await fetch(`maps/${encodeURIComponent(mapName)}.txt`, { cache: 'no-store' })).text();
    if (!text) throw new Error('no map');
    mapData = parseMap(text);
  } catch (e) { mapNote = "Couldn't load that map."; mapName = null; }
}
const saveKey = mapName ? `${CONFIG.save.key}:${mapName}` : CONFIG.save.key;
const saving = mapName !== 'editor';
const make = (seed, opts = {}) => createWorld(seed, mapData ? { ...opts, map: `file:${mapName}`, mapData } : opts);
const store = {
  get() { try { return saving ? localStorage.getItem(saveKey) : null; } catch (e) { return null; } },
  set(v) { try { if (saving) localStorage.setItem(saveKey, v); } catch (e) { /* plays on unsaved */ } },
  clear() { try { localStorage.removeItem(saveKey); } catch (e) { /* nothing to clear */ } },
};
const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;
const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
let world, startNote = '';
if (Number.isFinite(urlSeed)) {
  world = make(urlSeed >>> 0);
} else {
  const saved = store.get();
  if (saved) {
    try { world = loadWorld(make, saved); } catch (e) { startNote = 'Old save lost. New game.'; store.clear(); }
  }
  if (!world) world = make(randomSeed());
}
let log = createMessageLog(world);
if (startNote || mapNote) log.show(mapNote || startNote);
let layout;
let inspect = null; // { x, y } of the long-pressed tile, cleared by the next action
let debug = false;  // tap the top bar: noise heatmap and world time (takes no turn)
let shoveArmed = false; // SHOVE pressed: the next map tap picks the direction
let bagOpen = false;    // BAG panel showing (opening it takes no turn)
let bagSelected = 0;    // item id tapped in the bag
let aiming = 0;         // item id being aimed for a throw (THROW in the bag); 0 when not aiming
let diedAt = 0;     // when the player died (ms), so a fast tapper sees the death screen

function newGame(newSeed) {
  store.clear();
  world = make(newSeed);
  log = createMessageLog(world);
  inspect = null; shoveArmed = false; bagOpen = false; aiming = 0; diedAt = 0;
  draw();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(w, h);
  draw();
}

function draw() {
  ctx.fillStyle = CONFIG.colours.background;
  ctx.fillRect(0, 0, layout.cssW, layout.cssH);
  drawMap(ctx, world, layout, inspect, debug, aiming ? validThrowTargets(world, player(world)) : null);
  drawTopBar(ctx, world, layout, log, debug);
  if (bagOpen) drawBag(ctx, world, layout, bagSelected);
  drawActionBar(ctx, layout, { shoveArmed, bagOpen, aiming: !!aiming });
  if (world.gameOver) drawDeath(ctx, world, layout);
}

// A player action: clears the status line and any inspect outline, then runs the turn.
// A blocked move takes no turn but still gets its message.
function act(input) {
  endScroll();
  log.clear();
  inspect = null;
  const camBefore = { ...world.cam };
  const oldMap = captureMap(); // the screen as it was, in case the view flips
  const took = applyInput(world, input);
  if (world.gameOver) { if (!diedAt) diedAt = performance.now(); store.clear(); }
  else store.set(saveWorld(world));
  draw();
  const dx = world.cam.sx - camBefore.sx, dy = world.cam.sy - camBefore.sy;
  if ((dx || dy) && CONFIG.ui.scrollMs > 0) startScroll(oldMap, dx, dy);
  return took;
}

// Scrolling between screens (render only, Zelda-style): when the view flips, the old screen
// slides out and the new one slides in over ui.scrollMs. Both are pictures of the map area;
// screens overlap, so they slide by a screen's step, not its full size. A tap during the slide
// finishes it at once (and still counts).
let scroll = null; // { oldMap, newMap, dx, dy, start }
function captureMap() {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.width = Math.round(layout.mapW * dpr); c.height = Math.round(layout.mapH * dpr);
  c.getContext('2d').drawImage(canvas, layout.mapX * dpr, layout.mapY * dpr, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}
function startScroll(oldMap, dx, dy) {
  scroll = { oldMap, newMap: captureMap(), dx, dy, start: performance.now() };
  requestAnimationFrame(scrollFrame);
}
function scrollFrame(now) {
  if (!scroll) return;
  const f = Math.min(1, (now - scroll.start) / CONFIG.ui.scrollMs);
  if (f >= 1) { endScroll(); return; }
  const e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f); // ease in and out
  const L = layout, stepX = world.stepX * L.tile, stepY = world.stepY * L.tile;
  const panX = scroll.dx * stepX * e, panY = scroll.dy * stepY * e;
  draw();
  ctx.save();
  ctx.beginPath(); ctx.rect(L.mapX, L.mapY, L.mapW, L.mapH); ctx.clip();
  ctx.fillStyle = CONFIG.colours.background; ctx.fillRect(L.mapX, L.mapY, L.mapW, L.mapH);
  ctx.drawImage(scroll.oldMap, L.mapX - panX, L.mapY - panY, L.mapW, L.mapH);
  ctx.drawImage(scroll.newMap, L.mapX + scroll.dx * stepX - panX, L.mapY + scroll.dy * stepY - panY, L.mapW, L.mapH);
  ctx.restore();
  requestAnimationFrame(scrollFrame);
}
function endScroll() {
  if (!scroll) return;
  scroll = null;
  draw();
}

// Touch. A quick tap acts on release: tap your own tile to wait, anywhere else on the map to
// step one tile up, down, left or right (whichever way is furthest from your tile's centre).
// Hold still for longPressMs to inspect the tile instead: no turn, not recorded.
let press = null; // { x, y, timer, done }
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  if (press) clearTimeout(press.timer);
  const p = { x: ev.clientX, y: ev.clientY, done: false, timer: 0 };
  p.timer = setTimeout(() => {
    p.done = true;
    const t = tileAtPixel(layout, p.x, p.y, camera(world));
    if (!t) return;
    inspect = t;
    log.show(describeTile(world, t.x, t.y));
    if (navigator.vibrate) navigator.vibrate(CONFIG.ui.vibrateMs);
    draw();
  }, CONFIG.ui.longPressMs);
  press = p;
});
canvas.addEventListener('pointermove', ev => {
  if (press && !press.done && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > CONFIG.ui.tapSlop) {
    clearTimeout(press.timer); press = null; // a drag, not a tap
  }
});
canvas.addEventListener('pointerup', ev => {
  const p = press; press = null;
  if (!p) return;
  clearTimeout(p.timer);
  if (p.done) return; // that was an inspect
  tap(p.x, p.y);
});
canvas.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; });
canvas.addEventListener('contextmenu', ev => ev.preventDefault());

function tap(px, py) {
  endScroll();
  if (world.gameOver) {
    // Ignore taps for a moment so a fast tapper sees the death screen, then start again.
    if (performance.now() - diedAt > CONFIG.ui.deathTapDelayMs) newGame(randomSeed());
    return;
  }
  if (py < CONFIG.ui.topBarHeight) { debug = !debug; draw(); return; }
  const btn = actionButtonAt(layout, px, py, aiming ? ['cancel'] : undefined);
  if (btn) return pressButton(btn.id);
  if (aiming) {
    // Aiming a throw: tap a highlighted tile. Tapping yourself cancels; anywhere else says so.
    const t = tileAtPixel(layout, px, py, camera(world));
    if (!t) return;
    const pp = player(world).Position;
    if (t.x === pp.x && t.y === pp.y) { aiming = 0; draw(); return; }
    if (!validThrowTargets(world, player(world)).some(v => v.x === t.x && v.y === t.y)) { log.show("Can't throw there."); draw(); return; }
    const itemId = aiming; aiming = 0;
    act({ type: 'throw', itemId, x: t.x, y: t.y });
    return;
  }
  if (bagOpen) {
    // Tap an item to select it (no turn); use or drop takes a turn and closes the bag so you
    // see what happened.
    const b = bagHitAt(world, layout, bagSelected, px, py);
    if (!b) return;
    if (b.action === 'select') { bagSelected = b.itemId; draw(); return; }
    bagOpen = false; bagSelected = 0;
    if (b.action === 'throw') {
      // Start aiming (no turn yet). If there's nowhere to throw it, say so.
      if (!validThrowTargets(world, player(world)).length) { log.show('Nowhere to throw it.'); draw(); return; }
      aiming = b.itemId; log.show('Tap where to throw it.'); draw(); return;
    }
    if (b.action === 'use') act({ type: 'use', itemId: b.itemId });
    else if (b.action === 'drop') act({ type: 'drop', itemId: b.itemId });
    else draw();
    return;
  }
  const cam = camera(world);
  const t = tileAtPixel(layout, px, py, cam);
  if (!t) return;
  const p = player(world).Position;
  const self = t.x === p.x && t.y === p.y;
  const ox = px - (layout.mapX + (p.x - cam.ox + 0.5) * layout.tile);
  const oy = py - (layout.mapY + (p.y - cam.oy + 0.5) * layout.tile);
  let [dx, dy] = Math.abs(ox) >= Math.abs(oy) ? [Math.sign(ox), 0] : [0, Math.sign(oy)];
  // Tapping a creature you can see diagonally next to you hits (or shoves) it: attacks reach
  // 8 ways, movement is 4-way.
  const tx = t.x - p.x, ty = t.y - p.y;
  if (Math.abs(tx) === 1 && Math.abs(ty) === 1) {
    const c = creatureAt(world, t.x, t.y);
    if (c && canNotice(world, player(world), c)) [dx, dy] = [tx, ty];
  }
  if (shoveArmed) {
    // Armed: this tap picks the direction. Tapping yourself cancels; nothing there cancels too.
    shoveArmed = false;
    if (self) { draw(); return; }
    if (!act({ type: 'shove', dx, dy })) { log.show('Nothing to shove there.'); draw(); }
    return;
  }
  // Tapping yourself picks up what you're standing on (if anything), else waits.
  if (self) return act(itemsAt(world, p.x, p.y).length ? { type: 'pickup' } : { type: 'wait' });
  act({ type: 'move', dx, dy });
}

// Action bar buttons. SHOVE arms (takes no turn); pressing it again disarms.
function pressButton(id) {
  if (id === 'cancel') { aiming = 0; log.clear(); draw(); return; }
  if (id === 'shove') { shoveArmed = !shoveArmed; bagOpen = false; draw(); }
  if (id === 'bag') { bagOpen = !bagOpen; bagSelected = 0; shoveArmed = false; draw(); }
}

// Keyboard for desktop testing: arrows / WASD / numpad 8426, space or . to wait, F shove,
// I or B bag, G pick up. No diagonals.
const KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  8: [0, -1], 2: [0, 1], 4: [-1, 0], 6: [1, 0],
};
window.addEventListener('keydown', ev => {
  if (world.gameOver) { if (performance.now() - diedAt > CONFIG.ui.deathTapDelayMs) newGame(randomSeed()); return; }
  if (ev.key === 'f') { ev.preventDefault(); pressButton('shove'); return; }
  if (ev.key === 'i' || ev.key === 'b') { ev.preventDefault(); pressButton('bag'); return; }
  if (ev.key === 'g') { ev.preventDefault(); act({ type: 'pickup' }); return; }
  let input = null;
  if (ev.key === ' ' || ev.key === '.' || ev.key === '5') input = { type: 'wait' };
  else if (KEYS[ev.key]) {
    input = { type: shoveArmed ? 'shove' : 'move', dx: KEYS[ev.key][0], dy: KEYS[ev.key][1] };
    shoveArmed = false;
  }
  if (!input) return;
  ev.preventDefault();
  act(input);
});

window.addEventListener('resize', resize);
resize();
