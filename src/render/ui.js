// Top bar and control pad. Only reads world state (and which buttons are held, for highlight).
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

export function drawPad(ctx, L, held) {
  const c = CONFIG.colours;
  ctx.fillStyle = c.pad;
  ctx.fillRect(0, L.padY, L.cssW, L.padH);
  for (const btn of L.buttons) {
    const down = held.has(btn.id);
    ctx.fillStyle = btn.kind === 'ab' ? (down ? c.abPressed : c.abButton) : (down ? c.buttonPressed : c.button);
    ctx.beginPath();
    if (btn.shape === 'round') {
      ctx.arc(btn.x + btn.w / 2, btn.y + btn.h / 2, btn.w / 2, 0, Math.PI * 2);
    } else {
      const r = btn.shape === 'pill' ? btn.h / 2 : 6;
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, r);
    }
    ctx.fill();
    ctx.fillStyle = c.buttonText;
    const size = btn.kind === 'menu' ? 12 : Math.floor(btn.h * 0.4);
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
  }
}
