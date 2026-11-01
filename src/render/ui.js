// Status bar: one line, Teletext-ish. Turn number on the left, the latest message
// after it. With no message, the seed shows on the right.
import { CONFIG } from '../config.js';
import { PRIORITY } from './messages.js';
import { dayOf } from '../sim/time.js';

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
  const turnText = `D${dayOf(world.turn)}`; // the day you're on
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
const LABELS = { sneak: ['SNEAK', 'SNEAKING'], shove: ['SHOVE', 'SHOVE ->'], bag: ['BAG', 'BAG'], fire: ['FIRE', 'FIRE'], cancel: ['CANCEL', 'CANCEL'] };
export function drawButtons(ctx, world, layout, ui = {}) {
  const C = CONFIG.colours;
  const player = world.entities.get(world.playerId);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, layout.height - layout.barHeight, layout.width, layout.barHeight);
  for (const b of layout.buttons) {
    const on = b.id === 'cancel' || (b.id === 'sneak' && player && player.Stealth && player.Stealth.sneaking) || ui.armed === b.id || (b.id === 'bag' && ui.bagOpen);
    ctx.fillStyle = b.id === 'cancel' ? C.buttonArmedBg : !on ? C.buttonBg : b.id === 'shove' ? C.buttonArmedBg : C.buttonOnBg;
    if (b.id === 'cancel') ctx.fillStyle = C.buttonArmedBg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = on ? C.buttonOnText : C.buttonText;
    ctx.font = `bold ${Math.floor(Math.min(b.h * 0.4, b.w / 6))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = b.id === 'fire' && ui.ammo !== null ? `FIRE ${ui.ammo}` : LABELS[b.id][on ? 1 : 0];
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
}

// Death screen (prototype style, like the rest of the greybox UI): the last view
// darkened, a big red title, then the run's numbers. The look is decided at the art
// pass (step 41). flash toggles the "tap" prompt.
export function drawDeath(ctx, layout, t, flash) {
  const C = CONFIG.colours;
  const { width: w, height: h } = layout;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.healthFull;
  ctx.font = `bold ${Math.floor(w / 7)}px monospace`;
  ctx.fillText('YOU DIED', w / 2, h * 0.25);
  ctx.fillStyle = C.statusDanger;
  ctx.font = `bold ${Math.floor(w / 17)}px monospace`;
  ctx.fillText(t.cause, w / 2, h * 0.34, w - 24);
  const lines = [
    ['Days survived', t.days],
    ['Zombies killed', t.kills],
    ['Turns', t.turns],
    ['Seed', t.seed],
  ];
  ctx.font = `${Math.floor(w / 20)}px monospace`;
  lines.forEach(([label, value], i) => {
    const y = h * 0.45 + i * h * 0.055;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.statusTurn;
    ctx.fillText(label, w * 0.14, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(value), w * 0.86, y);
  });
  if (flash) {
    ctx.textAlign = 'center';
    ctx.fillStyle = C.buttonOnBg;
    ctx.font = `bold ${Math.floor(w / 18)}px monospace`;
    ctx.fillText('Tap for a new game', w / 2, h * 0.75);
  }
}

// Inventory panel ("BAG"): an 8-bit list filling the map area. Header with slots used and
// CLOSE; one big row per item with its use button (EAT / USE / WIELD / PUT AWAY) and DROP.
// bagLayout() is pure layout so main.js can hit-test the same rects it draws.
// ui.confirmNew: show the "start a new game?" confirm instead of the list.
export function bagLayout(world, layout, ui = {}) {
  const p = world.entities.get(world.playerId);
  const top = layout.statusHeight, bottom = layout.height - layout.barHeight;
  const pad = 8, rowH = 96, w = layout.width;
  const panel = { x: 0, y: top, w, h: bottom - top };
  const close = { x: w - pad - 110, y: top + pad, w: 110, h: 44 };
  const rows = [];
  if (p) {
    p.Inventory.items.forEach((id, i) => {
      const item = world.entities.get(id);
      const def = CONFIG.items[item.Item.type];
      const y = top + pad * 2 + 44 + i * (rowH + pad);
      const useLabel = def.weapon ? (p.Inventory.wielded === id ? 'STOW' : 'WIELD') : def.heal ? 'EAT' : 'USE';
      const bw = Math.floor((w - pad * 5) / 3), by = y + 44, bh = rowH - 52;
      rows.push({
        itemId: id, item, y, h: rowH, wielded: p.Inventory.wielded === id,
        use: { x: pad * 2, y: by, w: bw, h: bh, label: useLabel },
        toss: { x: pad * 3 + bw, y: by, w: bw, h: bh, label: 'THROW' },
        drop: { x: pad * 4 + bw * 2, y: by, w: bw, h: bh, label: 'DROP' },
      });
    });
  }
  // Small, out-of-the-way NEW GAME at the bottom of the panel, and its confirm buttons.
  const newGame = { x: w - pad - 120, y: bottom - pad - 34, w: 120, h: 34 };
  const half = Math.floor((w - pad * 3) / 2);
  const yes = { x: pad, y: top + 140, w: half, h: 64 };
  const no = { x: pad * 2 + half, y: top + 140, w: half, h: 64 };
  return { panel, close, rows, newGame, yes, no, used: p ? p.Inventory.items.reduce((n, id) => n + world.entities.get(id).Item.slots, 0) : 0, capacity: p ? p.Inventory.capacity : 0 };
}

export function drawBag(ctx, world, layout, ui = {}) {
  const C = CONFIG.colours;
  const bag = bagLayout(world, layout, ui);
  const pad = 8;
  ctx.fillStyle = C.bagBg;
  ctx.fillRect(bag.panel.x, bag.panel.y, bag.panel.w, bag.panel.h);
  if (ui.confirmNew) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.bagTitle;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('Start a new game?', layout.width / 2, bag.panel.y + 60);
    ctx.fillStyle = C.bagText;
    ctx.font = '17px monospace';
    ctx.fillText('This run will be lost.', layout.width / 2, bag.panel.y + 96);
    for (const [b, label, bg] of [[bag.yes, 'YES', C.healthFull], [bag.no, 'NO', C.bagButton]]) {
      ctx.fillStyle = bg;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = C.bagButtonText;
      ctx.font = 'bold 24px monospace';
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    return;
  }
  // NEW GAME: small and dim so it isn't hit by accident.
  ctx.fillStyle = C.bagRow;
  ctx.fillRect(bag.newGame.x, bag.newGame.y, bag.newGame.w, bag.newGame.h);
  ctx.fillStyle = C.statusDim;
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEW GAME', bag.newGame.x + bag.newGame.w / 2, bag.newGame.y + bag.newGame.h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.bagTitle;
  ctx.font = 'bold 24px monospace';
  ctx.fillText(`BAG ${bag.used}/${bag.capacity}`, pad * 2, bag.close.y + bag.close.h / 2);
  const button = (b, text) => {
    ctx.fillStyle = C.bagButton;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = C.bagButtonText;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textAlign = 'left';
  };
  button(bag.close, 'CLOSE');
  if (!bag.rows.length) {
    ctx.fillStyle = C.bagText;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('Empty.', pad * 2, bag.close.y + 44 + 40);
  }
  for (const r of bag.rows) {
    ctx.fillStyle = C.bagRow;
    ctx.fillRect(pad, r.y, layout.width - pad * 2, r.h);
    const g = r.item.Glyph, icon = 32;
    ctx.fillStyle = g.bg;
    ctx.fillRect(pad * 2, r.y + 6, icon, icon);
    ctx.fillStyle = g.fg;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(g.char, pad * 2 + icon / 2, r.y + 6 + icon / 2 + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.bagText;
    ctx.font = 'bold 17px monospace';
    const label = (r.wielded ? '> ' : '') + r.item.Name.name;
    ctx.fillText(label, pad * 3 + icon, r.y + 15, layout.width - (pad * 5 + icon));
    ctx.fillStyle = C.bagTitle;
    ctx.font = '13px monospace';
    const info = [`${r.item.Item.slots} slot${r.item.Item.slots > 1 ? 's' : ''}`];
    if (r.item.Item.ammo !== undefined) info.push(`ammo ${r.item.Item.ammo}`);
    if (r.wielded) info.push('in hand');
    ctx.fillText(info.join(', '), pad * 3 + icon, r.y + 33);
    button(r.use, r.use.label);
    button(r.toss, r.toss.label);
    button(r.drop, r.drop.label);
  }
}
