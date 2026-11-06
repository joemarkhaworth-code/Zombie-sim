// Headless test run: the sim with no rendering. `node tests/headless.js`
import { CONFIG } from '../src/config.js';
import { createWorld, player, tileBlocks } from '../src/sim/world.js';
import { applyInput, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
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
  // Walk left into the edge wall: moves until blocked, blocked bumps cost no turn.
  let moves = 0;
  while (applyInput(w, { type: 'move', dx: -1, dy: 0 })) moves++;
  check(p.Position.x >= 1, 'never walks into the wall');
  check(w.turn === 1 + moves, 'blocked bump takes no turn');
  check(w.inputs.length === w.turn, 'every turn-taking input recorded');
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
  for (let i = 0; i < TURNS * 2 && w.turn < TURNS; i++) {
    const input = r.chance(0.1) ? { type: 'wait' } : { type: 'move', dx: r.int(3) - 1, dy: r.int(3) - 1 };
    applyInput(w, input);
    const p = player(w).Position;
    if (tileBlocks(w, p.x, p.y)) { check(false, `seed ${s}: player in a wall`); break; }
  }
  const again = replay(createWorld, s, w.inputs);
  const a = player(w).Position, b = player(again).Position;
  check(a.x === b.x && a.y === b.y && again.turn === w.turn, `seed ${s}: replay matches`);
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`headless: all checks passed (${SEEDS} seeds x ${TURNS} turns)`);
