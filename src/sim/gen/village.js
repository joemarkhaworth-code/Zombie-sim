// Village land (step 14a): a small Lake District village, generated in layers the way
// real Lakeland villages grew. Top of the map = valley head. Each layer claims ("lays")
// its tiles; later layers only build on tiles nobody has claimed yet.
//   1. Valley: a valley floor with a beck winding down it, rising fellside on both sides
//      (slow going), side gills tumbling off the fells, a lake at the foot of the dale.
//   2. Main road: down the valley floor, crossing the beck once on a stone bridge.
//      The village centres on this crossing; through the village the road runs straight.
//   3. High street: pavements both sides, and continuous rows of building plots
//      (terraced cottages, a pub by the bridge, a shop) fronting straight onto them.
//   4. Ginnels: narrow 1-tile passages between the terrace rows, through to a back lane
//      behind small walled yards (one yard per plot, gate onto the back lane).
//   5. A small green by the bridge, and a church plot in a walled graveyard just off it.
//   6. Outskirts: side lanes to a farm or two, dry-stone-walled fields off the lanes
//      with gates, footpaths up the fellside through gates in the fell wall, rough fell
//      (bracken, rock, scree), trees along the beck and a wood.
// Finally every walkable tile is made reachable (a gate is knocked in a wall if needed).
// Buildings are left as empty plots (TILE.PLOT) for step 14b.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from './testgrid.js';

export function generateVillage(rng, width, height) {
  const V = CONFIG.village;
  const tiles = new Uint8Array(width * height);
  const locked = new Uint8Array(width * height); // claimed by a layer
  const idx = (x, y) => y * width + x;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const at = (x, y) => tiles[idx(x, y)];
  const set = (x, y, t) => { if (inMap(x, y)) tiles[idx(x, y)] = t; };
  const lay = (x, y, t) => { if (inMap(x, y)) { tiles[idx(x, y)] = t; locked[idx(x, y)] = 1; } };
  const free = (x, y) => inMap(x, y) && !locked[idx(x, y)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const noise = valueNoise(rng, width, height, 6);

  // Village rows. The bridge is 2 rows (br, br+1). Above it the "up" street, below it
  // the "down" street; each has a connecting lane row at both ends.
  const D = V.plotDepth, Y = V.yardDepth;
  const backK = 2 + D + Y;         // depth of the back lane from the road (pavement = 1)
  const beckK = backK + 2;         // the beck runs behind the back lane and its bank
  const br = Math.round(height * V.bridgeAt) + rng.int(5) - 2;
  const [upRows, downRows] = V.streetRows;
  const uTop = br - 1 - upRows, lBot = br + 2 + downRows;
  const vTop = uTop - 1, vBot = lBot + 1;
  const lakeTop = height - V.lakeRows;
  const inVillage = (y) => y >= vTop && y <= vBot;

  // ---- 1. Valley ----------------------------------------------------------------
  // rc[y]: the road's right-hand column (road = rc-1, rc); the valley follows it.
  const rc = new Array(height);
  const rc0 = (width >> 1) + rng.int(3) - 1;
  const wander = (p) => clamp(rng.chance(V.roadDrift) ? p + (rng.chance(0.5) ? 1 : -1) : p, rc0 - 6, rc0 + 6);
  for (let y = vTop - 2; y <= vBot + 2; y++) rc[y] = rc0;
  for (let y = vTop - 3; y >= 0; y--) rc[y] = wander(rc[y + 1]);
  for (let y = vBot + 3; y < height; y++) rc[y] = wander(rc[y - 1]);
  // X(s, k, y): the column k tiles out from the road on side s (+1 east, -1 west).
  const X = (s, k, y) => (s > 0 ? rc[y] + k : rc[y] - 1 - k);
  const depth = (x, y) => (x >= rc[y] ? x - rc[y] : rc[y] - 1 - x); // road tiles: 0 / -1
  // Floor half-width: narrow at the valley head, wider toward the lake, widest round the village.
  const half = [];
  for (let y = 0; y < height; y++) {
    const base = V.floorHalf[0] + (V.floorHalf[1] - V.floorHalf[0]) * (y / height) + noise(0, y) * 2 - 1;
    const away = y < vTop ? vTop - y : y > vBot ? y - vBot : 0;
    const t = clamp(1 - away / 6, 0, 1);
    half.push(base + (Math.max(base, V.villageHalf) - base) * t);
  }
  const zone = (x, y) => { // 0 valley floor, 1 lower fellside (intake fields), 2 open fell
    const d = depth(x, y);
    return d <= half[y] ? 0 : d <= half[y] + V.intake ? 1 : 2;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, zone(x, y) === 0 ? TILE.GRASS : TILE.FELL);

  // The beck runs on side bs above the bridge and -bs below it (it crosses at the bridge).
  const bs = rng.chance(0.5) ? 1 : -1;
  const beckSide = (y) => (y < br ? bs : -bs);
  // The lake fills the foot of the dale on the beck's side, clear of the road.
  for (let y = lakeTop; y < height; y++) for (let x = 0; x < width; x++) {
    if (Math.sign(x - rc[y] + 0.5) !== -bs) continue;
    const edge = 4 + Math.max(0, lakeTop + 3 - y) * 2 + Math.round(noise(x, y) * 2);
    if (depth(x, y) >= edge) lay(x, y, TILE.LAKE);
  }
  // The beck: depth from the road per row; behind the back lanes through the village,
  // wandering over the floor outside it; a straight run across the valley at the bridge.
  const bd = new Array(height);
  for (let y = vTop - 1; y <= vBot + 1; y++) bd[y] = beckK;
  const beckStep = (prev, y) => {
    const maxD = Math.max(3, Math.floor(half[y]) - 1);
    const target = 3 + (maxD - 3) * noise(5, y * 1.5);
    return clamp(prev + (rng.chance(0.6) ? Math.sign(Math.round(target - prev)) : 0), 3, maxD);
  };
  for (let y = vTop - 2; y >= 0; y--) bd[y] = beckStep(bd[y + 1], y);
  for (let y = vBot + 2; y < height; y++) bd[y] = y >= lakeTop ? bd[y - 1] + 1 : beckStep(bd[y - 1], y);
  let prevX = null;
  for (let y = 0; y < height; y++) {
    if (y === br || y === br + 1) {
      const a = X(bs, beckK, y), b = X(-bs, beckK, y);
      for (let x = Math.min(a, b); x <= Math.max(a, b); x++) lay(x, y, TILE.STREAM);
      prevX = X(-bs, beckK, y);
      continue;
    }
    const x = clamp(X(beckSide(y), bd[y], y), 1, width - 2);
    if (inMap(x, y) && at(x, y) === TILE.LAKE) break; // reached the lake
    const from = prevX === null ? x : prevX;
    for (let xx = Math.min(from, x); xx <= Math.max(from, x); xx++) {
      if (at(xx, y) === TILE.LAKE) break;
      lay(xx, y, TILE.STREAM);
    }
    prevX = x;
  }
  // Shingle shore round the lake.
  for (let y = lakeTop - 1; y < height; y++) for (let x = 0; x < width; x++) {
    if (!free(x, y) || depth(x, y) < 3) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && at(x + dx, y + dy) === TILE.LAKE)) lay(x, y, TILE.SHORE);
  }
  // Gills: side streams off the fell on the beck's side, one above the village, one below.
  const gillRows = [[2, vTop - 4], [vBot + 3, lakeTop - 4]];
  for (let g = 0; g < Math.min(V.gills, gillRows.length); g++) {
    const [y0, y1] = gillRows[g];
    if (y1 <= y0) continue;
    let y = y0 + rng.int(y1 - y0);
    const s = beckSide(y);
    let x = s > 0 ? width - 1 : 0;
    for (let steps = 0; steps < width * 2 && inMap(x, y); steps++) {
      if (at(x, y) === TILE.STREAM && locked[idx(x, y)] && steps > 0) break; // joined the beck
      if (!free(x, y)) break;
      lay(x, y, TILE.STREAM);
      if (rng.chance(0.25) && y + 1 < y1 + 2) y++; else x -= s;
    }
  }

  // ---- 2. Main road and the bridge ---------------------------------------------------
  const road = [];
  for (let y = 0; y < height; y++) for (const x of [rc[y] - 1, rc[y]]) { lay(x, y, TILE.ROAD); road.push([x, y]); }
  for (const y of [br, br + 1]) for (let x = X(-1, 1, y); x <= X(1, 1, y); x++) lay(x, y, TILE.BRIDGE); // road + pavements

  // ---- 3-5. High street, ginnels and yards, green and church ------------------------
  const plots = [];
  let green = null, graveyard = null;
  const parts = {
    up: { near: br - 2, dir: -1, len: upRows, conNear: br - 1, conFar: uTop - 1 },
    down: { near: br + 3, dir: 1, len: downRows, conNear: br + 2, conFar: lBot + 1 },
  };
  const gp = rng.chance(0.5) ? 'up' : 'down', gs = rng.chance(0.5) ? 1 : -1; // where the green + church go
  const rect = (s, k0, k1, y0, y1, xRow = y0) => {
    const xa = X(s, k0, xRow), xb = X(s, k1, xRow);
    return { x: Math.min(xa, xb), y: Math.min(y0, y1), w: Math.abs(xb - xa) + 1, h: Math.abs(y1 - y0) + 1 };
  };
  // Pavements both sides through the village (the bridge carries them over the beck).
  for (let y = vTop; y <= vBot; y++) if (y !== br && y !== br + 1) for (const s of [1, -1]) lay(X(s, 1, y), y, TILE.PAVEMENT);

  for (const [pName, P] of Object.entries(parts)) for (const s of [1, -1]) {
    const yOf = (t) => P.near + P.dir * t;
    const beckHere = s === (pName === 'up' ? bs : -bs);
    // Lanes: a lane at each end from the pavement to the back lane; the back lane behind.
    for (const y of [P.conNear, P.conFar]) for (let k = 2; k <= backK; k++) lay(X(s, k, y), y, TILE.LANE);
    for (let t = -1; t <= P.len; t++) lay(X(s, backK, yOf(t)), yOf(t), TILE.LANE);
    // Beyond the back lane: the beck's bank, or a field wall (sometimes a hedge).
    if (!beckHere) {
      const edge = rng.chance(V.backHedge) ? TILE.HEDGE : TILE.DRYSTONE;
      for (let t = 0; t < P.len; t++) lay(X(s, backK + 1, yOf(t)), yOf(t), edge);
    }
    const ginnel = (t) => { for (let k = 2; k < backK; k++) lay(X(s, k, yOf(t)), yOf(t), TILE.GINNEL); };
    let t = 0;
    if (pName === gp && s === gs) {
      // The green: open grass by the bridge with a big tree.
      const rem = P.len - (V.greenRows + 1 + V.churchRows);
      const gh = V.greenRows + (rem > 0 && rem < 5 ? rem : 0); // rows too few for a terrace: a bigger green
      for (let tt = 0; tt < gh; tt++) for (let k = 2; k < backK; k++) lay(X(s, k, yOf(tt)), yOf(tt), TILE.GRASS);
      lay(X(s, 2 + Math.floor((backK - 3) / 2), yOf(Math.floor(gh / 2))), yOf(Math.floor(gh / 2)), TILE.TREE);
      green = rect(s, 2, backK - 1, yOf(0), yOf(gh - 1));
      t = gh; ginnel(t++);
      // The church in its walled graveyard: lychgate on the pavement, back gate on the back lane.
      const ch = V.churchRows, t0 = t, mid = t0 + Math.floor(ch / 2);
      const cK0 = 5, cK1 = backK - 3; // church plot depth range
      for (let tt = t0; tt < t0 + ch; tt++) for (let k = 2; k < backK; k++) {
        const y = yOf(tt), wall = tt === t0 || tt === t0 + ch - 1 || k === 2 || k === backK - 1;
        const church = k >= cK0 && k <= cK1 && tt >= t0 + 2 && tt <= t0 + ch - 3;
        lay(X(s, k, y), y, wall ? TILE.DRYSTONE : church ? TILE.PLOT : TILE.GRASS);
      }
      lay(X(s, 2, yOf(mid)), yOf(mid), TILE.GATE);
      lay(X(s, backK - 1, yOf(t0 + ch - 2)), yOf(t0 + ch - 2), TILE.GATE);
      for (let k = 3; k < cK0; k++) lay(X(s, k, yOf(mid)), yOf(mid), TILE.PATH);
      for (let tt = t0 + 1; tt < t0 + ch - 1; tt++) for (let k = 3; k < backK - 1; k++) {
        const y = yOf(tt), x = X(s, k, y);
        if (at(x, y) !== TILE.GRASS || (tt - t0) % 2 !== 1 || k % 2 !== 1) continue;
        if (N4.some(([dx, dy]) => [TILE.PATH, TILE.GATE].includes(at(x + dx, y + dy)))) continue;
        if (rng.chance(V.graves)) lay(x, y, TILE.GRAVE);
      }
      graveyard = rect(s, 2, backK - 1, yOf(t0), yOf(t0 + ch - 1));
      plots.push({ ...rect(s, cK0, cK1, yOf(t0 + 2), yOf(t0 + ch - 3)), kind: 'church', front: { x: X(s, cK0 - 1, yOf(mid)), y: yOf(mid) } });
      t += ch;
      if (t < P.len) ginnel(t++);
    }
    // Terrace rows: plots fronting the pavement, a walled yard behind each, ginnels between rows.
    let wantPub = pName === gp && s === -gs;
    while (P.len - t >= 4) {
      const avail = P.len - t, units = [];
      const limit = avail >= 9 ? avail - 5 : avail; // leave room for a ginnel and another row
      let sum = 0;
      const n = V.unitsPerRow[0] + rng.int(V.unitsPerRow[1] - V.unitsPerRow[0] + 1);
      for (let i = 0; i < n; i++) {
        const pub = wantPub && i === 0;
        const h = pub ? V.pubRows : V.unitRows[0] + rng.int(V.unitRows[1] - V.unitRows[0] + 1);
        if (sum + h > limit) break;
        units.push({ h, kind: pub ? 'pub' : 'cottage' }); sum += h;
      }
      if (units.length && units[units.length - 1].h < 4) { // the last yard needs a wall on both ends
        if (sum + 1 <= limit) { units[units.length - 1].h++; sum++; } else sum -= units.pop().h;
      }
      if (!units.length) break;
      const rest = avail - sum;
      if (rest > 0 && rest < 5) { units[units.length - 1].h += rest; sum += rest; } // too short for another row
      if (units[0].kind === 'pub') wantPub = false;
      let a = t;
      units.forEach((u, i) => {
        const last = i === units.length - 1;
        for (let tt = a; tt < a + u.h; tt++) {
          const y = yOf(tt), wallRow = tt === a || (last && tt === a + u.h - 1);
          for (let k = 2; k <= 1 + D; k++) lay(X(s, k, y), y, TILE.PLOT);
          for (let k = 2 + D; k < backK - 1; k++) lay(X(s, k, y), y, wallRow ? TILE.DRYSTONE : TILE.YARD);
          lay(X(s, backK - 1, y), y, tt === a + 1 ? TILE.GATE : TILE.DRYSTONE);
        }
        const fy = yOf(a + Math.floor(u.h / 2));
        plots.push({ ...rect(s, 2, 1 + D, yOf(a), yOf(a + u.h - 1)), kind: u.kind, front: { x: X(s, 1, fy), y: fy }, back: { x: X(s, 2 + D, yOf(a + 1)), y: yOf(a + 1) } });
        a += u.h;
      });
      t += sum;
      if (t < P.len) ginnel(t++);
    }
    for (; t < P.len; t++) for (let k = 2; k < backK; k++) lay(X(s, k, yOf(t)), yOf(t), TILE.GRASS); // odd leftover row: a strip of garden
  }
  // The shop: the cottage nearest the bridge on the other street from the pub.
  const cottages = plots.filter((p) => p.kind === 'cottage');
  const other = cottages.filter((p) => (p.y < br) !== (gp === 'up'));
  const pool = other.length ? other : cottages;
  if (pool.length) pool.reduce((a, b) => (Math.abs(b.y + b.h / 2 - br) < Math.abs(a.y + a.h / 2 - br) ? b : a)).kind = 'shop';

  // ---- 6. Outskirts ----------------------------------------------------------------
  const farms = [];
  const footpath = (x, y, dx, dy) => { // up the fellside to the map edge; gates through walls
    for (let i = 0; i < width * 3 && inMap(x, y); i++) {
      const t = at(x, y);
      if (t === TILE.LAKE || t === TILE.SHORE) break;
      if (t === TILE.STREAM) lay(x, y, TILE.BRIDGE); // a footbridge
      else if (t === TILE.DRYSTONE || t === TILE.HEDGE) lay(x, y, TILE.GATE);
      else if (free(x, y)) lay(x, y, TILE.PATH);
      if (x === 0 || x === width - 1) break;
      const ny = y + dy;
      if (rng.chance(0.3) && ny >= 1 && ny < lakeTop - 2 && !inVillage(ny)) y = ny; else x += dx;
    }
  };
  // Farms: a side lane off the main road to a walled farmyard with a farmhouse and barn
  // at the foot of the fell, on the side away from the beck. A footpath leads on uphill.
  const farmRows = [[5, vTop - 5, -bs, -1], [vBot + 5, lakeTop - 5, bs, 1]];
  for (let f = 0; f < Math.min(V.farms, farmRows.length); f++) {
    const [r0, r1, s, dy] = farmRows[f];
    const W = V.farmW, H = V.farmH;
    for (let tries = 0; tries < 20 && r1 >= r0; tries++) {
      const yL = r0 + rng.int(r1 - r0 + 1), y0 = yL - Math.floor(H / 2);
      const maxDepth = s > 0 ? width - 2 - rc[yL] : rc[yL] - 2;
      const kF = clamp(Math.round(half[yL]) - 1 + rng.int(3), 4, maxDepth - W + 1);
      const Xf = (k) => X(s, k, yL); // the farm is laid square to the road at its lane
      const xs = Array.from({ length: W }, (_, i) => Xf(kF + i));
      const x0 = Math.min(...xs);
      let ok = y0 >= 1 && y0 + H < height && x0 >= 1 && x0 + W < width;
      for (let y = y0 - 1; ok && y <= y0 + H; y++) for (let x = x0 - 1; x <= x0 + W; x++) if (!free(x, y)) { ok = false; break; }
      for (let k = 1; ok && k < kF; k++) for (const yy of [yL - 1, yL, yL + 1]) if (k > 1 && !free(Xf(k), yy)) { ok = false; break; }
      if (!ok) continue;
      for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + W; x++) {
        const wall = y === y0 || y === y0 + H - 1 || x === x0 || x === x0 + W - 1;
        lay(x, y, wall ? TILE.DRYSTONE : TILE.YARD);
      }
      // Farmhouse and barn along the far wall, the yard in front by the gate.
      const farK0 = kF + W - 1 - 4, farK1 = kF + W - 2;
      const half1 = Math.floor((H - 2) / 2);
      const house = { ...rect(s, farK0, farK1, y0 + 1, y0 + half1, yL), kind: 'farmhouse' };
      const barn = { ...rect(s, farK0, farK1, y0 + half1 + 1, y0 + H - 2, yL), kind: 'barn' };
      for (const p of [house, barn]) {
        for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) lay(x, y, TILE.PLOT);
        const fy = p.y + Math.floor(p.h / 2);
        p.front = { x: Xf(farK0 - 1), y: fy };
        plots.push(p);
      }
      // The side lane (walled both sides) and the gate into the yard.
      for (let k = 1; k < kF; k++) {
        lay(Xf(k), yL, TILE.LANE);
        if (k > 1) for (const yy of [yL - 1, yL + 1]) lay(Xf(k), yy, TILE.DRYSTONE);
      }
      lay(Xf(kF), yL, TILE.GATE);
      // A footpath from the back of the farm up the fell.
      const py = y0 + (dy < 0 ? 1 : H - 2);
      lay(Xf(kF + W - 1), py, TILE.GATE);
      footpath(Xf(kF + W), py, s, dy);
      farms.push({ x: x0, y: y0, w: W, h: H, gate: { x: Xf(kF), y: yL } });
      break;
    }
  }
  // Footpaths from the far ends of the beck-side back lanes: over the beck and up the fell.
  footpath(X(bs, backK + 1, uTop - 1), uTop - 1, bs, -1);
  footpath(X(-bs, backK + 1, lBot + 1), lBot + 1, -bs, 1);
  // The main road is walled outside the village.
  for (let y = 0; y < height; y++) {
    if (inVillage(y)) continue;
    for (const s of [1, -1]) if (free(X(s, 1, y), y)) lay(X(s, 1, y), y, TILE.DRYSTONE);
  }

  // Fields: walled enclosures on the floor and lower fellside. Seeds sit a few tiles off
  // the road and lanes so fields front onto them; walls wander (jittered nearest seed).
  const seeds = [];
  const ways = road.filter(([, y]) => !inVillage(y));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y) === TILE.LANE && !inVillage(y)) ways.push([x, y]);
  for (let i = 0, tries = 0; i < V.fields && tries < V.fields * 30; tries++) {
    const [wx, wy] = ways[rng.int(ways.length)];
    const horizontalLane = at(wx, wy) === TILE.LANE;
    const off = (rng.chance(0.5) ? 1 : -1) * (3 + rng.int(6));
    const sx = horizontalLane ? wx : wx + off, sy = horizontalLane ? wy + off : wy;
    if (free(sx, sy) && zone(sx, sy) < 2) { seeds.push([sx, sy]); i++; }
  }
  for (let i = 0; i < V.fields / 2; i++) {
    const x = rng.int(width), y = rng.int(lakeTop);
    if (free(x, y) && zone(x, y) < 2) seeds.push([x, y]);
  }
  const region = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!free(x, y) || zone(x, y) === 2 || at(x, y) === TILE.STREAM) continue;
    let best = -1, bdist = Infinity;
    const jx = x + (noise(x, y) - 0.5) * 4, jy = y + (noise(y, x) - 0.5) * 4;
    seeds.forEach(([sx, sy], i) => { const d = (jx - sx) ** 2 + (jy - sy) ** 2; if (d < bdist) { bdist = d; best = i; } });
    region[idx(x, y)] = best;
  }
  const wallAt = (x, y) => { if (free(x, y) && at(x, y) !== TILE.STREAM) set(x, y, TILE.DRYSTONE); };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const r = region[idx(x, y)];
    if (r < 0) continue;
    const right = x + 1 < width ? region[idx(x + 1, y)] : r, down = y + 1 < height ? region[idx(x, y + 1)] : r;
    if ((right >= 0 && right !== r) || (down >= 0 && down !== r)) wallAt(x, y);
  }
  // The fell wall: along the top of the intake fields.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (zone(x, y) !== 1 || region[idx(x, y)] < 0) continue;
    if (N4.some(([dx, dy]) => inMap(x + dx, y + dy) && zone(x + dx, y + dy) === 2 && free(x + dx, y + dy))) wallAt(x, y);
  }
  // Gates: every field gets one onto a road, lane or path it borders; most neighbouring
  // fields get one between them; some fields get one onto the open fell.
  const label = (x, y) => {
    if (!inMap(x, y)) return null;
    const t = at(x, y), r = region[idx(x, y)];
    if (TILE_INFO[t].blocks) return null;
    if (r >= 0 && free(x, y)) return `f${r}`;
    if (t === TILE.ROAD || t === TILE.LANE || t === TILE.PATH) return 'way';
    if (free(x, y) && zone(x, y) === 2) return 'fell';
    return null;
  };
  const groups = new Map();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== TILE.DRYSTONE) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const a = label(x - dx, y - dy), b = label(x + dx, y + dy);
      if (!a || !b || a === b || (a[0] !== 'f' && b[0] !== 'f')) continue;
      const key = [a, b].sort().join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push([x, y]);
    }
  }
  for (const [key, cells] of groups) {
    const chance = key.includes('way') ? 1 : key.includes('fell') ? V.fellGate : V.fieldGate;
    if (!rng.chance(chance)) continue;
    const [x, y] = cells[rng.int(cells.length)];
    lay(x, y, TILE.GATE);
  }

  // Open fell: bracken, rock outcrops, scree high up, odd thorn trees; some bracken on the intake.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!free(x, y) || at(x, y) !== TILE.FELL) continue;
    const n = noise(x * 1.3, y * 1.3), up = depth(x, y) - half[y] - V.intake;
    if (zone(x, y) === 1) { if (n < 0.35 && rng.chance(0.5)) set(x, y, TILE.BRACKEN); continue; }
    if (n > 0.78 && rng.chance(0.6)) set(x, y, TILE.ROCK);
    else if (up > V.screeFrom && n > 0.6 && rng.chance(0.5)) set(x, y, TILE.SCREE);
    else if (n < 0.42 && rng.chance(0.8)) set(x, y, TILE.BRACKEN);
    else if (rng.chance(0.01)) set(x, y, TILE.TREE);
  }
  // Trees along the beck, a wood on the beck's side below the village, a few field trees.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!free(x, y) || ![TILE.GRASS, TILE.FELL].includes(at(x, y))) continue;
    if (N4.some(([dx, dy]) => inMap(x + dx, y + dy) && at(x + dx, y + dy) === TILE.STREAM) && rng.chance(V.beckTrees)) set(x, y, TILE.TREE);
  }
  const wy = Math.round((vBot + lakeTop) / 2), wxc = X(-bs, Math.round(half[wy]), wy), R = V.woodRadius;
  for (let y = wy - R; y <= wy + R; y++) for (let x = Math.round(wxc - R * 1.5); x <= Math.round(wxc + R * 1.5); x++) {
    if (!free(x, y) || ![TILE.GRASS, TILE.FELL, TILE.BRACKEN].includes(at(x, y))) continue;
    const d = ((x - wxc) / (R * 1.5)) ** 2 + ((y - wy) / R) ** 2 + (noise(x, y) - 0.5) * 0.6;
    if (d > 1) continue;
    if (rng.chance(V.woodDensity)) set(x, y, TILE.TREE); else if (rng.chance(0.2)) set(x, y, TILE.BUSH);
  }
  for (let i = 0; i < V.fieldTrees; i++) {
    const x = rng.int(width), y = rng.int(lakeTop);
    if (free(x, y) && at(x, y) === TILE.GRASS) set(x, y, rng.chance(0.6) ? TILE.TREE : TILE.BUSH);
  }

  // Reachability from the bridge.
  const start = { x: rc0, y: br };
  makeReachable(tiles, width, height, [start.x, start.y]);

  return { tiles, plots, green, graveyard, farms, bridgeRow: br, lakeTop, start };
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
// What a blocker becomes when a way has to be knocked through it.
const OPENED = { [TILE.DRYSTONE]: TILE.GATE, [TILE.ROCK]: TILE.FELL, [TILE.GRAVE]: TILE.GRASS };

function makeReachable(tiles, width, height, [sx, sy]) {
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  for (let pass = 0; pass < 400; pass++) {
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
    // Knock the shortest way out of the pocket (never through the lake).
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
    for (let j = goal; j !== start; j = prev[j]) if (!passable(tiles[j])) tiles[j] = OPENED[tiles[j]] ?? TILE.GRASS;
  }
}
