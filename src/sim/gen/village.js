// Village land (step 14a): one small Lake District village from the seed.
//   - a winding lane running top to bottom (2 tiles wide)
//   - a shallow stream winding across, with a stone bridge where the lane crosses it
//   - fields split into rough rectangles, bounded by dry-stone walls and hedges, with gates
//   - a small wood, scattered trees, a pond, a few bushes
//   - empty building plots beside the lane (gardens with a gate onto the lane), recorded
//     in world.plots for 14b to build on
// Finally every walkable tile is made reachable (gaps knocked in walls/hedges if needed).
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from './testgrid.js';

export function generateVillage(rng, width, height) {
  const V = CONFIG.village;
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  const at = (x, y) => tiles[y * width + x];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < width && y < height) tiles[y * width + x] = t; };
  const inMap = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const reserved = new Uint8Array(width * height); // lane, stream, pond, plots: fields don't draw over these
  const reserve = (x, y) => { if (inMap(x, y)) reserved[y * width + x] = 1; };

  // 1. Lane: a random walk down the map with some momentum.
  const lane = [];
  let lx = Math.floor(width / 2), drift = 0;
  for (let y = 0; y < height; y++) {
    if (rng.chance(V.laneWiggle)) {
      // wander, but lean back toward the middle so the lane winds rather than drifts
      const off = (lx - width / 2) / (width / 2 - V.laneMargin);
      const r = rng.next() + off * 0.5;
      drift = r < 0.33 ? 1 : r > 0.66 ? -1 : 0;
    }
    lx = Math.max(V.laneMargin, Math.min(width - V.laneMargin - 2, lx + drift));
    for (let k = 0; k < 2; k++) { set(lx + k, y, TILE.LANE); reserve(lx + k, y); lane.push([lx + k, y]); }
    // smooth diagonal steps so the lane never pinches to a corner
    if (y > 0 && drift !== 0) { set(lx - drift, y, TILE.LANE); reserve(lx - drift, y); lane.push([lx - drift, y]); }
  }

  // 2. Stream: a random walk across the map (left to right) around streamRow.
  // Each column's water joins the last column's edge-to-edge (no diagonal-only steps), so
  // the stream always shares tiles with the lane where they cross - those become the bridge.
  let sy = Math.floor(height * V.streamRow);
  for (let x = 0; x < width; x++) {
    const prev = sy;
    if (rng.chance(V.streamWiggle)) sy = Math.max(Math.floor(height * 0.4), Math.min(Math.floor(height * 0.8), sy + rng.int(3) - 1));
    const rows = new Set([Math.min(prev, sy), Math.max(prev, sy), sy + (x % 3 === 0 ? 1 : 0)]);
    for (const yy of rows) {
      if (at(x, yy) === TILE.LANE) set(x, yy, TILE.BRIDGE); // where the lane crosses: a stone bridge
      else set(x, yy, TILE.STREAM);
      reserve(x, yy);
    }
  }

  // The bridge spans the whole stream: any lane tile touching water becomes bridge.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== TILE.LANE) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && at(x + dx, y + dy) === TILE.STREAM)) set(x, y, TILE.BRIDGE);
  }

  // 3. Building plots beside the lane (placed before the pond so they get first pick): garden rectangles with a hedge/wall boundary and a gate.
  const plots = [];
  for (let tries = 0; tries < 1500 && plots.length < V.plots; tries++) {
    const [lx0, ly0] = lane[rng.int(lane.length)];
    const shrink = tries > 700 ? 1 : 0; // later tries: allow a slightly smaller plot
    const w = V.plotW[0] - shrink + rng.int(V.plotW[1] - V.plotW[0] + 1), h = V.plotH[0] - shrink + rng.int(V.plotH[1] - V.plotH[0] + 1);
    const left = rng.chance(0.5);
    const x0 = left ? lx0 - 2 - w : lx0 + 3; // a tile of verge between lane and boundary
    const y0 = ly0 - Math.floor(h / 2);
    if (x0 < 1 || y0 < 1 || x0 + w >= width - 1 || y0 + h >= height - 1) continue;
    let clear = true;
    for (let y = y0 - 1; y <= y0 + h && clear; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (reserved[y * width + x]) { clear = false; break; }
    if (!clear) continue;
    const edge = rng.chance(0.5) ? TILE.DRYSTONE : TILE.HEDGE;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      const border = x === x0 - 1 || y === y0 - 1 || x === x0 + w || y === y0 + h;
      set(x, y, border ? edge : TILE.GRASS);
      reserve(x, y);
    }
    // gate in the side facing the lane, and the verge tile in front of it
    const gx = left ? x0 + w : x0 - 1, gy = y0 + Math.floor(h / 2);
    set(gx, gy, TILE.GRASS);
    set(gx + (left ? 1 : -1), gy, TILE.GRASS);
    plots.push({ x: x0, y: y0, w, h, gate: { x: gx, y: gy }, side: left ? 'west' : 'east' });
  }

  // 4. Pond: an ellipse away from the lane and stream.
  for (let tries = 0; tries < 600; tries++) {
    const r = tries < 300 ? V.pondRadius : Math.max(2, V.pondRadius - 1), px = r + 2 + rng.int(width - 2 * r - 4), py = r + 2 + rng.int(height - 2 * r - 4);
    let clear = true;
    for (let y = py - r - 2; y <= py + r + 2 && clear; y++) for (let x = px - r - 2; x <= px + r + 2; x++) if (inMap(x, y) && reserved[y * width + x]) { clear = false; break; }
    if (!clear) continue;
    for (let y = py - r - 1; y <= py + r + 1; y++) for (let x = px - r - 1; x <= px + r + 1; x++) {
      const d = ((x - px) / (r + 0.5)) ** 2 + ((y - py) / (r - 0.3)) ** 2;
      if (d <= 1) set(x, y, TILE.POND);
      if (d <= 1.8) reserve(x, y); // keep a grass bank
    }
    break;
  }

  // 5. Fields: split the land into rough rectangles; draw their edges as walls or hedges
  //    (one type per edge), skipping anything reserved, with a gate or two per edge.
  const fields = [];
  const split = (x, y, w, h, depth) => {
    if (depth > 4 || (w < V.fieldMin * 2 && h < V.fieldMin * 2)) { fields.push({ x, y, w, h }); return; }
    if (w >= h && w >= V.fieldMin * 2) {
      const c = V.fieldMin + rng.int(w - 2 * V.fieldMin + 1);
      split(x, y, c, h, depth + 1); split(x + c, y, w - c, h, depth + 1);
    } else if (h >= V.fieldMin * 2) {
      const c = V.fieldMin + rng.int(h - 2 * V.fieldMin + 1);
      split(x, y, w, c, depth + 1); split(x, y + c, w, h - c, depth + 1);
    } else fields.push({ x, y, w, h });
  };
  split(0, 0, width, height, 0);
  const drawEdge = (cells) => {
    const kind = rng.chance(V.hedgeShare) ? TILE.HEDGE : TILE.DRYSTONE;
    const free = cells.filter(([x, y]) => inMap(x, y) && !reserved[y * width + x]);
    if (free.length < 3) return;
    const gates = new Set();
    for (let g = 0; g < 1 + Math.floor(free.length / 12); g++) gates.add(1 + rng.int(free.length - 2));
    free.forEach(([x, y], i) => { if (!gates.has(i)) set(x, y, kind); });
  };
  for (const f of fields) {
    const top = [], left = [];
    for (let x = f.x; x < f.x + f.w; x++) top.push([x, f.y]);
    for (let y = f.y; y < f.y + f.h; y++) left.push([f.x, y]);
    if (f.y > 0) drawEdge(top);
    if (f.x > 0) drawEdge(left);
  }

  // 6. Map edge: a dry-stone wall all round (the lane runs off the map through gaps).
  for (let x = 0; x < width; x++) for (const y of [0, height - 1]) if (at(x, y) !== TILE.LANE) set(x, y, TILE.DRYSTONE);
  for (let y = 0; y < height; y++) for (const x of [0, width - 1]) if (!reserved[y * width + x]) set(x, y, TILE.DRYSTONE);

  // 7. A small wood in one corner region: dense trees with bushes underneath.
  const wx = rng.chance(0.5) ? 1 : width - 1 - V.woodSize, wy = rng.chance(0.5) ? 1 : height - 1 - V.woodSize;
  for (let y = wy; y < wy + V.woodSize; y++) for (let x = wx; x < wx + V.woodSize; x++) {
    if (!inMap(x, y) || reserved[y * width + x] || at(x, y) === TILE.DRYSTONE) continue;
    const cx = wx + V.woodSize / 2, cy = wy + V.woodSize / 2;
    const near = 1 - Math.hypot(x - cx, y - cy) / (V.woodSize * 0.7);
    if (rng.chance(V.woodDensity * near)) set(x, y, TILE.TREE);
    else if (rng.chance(0.25 * near)) set(x, y, TILE.BUSH);
  }

  // 8. Scattered trees (fields and hedgerows) and a few bushes.
  for (let i = 0; i < V.scatteredTrees; i++) {
    const x = 1 + rng.int(width - 2), y = 1 + rng.int(height - 2);
    if (!reserved[y * width + x] && (at(x, y) === TILE.GRASS || at(x, y) === TILE.HEDGE)) set(x, y, TILE.TREE);
  }
  for (let i = 0; i < V.bushes; i++) {
    const x = 1 + rng.int(width - 2), y = 1 + rng.int(height - 2);
    if (!reserved[y * width + x] && at(x, y) === TILE.GRASS) set(x, y, TILE.BUSH);
  }

  // 9. Reachability: flood from the lane; knock gates in walls/hedges/trees that separate
  //    an unreached pocket from reached land, until everything walkable is reachable.
  makeReachable(tiles, width, height, lane[Math.floor(lane.length / 2)]);

  return { tiles, plots, lane };
}

const passable = (t) => !TILE_INFO[t].blocks;

function makeReachable(tiles, width, height, [sx, sy]) {
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inside = (x, y) => x > 0 && y > 0 && x < width - 1 && y < height - 1;
  for (let pass = 0; pass < 100; pass++) {
    // Flood from the lane over walkable tiles (4-way, stricter than 8-way movement).
    const seen = new Uint8Array(width * height);
    const queue = [[sx, sy]]; seen[sy * width + sx] = 1;
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy, i = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[i] || !passable(tiles[i])) continue;
        seen[i] = 1; queue.push([nx, ny]);
      }
    }
    // An unreached walkable tile? Carve the shortest way out of its pocket: breadth-first
    // through anything except the pond and the map edge, to the nearest reached tile,
    // turning walls/hedges/trees on the way into grass (gates).
    let start = -1;
    for (let i = 0; i < tiles.length && start < 0; i++) if (passable(tiles[i]) && !seen[i]) start = i;
    if (start < 0) return;
    const prev = new Int32Array(width * height).fill(-1);
    const bfs = [start]; prev[start] = start;
    let goal = -1;
    for (let h = 0; h < bfs.length && goal < 0; h++) {
      const i = bfs[h], x = i % width, y = Math.floor(i / width);
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy, j = ny * width + nx;
        if (!inside(nx, ny) || prev[j] >= 0 || tiles[j] === TILE.POND) continue;
        prev[j] = i;
        if (seen[j]) { goal = j; break; }
        bfs.push(j);
      }
    }
    if (goal < 0) return; // nothing to connect to (shouldn't happen)
    for (let j = goal; j !== start; j = prev[j]) if (!passable(tiles[j])) tiles[j] = TILE.GRASS;
  }
}
