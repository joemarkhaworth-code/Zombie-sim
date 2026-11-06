// Boot, input, loop.
import { CONFIG } from './config.js';
import { createWorld, player } from './sim/world.js';
import { applyInput } from './sim/turn.js';
import { computeLayout, tileAtPixel } from './render/layout.js';
import { drawMap } from './render/greybox.js';
import { drawTopBar, drawActionBar } from './render/ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const urlSeed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
const seed = Number.isFinite(urlSeed) ? urlSeed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
let world = createWorld(seed);
let layout;

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
  drawActionBar(ctx, layout);
}

// Tap a tile: your own tile waits; any other tile steps one tile towards it (8-way).
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const t = tileAtPixel(layout, ev.clientX, ev.clientY);
  if (!t) return;
  const p = player(world).Position;
  const dx = Math.sign(t.x - p.x), dy = Math.sign(t.y - p.y);
  const input = dx === 0 && dy === 0 ? { type: 'wait' } : { type: 'move', dx, dy };
  if (applyInput(world, input)) draw();
});

// Keyboard for desktop testing: arrows / numpad / hjklyubn, space or . to wait.
const KEYS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  8: [0, -1], 2: [0, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 9: [1, -1], 1: [-1, 1], 3: [1, 1],
};
window.addEventListener('keydown', ev => {
  let input = null;
  if (ev.key === ' ' || ev.key === '.' || ev.key === '5') input = { type: 'wait' };
  else if (KEYS[ev.key]) input = { type: 'move', dx: KEYS[ev.key][0], dy: KEYS[ev.key][1] };
  if (!input) return;
  ev.preventDefault();
  if (applyInput(world, input)) draw();
});

window.addEventListener('resize', resize);
resize();
