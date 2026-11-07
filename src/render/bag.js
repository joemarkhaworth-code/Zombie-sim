// The bag panel: an 8-bit list over the map. Header "BAG used/capacity" + CLOSE, one big row per
// item with its glyph, name and slots, and two buttons: use (EAT / USE / HOLD / STOW) and DROP.
// Opening it takes no turn; use and drop take a turn and close it (main.js).
import { CONFIG } from '../config.js';
import { itemType, slotsUsed } from '../sim/systems/items.js';

const ROW = 56, PAD = 8;

// Hit areas: [{ action: 'close' | 'use' | 'drop', itemId?, x, y, w, h }] plus the drawing rows.
export function bagLayout(world, L) {
  const p = world.entities.get(world.playerId);
  const inv = p.Inventory;
  const x = L.mapX + PAD, w = L.mapW - PAD * 2, top = L.mapY + PAD;
  const buttons = [{ action: 'close', x: x + w - 96, y: top + 6, w: 90, h: 40 }];
  const rows = inv.items.map((id, i) => {
    const item = world.entities.get(id), t = itemType(item);
    const y = top + 52 + i * (ROW + 4);
    const verb = t.weapon ? (inv.wielded === id ? 'STOW' : 'HOLD') : (t.verb || 'USE');
    const bw = 64;
    buttons.push({ action: 'drop', itemId: id, x: x + w - bw - 6, y: y + 6, w: bw, h: ROW - 12, label: 'DROP' });
    buttons.push({ action: 'use', itemId: id, x: x + w - bw * 2 - 12, y: y + 6, w: bw, h: ROW - 12, label: verb });
    return { item, t, y, wielded: inv.wielded === id };
  });
  return { x, y: top, w, h: L.mapH - PAD * 2, rows, buttons, used: slotsUsed(world, p), capacity: inv.capacity };
}

export function bagButtonAt(world, L, px, py) {
  return bagLayout(world, L).buttons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
}

export function drawBag(ctx, world, L) {
  const c = CONFIG.colours, B = bagLayout(world, L);
  ctx.fillStyle = c.bagBg; ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.strokeStyle = c.bagLine; ctx.lineWidth = 2; ctx.strokeRect(B.x + 1, B.y + 1, B.w - 2, B.h - 2);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = c.bagTitle; ctx.font = 'bold 20px monospace';
  ctx.fillText(`BAG ${B.used}/${B.capacity}`, B.x + 12, B.y + 26);
  if (!B.rows.length) {
    ctx.fillStyle = c.dimText; ctx.font = 'bold 15px monospace';
    ctx.fillText('Empty.', B.x + 12, B.y + 80);
  }
  for (const r of B.rows) {
    ctx.fillStyle = c.bagRow; ctx.fillRect(B.x + 6, r.y, B.w - 12, ROW);
    ctx.fillStyle = r.t.colour; ctx.font = 'bold 26px monospace';
    ctx.fillText(r.t.glyph, B.x + 16, r.y + ROW / 2 + 1);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace';
    ctx.fillText(r.wielded ? `> ${r.t.name}` : r.t.name, B.x + 42, r.y + ROW / 2 - 8);
    ctx.fillStyle = c.dimText; ctx.font = '12px monospace';
    ctx.fillText(`${r.wielded ? 'in hand, ' : ''}${r.t.slots} slot${r.t.slots > 1 ? 's' : ''}`, B.x + 42, r.y + ROW / 2 + 10);
  }
  for (const b of B.buttons) {
    ctx.fillStyle = b.action === 'close' ? c.button : b.action === 'drop' ? c.bagDrop : c.bagUse;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillText(b.label || 'CLOSE', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textAlign = 'left';
  }
}
