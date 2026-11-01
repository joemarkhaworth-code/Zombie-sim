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
