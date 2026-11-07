// Top bar (status line) and action bar. Only reads world state and the message log.
import { CONFIG } from '../config.js';
import { LEVEL, deathText } from './messages.js';
import { actionButtons } from './layout.js';

// Turn number on the left, then your hearts, then the latest message. With no message, the seed
// shows dimmed on the right.
export function drawTopBar(ctx, world, L, log, debug) {
  const c = CONFIG.colours, h = CONFIG.ui.topBarHeight;
  ctx.fillStyle = c.topBar; ctx.fillRect(0, 0, L.cssW, h);
  ctx.font = `bold ${CONFIG.ui.messageFont}px monospace`; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = c.topBarText;
  const turn = `T${world.turn}`;
  ctx.fillText(turn, 8, h / 2);
  const p = world.entities.get(world.playerId);
  let x = 8 + ctx.measureText(turn + ' ').width;
  if (p && p.Health) x = drawHearts(ctx, x, h / 2, p.Health.hp, p.Health.max) + 8;
  if (log && log.text) {
    ctx.fillStyle = log.level >= LEVEL.danger ? c.dangerText : c.topBarText;
    fitText(ctx, log.text, x, h / 2, L.cssW - x - 6);
  } else if (debug) {
    ctx.textAlign = 'right'; ctx.fillStyle = `rgb(${c.noise})`;
    ctx.fillText(`DEBUG tick ${world.tick} seed ${world.seed}`, L.cssW - 8, h / 2);
  } else {
    ctx.textAlign = 'right'; ctx.fillStyle = c.dimText;
    ctx.fillText(`seed ${world.seed}`, L.cssW - 8, h / 2);
  }
}

// Shrinks the font a little if a message would run off a narrow screen.
function fitText(ctx, text, x, y, maxW) {
  let size = CONFIG.ui.messageFont;
  while (size > 10 && ctx.measureText(text).width > maxW) {
    size--; ctx.font = `bold ${size}px monospace`;
  }
  ctx.fillText(text, x, y);
}

// Hearts, Zelda-style: hp and max are in half-hearts. Returns the x after the last heart.
export function drawHearts(ctx, x, cy, hp, max) {
  const s = 14, gap = 3, n = Math.ceil(max / 2);
  for (let i = 0; i < n; i++) {
    const left = hp >= i * 2 + 1, right = hp >= i * 2 + 2;
    const hx = x + i * (s + gap), hy = cy - s / 2;
    heart(ctx, hx, hy, s, CONFIG.colours.heartEmpty);
    if (left) { ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, right ? s : s / 2, s); ctx.clip(); heart(ctx, hx, hy, s, CONFIG.colours.heart); ctx.restore(); }
  }
  return x + n * (s + gap);
}

// A small blocky heart.
function heart(ctx, x, y, s, colour) {
  ctx.fillStyle = colour;
  const u = s / 7;
  const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < 7; rx++) if (row[rx] === 'X') ctx.fillRect(x + rx * u, y + ry * u + u / 2, Math.ceil(u), Math.ceil(u));
  });
}

// The action bar: big buttons. SHOVE turns orange while armed (tap a direction next).
export function drawActionBar(ctx, L, ui = {}) {
  const c = CONFIG.colours;
  ctx.fillStyle = c.actionBar;
  ctx.fillRect(0, L.barY, L.cssW, L.barH);
  for (const b of actionButtons(L)) {
    let label = b.id.toUpperCase(), on = false;
    if (b.id === 'shove' && ui.shoveArmed) { on = true; label = 'TAP A WAY'; }
    if (b.id === 'bag' && ui.bagOpen) on = true;
    ctx.fillStyle = on ? c.shoveArmed : c.button;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 8); else ctx.rect(b.x, b.y, b.w, b.h);
    ctx.fill();
    ctx.fillStyle = on ? '#000000' : c.buttonText;
    ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}

// Death (a plain placeholder until the game over screen, step 11): the map darkened, the cause.
export function drawDeath(ctx, world, L) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(L.mapX, L.mapY, L.mapW, L.mapH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cx = L.cssW / 2, cy = L.mapY + L.mapH / 2;
  ctx.fillStyle = CONFIG.colours.deadText; ctx.font = 'bold 36px monospace';
  ctx.fillText('YOU DIED', cx, cy - 40);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px monospace';
  ctx.fillText(deathText(world.gameOver), cx, cy);
  ctx.fillText(`Lasted ${world.turn} turns.`, cx, cy + 26);
  ctx.fillStyle = CONFIG.colours.dimText;
  ctx.fillText('Tap to start again', cx, cy + 70);
}
