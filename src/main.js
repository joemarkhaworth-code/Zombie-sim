// Boot, input and render loop.
import { CONFIG } from './config.js';
import { createWorld } from './sim/world.js';
import { playerAct } from './sim/turn.js';
import { drawWorld } from './render/greybox.js';
import { drawStatus, drawButtons } from './render/ui.js';
import { createMessageLog, describeTile } from './render/messages.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seed = params.has('seed')
  ? Number(params.get('seed')) >>> 0
  : Math.floor(Math.random() * 1e9);
const world = createWorld(seed);
window.world = world; // handy for debugging from the console
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
    buttons: [{ id: 'sneak', x: pad, y: h - barHeight + pad, w: w - pad * 2, h: barHeight - pad * 2 }],
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
  drawWorld(ctx, world, layout, inspect, debug);
  drawStatus(ctx, world, layout, messages.message);
  drawButtons(ctx, world, layout);
}

// Touch: a quick tap acts. Holding still for longPressMs inspects the tile under
// the finger (shown in the status bar, with an outline). Inspecting takes no turn
// and isn't recorded as input.
let down = null;
let inspect = null; // { x, y } of the last inspected tile, until the next action
const debug = { noise: false }; // tap the top bar to toggle the noise heatmap

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
  if (d.longPressed || d.moved) return;
  if (e.clientY < layout.statusHeight) { toggleNoiseMap(); return; }
  if (e.clientY >= layout.height - layout.barHeight) { onButton(e.clientX, e.clientY); return; }
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
  if (b.id === 'sneak') {
    const p = world.entities.get(world.playerId);
    inspect = null;
    playerAct(world, { type: 'sneak', on: !p.Stealth.sneaking });
    if (navigator.vibrate) navigator.vibrate(10);
    render();
  }
}

function onLongPress(px, py) {
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
  if (Math.hypot(ddx, ddy) < s * CONFIG.input.waitRadiusTiles) {
    action = { type: 'wait' };
  } else {
    const sector = Math.round(Math.atan2(ddy, ddx) / (Math.PI / 4)); // -4..4
    const dirs = { 0: [1, 0], 1: [1, 1], 2: [0, 1], 3: [-1, 1], 4: [-1, 0], '-4': [-1, 0], '-3': [-1, -1], '-2': [0, -1], '-1': [1, -1] };
    const [dx, dy] = dirs[sector];
    action = { type: 'move', dx, dy };
  }
  inspect = null;
  playerAct(world, action);
  render(); // even a failed move (bump) shows a message
}

window.addEventListener('resize', resize);
resize();
