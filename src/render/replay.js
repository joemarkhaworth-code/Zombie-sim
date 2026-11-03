// Death replay (step 21): the whole run again, sped up, seen from above.
//
// Draws the replay world's land (one pixel per tile, scaled up, so it's cheap every frame),
// fire, everything alive (zombies green, you yellow and bigger), corpses, and your path so
// far as a fading trail. Night and storms dim the whole picture. Upstairs, cellars and
// lofts are drawn as the building they belong to (you blink on its roof). A header shows
// the day and clock and how far through the run it is. Nothing here touches the sim.
import { CONFIG } from '../config.js';
import { TILE_COLOUR } from './greybox.js';
import { clockOf, dayOf } from '../sim/time.js';

const RGB = {};
const rgb = (hex) => {
  if (!RGB[hex]) { const n = parseInt(hex.slice(1), 16); RGB[hex] = [n >> 16, (n >> 8) & 255, n & 255]; }
  return RGB[hex];
};

let image = null, canvas = null; // the land, one pixel per tile

// Where (x, y) shows on the land: itself, or (on an upper floor / cellar) its building's middle.
export function landSpot(world, x, y) {
  const land = world.landHeight || world.height;
  if (y < land) return { x, y, inside: false };
  for (const f of world.floors || []) {
    if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) {
      const b = world.buildings[f.building];
      return { x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), inside: true };
    }
  }
  return null;
}

export function drawReplay(ctx, layout, world, { trail, index, total, flash }) {
  const C = CONFIG.colours, R = CONFIG.replay;
  const W = world.width, H = world.landHeight || world.height;
  const head = layout.statusHeight;
  const ts = Math.max(1, Math.min(layout.width / W, (layout.height - head * 2) / H));
  const mw = W * ts, mh = H * ts, ox = (layout.width - mw) / 2, oy = head + (layout.height - head * 2 - mh) / 2;
  ctx.fillStyle = C.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  // Land and fire, one pixel per tile.
  if (!canvas || canvas.width !== W || canvas.height !== H) {
    canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    image = canvas.getContext('2d').createImageData(W, H);
  }
  const d = image.data;
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = world.fire && world.fire[i] ? rgb(C.replayFire) : rgb(TILE_COLOUR[world.tiles[i]] || C.background);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  canvas.getContext('2d').putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, ox, oy, mw, mh);
  // Night (and dark storms) dim the valley.
  const dark = R.darkByLight[world.ambient ?? 3];
  if (dark) { ctx.fillStyle = `rgba(0,0,20,${dark})`; ctx.fillRect(ox, oy, mw, mh); }
  // Your path so far.
  if (trail.length > 1) {
    ctx.strokeStyle = C.replayTrail; ctx.lineWidth = Math.max(1, ts * 0.6);
    ctx.beginPath();
    trail.forEach((p, k) => { const px = ox + (p.x + 0.5) * ts, py = oy + (p.y + 0.5) * ts; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
  }
  // Corpses, then the living.
  const dot = (x, y, size, colour) => { ctx.fillStyle = colour; ctx.fillRect(ox + (x + 0.5) * ts - size / 2, oy + (y + 0.5) * ts - size / 2, size, size); };
  for (const e of world.entities.values()) {
    if (!e.Position || !(e.Corpse || (e.Health && e.Brain))) continue;
    const at = landSpot(world, e.Position.x, e.Position.y);
    if (at) dot(at.x, at.y, Math.max(2, ts * (e.Corpse ? 1 : 1.4)), e.Corpse ? C.replayCorpse : C.replayZombie);
  }
  const p = world.entities.get(world.playerId) || world.fallenPlayer;
  if (p && p.Position) {
    const at = landSpot(world, p.Position.x, p.Position.y);
    if (at && !(at.inside && flash)) { // upstairs/cellar: you blink on the roof
      dot(at.x, at.y, Math.max(5, ts * 3) + 2, '#000000');
      dot(at.x, at.y, Math.max(5, ts * 3), world.gameOver ? C.healthFull : C.player);
    }
  }
  // Header: day, clock, progress; footer: how to leave.
  ctx.fillStyle = C.statusBg; ctx.fillRect(0, 0, layout.width, head);
  ctx.font = `bold ${Math.floor(head * 0.5)}px monospace`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = C.statusTurn;
  ctx.fillText(`REPLAY  D${dayOf(world.tick)} ${clockOf(world.tick)}`, 8, head / 2);
  const bw = layout.width * 0.3, bx = layout.width - bw - 10, by = head * 0.35;
  ctx.fillStyle = C.statusDim; ctx.fillRect(bx, by, bw, head * 0.3);
  ctx.fillStyle = C.statusTurn; ctx.fillRect(bx, by, bw * (total ? index / total : 1), head * 0.3);
  ctx.textAlign = 'center'; ctx.fillStyle = C.statusDim;
  ctx.fillText(index >= total ? 'Tap to go back' : 'Tap to skip', layout.width / 2, layout.height - head / 2);
}
