// Boot, input, loop.
import { CONFIG } from './config.js';
import { createWorld, player } from './sim/world.js';
import { applyInput } from './sim/turn.js';
import { computeLayout, tileAtPixel } from './render/layout.js';
import { drawMap } from './render/greybox.js';
import { drawTopBar, drawActionBar } from './render/ui.js';
import { createMessageLog, describeTile } from './render/messages.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
const seed = Number.isFinite(urlSeed) ? urlSeed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
let world = createWorld(seed);
let log = createMessageLog(world);
let layout;
let inspect = null; // { x, y } of the long-pressed tile, cleared by the next action
let debug = false;  // tap the top bar: noise heatmap and world time (takes no turn)

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
  drawMap(ctx, world, layout, inspect, debug);
  drawTopBar(ctx, world, layout, log, debug);
  drawActionBar(ctx, layout);
}

// A player action: clears the status line and any inspect outline, then runs the turn.
// A blocked move takes no turn but still gets its message.
function act(input) {
  log.clear();
  inspect = null;
  applyInput(world, input);
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
    const t = tileAtPixel(layout, p.x, p.y);
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
  if (py < CONFIG.ui.topBarHeight) { debug = !debug; draw(); return; }
  const t = tileAtPixel(layout, px, py);
  if (!t) return;
  const p = player(world).Position;
  if (t.x === p.x && t.y === p.y) return act({ type: 'wait' });
  const ox = px - (layout.mapX + (p.x + 0.5) * layout.tile);
  const oy = py - (layout.mapY + (p.y + 0.5) * layout.tile);
  act(Math.abs(ox) >= Math.abs(oy)
    ? { type: 'move', dx: Math.sign(ox), dy: 0 }
    : { type: 'move', dx: 0, dy: Math.sign(oy) });
}

// Keyboard for desktop testing: arrows / WASD / numpad 8426, space or . to wait. No diagonals.
const KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  8: [0, -1], 2: [0, 1], 4: [-1, 0], 6: [1, 0],
};
window.addEventListener('keydown', ev => {
  let input = null;
  if (ev.key === ' ' || ev.key === '.' || ev.key === '5') input = { type: 'wait' };
  else if (KEYS[ev.key]) input = { type: 'move', dx: KEYS[ev.key][0], dy: KEYS[ev.key][1] };
  if (!input) return;
  ev.preventDefault();
  act(input);
});

window.addEventListener('resize', resize);
resize();
