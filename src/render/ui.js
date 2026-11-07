// Top bar (status line) and action bar. Only reads world state and the message log.
import { CONFIG } from '../config.js';
import { LEVEL } from './messages.js';

// Turn number on the left, then the latest message. With no message, the seed shows dimmed on the right.
export function drawTopBar(ctx, world, L, log, debug) {
  const c = CONFIG.colours, h = CONFIG.ui.topBarHeight;
  ctx.fillStyle = c.topBar; ctx.fillRect(0, 0, L.cssW, h);
  ctx.font = `bold ${CONFIG.ui.messageFont}px monospace`; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = c.topBarText;
  const turn = `T${world.turn}`;
  ctx.fillText(turn, 8, h / 2);
  if (log && log.text) {
    ctx.fillStyle = log.level === LEVEL.danger ? c.dangerText : c.topBarText;
    const x = 8 + ctx.measureText(turn + ' ').width;
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

export function drawActionBar(ctx, L) {
  ctx.fillStyle = CONFIG.colours.actionBar;
  ctx.fillRect(0, L.barY, L.cssW, L.barH); // buttons arrive with later steps
}
