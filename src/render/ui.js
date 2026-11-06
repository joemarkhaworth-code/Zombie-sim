// Top bar and action bar. Only reads world state.
import { CONFIG } from '../config.js';

export function drawTopBar(ctx, world, L) {
  const c = CONFIG.colours, h = CONFIG.ui.topBarHeight;
  ctx.fillStyle = c.topBar; ctx.fillRect(0, 0, L.cssW, h);
  ctx.font = 'bold 16px monospace'; ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = c.topBarText;
  ctx.fillText(`T${world.turn}`, 8, h / 2);
  ctx.textAlign = 'right'; ctx.fillStyle = c.dimText;
  ctx.fillText(`seed ${world.seed}`, L.cssW - 8, h / 2);
}

export function drawActionBar(ctx, L) {
  ctx.fillStyle = CONFIG.colours.actionBar;
  ctx.fillRect(0, L.barY, L.cssW, L.barH); // buttons arrive with later steps
}
