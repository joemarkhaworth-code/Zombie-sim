// Boot, input and render loop.
import { CONFIG } from './config.js';
import { createWorld } from './sim/world.js';
import { playerAct } from './sim/turn.js';
import { drawWorld } from './render/greybox.js';
import { drawStatus } from './render/ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seed = params.has('seed')
  ? Number(params.get('seed')) >>> 0
  : Math.floor(Math.random() * 1e9);
const world = createWorld(seed);
window.world = world; // handy for debugging from the console

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
  const tileSize = Math.floor(Math.min(w / world.width, (h - statusHeight) / world.height));
  layout = {
    width: w, height: h, statusHeight, tileSize,
    offsetX: Math.floor((w - tileSize * world.width) / 2),
    offsetY: statusHeight + Math.floor((h - statusHeight - tileSize * world.height) / 2),
  };
  render();
}

function render() {
  ctx.fillStyle = CONFIG.colours.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawWorld(ctx, world, layout);
  drawStatus(ctx, world, layout);
}

function screenToTile(px, py) {
  return {
    x: Math.floor((px - layout.offsetX) / layout.tileSize),
    y: Math.floor((py - layout.offsetY) / layout.tileSize),
  };
}

// Tap = short press without much movement. (Long-press inspect comes in step 5.)
let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const held = performance.now() - down.t;
  down = null;
  if (moved > CONFIG.input.tapMaxMovePx || held > CONFIG.input.tapMaxMs) return;
  onTap(screenToTile(e.clientX, e.clientY));
});
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function onTap(tile) {
  const p = world.entities.get(world.playerId).Position;
  const dx = tile.x - p.x;
  const dy = tile.y - p.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return; // only adjacent tiles
  const action = dx === 0 && dy === 0 ? { type: 'wait' } : { type: 'move', dx, dy };
  if (playerAct(world, action)) render();
}

window.addEventListener('resize', resize);
resize();
