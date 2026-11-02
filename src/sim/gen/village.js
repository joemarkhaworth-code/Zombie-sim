// Village land (step 14a): a small Lake District village, generated in layers the way
// real Lakeland villages grew, at true scale (CONFIG.scale: 1 tile ~ 1.5 m). Top of the
// map = valley head. Each layer claims ("lays") its tiles; later layers only build on
// tiles nobody has claimed yet.
//   1. Valley: a valley floor with a beck winding down it, rising fellside on both sides
//      (slow going), side gills tumbling off the fells, a lake at the foot of the dale.
//   2. Main road: down the valley floor, crossing the beck once on a narrow stone bridge.
//      The village centres on this crossing; through the village the road runs straight.
//   3. High street: pavements both sides, and continuous rows of building plots
//      (terraced cottages, a pub by the bridge, a corner shop) fronting straight onto them.
//      Detached cottages in their own gardens towards the ends of the street.
//   4. Ginnels: 1-tile passages between the terrace rows, through to a back lane behind
//      the walled yards (one yard per plot, gate onto the back lane).
//   5. A green by the bridge, and the church in a walled graveyard just off it.
//   6. Outskirts: side lanes to a farm or two, dry-stone-walled fields (10-20 tiles
//      across) with gates, footpaths up the fellside through gates in the fell wall, rough
//      fell (bracken, rock, scree), trees along the beck and a wood.
// Finally every walkable tile is made reachable (a gate is knocked in a wall if needed).
// Buildings are left as empty plots (TILE.PLOT) of their true size for step 14b.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from './testgrid.js';

const pick = (rng, v) => (Array.isArray(v) ? v[0] + rng.int(v[1] - v[0] + 1) : v);

export function generateVillage(rng, width, height) {
  const V = CONFIG.village, BLD = CONFIG.scale.buildings, WAY = CONFIG.scale.ways;
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
  const noise = valueNoise(rng, width, height, 9);

  // Widths for this map, from the scale table.
  const rw = pick(rng, WAY.mainRoad), lw = pick(rng, WAY.lane), bw = pick(rng, WAY.beck), bridgeW = WAY.bridge;
  // Street block: pavement (depth 1), then the block from the pavement to the back lane,
  // deep enough for the deepest street building (the pub) and a yard behind it.
  const B = BLD.pub[1] + V.yardMin;
  const backK0 = 2 + B, backK1 = 1 + B + lw; // the back lane
  const bankK = backK1 + 1, beckK = bankK + 1; // the beck's bank and the beck behind it

  // Village rows. The beck crosses the road on rows br..br+bw-1 (the bridge). Each street
  // has a lane at both ends (lw rows) and its plots in between (streetRows).
  const br = Math.round(height * V.bridgeAt) + rng.int(5) - 2;
  const [upRows, downRows] = V.streetRows;
  const vTop = br - 2 * lw - upRows, vBot = br + bw + 2 * lw + downRows - 1;
  const lakeTop = height - V.lakeRows;
  const inVillage = (y) => y >= vTop && y <= vBot;

  // ---- 1. Valley ----------------------------------------------------------------
  // rl[y]: the road's left column (road = rl..rl+rw-1); the valley follows the road.
  const rl = new Array(height);
  const rl0 = ((width - rw) >> 1) + rng.int(3) - 1;
  const wander = (p) => clamp(rng.chance(V.roadDrift) ? p + (rng.chance(0.5) ? 1 : -1) : p, rl0 - 10, rl0 + 10);
  for (let y = vTop - 2; y <= vBot + 2; y++) rl[y] = rl0;
  for (let y = vTop - 3; y >= 0; y--) rl[y] = wander(rl[y + 1]);
  for (let y = vBot + 3; y < height; y++) rl[y] = wander(rl[y - 1]);
  // X(s, k, y): the column k tiles out from the road's edge on side s (+1 east, -1 west).
  const X = (s, k, y) => (s > 0 ? rl[y] + rw - 1 + k : rl[y] - k);
  const depth = (x, y) => (x >= rl[y] + rw ? x - (rl[y] + rw - 1) : x < rl[y] ? rl[y] - x : 0);
  const sideOf = (x, y) => (x >= rl[y] + rw ? 1 : x < rl[y] ? -1 : 0);
  // Floor half-width: narrow at the valley head, wider toward the lake, widest round the
  // village (room for the street, back lanes and the beck).
  const villageHalf = beckK + bw + 6;
  const half = [];
  for (let y = 0; y < height; y++) {
    const base = V.floorHalf[0] + (V.floorHalf[1] - V.floorHalf[0]) * (y / height) + noise(0, y) * 4 - 2;
    const away = y < vTop ? vTop - y : y > vBot ? y - vBot : 0;
    const t = clamp(1 - away / 12, 0, 1);
    half.push(base + (Math.max(base, villageHalf) - base) * t);
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
    if (sideOf(x, y) !== -bs) continue;
    const edge = 5 + Math.max(0, lakeTop + 5 - y) * 2 + Math.round(noise(x, y) * 3);
    if (depth(x, y) >= edge) lay(x, y, TILE.LAKE);
  }
  // The beck (bw wide): behind the back lanes through the village, wandering over the floor
  // outside it, and straight across the valley at the bridge.
  const bd = new Array(height); // inner depth of the beck per row
  for (let y = vTop - 1; y <= vBot + 1; y++) bd[y] = beckK;
  const beckStep = (prev, y) => {
    const maxD = Math.max(4, Math.floor(half[y]) - bw);
    const target = 4 + (maxD - 4) * noise(5, y * 0.8);
    return clamp(prev + (rng.chance(0.5) ? Math.sign(Math.round(target - prev)) : 0), 4, maxD);
  };
  for (let y = vTop - 2; y >= 0; y--) bd[y] = beckStep(bd[y + 1], y);
  for (let y = vBot + 2; y < height; y++) bd[y] = y >= lakeTop ? bd[y - 1] + 1 : beckStep(bd[y - 1], y);
  let prev = null; // [x0, x1] of the beck on the row above
  for (let y = 0; y < height; y++) {
    let x0, x1;
    if (y >= br && y < br + bw) {
      x0 = Math.min(X(bs, beckK + bw - 1, y), X(-bs, beckK + bw - 1, y));
      x1 = Math.max(X(bs, beckK + bw - 1, y), X(-bs, beckK + bw - 1, y));
    } else {
      const s = beckSide(y), a = X(s, bd[y], y), b = X(s, bd[y] + bw - 1, y);
      x0 = clamp(Math.min(a, b), 1, width - 2); x1 = clamp(Math.max(a, b), 1, width - 2);
      if (prev && x0 > prev[1]) x0 = prev[1]; // stay joined to the row above (4-connected)
      if (prev && x1 < prev[0]) x1 = prev[0];
    }
    let water = 0;
    for (let x = x0; x <= x1; x++) if (at(x, y) !== TILE.LAKE) { lay(x, y, TILE.STREAM); water++; }
    if (!water) break; // reached the lake
    prev = [x0, x1];
  }
  // Shingle shore round the lake.
  for (let y = lakeTop - 1; y < height; y++) for (let x = 0; x < width; x++) {
    if (!free(x, y) || depth(x, y) < 3) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && at(x + dx, y + dy) === TILE.LAKE)) lay(x, y, TILE.SHORE);
  }
  // Gills: 1-tile side streams off the fell on the beck's side, above and below the village.
  const gillRows = [[4, vTop - 8], [vBot + 4, lakeTop - 8]];
  for (let g = 0; g < Math.min(V.gills, gillRows.length); g++) {
    const [y0, y1] = gillRows[g];
    if (y1 <= y0) continue;
    let y = y0 + rng.int(y1 - y0);
    const s = beckSide(y);
    let x = s > 0 ? width - 1 : 0;
    for (let steps = 0; steps < width * 3 && inMap(x, y); steps++) {
      if (at(x, y) === TILE.STREAM && locked[idx(x, y)] && steps > 0) break; // joined the beck
      if (!free(x, y)) break;
      lay(x, y, TILE.STREAM);
      if (rng.chance(0.25) && y + 1 < y1 + 4) y++; else x -= s;
    }
  }

  // ---- 2. Main road and the bridge ---------------------------------------------------
  const road = [];
  for (let y = 0; y < height; y++) for (let x = rl[y]; x < rl[y] + rw; x++) {
    if (y >= br && y < br + bw) continue; // the beck: only the bridge crosses it
    lay(x, y, TILE.ROAD); road.push([x, y]);
  }
  const bx0 = rl0 + Math.floor((rw - bridgeW) / 2); // the bridge: narrower than the road
  for (let y = br; y < br + bw; y++) for (let x = bx0; x < bx0 + bridgeW; x++) { lay(x, y, TILE.BRIDGE); road.push([x, y]); }

  // ---- 3-5. High street, ginnels and yards, green and church ------------------------
  const plots = [];
  let green = null, graveyard = null;
  const parts = {
    up: { near: br - lw - 1, dir: -1, len: upRows },
    down: { near: br + bw + lw, dir: 1, len: downRows },
  };
  const gp = rng.chance(0.5) ? 'up' : 'down', gs = rng.chance(0.5) ? 1 : -1; // where the green + church go
  const shopSide = rng.chance(0.5) ? 1 : -1; // the shop: on the other street from the pub
  const facing = (s) => (s > 0 ? 'W' : 'E'); // street plots face the road
  // Pavements both sides through the village (they stop at the beck; the bridge is narrow).
  for (let y = vTop; y <= vBot; y++) if (y < br || y >= br + bw) for (const s of [1, -1]) lay(X(s, 1, y), y, TILE.PAVEMENT);

  for (const [pName, P] of Object.entries(parts)) for (const s of [1, -1]) {
    const yOf = (t) => P.near + P.dir * t;
    const put = (t, k, tile) => lay(X(s, k, yOf(t)), yOf(t), tile);
    const fill = (t0, t1, k0, k1, tile) => { for (let t = t0; t <= t1; t++) for (let k = k0; k <= k1; k++) put(t, k, tile); };
    const rect = (t0, t1, k0, k1) => {
      const xa = X(s, k0, yOf(t0)), xb = X(s, k1, yOf(t0)), ya = yOf(t0), yb = yOf(t1);
      return { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa) + 1, h: Math.abs(yb - ya) + 1 };
    };
    const at2 = (t, k) => ({ x: X(s, k, yOf(t)), y: yOf(t) });
    const beckHere = s === (pName === 'up' ? bs : -bs);
    // Lanes: one at each end of the street (lw wide) from the pavement to the back lane,
    // and the back lane behind the block. The lane by the bridge runs along the beck.
    fill(-lw, -1, 2, backK1, TILE.LANE);
    fill(P.len, P.len + lw - 1, 2, backK1, TILE.LANE);
    fill(0, P.len - 1, backK0, backK1, TILE.LANE);
    // Beyond the back lane: the beck's bank, or a field wall (sometimes a hedge).
    if (!beckHere) fill(0, P.len - 1, bankK, bankK, rng.chance(V.backHedge) ? TILE.HEDGE : TILE.DRYSTONE);
    const ginnel = (t) => fill(t, t, 2, 1 + B, TILE.GINNEL);
    let t = 0;
    if (pName === gp && s === gs) {
      // The green: open grass by the bridge with a couple of big trees.
      const gh = pick(rng, V.greenRows);
      fill(0, gh - 1, 2, 1 + B, TILE.GRASS);
      put(Math.floor(gh / 2), 2 + Math.floor(B / 3), TILE.TREE);
      if (rng.chance(0.6)) put(Math.floor(gh / 2) + 2, 2 + Math.floor(B * 2 / 3), TILE.TREE);
      green = rect(0, gh - 1, 2, 1 + B);
      t = gh; ginnel(t++);
      // The church, lying along the street in its walled graveyard: graves all round it,
      // a lychgate on the pavement with a path to the door, a back gate onto the back lane.
      const [cw, cl] = BLD.church, g = V.graveRows;
      const cs = cl + 2 * g + 2, t0 = t, t1 = t0 + cs - 1, mid = t0 + Math.floor(cs / 2);
      const ck0 = 3 + g, ck1 = ck0 + cw - 1; // church depth range
      fill(t0, t1, 2, 1 + B, TILE.DRYSTONE);
      fill(t0 + 1, t1 - 1, 3, B, TILE.GRASS);
      fill(t0 + 1 + g, t1 - 1 - g, ck0, ck1, TILE.PLOT);
      put(mid, 2, TILE.GATE);
      put(t1 - 1, 1 + B, TILE.GATE);
      for (let k = 3; k < ck0; k++) put(mid, k, TILE.PATH);
      for (let tt = t0 + 1; tt < t1; tt++) for (let k = 3; k <= B; k++) {
        const { x, y } = at2(tt, k);
        if (at(x, y) !== TILE.GRASS || (tt - t0) % 2 !== 1 || (k - 3) % 2 !== 0) continue; // rows of graves, walkways between
        if (N4.some(([dx, dy]) => [TILE.PATH, TILE.GATE].includes(at(x + dx, y + dy)))) continue;
        if (rng.chance(V.graves)) lay(x, y, TILE.GRAVE);
      }
      graveyard = rect(t0, t1, 2, 1 + B);
      plots.push({ ...rect(t0 + 1 + g, t1 - 1 - g, ck0, ck1), kind: 'church', building: 'church', facing: facing(s), turned: true, front: at2(mid, ck0 - 1) });
      t = t1 + 1;
      if (t < P.len) ginnel(t++);
    }
    // A street plot (terraced cottage, pub, shop) fronting the pavement, with a walled yard
    // behind it and a gate onto the back lane. lastInRow: the yard also needs its far wall.
    // A street plot (terraced cottage, pub, shop) fronting the pavement, with a walled yard
    // behind it and a gate onto the back lane. Neighbours in a terrace share a party wall,
    // so each plot starts on the last row of the one before (yard walls are shared too).
    // Some yards get a shed in the far corner (its walls are the yard's); the gate moves over.
    const outbuilding = (t0, t1, k0, k1, building, turned) => {
      fill(t0, t1, k0, k1, TILE.PLOT);
      plots.push({ ...rect(t0, t1, k0, k1), kind: building, building, facing: facing(s), turned: !!turned, front: at2(t0 + Math.floor((t1 - t0) / 2), k0 - 1) });
    };
    const streetPlot = (a, building, kind) => {
      const [f, d] = BLD[building];
      const notPlot = (tt, k0, k1, tile) => { for (let k = k0; k <= k1; k++) { const { x, y } = at2(tt, k); if (at(x, y) !== TILE.PLOT) lay(x, y, tile); } };
      fill(a, a + f - 1, 2, 1 + d, TILE.PLOT);
      for (let tt = a; tt < a + f; tt++) notPlot(tt, 2 + d, B, tt === a || tt === a + f - 1 ? TILE.DRYSTONE : TILE.YARD);
      fill(a, a + f - 1, 1 + B, 1 + B, TILE.DRYSTONE); // back wall
      const m = a + Math.floor(f / 2);
      const [sw, sl] = BLD.shed;
      const shed = B - (1 + d) >= sl + 2 && f >= sw + 2 && rng.chance(V.yardShed);
      put(shed ? a + f - 2 : m, 1 + B, TILE.GATE);
      plots.push({ ...rect(a, a + f - 1, 2, 1 + d), kind, building, facing: facing(s), front: at2(m, 1), back: at2(m, 2 + d), yard: rect(a + 1, a + f - 2, 2 + d, B) });
      if (shed) outbuilding(a, a + sw - 1, 2 + B - sl, 1 + B, 'shed');
      return f - 1; // the next plot shares this one's end wall
    };
    // A detached cottage in its own walled garden: front gate and path from the pavement.
    const [dw, dd] = BLD.detachedCottage, gsd = V.detachedGarden;
    const detachedSpan = dw + 2 * gsd + 2;
    const detached = (a) => {
      const a1 = a + detachedSpan - 1, m = a + 1 + gsd + Math.floor(dw / 2);
      fill(a, a1, 2, 1 + B, TILE.DRYSTONE);
      fill(a + 1, a1 - 1, 3, B, TILE.GRASS);
      fill(a + 1 + gsd, a + gsd + dw, 4, 3 + dd, TILE.PLOT);
      put(m, 2, TILE.GATE); put(m, 3, TILE.PATH);
      put(m, 1 + B, TILE.GATE);
      plots.push({ ...rect(a + 1 + gsd, a + gsd + dw, 4, 3 + dd), kind: 'detached', building: 'detachedCottage', facing: facing(s), front: at2(m, 3), back: at2(m, 4 + dd), garden: rect(a + 1, a1 - 1, 3, B) });
      // In the back garden (its walls shared with the garden's): a greenhouse in one corner,
      // sometimes a shed in the other. Both face the house.
      const [gw, gl] = BLD.greenhouse, [sw, sl] = BLD.shed;
      if (B - (3 + dd) >= gw) outbuilding(a1 - gl + 1, a1, 2 + B - gw, 1 + B, 'greenhouse', true);
      if (B - (3 + dd) >= sl && rng.chance(V.gardenShed)) outbuilding(a, a + sw - 1, 2 + B - sl, 1 + B, 'shed');
    };
    let special = pName === gp && s === -gs ? 'pub' : pName !== gp && s === shopSide ? 'shop' : null;
    const cottageW = BLD.terracedCottage[0];
    while (t < P.len) {
      const avail = P.len - t;
      const specialW = special ? BLD[special === 'pub' ? 'pub' : 'cornerShop'][0] : 0;
      // Terraces near the middle; the end of the street is kept for a detached cottage.
      const room = avail - detachedSpan - 1; // rows left for terraces (and a ginnel)
      if (room >= specialW + 2 * cottageW) {
        // A terrace row: [pub or shop first, by the bridge or the corner] + 3-5 cottages.
        const units = special ? [special] : [];
        let sum = specialW; // rows used (neighbours share a wall row)
        const n = pick(rng, V.terraceUnits);
        for (let i = 0; i < n && sum + cottageW - (sum ? 1 : 0) <= room; i++) { units.push('cottage'); sum += cottageW - (sum ? 1 : 0); }
        let a = t;
        for (const u of units) a += streetPlot(a, u === 'pub' ? 'pub' : u === 'shop' ? 'cornerShop' : 'terracedCottage', u);
        special = null;
        t += sum;
        if (t < P.len) ginnel(t++);
      } else if (avail >= detachedSpan) {
        detached(t); t += detachedSpan;
      } else { // the last few rows: a walled garden with a gate
        fill(t, P.len - 1, 2, 1 + B, avail >= 3 ? TILE.DRYSTONE : TILE.GRASS);
        if (avail >= 3) { fill(t + 1, P.len - 2, 3, B, TILE.GRASS); put(t + 1, 2, TILE.GATE); }
        t = P.len;
      }
    }
  }

  // ---- 6. Outskirts ----------------------------------------------------------------
  const farms = [];
  const footpath = (x, y, dx, dy) => { // up the fellside to the map edge; gates through walls
    for (let i = 0; i < width * 4 && inMap(x, y); i++) {
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
  // Farms: a side lane off the main road to a walled farmyard at the foot of the fell, on
  // the side away from the beck. The farmhouse and barn stand along the far wall, facing
  // the yard and the gate. A footpath leads on uphill from the back.
  const [fhW, fhL] = BLD.farmhouse, [bnW, bnL] = BLD.barn;
  const Wc = 1 + V.farmYard + Math.max(fhL, bnL) + 1, Hc = 1 + 1 + fhW + 1 + bnW + 1 + 1;
  const farmRows = [[3, vTop - Hc - 4, -bs, -1], [vBot + 4, lakeTop - Hc - 3, bs, 1]];
  for (let f = 0; f < Math.min(V.farms, farmRows.length); f++) {
    const [r0, r1, s, dy] = farmRows[f];
    for (let tries = 0; tries < 30 && r1 >= r0; tries++) {
      const y0 = r0 + rng.int(r1 - r0 + 1), yL = y0 + Math.floor(Hc / 2) - Math.floor(lw / 2);
      const Xf = (k) => X(s, k, yL); // the farm is laid square to the road at its lane
      const maxDepth = s > 0 ? width - 2 - (rl[yL] + rw - 1) : rl[yL] - 1;
      const kF = clamp(Math.round(half[yL]) - 6 + rng.int(6), 4, maxDepth - Wc + 1);
      const x0 = Math.min(Xf(kF), Xf(kF + Wc - 1));
      let ok = y0 >= 1 && y0 + Hc < height && x0 >= 1 && x0 + Wc < width;
      for (let y = y0 - 1; ok && y <= y0 + Hc; y++) for (let x = x0 - 1; x <= x0 + Wc; x++) if (!free(x, y)) { ok = false; break; }
      // Each lane row runs from that row's own road edge (the road may bend) to the gate.
      const gateX = Xf(kF);
      const span = (yy, k0) => { const xs = []; for (let x = X(s, k0, yy); x !== gateX; x += s) xs.push(x); return xs; };
      for (let yy = yL - 1; ok && yy <= yL + lw; yy++) if (span(yy, 2).some((x) => !free(x, yy))) ok = false;
      if (!ok) continue;
      for (let y = y0; y < y0 + Hc; y++) for (let x = x0; x < x0 + Wc; x++) {
        const wall = y === y0 || y === y0 + Hc - 1 || x === x0 || x === x0 + Wc - 1;
        lay(x, y, wall ? TILE.DRYSTONE : TILE.YARD);
      }
      const farK = kF + Wc - 2; // the inside of the far wall
      const building = (key, kind, w, l, yTop) => {
        const xa = Xf(farK - l + 1), xb = Xf(farK);
        const p = { x: Math.min(xa, xb), y: yTop, w: l, h: w, kind, building: key, facing: s > 0 ? 'W' : 'E' };
        for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) lay(x, y, TILE.PLOT);
        p.front = { x: Xf(farK - l), y: yTop + Math.floor(w / 2) };
        plots.push(p);
      };
      building('farmhouse', 'farmhouse', fhW, fhL, y0 + 2);
      building('barn', 'barn', bnW, bnL, y0 + 2 + fhW + 1);
      // A shed in the yard corner by the gate wall (sharing the yard's walls), facing into the yard.
      const [sw, sl] = BLD.shed, sy = dy < 0 ? y0 : y0 + Hc - sl, sxa = Xf(kF), sxb = Xf(kF + sw - 1);
      for (let y = sy; y < sy + sl; y++) for (let x = Math.min(sxa, sxb); x <= Math.max(sxa, sxb); x++) lay(x, y, TILE.PLOT);
      plots.push({ x: Math.min(sxa, sxb), y: sy, w: sw, h: sl, kind: 'shed', building: 'shed', facing: dy < 0 ? 'S' : 'N', front: { x: Xf(kF + 1), y: dy < 0 ? sy + sl : sy - 1 } });
      // The side lane (walled both sides) and the gate into the yard.
      for (let yy = yL; yy < yL + lw; yy++) for (const x of span(yy, 1)) lay(x, yy, TILE.LANE);
      for (const yy of [yL - 1, yL + lw]) for (const x of span(yy, 2)) lay(x, yy, TILE.DRYSTONE);
      for (let yy = yL; yy < yL + lw; yy++) lay(Xf(kF), yy, TILE.GATE);
      // A footpath from the back of the farm up the fell.
      const py = dy < 0 ? y0 + 1 : y0 + Hc - 2;
      lay(Xf(kF + Wc - 1), py, TILE.GATE);
      footpath(Xf(kF + Wc), py, s, dy);
      farms.push({ x: x0, y: y0, w: Wc, h: Hc, gate: { x: Xf(kF), y: yL } });
      break;
    }
  }
  // Footpaths from the far ends of the beck-side back lanes: over the beck and up the fell.
  footpath(X(bs, bankK, vTop), vTop, bs, -1);
  footpath(X(-bs, bankK, vBot), vBot, -bs, 1);
  // The main road is walled outside the village.
  for (let y = 0; y < height; y++) {
    if (inVillage(y)) continue;
    for (const s of [1, -1]) if (free(X(s, 1, y), y)) lay(X(s, 1, y), y, TILE.DRYSTONE);
  }

  // Fields: walled enclosures 10-20 tiles across on the floor and lower fellside (jittered
  // grid of seeds, nearest seed wins, with a wobble so the walls wander).
  const [fMin, fMax] = CONFIG.scale.countryside.field;
  const spacing = (fMin + fMax) / 2;
  const seeds = [];
  for (let gy = spacing / 2; gy < height; gy += spacing) for (let gx = spacing / 2; gx < width; gx += spacing) {
    const x = Math.round(gx + (rng.next() - 0.5) * spacing * 0.6), y = Math.round(gy + (rng.next() - 0.5) * spacing * 0.6);
    if (inMap(x, y)) seeds.push([x, y]);
  }
  const region = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!free(x, y) || zone(x, y) === 2 || at(x, y) === TILE.STREAM) continue;
    let best = -1, bdist = Infinity;
    const jx = x + (noise(x, y) - 0.5) * 6, jy = y + (noise(y, x) - 0.5) * 6;
    for (let i = 0; i < seeds.length; i++) {
      const dx = jx - seeds[i][0], dy = jy - seeds[i][1];
      if (Math.abs(dx) > spacing * 2 || Math.abs(dy) > spacing * 2) continue;
      const d = dx * dx + dy * dy;
      if (d < bdist) { bdist = d; best = i; }
    }
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
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
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

  // Reachability from the middle of the bridge.
  const start = { x: bx0 + Math.floor(bridgeW / 2), y: br + Math.floor(bw / 2) };
  makeReachable(tiles, width, height, [start.x, start.y]);

  return {
    tiles, plots, green, graveyard, farms, bridgeRow: br, lakeTop, start,
    widths: { road: rw, lane: lw, beck: bw, bridge: bridgeW }, // as picked for this map
  };
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

// Building plots don't count: they become walled buildings (14b), so no way may run through one.
const passable = (t) => !TILE_INFO[t].blocks && t !== TILE.PLOT;
// What a blocker becomes when a way has to be knocked through it.
const OPENED = { [TILE.DRYSTONE]: TILE.GATE, [TILE.ROCK]: TILE.FELL, [TILE.GRAVE]: TILE.GRASS };

function makeReachable(tiles, width, height, [sx, sy]) {
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const seen = new Uint8Array(width * height);
  const flood = (from) => { // grow the reached area from these tiles
    const queue = [...from];
    while (queue.length) {
      const i = queue.pop(), x = i % width, y = (i - x) / width;
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy, j = ny * width + nx;
        if (!inside(nx, ny) || seen[j] || !passable(tiles[j])) continue;
        seen[j] = 1; queue.push(j);
      }
    }
  };
  seen[sy * width + sx] = 1; flood([sy * width + sx]);
  let scan = 0;
  for (let pass = 0; pass < 2000; pass++) {
    while (scan < tiles.length && !(passable(tiles[scan]) && !seen[scan])) scan++;
    if (scan >= tiles.length) return;
    const start = scan;
    // Knock the shortest way out of the pocket (never through the lake).
    const prev = new Int32Array(width * height).fill(-1);
    const bfs = [start]; prev[start] = start;
    let goal = -1;
    for (let h = 0; h < bfs.length && goal < 0; h++) {
      const i = bfs[h], x = i % width, y = (i - x) / width;
      for (const [dx, dy] of N) {
        const nx = x + dx, ny = y + dy, j = ny * width + nx;
        if (!inside(nx, ny) || prev[j] >= 0 || tiles[j] === TILE.LAKE || tiles[j] === TILE.POND || tiles[j] === TILE.PLOT) continue;
        prev[j] = i;
        if (seen[j]) { goal = j; break; }
        bfs.push(j);
      }
    }
    if (goal < 0) { tiles[start] = TILE.ROCK; continue; } // an island cut off by the lake: make it rock
    const opened = [];
    for (let j = goal; j !== start; j = prev[j]) { if (!passable(tiles[j])) tiles[j] = OPENED[tiles[j]] ?? TILE.GRASS; opened.push(j); }
    opened.push(start);
    for (const j of opened) seen[j] = 1;
    flood(opened);
  }
}
