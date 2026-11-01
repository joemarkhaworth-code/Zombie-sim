// Status bar: one line, Teletext-ish. Turn number on the left, the latest message
// after it. With no message, the seed shows on the right.
import { CONFIG } from '../config.js';
import { PRIORITY } from './messages.js';

export function drawStatus(ctx, world, layout, message) {
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
  const msgX = 8 + ctx.measureText(turnText + '  ').width;
  if (message) {
    ctx.fillStyle = message.priority >= PRIORITY.danger ? C.statusDanger : C.statusText;
    ctx.fillText(message.text, msgX, h / 2, width - msgX - 8);
  } else {
    ctx.textAlign = 'right';
    ctx.fillStyle = C.statusDim;
    ctx.fillText(`SEED ${world.seed}`, width - 8, h / 2);
  }
}

// Bottom bar: big thumb-friendly buttons. For now just SNEAK (a toggle).
// layout.buttons: [{ id, x, y, w, h }] - main.js uses the same rects for taps.
export function drawButtons(ctx, world, layout) {
  const C = CONFIG.colours;
  const player = world.entities.get(world.playerId);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, layout.height - layout.barHeight, layout.width, layout.barHeight);
  for (const b of layout.buttons) {
    const on = b.id === 'sneak' && player && player.Stealth && player.Stealth.sneaking;
    ctx.fillStyle = on ? C.buttonOnBg : C.buttonBg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = on ? C.buttonOnText : C.buttonText;
    ctx.font = `bold ${Math.floor(b.h * 0.4)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(on ? 'SNEAKING' : 'SNEAK', b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}
