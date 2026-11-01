// Status bar: one line of Teletext-ish text.
import { CONFIG } from '../config.js';

export function drawStatus(ctx, world, layout) {
  const { width, statusHeight: h } = layout;
  ctx.fillStyle = CONFIG.colours.statusBg;
  ctx.fillRect(0, 0, width, h);
  ctx.fillStyle = CONFIG.colours.statusText;
  ctx.font = `bold ${Math.floor(h * 0.55)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`TURN ${world.turn}`, 8, h / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`SEED ${world.seed}`, width - 8, h / 2);
}
