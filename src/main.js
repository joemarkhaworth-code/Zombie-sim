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

// Tap your own tile to wait. Tap anywhere else on the map to step one tile up, down, left
// or right: whichever way is furthest from you, measured in pixels from your tile's centre.
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const t = tileAtPixel(layout, ev.clientX, ev.clientY);
  if (!t) return;
  const p = player(world).Position;
  let input;
  if (t.x === p.x && t.y === p.y) input = { type: 'wait' };
  else {
    const ox = ev.clientX - (layout.mapX + (p.x + 0.5) * layout.tile);
    const oy = ev.clientY - (layout.mapY + (p.y + 0.5) * layout.tile);
    input = Math.abs(ox) >= Math.abs(oy)
      ? { type: 'move', dx: Math.sign(ox), dy: 0 }
      : { type: 'move', dx: 0, dy: Math.sign(oy) };
  }
  if (applyInput(world, input)) draw();
});

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
  if (applyInput(world, input)) draw();
});

window.addEventListener('resize', resize);
resize();
