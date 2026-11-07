// The bag panel, over the map. Top: BAG and CLOSE. Then IN HAND (what you hold, not in the bag),
// then the bag grid: each item drawn as a block over the squares it takes up. Tap an item to
// select it; its name and buttons appear underneath: use (EAT / USE / HOLD / STOW), THROW and DROP.
// Opening it and selecting take no turn; use and drop take a turn and close it (main.js).
import { CONFIG } from '../config.js';
import { itemType } from '../sim/systems/items.js';

const PAD = 8;

// Everything to draw and every hit area, for the current selection.
// Hit areas: { action: 'close' | 'select' | 'use' | 'throw' | 'drop', itemId?, x, y, w, h, label? }
export function bagLayout(world, L, selected) {
  const p = world.entities.get(world.playerId), inv = p.Inventory;
  const x = L.mapX + PAD, w = L.mapW - PAD * 2, y = L.mapY + PAD, h = L.mapH - PAD * 2;
  const hits = [{ action: 'close', x: x + w - 96, y: y + 4, w: 90, h: 40, label: 'CLOSE' }];
  // In hand.
  const hand = { x: x + 12, y: y + 66, w: w - 24, h: 44 };
  if (inv.hand) hits.push({ action: 'select', itemId: inv.hand, ...hand });
  // The grid: squares as big as fit across the panel and down it, leaving room for the buttons.
  const gy = hand.y + hand.h + 26, below = 8 + 22 + 48 + 8;
  const cell = Math.floor(Math.min(48, (w - 24) / inv.cols, (y + h - gy - below) / inv.rows));
  const gx = x + Math.floor((w - cell * inv.cols) / 2);
  const blocks = inv.items.map(s => ({ ...s, px: gx + s.x * cell, py: gy + s.y * cell, pw: s.w * cell, ph: s.h * cell }));
  for (const b of blocks) hits.push({ action: 'select', itemId: b.id, x: b.px, y: b.py, w: b.pw, h: b.ph });
  // The selected item's buttons.
  const info = { x: x + 12, y: gy + cell * inv.rows + 8, w: w - 24 };
  let sel = null;
  if (selected && (inv.hand === selected || inv.items.some(s => s.id === selected))) {
    const item = world.entities.get(selected), t = itemType(item), held = inv.hand === selected;
    const verb = t.weapon ? (held ? 'STOW' : 'HOLD') : (t.verb || 'USE');
    const bw = Math.floor((info.w - 16) / 3), by = info.y + 22;
    hits.push({ action: 'use', itemId: selected, x: info.x, y: by, w: bw, h: 48, label: verb });
    hits.push({ action: 'throw', itemId: selected, x: info.x + bw + 8, y: by, w: bw, h: 48, label: 'THROW' });
    hits.push({ action: 'drop', itemId: selected, x: info.x + (bw + 8) * 2, y: by, w: bw, h: 48, label: 'DROP' });
    sel = { item, t, held };
  }
  return { x, y, w, h, hand, cell, gx, gy, blocks, info, sel, hits, inv };
}

export function bagHitAt(world, L, selected, px, py) {
  const B = bagLayout(world, L, selected);
  // Later areas win (buttons over blocks).
  for (let i = B.hits.length - 1; i >= 0; i--) {
    const b = B.hits[i];
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
  }
  return null;
}

export function drawBag(ctx, world, L, selected) {
  const c = CONFIG.colours, B = bagLayout(world, L, selected), inv = B.inv;
  ctx.fillStyle = c.bagBg; ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.strokeStyle = c.bagLine; ctx.lineWidth = 2; ctx.strokeRect(B.x + 1, B.y + 1, B.w - 2, B.h - 2);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = c.bagTitle; ctx.font = 'bold 20px monospace';
  ctx.fillText('BAG', B.x + 12, B.y + 26);
  // In hand.
  ctx.fillStyle = c.dimText; ctx.font = 'bold 12px monospace';
  ctx.fillText('IN HAND', B.hand.x, B.hand.y - 9);
  ctx.fillStyle = c.bagRow; ctx.fillRect(B.hand.x, B.hand.y, B.hand.w, B.hand.h);
  if (inv.hand) {
    const t = itemType(world.entities.get(inv.hand));
    ctx.fillStyle = t.colour; ctx.font = 'bold 26px monospace';
    ctx.fillText(t.glyph, B.hand.x + 12, B.hand.y + B.hand.h / 2 + 1);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px monospace';
    ctx.fillText(t.name, B.hand.x + 40, B.hand.y + B.hand.h / 2 + 1);
    if (selected === inv.hand) outline(ctx, B.hand.x, B.hand.y, B.hand.w, B.hand.h, c.bagTitle);
  } else {
    ctx.fillStyle = c.dimText; ctx.font = '14px monospace';
    ctx.fillText('Bare hands', B.hand.x + 12, B.hand.y + B.hand.h / 2 + 1);
  }
  // The grid: empty squares, then each item as a block over its squares.
  ctx.fillStyle = c.dimText; ctx.font = 'bold 12px monospace';
  ctx.fillText('IN THE BAG', B.gx, B.gy - 10);
  for (let yy = 0; yy < inv.rows; yy++) {
    for (let xx = 0; xx < inv.cols; xx++) {
      ctx.fillStyle = c.bagCell;
      ctx.fillRect(B.gx + xx * B.cell + 1, B.gy + yy * B.cell + 1, B.cell - 2, B.cell - 2);
    }
  }
  for (const b of B.blocks) {
    const t = itemType(world.entities.get(b.id));
    ctx.fillStyle = c.bagRow; ctx.fillRect(b.px + 2, b.py + 2, b.pw - 4, b.ph - 4);
    ctx.strokeStyle = t.colour; ctx.lineWidth = 2; ctx.strokeRect(b.px + 3, b.py + 3, b.pw - 6, b.ph - 6);
    ctx.fillStyle = t.colour; ctx.font = `bold ${Math.floor(Math.min(b.pw, b.ph) * 0.6)}px monospace`; ctx.textAlign = 'center';
    ctx.fillText(t.glyph, b.px + b.pw / 2, b.py + b.ph / 2 + 1);
    ctx.textAlign = 'left';
    if (selected === b.id) outline(ctx, b.px, b.py, b.pw, b.ph, c.bagTitle);
  }
  // Selected item.
  if (B.sel) {
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px monospace';
    ctx.fillText(`${B.sel.t.name}${B.sel.held ? ', in hand' : ''}`, B.info.x, B.info.y + 9);
  } else {
    ctx.fillStyle = c.dimText; ctx.font = '13px monospace';
    ctx.fillText(inv.items.length || inv.hand ? 'Tap an item.' : 'Nothing on you.', B.info.x, B.info.y + 9);
  }
  for (const b of B.hits) {
    if (b.action === 'select') continue;
    ctx.fillStyle = b.action === 'close' ? c.button : b.action === 'drop' ? c.bagDrop : b.action === 'throw' ? c.bagThrow : c.bagUse;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textAlign = 'left';
  }
}

function outline(ctx, x, y, w, h, colour) {
  ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
