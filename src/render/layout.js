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

// Screen pixel -> tile, or null if outside the map.
export function tileAtPixel(layout, px, py) {
  const x = Math.floor((px - layout.mapX) / layout.tile);
  const y = Math.floor((py - layout.mapY) / layout.tile);
  if (x < 0 || y < 0 || x >= CONFIG.screen.w || y >= CONFIG.screen.h) return null;
  return { x, y };
}
