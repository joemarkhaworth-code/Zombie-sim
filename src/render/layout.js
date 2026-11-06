// Fits one screen of tiles between the top bar and the action bar, centred.
import { CONFIG } from '../config.js';

export function computeLayout(cssW, cssH) {
  const { w, h } = CONFIG.screen;
  const { topBarHeight, actionBarHeight, minTile } = CONFIG.ui;
  const mapH = cssH - topBarHeight - actionBarHeight;
  const tile = Math.max(minTile, Math.floor(Math.min(cssW / w, mapH / h)));
  const mapX = Math.floor((cssW - tile * w) / 2);
  const mapY = topBarHeight + Math.max(0, Math.floor((mapH - tile * h) / 2));
  return { cssW, cssH, tile, mapX, mapY, mapW: tile * w, mapH: tile * h };
}

// Screen pixel -> tile, or null if outside the map.
export function tileAtPixel(layout, px, py) {
  const x = Math.floor((px - layout.mapX) / layout.tile);
  const y = Math.floor((py - layout.mapY) / layout.tile);
  if (x < 0 || y < 0 || x >= CONFIG.screen.w || y >= CONFIG.screen.h) return null;
  return { x, y };
}
