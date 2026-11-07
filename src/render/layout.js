// Screen layout: top bar, the map (one screen of tiles) flush under it, then the control pad
// filling the rest. The pad is Game Boy style: an inverted-T d-pad (keyboard arrow layout)
// on the left, B and A on the right, SELECT and START along the bottom.
import { CONFIG } from '../config.js';

export function computeLayout(cssW, cssH) {
  const { w, h } = CONFIG.screen;
  const u = CONFIG.ui;
  const mapAvail = cssH - u.topBarHeight - u.padMinHeight;
  const tile = Math.max(u.minTile, Math.floor(Math.min(cssW / w, mapAvail / h)));
  const mapX = Math.floor((cssW - tile * w) / 2);
  const mapY = u.topBarHeight;
  const padY = mapY + tile * h;
  const L = {
    cssW, cssH, tile, mapX, mapY, mapW: tile * w, mapH: tile * h,
    padY, padH: cssH - padY,
  };
  L.buttons = layoutButtons(L);
  return L;
}

// Buttons: { id, label, x, y, w, h, shape: 'rect' | 'round' | 'pill', kind: 'dpad' | 'ab' | 'menu', dx?, dy? }
function layoutButtons(L) {
  const u = CONFIG.ui, m = u.margin, g = u.gap;
  const b = Math.max(u.button.min, Math.min(u.button.max, Math.floor(L.cssW / u.button.perWidth)));
  const d = Math.round(b * u.abScale);
  const pillW = Math.round(b * u.pill.wScale), pillH = u.pill.h;
  const bottom = L.cssH - m;
  const pillY = bottom - pillH;
  const rowB = pillY - m - b;   // d-pad bottom row: left, down, right
  const rowT = rowB - g - b;    // d-pad top row: up
  const out = [];
  const col = i => m + i * (b + g);
  out.push({ id: 'up', label: '▲', x: col(1), y: rowT, w: b, h: b, shape: 'rect', kind: 'dpad', dx: 0, dy: -1 });
  out.push({ id: 'left', label: '◀', x: col(0), y: rowB, w: b, h: b, shape: 'rect', kind: 'dpad', dx: -1, dy: 0 });
  out.push({ id: 'down', label: '▼', x: col(1), y: rowB, w: b, h: b, shape: 'rect', kind: 'dpad', dx: 0, dy: 1 });
  out.push({ id: 'right', label: '▶', x: col(2), y: rowB, w: b, h: b, shape: 'rect', kind: 'dpad', dx: 1, dy: 0 });
  // A upper right, B lower left of it, like the old handhelds.
  const ax = L.cssW - m - d, bx = ax - g * 2 - d;
  out.push({ id: 'a', label: 'A', x: ax, y: rowT + Math.round(b * 0.2), w: d, h: d, shape: 'round', kind: 'ab' });
  out.push({ id: 'b', label: 'B', x: bx, y: rowB - Math.round(b * 0.2) + (b - d), w: d, h: d, shape: 'round', kind: 'ab' });
  const cx = L.cssW / 2;
  out.push({ id: 'select', label: 'SELECT', x: Math.round(cx - g * 2 - pillW), y: pillY, w: pillW, h: pillH, shape: 'pill', kind: 'menu' });
  out.push({ id: 'start', label: 'START', x: Math.round(cx + g * 2), y: pillY, w: pillW, h: pillH, shape: 'pill', kind: 'menu' });
  return out;
}

// The button under a point (with a little slop; nearest centre wins), or null.
export function buttonAt(L, px, py) {
  const s = CONFIG.ui.hitSlop;
  let best = null, bestD = Infinity;
  for (const btn of L.buttons) {
    if (px < btn.x - s || px > btn.x + btn.w + s || py < btn.y - s || py > btn.y + btn.h + s) continue;
    const d = Math.hypot(px - (btn.x + btn.w / 2), py - (btn.y + btn.h / 2));
    if (d < bestD) { bestD = d; best = btn; }
  }
  return best;
}

// Screen pixel -> tile, or null if outside the map (for long-press inspect, step 3).
export function tileAtPixel(L, px, py) {
  const x = Math.floor((px - L.mapX) / L.tile);
  const y = Math.floor((py - L.mapY) / L.tile);
  if (x < 0 || y < 0 || x >= CONFIG.screen.w || y >= CONFIG.screen.h) return null;
  return { x, y };
}
