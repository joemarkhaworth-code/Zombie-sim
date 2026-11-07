// Fits one screen of tiles between the top bar and the action bar.
// The map sits flush under the top bar; any height left over goes to the action bar
// (more thumb room), so there are no black bands. Narrow gaps either side stay black.
import { CONFIG } from '../config.js';

export function computeLayout(cssW, cssH) {
  const { w, h } = CONFIG.screen;
  const { topBarHeight, actionBarHeight, minTile } = CONFIG.ui;
  const mapH = cssH - topBarHeight - actionBarHeight;
  const tile = Math.max(minTile, Math.floor(Math.min(cssW / w, mapH / h)));
  const mapX = Math.floor((cssW - tile * w) / 2);
  const mapY = topBarHeight;
  const barY = mapY + tile * h; // action bar runs from here to the bottom (at least actionBarHeight)
  return { cssW, cssH, tile, mapX, mapY, mapW: tile * w, mapH: tile * h, barY, barH: cssH - barY };
}

// Action bar buttons: big, side by side, splitting the bar evenly. Add future actions here
// rather than new UI. Returns [{ id, x, y, w, h }].
// While aiming a throw the bar is one big CANCEL.
export const ACTION_BUTTONS = ['shove', 'bag'];
export function actionButtons(L, ids = ACTION_BUTTONS) {
  const pad = 8, n = ids.length;
  const h = Math.min(L.barH - pad * 2, CONFIG.ui.actionBarHeight - pad * 2);
  const w = (L.cssW - pad * (n + 1)) / n;
  return ids.map((id, i) => ({ id, x: pad + i * (w + pad), y: L.barY + pad, w, h }));
}

export function actionButtonAt(L, px, py, ids) {
  return actionButtons(L, ids).find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
}

// Screen pixel -> tile, or null if outside the map.
export function tileAtPixel(layout, px, py) {
  const x = Math.floor((px - layout.mapX) / layout.tile);
  const y = Math.floor((py - layout.mapY) / layout.tile);
  if (x < 0 || y < 0 || x >= CONFIG.screen.w || y >= CONFIG.screen.h) return null;
  return { x, y };
}
