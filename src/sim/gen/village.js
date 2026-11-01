// Village land (step 14a): a small Lake District village in its dale, from the seed.
// Modelled on how real Lakeland dales lie on the OS map (top of the map = valley head):
//   - a valley floor running top to bottom, fells rising on both sides
//   - a beck winding down the floor, fed by gills off the fells, running into a lake
//     ("water"/"mere") that fills the foot of the dale, with a shingle shore
//   - the road follows the valley floor beside the beck between dry-stone walls, crosses
//     it once on a stone bridge in the village, and skirts the lake shore
//   - the village: plots strung along the road around the bridge, and a small green
//   - small irregular in-bye fields on the floor and larger intake fields above them,
//     almost all dry-stone walled (hedges are rare here: a few garden hedges), a long
//     fell wall along the foot of the fellside, a couple of walls climbing the fell
//   - open fell above: rough grazing, bracken, rock outcrops, scree on the steepest parts
//   - trees along the beck, a broadleaf wood on the lower valley side near the lake
// Finally every walkable tile is made reachable (gaps knocked in walls if needed).
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from './testgrid.js';

export function generateVillage(rng, width, height) {
  const V = CONFIG.village;
  const tiles = new Uint8Array(width * height);
  const idx = (x, y) => y * width + x;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const at = (x, y) => tiles[idx(x, y)];
  const set = (x, y, t) => { if (inMap(x, y)) tiles[idx(x, y)] = t; };
  const reserved = new Uint8Array(width * height); // road, beck, lake, plots, green: walls never go here
  const reserve = (x, y) => { if (inMap(x, y)) reserved[idx(x, y)] = 1; };
  const noise = valueNoise(rng, width, height, 6);

  // 1. The dale: a meandering centre line and a floor that widens toward the lake.
  const cx = [], half = [];
  let c = width / 2 + rng.int(5) - 2, drift = 0;
  for (let y = 0; y < height; y++) {
    drift = Math.max(-0.6, Math.min(0.6, drift + (rng.next() - 0.5) * 0.25 - (c - width / 2) * 0.01));
    c += drift;
    cx.push(c);
    half.push(V.floorHalf[0] + (V.floorHalf[1] - V.floorHalf[0]) * (y / height) + noise(0, y) * 2 - 1);
  }
  const zone = (x, y) => { // 0 valley floor, 1 intake, 2 open fell
    const d = Math.abs(x - cx[y]);
    return d <= half[y] ? 0 : d <= half[y] + V.intake ? 1 : 2;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, zone(x, y) === 2 ? TILE.FELL : TILE.GRASS);

  // 2. The lake at the foot of the dale, with a shingle shore.
  const lakeTop = height - V.lakeRows - rng.int(3);
  for (let y = lakeTop; y < height; y++) for (let x = 0; x < width; x++) {
    const t = (y - lakeTop) / (height - lakeTop); // 0 at the head of the lake
    const w = (half[y] + V.intake * 0.6) * Math.min(1, 0.5 + t * 1.5);
    const d = Math.abs(x - cx[y]) + noise(x, y) * 1.5;
    if (d <= w) { set(x, y, TILE.LAKE); reserve(x, y); }
    else if (d <= w + 1.3) { set(x, y, TILE.SHORE); reserve(x, y); }
  }

  // 3. The beck: winds down the floor from the valley head into the lake (4-connected).
  const beck = [];
  let bx = Math.round(cx[0]);
  for (let y = 0; y <= lakeTop; y++) {
    const prev = bx;
    const target = cx[y] + Math.sin(y / 5 + noise(1, y) * 3) * half[y] * 0.35;
    if (bx < target - 1) bx++; else if (bx > target + 1) bx--; else if (rng.chance(0.3)) bx += rng.int(3) - 1;
    for (let x = Math.min(prev, bx); x <= Math.max(prev, bx); x++) { set(x, y, TILE.STREAM); reserve(x, y); }
    beck[y] = bx;
    if (y > lakeTop - 6 && rng.chance(0.5)) { set(bx + 1, y, TILE.STREAM); reserve(bx + 1, y); } // widens near the lake
  }
  for (let y = lakeTop; y < height && at(beck[lakeTop], y) !== TILE.LAKE; y++) { set(beck[lakeTop], y, TILE.STREAM); reserve(beck[lakeTop], y); }

  // 4. Gills: side streams tumbling off the fells into the beck.
  for (let g = 0; g < V.gills; g++) {
    const fromLeft = g % 2 === 0;
    let x = fromLeft ? 0 : width - 1, y = 2 + rng.int(Math.max(1, lakeTop - 10));
    for (let steps = 0; steps < width * 2; steps++) {
      if (at(x, y) === TILE.STREAM && reserved[idx(x, y)] && steps > 0) break; // joined the beck
      set(x, y, TILE.STREAM);
      if (rng.chance(0.25) && y < lakeTop - 2) y++; // downhill as it goes
      else x += fromLeft ? 1 : -1;
      if (!inMap(x, y) || at(x, y) === TILE.LAKE || at(x, y) === TILE.SHORE) break;
    }
  }

  // 5. The road: beside the beck on one side, crossing it once on a stone bridge in the
  //    village, then along the lake shore. 2 tiles wide.
  const bridgeRow = Math.floor(lakeTop * V.bridgeAt) + rng.int(5) - 2;
  let side = rng.chance(0.5) ? 1 : -1;
  const road = [];
  const roadX = [];
  for (let y = 0; y < height; y++) {
    let rx;
    if (y < lakeTop) rx = beck[y] + side * V.roadOffset - (side < 0 ? 1 : 0);
    else { // skirt the lake on the road's side
      let x = beck[lakeTop] + side * V.roadOffset;
      while (inMap(x, y) && (at(x, y) === TILE.LAKE || at(x + 1, y) === TILE.LAKE || at(x, y) === TILE.SHORE && at(x + side, y) === TILE.LAKE)) x += side;
      rx = x + (side > 0 ? 1 : -1);
    }
    rx = Math.max(1, Math.min(width - 3, rx));
    if (y > 0 && Math.abs(rx - roadX[y - 1]) > 1) { // keep the road joined
      const step = Math.sign(rx - roadX[y - 1]);
      for (let x = roadX[y - 1]; x !== rx; x += step) for (const k of [0, 1]) { set(x + k, y, TILE.LANE); reserve(x + k, y); road.push([x + k, y]); }
    }
    for (const k of [0, 1]) { set(rx + k, y, TILE.LANE); reserve(rx + k, y); road.push([rx + k, y]); }
    roadX[y] = rx;
    if (y === bridgeRow) { // cross the beck: a 2-row bridge from this side to the other
      const nx = beck[y + 2] - side * V.roadOffset - (side > 0 ? 1 : 0);
      const step = Math.sign(nx - rx);
      for (const yy of [y + 1, y + 2]) for (let x = rx; x !== nx + step * 2; x += step) { set(x, yy, TILE.LANE); reserve(x, yy); road.push([x, yy]); }
      side = -side;
      roadX[y + 1] = roadX[y + 2] = nx;
      y += 2;
    }
  }
  // Wherever the road meets water (the beck, a gill): a stone bridge.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) === TILE.STREAM && road.some(([rx, ry]) => rx === x && ry === y)) set(x, y, TILE.BRIDGE);
  }
  for (const [x, y] of road) if (at(x, y) === TILE.STREAM) set(x, y, TILE.BRIDGE);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== TILE.LANE) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && at(x + dx, y + dy) === TILE.STREAM)) set(x, y, TILE.BRIDGE);
  }

  // 6. The village: plots strung along the road either side of the bridge, on the side
  //    away from the beck, plus a small green by the bridge.
  const plots = [];
  const onRoad = new Set(road.map(([x, y]) => idx(x, y)));
  const tryPlot = (x0, y0, w, h, facing) => {
    if (x0 < 1 || y0 < 1 || x0 + w >= width - 1 || y0 + h >= lakeTop - 1) return false;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (reserved[idx(x, y)]) return false;
    const edge = rng.chance(V.gardenHedge) ? TILE.HEDGE : TILE.DRYSTONE;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
      const border = x === x0 - 1 || y === y0 - 1 || x === x0 + w || y === y0 + h;
      set(x, y, border ? edge : TILE.GRASS);
      reserve(x, y);
    }
    const gx = facing > 0 ? x0 + w : x0 - 1, gy = y0 + Math.floor(h / 2);
    set(gx, gy, TILE.GRASS);
    for (let x = gx + facing; inMap(x, gy) && !onRoad.has(idx(x, gy)) && at(x, gy) !== TILE.STREAM; x += facing) { set(x, gy, TILE.GRASS); reserve(x, gy); }
    plots.push({ x: x0, y: y0, w, h, gate: { x: gx, y: gy }, side: facing > 0 ? 'west' : 'east' });
    return true;
  };
  // The green first (village centre, just past the bridge, away from the beck): open grass with a big tree, beside the road just past the bridge.
  let green = null;
  for (let tries = 0; tries < 60 && !green; tries++) {
    const gy = bridgeRow + 3 + rng.int(4), rx = roadX[Math.max(0, Math.min(height - 1, gy))];
    const gw = 5, gh = 4;
    const right = (beck[Math.min(lakeTop, gy)] - rx) < 0; // on the side of the road away from the beck
    const gx0 = right ? rx + 3 : rx - 1 - gw;
    let ok = gx0 > 1 && gx0 + gw < width - 1 && gy > 1 && gy + gh < lakeTop;
    for (let y = gy; y < gy + gh && ok; y++) for (let x = gx0; x < gx0 + gw; x++) if (reserved[idx(x, y)]) { ok = false; break; }
    if (!ok) continue;
    for (let y = gy; y < gy + gh; y++) for (let x = gx0 - 1; x < gx0 + gw + 1; x++) { if (!onRoad.has(idx(x, y))) { set(x, y, TILE.GRASS); reserve(x, y); } }
    set(gx0 + Math.floor(gw / 2), gy + 1, TILE.TREE);
    green = { x: gx0, y: gy, w: gw, h: gh };
  }

  const span = V.villageRows;
  for (const dir of [-1, 1]) { // above the bridge, then below
    let y = dir < 0 ? bridgeRow - 2 : bridgeRow + 4;
    let placed = 0;
    while (Math.abs(y - bridgeRow) < span && placed < V.plots / 2 + 1) {
      const h = V.plotH[0] + rng.int(V.plotH[1] - V.plotH[0] + 1);
      const w = V.plotW[0] + rng.int(V.plotW[1] - V.plotW[0] + 1);
      const rx = roadX[Math.max(0, Math.min(height - 1, y))];
      const beckSide = Math.sign(beck[Math.max(0, Math.min(lakeTop, y))] - rx) || 1;
      const away = -beckSide; // the side of the road away from the beck
      const y0 = dir < 0 ? y - h : y;
      // keep clear of the road along the plot's whole length (the road can jog a tile)
      const rows = Array.from({ length: h + 2 }, (_, i) => roadX[Math.max(0, Math.min(height - 1, y0 - 1 + i))]);
      const x0 = away > 0 ? Math.max(...rows) + 3 : Math.min(...rows) - 2 - w;
      if (tryPlot(x0, y0, w, h, away > 0 ? -1 : 1)) { placed++; y += dir * (h + 2); } // a narrow gap between plots
      else y += dir; // blocked here (road jog, green): try a row further on
    }
  }
  // More plots: cottages across the beck (facing the water) and a little further along
  // the road, until the village has its plots.
  for (let tries = 0; tries < 600 && plots.length < V.plots; tries++) {
    const y = bridgeRow + rng.int(span * 2) - span; // stay in the village
    if (y < 2 || y >= lakeTop - 8) continue;
    const w = V.plotW[0] + rng.int(V.plotW[1] - V.plotW[0] + 1), h = V.plotH[0] + rng.int(V.plotH[1] - V.plotH[0] + 1);
    const rows = Array.from({ length: h + 2 }, (_, i) => Math.max(0, Math.min(lakeTop, y - 1 + i)));
    if (rng.chance(0.6)) { // across the beck from the road
      const beckRight = beck[y] > roadX[Math.min(height - 1, y)];
      const x0 = beckRight ? Math.max(...rows.map((r) => beck[r])) + 3 : Math.min(...rows.map((r) => beck[r])) - 2 - w;
      tryPlot(x0, y, w, h, beckRight ? -1 : 1);
    } else { // further along the road, away from the beck
      const rx = rows.map((r) => roadX[r]);
      const beckRight = beck[y] > roadX[Math.min(height - 1, y)];
      tryPlot(beckRight ? Math.min(...rx) - 2 - w : Math.max(...rx) + 3, y, w, h, beckRight ? 1 : -1);
    }
  }
  // 7. Walled lane: dry-stone walls along both sides of the road outside the village,
  //    with field gateways every so often.
  const inVillage = (y) => Math.abs(y - bridgeRow) < span;
  for (let y = 0; y < height; y++) {
    if (inVillage(y) || y >= lakeTop) continue;
    const rx = roadX[y];
    for (const x of [rx - 1, rx + 2]) {
      if (!inMap(x, y) || reserved[idx(x, y)] || at(x, y) === TILE.STREAM) continue;
      if (rng.chance(V.laneGateChance)) continue; // a gateway
      set(x, y, TILE.DRYSTONE);
    }
  }

  // 8. Fields: irregular walled enclosures on the valley floor and intake (nearest-seed
  //    regions, jittered so the walls wander), with gaps for gateways. The fell wall runs
  //    along the top of the intake, and a couple of walls climb the open fell.
  const seeds = [];
  for (let i = 0; i < V.fields; i++) {
    for (let t = 0; t < 20; t++) {
      const x = rng.int(width), y = rng.int(lakeTop);
      if (zone(x, y) < 2) { seeds.push([x, y]); break; }
    }
  }
  const region = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < lakeTop; y++) for (let x = 0; x < width; x++) {
    if (zone(x, y) === 2) continue;
    let best = -1, bd = Infinity;
    const jx = x + (noise(x, y) - 0.5) * 4, jy = y + (noise(y, x) - 0.5) * 4;
    seeds.forEach(([sx, sy], i) => { const d = (jx - sx) ** 2 + (jy - sy) ** 2; if (d < bd) { bd = d; best = i; } });
    region[idx(x, y)] = best;
  }
  const wallAt = (x, y) => {
    if (!inMap(x, y) || reserved[idx(x, y)] || at(x, y) === TILE.STREAM) return;
    set(x, y, TILE.DRYSTONE);
  };
  for (let y = 0; y < lakeTop; y++) for (let x = 0; x < width; x++) {
    const r = region[idx(x, y)];
    if (r < 0) continue;
    const right = x + 1 < width ? region[idx(x + 1, y)] : r, down = y + 1 < lakeTop ? region[idx(x, y + 1)] : r;
    if ((right !== r && right >= 0) || (down !== r && down >= 0)) {
      if (!rng.chance(V.fieldGateChance)) wallAt(x, y);
    }
  }
  // Fell wall: along the boundary between intake and open fell.
  for (let y = 0; y < lakeTop; y++) for (let x = 0; x < width; x++) {
    if (zone(x, y) !== 1) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && zone(x + dx, y + dy) === 2) && !rng.chance(0.05)) wallAt(x, y);
  }
  // Walls climbing the fell from the fell wall to the map edge.
  for (let k = 0; k < V.fellWalls; k++) {
    const y0 = 3 + rng.int(Math.max(1, lakeTop - 6)), dir = k % 2 === 0 ? -1 : 1;
    let x = Math.round(cx[y0] + dir * (half[y0] + V.intake)), y = y0;
    while (inMap(x, y)) { wallAt(x, y); x += dir; if (rng.chance(0.2)) y += rng.chance(0.5) ? 1 : -1; if (y < 0 || y >= lakeTop) break; }
  }

  // 9. Open fell: bracken, rock outcrops, scree on the steep outer slopes, odd thorn trees.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== TILE.FELL) continue;
    const n = noise(x * 1.3, y * 1.3), steep = Math.abs(x - cx[Math.min(y, height - 1)]) - half[Math.min(y, height - 1)] - V.intake;
    if (n > 0.78 && rng.chance(0.6)) set(x, y, TILE.ROCK);
    else if (steep > V.screeFrom && n > 0.6 && rng.chance(0.5)) set(x, y, TILE.SCREE);
    else if (n < 0.42 && rng.chance(0.8)) set(x, y, TILE.BRACKEN);
    else if (rng.chance(0.01)) set(x, y, TILE.TREE);
  }

  // 10. Trees: along the beck banks, and a broadleaf wood on the lower valley side.
  for (let y = 0; y < lakeTop; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== TILE.GRASS || reserved[idx(x, y)]) continue;
    const byWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && at(x + dx, y + dy) === TILE.STREAM);
    if (byWater && rng.chance(V.beckTrees)) set(x, y, TILE.TREE);
  }
  const woodSide = rng.chance(0.5) ? 1 : -1;
  const wy0 = lakeTop - V.woodRows;
  for (let y = Math.max(0, wy0); y < height; y++) for (let x = 0; x < width; x++) {
    const d = (x - cx[y]) * woodSide;
    if (d < half[y] * 0.4 || d > half[y] + V.intake + 3) continue;
    const t = at(x, y);
    if (reserved[idx(x, y)] || !(t === TILE.GRASS || t === TILE.FELL || t === TILE.BRACKEN)) continue;
    if (rng.chance(V.woodDensity * (0.6 + noise(x, y) * 0.6))) set(x, y, TILE.TREE);
    else if (rng.chance(0.2)) set(x, y, TILE.BUSH);
  }
  // A few field trees and bushes.
  for (let i = 0; i < V.fieldTrees; i++) {
    const x = rng.int(width), y = rng.int(lakeTop);
    if (at(x, y) === TILE.GRASS && !reserved[idx(x, y)]) set(x, y, rng.chance(0.6) ? TILE.TREE : TILE.BUSH);
  }

  // 11. Reachability from the bridge.
  const start = road.find(([, y]) => y === bridgeRow) || road[Math.floor(road.length / 2)];
  makeReachable(tiles, width, height, start);

  return { tiles, plots, lane: road, green, bridgeRow, lakeTop };
}

// Smooth random field 0..1 (bilinear value noise on a coarse grid), seeded.
function valueNoise(rng, width, height, cell) {
  const gw = Math.ceil(Math.max(width, height) * 2 / cell) + 3;
  const grid = Array.from({ length: gw * gw }, () => rng.next());
  return (x, y) => {
    const fx = Math.abs(x) / cell, fy = Math.abs(y) / cell;
    const x0 = Math.floor(fx) % (gw - 1), y0 = Math.floor(fy) % (gw - 1), tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const g = (i, j) => grid[(y0 + j) * gw + (x0 + i)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (g(0, 0) * (1 - sx) + g(1, 0) * sx) * (1 - sy) + (g(0, 1) * (1 - sx) + g(1, 1) * sx) * sy;
  };
}

const passable = (t) => !TILE_INFO[t].blocks;

function makeReachable(tiles, width, height, [sx, sy]) {
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  for (let pass = 0; pass < 300; pass++) {
    const seen = new Uint8Array(width * height);
    const queue = [[sx, sy]]; seen[sy * width + sx] = 1;
    while (queue.length) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy, i = ny * width + nx;
        if (!inside(nx, ny) || seen[i] || !passable(tiles[i])) continue;
        seen[i] = 1; queue.push([nx, ny]);
      }
    }
    let start = -1;
    for (let i = 0; i < tiles.length && start < 0; i++) if (passable(tiles[i]) && !seen[i]) start = i;
    if (start < 0) return;
    // Carve the shortest way out of the pocket (never through the lake).
    const prev = new Int32Array(width * height).fill(-1);
    const bfs = [start]; prev[start] = start;
    let goal = -1;
    for (let h = 0; h < bfs.length && goal < 0; h++) {
      const i = bfs[h], x = i % width, y = Math.floor(i / width);
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy, j = ny * width + nx;
        if (!inside(nx, ny) || prev[j] >= 0 || tiles[j] === TILE.LAKE || tiles[j] === TILE.POND) continue;
        prev[j] = i;
        if (seen[j]) { goal = j; break; }
        bfs.push(j);
      }
    }
    if (goal < 0) { tiles[start] = TILE.ROCK; continue; } // an island cut off by the lake: make it rock
    for (let j = goal; j !== start; j = prev[j]) if (!passable(tiles[j])) tiles[j] = tiles[j] === TILE.ROCK ? TILE.FELL : TILE.GRASS;
  }
}
