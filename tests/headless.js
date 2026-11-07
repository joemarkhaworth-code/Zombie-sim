// Headless test run: the sim with no rendering. `node tests/headless.js`
import { CONFIG } from '../src/config.js';
import { createWorld, player, tileBlocks } from '../src/sim/world.js';
import { applyInput, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { makeZombie } from '../src/sim/world.js';
import { TILE } from '../src/sim/gen/testscreen.js';

const zombies = w => [...w.entities.values()].filter(e => e.Zombie);
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
// An empty walled room with no zombie, for controlled checks.
function emptyWorld(seed = 1) {
  const w = createWorld(seed);
  for (const z of zombies(w)) w.entities.delete(z.id);
  for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) w.tiles[y * w.w + x] = TILE.FLOOR;
  return w;
}
import { computeLayout, tileAtPixel } from '../src/render/layout.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
}

// Unit checks.
{
  const w = createWorld(1);
  const p = player(w);
  check(w.w === CONFIG.screen.w && w.h === CONFIG.screen.h, 'screen size from config');
  check(!tileBlocks(w, p.Position.x, p.Position.y), 'player starts on floor');
  check(tileBlocks(w, 0, 0) && tileBlocks(w, -1, 3), 'edges and off-map block');
  const x0 = p.Position.x, y0 = p.Position.y;
  check(applyInput(w, { type: 'wait' }) && w.turn === 1, 'waiting takes a turn');
  check(p.Position.x === x0 && p.Position.y === y0, 'waiting does not move');
  const before = { ...p.Position }, t0 = w.turn;
  check(!applyInput(w, { type: 'move', dx: 1, dy: 1 }) && w.turn === t0
    && p.Position.x === before.x && p.Position.y === before.y, 'diagonal moves refused, no turn');
  // Walk left into the edge wall: moves until blocked, blocked bumps cost no turn.
  let moves = 0;
  while (applyInput(w, { type: 'move', dx: -1, dy: 0 })) moves++;
  check(p.Position.x >= 1, 'never walks into the wall');
  check(w.turn === 1 + moves, 'blocked bump takes no turn');
  check(w.inputs.length === w.turn, 'every turn-taking input recorded');
}

// Scheduler and the zombie.
{
  // Every test screen has one zombie, a fair way off.
  for (let s = 1; s <= 100; s++) {
    const w = createWorld(s), zs = zombies(w);
    const [lo, hi] = CONFIG.testScreen.zombieDist;
    check(zs.length === 1, `seed ${s}: one zombie`);
    const d = zs[0] && dist(zs[0].Position, player(w).Position);
    check(d >= lo && d <= hi, `seed ${s}: zombie starts ${lo}-${hi} away (got ${d})`);
  }
  // Half speed: in an empty room it closes one tile every other turn while you wait.
  const saved = CONFIG.zombie.stagger; CONFIG.zombie.stagger = 0;
  const w = emptyWorld();
  const p = player(w);
  p.Position.x = 5; p.Position.y = 2;
  const z = makeZombie(w, 5, 10);
  const ds = [];
  for (let i = 0; i < 8; i++) { applyInput(w, { type: 'wait' }); ds.push(dist(z.Position, p.Position)); }
  check(ds.join() === '8,7,7,6,6,5,5,4', `zombie moves every other turn (got ${ds.join()})`);
  check(w.tick === w.turn, 'one tick per player action');
  // It stops next to you and doesn't step into you.
  for (let i = 0; i < 20; i++) applyInput(w, { type: 'wait' });
  check(dist(z.Position, p.Position) === 1, 'zombie ends next to you');
  // You can't walk into it (attacking comes in step 8): no turn spent.
  const dx = z.Position.x - p.Position.x, dy = z.Position.y - p.Position.y, t0 = w.turn;
  check(!applyInput(w, { type: 'move', dx, dy }) && w.turn === t0, 'walking into a zombie is blocked, no turn');
  // A zombie that steps next to you can't do anything else that action: you act first.
  CONFIG.zombie.stagger = saved;
}

// Layout: phone portrait fits the whole screen with thumb-sized tiles.
for (const [cw, ch] of [[360, 640], [390, 844], [430, 932]]) {
  const L = computeLayout(cw, ch);
  check(L.tile >= 32, `tiles thumb-sized on ${cw}x${ch} (got ${L.tile})`);
  check(L.mapW <= cw && L.mapY + L.mapH <= ch - CONFIG.ui.actionBarHeight, `screen fits ${cw}x${ch}`);
  check(L.mapY === CONFIG.ui.topBarHeight && L.barY === L.mapY + L.mapH && L.barH >= CONFIG.ui.actionBarHeight, `no gaps on ${cw}x${ch}`);
  const t = tileAtPixel(L, L.mapX + L.tile * 3.5, L.mapY + L.tile * 2.5);
  check(t && t.x === 3 && t.y === 2, 'pixel -> tile');
}

// Random play over many seeds: no crashes, player never inside a wall, replays match exactly.
const SEEDS = 100, TURNS = 500;
for (let s = 1; s <= SEEDS; s++) {
  const w = createWorld(s);
  const r = createRng(s * 7919);
  let last = { ...player(w).Position };
  const z = zombies(w)[0];
  let zlast = { ...z.Position }, closest = Infinity;
  for (let i = 0; i < TURNS * 2 && w.turn < TURNS; i++) {
    const input = r.chance(0.1) ? { type: 'wait' } : { type: 'move', dx: r.int(3) - 1, dy: r.int(3) - 1 };
    applyInput(w, input);
    const p = player(w).Position;
    if (tileBlocks(w, p.x, p.y)) { check(false, `seed ${s}: player in a wall`); break; }
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 1) { check(false, `seed ${s}: moved diagonally`); break; }
    last = { ...p };
    if (tileBlocks(w, z.Position.x, z.Position.y)) { check(false, `seed ${s}: zombie in a wall`); break; }
    if (dist(z.Position, zlast) > 1) { check(false, `seed ${s}: zombie moved diagonally or jumped`); break; }
    if (z.Position.x === p.x && z.Position.y === p.y) { check(false, `seed ${s}: zombie on the player`); break; }
    zlast = { ...z.Position };
    closest = Math.min(closest, dist(z.Position, p));
  }
  const again = replay(createWorld, s, w.inputs);
  check(closest === 1, `seed ${s}: the zombie reaches you at some point`);
  const a = player(w).Position, b = player(again).Position;
  const za = z.Position, zb = zombies(again)[0].Position;
  check(a.x === b.x && a.y === b.y && again.turn === w.turn && again.tick === w.tick
    && za.x === zb.x && za.y === zb.y, `seed ${s}: replay matches (player and zombie)`);
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`headless: all checks passed (${SEEDS} seeds x ${TURNS} turns)`);
