// Boot, input, loop.
import { CONFIG } from './config.js';
import { createWorld } from './sim/world.js';
import { applyInput } from './sim/turn.js';
import { computeLayout, buttonAt } from './render/layout.js';
import { drawMap } from './render/greybox.js';
import { drawTopBar, drawPad } from './render/ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
const seed = Number.isFinite(urlSeed) ? urlSeed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
let world = createWorld(seed);
let layout;
const held = new Set(); // button ids held down, for highlighting

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
  drawMap(ctx, world, layout);
  drawTopBar(ctx, world, layout);
  drawPad(ctx, layout, held);
}

// What each button does. A waits for now (it becomes the context action later);
// B, SELECT (bag and map) and START (menu, save, new game) come later.
function press(id) {
  const btn = layout.buttons.find(b => b.id === id);
  if (!btn) return;
  if (btn.kind === 'dpad') applyInput(world, { type: 'move', dx: btn.dx, dy: btn.dy });
  else if (id === 'a') applyInput(world, { type: 'wait' });
}

// Touch: press a button to act; hold a d-pad arrow to keep walking.
const pointers = new Map(); // pointerId -> { id, timer }
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const btn = buttonAt(layout, ev.clientX, ev.clientY);
  if (!btn) return;
  release(ev.pointerId);
  const p = { id: btn.id, timer: 0 };
  pointers.set(ev.pointerId, p);
  held.add(btn.id);
  press(btn.id);
  if (btn.kind === 'dpad') {
    const repeat = () => { press(btn.id); draw(); p.timer = setTimeout(repeat, CONFIG.ui.repeatMs); };
    p.timer = setTimeout(repeat, CONFIG.ui.repeatDelayMs);
  }
  draw();
});
function release(pointerId) {
  const p = pointers.get(pointerId);
  if (!p) return;
  clearTimeout(p.timer);
  pointers.delete(pointerId);
  if (![...pointers.values()].some(q => q.id === p.id)) held.delete(p.id);
  draw();
}
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(t, ev => release(ev.pointerId));
}

// Keyboard for desktop testing: arrows / WASD = d-pad, space or Z = A, X = B,
// Shift = SELECT, Enter = START.
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  ' ': 'a', z: 'a', x: 'b', Shift: 'select', Enter: 'start',
};
window.addEventListener('keydown', ev => {
  const id = KEYS[ev.key];
  if (!id) return;
  ev.preventDefault();
  press(id);
  draw();
});

window.addEventListener('resize', resize);
resize();
