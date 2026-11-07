// Top bar (status line) and action bar. Only reads world state and the message log.
import { CONFIG } from '../config.js';
import { LEVEL, deathText } from './messages.js';
import { actionButtons } from './layout.js';
import { dayOf, clockOf, daysSurvived } from '../sim/time.js';

// Day and clock on the left (D1 08:24), then your hearts, then the latest message. With no
// message, the seed shows dimmed on the right. The turn number is in the debug view.
export function drawTopBar(ctx, world, L, log, debug) {
  const c = CONFIG.colours, h = CONFIG.ui.topBarHeight;
  ctx.fillStyle = c.topBar; ctx.fillRect(0, 0, L.cssW, h);
  ctx.font = `bold ${CONFIG.ui.messageFont}px monospace`; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = c.topBarText;
  const now = world.gameOver ? world.gameOver.tick : world.tick; // stopped at the moment you died
  const turn = `D${dayOf(now)} ${clockOf(now)}`;
  ctx.fillText(turn, 8, h / 2);
  const p = world.entities.get(world.playerId);
  let x = 8 + ctx.measureText(turn + ' ').width;
  if (p && p.Health) x = drawHearts(ctx, x, h / 2, p.Health.hp, p.Health.max) + 8;
  if (log && log.text) {
    ctx.fillStyle = log.level >= LEVEL.danger ? c.dangerText : c.topBarText;
    fitText(ctx, log.text, x, h / 2, L.cssW - x - 6);
  } else if (debug) {
    ctx.textAlign = 'right'; ctx.fillStyle = `rgb(${c.noise})`;
    ctx.fillText(`T${world.turn} tick ${world.tick} seed ${world.seed}`, L.cssW - 8, h / 2);
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
  for (const b of actionButtons(L, ui.aiming ? ['cancel'] : undefined)) {
    let label = b.id.toUpperCase(), on = false;
    if (b.id === 'cancel') { on = true; label = 'CANCEL THROW'; }
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

// Game over: a plain screen over the darkened map (the final look, e.g. a Teletext page, is
// decided at the art pass). YOU DIED, the deadpan cause, when, days survived, zombies put down,
// turns and the seed.
export function drawDeath(ctx, world, L) {
  const c = CONFIG.colours, g = world.gameOver;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, L.mapY, L.cssW, L.mapH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cx = L.cssW / 2;
  let y = L.mapY + Math.max(40, L.mapH * 0.16);
  ctx.fillStyle = c.deadText; ctx.font = 'bold 38px monospace';
  ctx.fillText('YOU DIED', cx, y);
  y += 50;
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px monospace';
  for (const line of wrap(ctx, deathText(g, world.seed), L.cssW - 40)) { ctx.fillText(line, cx, y); y += 22; }
  y += 18;
  const days = daysSurvived(g.tick);
  const rows = [
    `Day ${dayOf(g.tick)}, ${clockOf(g.tick)}`,
    `Survived ${days} day${days === 1 ? '' : 's'}`,
    `Zombies put down: ${world.stats ? world.stats.kills : 0}`,
    `Turns: ${g.turn}`,
  ];
  ctx.font = '15px monospace'; ctx.fillStyle = '#dddddd';
  for (const r of rows) { ctx.fillText(r, cx, y); y += 24; }
  ctx.fillStyle = c.dimText; ctx.font = '13px monospace';
  ctx.fillText(`Seed ${world.seed}`, cx, y + 6);
  ctx.fillStyle = c.bagTitle; ctx.font = 'bold 16px monospace';
  ctx.fillText('Tap for a new game', cx, L.mapY + L.mapH - 40);
}

function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
