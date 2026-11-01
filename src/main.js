// Boot, input and render loop.
import { CONFIG } from './config.js';
import { createWorld } from './sim/world.js';
import { playerAct } from './sim/turn.js';
import { drawWorld } from './render/greybox.js';
import { drawStatus } from './render/ui.js';
import { createMessageLog } from './render/messages.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seed = params.has('seed')
  ? Number(params.get('seed')) >>> 0
  : Math.floor(Math.random() * 1e9);
const world = createWorld(seed);
window.world = world; // handy for debugging from the console
const messages = createMessageLog(world);

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
  const tileSize = Math.floor(w / CONFIG.view.tilesAcross);
  const cols = CONFIG.view.tilesAcross;
  const rows = Math.floor((h - statusHeight) / tileSize);
  layout = {
    width: w, height: h, statusHeight, tileSize, cols, rows,
    offsetX: Math.floor((w - tileSize * cols) / 2),
    offsetY: statusHeight + Math.floor((h - statusHeight - tileSize * rows) / 2),
  };
  render();
}

// Keep the player centred; stop at the map edges when the map is bigger than the view.
function updateCamera() {
  const p = world.entities.get(world.playerId).Position;
  const clamp = (v, size, view) => (size <= view ? Math.floor((size - view) / 2) : Math.max(0, Math.min(v, size - view)));
  layout.camX = clamp(p.x - (layout.cols >> 1), world.width, layout.cols);
  layout.camY = clamp(p.y - (layout.rows >> 1), world.height, layout.rows);
}

function render() {
  updateCamera();
  ctx.fillStyle = CONFIG.colours.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawWorld(ctx, world, layout);
  drawStatus(ctx, world, layout, messages.message);
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
  onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Tap anywhere: step one tile in that direction (8-way). Tap on yourself: wait.
function onTap(px, py) {
  const p = world.entities.get(world.playerId).Position;
  const s = layout.tileSize;
  const cx = layout.offsetX + (p.x - layout.camX + 0.5) * s;
  const cy = layout.offsetY + (p.y - layout.camY + 0.5) * s;
  const ddx = px - cx, ddy = py - cy;
  let action;
  if (Math.hypot(ddx, ddy) < s * CONFIG.input.waitRadiusTiles) {
    action = { type: 'wait' };
  } else {
    const sector = Math.round(Math.atan2(ddy, ddx) / (Math.PI / 4)); // -4..4
    const dirs = { 0: [1, 0], 1: [1, 1], 2: [0, 1], 3: [-1, 1], 4: [-1, 0], '-4': [-1, 0], '-3': [-1, -1], '-2': [0, -1], '-1': [1, -1] };
    const [dx, dy] = dirs[sector];
    action = { type: 'move', dx, dy };
  }
  playerAct(world, action);
  render(); // even a failed move (bump) shows a message
}

window.addEventListener('resize', resize);
resize();
