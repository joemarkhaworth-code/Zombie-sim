// Status bar: one line, Teletext-ish. Turn number on the left, the latest message
// after it. With no message, the seed shows on the right.
import { CONFIG } from '../config.js';
import { PRIORITY } from './messages.js';

// Health: one block per point, filled or empty. Blinks (blink=true hides filled
// blocks) while you're bleeding.
function drawHealth(ctx, world, x, h, blink) {
  const C = CONFIG.colours;
  const p = world.entities.get(world.playerId) || world.fallenPlayer;
  if (!p || !p.Health) return x;
  const size = Math.floor(h * 0.38), gap = 3;
  const bleeding = p.Bleeding && p.Bleeding.level > 0;
  for (let i = 0; i < p.Health.max; i++) {
    const full = i < p.Health.hp;
    ctx.fillStyle = full && !(bleeding && blink) ? C.healthFull : C.healthEmpty;
    ctx.fillRect(x + i * (size + gap), Math.floor((h - size) / 2), size, size);
  }
  return x + p.Health.max * (size + gap);
}

export function drawStatus(ctx, world, layout, message, blink = false) {
  const C = CONFIG.colours;
  const { width, statusHeight: h } = layout;
  ctx.fillStyle = C.statusBg;
  ctx.fillRect(0, 0, width, h);
  ctx.font = `bold ${Math.floor(h * 0.55)}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.statusTurn;
  const turnText = `T${world.turn}`;
  ctx.fillText(turnText, 8, h / 2);
  const healthX = 8 + ctx.measureText(turnText + ' ').width;
  const msgX = drawHealth(ctx, world, healthX, h, blink) + 8;
  if (message) {
    ctx.fillStyle = message.priority >= PRIORITY.danger ? C.statusDanger : C.statusText;
    ctx.fillText(message.text, msgX, h / 2, width - msgX - 8);
  } else {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.statusDim;
    ctx.fillText(`SEED ${world.seed}`, width - 8, h / 2);
  }
}

// Bottom bar: big thumb-friendly buttons side by side.
//   SNEAK  - toggle (yellow "SNEAKING" when on)
//   SHOVE  - one-shot: orange when armed, waiting for you to tap a creature
// layout.buttons: [{ id, x, y, w, h }] - main.js uses the same rects for taps.
// ui: { armed } - which one-shot action (if any) is waiting for a target.
const LABELS = { sneak: ['SNEAK', 'SNEAKING'], shove: ['SHOVE', 'SHOVE ->'] };
export function drawButtons(ctx, world, layout, ui = {}) {
  const C = CONFIG.colours;
  const player = world.entities.get(world.playerId);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, layout.height - layout.barHeight, layout.width, layout.barHeight);
  for (const b of layout.buttons) {
    const on = (b.id === 'sneak' && player && player.Stealth && player.Stealth.sneaking) || ui.armed === b.id;
    ctx.fillStyle = !on ? C.buttonBg : b.id === 'shove' ? C.buttonArmedBg : C.buttonOnBg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = on ? C.buttonOnText : C.buttonText;
    ctx.font = `bold ${Math.floor(Math.min(b.h * 0.4, b.w / 6))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[b.id][on ? 1 : 0], b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}

// Death screen: dark overlay, big red title, how you died, the turn, and a prompt.
export function drawDeath(ctx, layout, text) {
  const C = CONFIG.colours;
  const { width: w, height: h } = layout;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.healthFull;
  ctx.font = `bold ${Math.floor(w / 7)}px monospace`;
  ctx.fillText(text.title, w / 2, h * 0.38);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(w / 18)}px monospace`;
  ctx.fillText(text.how, w / 2, h * 0.48, w - 16);
  ctx.fillStyle = C.statusTurn;
  ctx.fillText(text.turn, w / 2, h * 0.54);
  ctx.fillStyle = C.buttonOnBg;
  ctx.fillText('Tap to restart', w / 2, h * 0.66);
}
