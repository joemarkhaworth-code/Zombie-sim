// Headless test run: the sim with no rendering. `node tests/headless.js`
import { CONFIG } from '../src/config.js';
import { createWorld, player, tileBlocks } from '../src/sim/world.js';
import { applyInput, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { computeLayout, tileAtPixel, buttonAt } from '../src/render/layout.js';

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

// Layout: phone portrait fits the whole screen with thumb-sized tiles, the pad underneath.
for (const [cw, ch] of [[320, 568], [360, 640], [390, 664], [390, 844], [430, 932]]) {
  const L = computeLayout(cw, ch);
  const tag = `${cw}x${ch}`;
  check(L.tile >= 32 || cw < 352, `tiles thumb-sized on ${tag} (got ${L.tile})`);
  check(L.mapW <= cw && L.mapY === CONFIG.ui.topBarHeight, `map flush under the top bar on ${tag}`);
  check(L.padY === L.mapY + L.mapH && L.padH >= CONFIG.ui.padMinHeight, `pad fills the rest on ${tag}`);
  for (const a of L.buttons) {
    check(a.x >= 0 && a.x + a.w <= cw && a.y >= L.padY && a.y + a.h <= ch, `${a.id} on the pad on ${tag}`);
    for (const b of L.buttons) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      check(!overlap, `${a.id} and ${b.id} don't overlap on ${tag}`);
    }
    const hit = buttonAt(L, a.x + a.w / 2, a.y + a.h / 2);
    check(hit && hit.id === a.id, `pressing ${a.id}'s centre hits it on ${tag}`);
  }
  const up = L.buttons.find(b => b.id === 'up'), down = L.buttons.find(b => b.id === 'down');
  check(up.x === down.x && up.y < down.y, `inverted-T d-pad on ${tag}`);
  const t = tileAtPixel(L, L.mapX + L.tile * 3.5, L.mapY + L.tile * 2.5);
  check(t && t.x === 3 && t.y === 2, 'pixel -> tile');
}

// Random play over many seeds: no crashes, player never inside a wall, replays match exactly.
const SEEDS = 100, TURNS = 500;
for (let s = 1; s <= SEEDS; s++) {
  const w = createWorld(s);
  const r = createRng(s * 7919);
  let last = { ...player(w).Position };
  for (let i = 0; i < TURNS * 2 && w.turn < TURNS; i++) {
    const input = r.chance(0.1) ? { type: 'wait' } : { type: 'move', dx: r.int(3) - 1, dy: r.int(3) - 1 };
    applyInput(w, input);
    const p = player(w).Position;
    if (tileBlocks(w, p.x, p.y)) { check(false, `seed ${s}: player in a wall`); break; }
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 1) { check(false, `seed ${s}: moved diagonally`); break; }
    last = { ...p };
  }
  const again = replay(createWorld, s, w.inputs);
  const a = player(w).Position, b = player(again).Position;
  check(a.x === b.x && a.y === b.y && again.turn === w.turn, `seed ${s}: replay matches`);
}

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`headless: all checks passed (${SEEDS} seeds x ${TURNS} turns)`);
