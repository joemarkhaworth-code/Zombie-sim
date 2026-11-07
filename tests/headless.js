// Headless test run: the sim with no rendering. `node tests/headless.js`
import { CONFIG } from '../src/config.js';
import { createWorld, player, tileBlocks } from '../src/sim/world.js';
import { applyInput, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { makeZombie } from '../src/sim/world.js';
import { TILE } from '../src/sim/gen/testscreen.js';
import { createMessageLog, describeTile, LEVEL } from '../src/render/messages.js';
import { lineClear, canNotice, tileVisibility, updatePlayerView } from '../src/sim/systems/vision.js';

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
  const z = makeZombie(w, 5, 8); // 6 tiles off: within its sight (7)
  const ds = [];
  for (let i = 0; i < 8; i++) { applyInput(w, { type: 'wait' }); ds.push(dist(z.Position, p.Position)); }
  check(ds.join() === '6,5,5,4,4,3,3,2', `zombie moves every other turn (got ${ds.join()})`);
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

// Status line and inspect.
{
  const saved = CONFIG.zombie.stagger; CONFIG.zombie.stagger = 0;
  const w = emptyWorld();
  const log = createMessageLog(w);
  const p = player(w);
  p.Position.x = 5; p.Position.y = 2;
  const turn = input => { log.clear(); return applyInput(w, input); };
  turn({ type: 'wait' });
  check(log.text === 'You wait.', `waiting says so (got "${log.text}")`);
  p.Position.y = 1;
  check(!turn({ type: 'move', dx: 0, dy: -1 }) && log.text === 'A wall blocks the way.', `bumping a wall says so, no turn (got "${log.text}")`);
  const z = makeZombie(w, 5, 3);
  turn({ type: 'move', dx: 0, dy: 1 }); // into the zombie's way? it's 2 below: step to y=2, now adjacent
  check(log.text === 'The zombie is next to you!' && log.level === LEVEL.danger, `zombie next to you is a danger message (got "${log.text}")`);
  turn({ type: 'wait' });
  check(log.text !== 'The zombie is next to you!', 'the warning only fires when it newly arrives');
  check(!turn({ type: 'move', dx: 0, dy: 1 }) && log.text === 'The zombie is in the way.', `bumping the zombie says so (got "${log.text}")`);
  // Several things in one turn: danger beats the rest.
  p.Position.x = 8; p.Position.y = 2; z.Position.x = 8; z.Position.y = 5;
  let arrived = false;
  for (let i = 0; i < 8 && !arrived; i++) {
    turn({ type: 'wait' });
    arrived = dist(z.Position, p.Position) === 1;
  }
  check(arrived && log.level === LEVEL.danger && log.text === 'The zombie is next to you!', 'danger outranks "You wait." on the turn it arrives');
  // Inspect wording: you, the zombie, a wall, the floor; all short enough for a phone.
  check(describeTile(w, 8, 2) === "That's you.", 'inspect yourself');
  check(describeTile(w, z.Position.x, z.Position.y).startsWith('A zombie'), 'inspect the zombie');
  check(describeTile(w, 0, 0).startsWith('A stone wall'), 'inspect a wall');
  check(describeTile(w, 2, 9).startsWith('Bare floor'), 'inspect the floor');
  for (const [x, y] of [[8, 2], [z.Position.x, z.Position.y], [0, 0], [2, 9]]) {
    check(describeTile(w, x, y).length <= 30, `inspect text fits a phone: "${describeTile(w, x, y)}"`);
  }
  const t0 = w.turn, n0 = w.inputs.length;
  describeTile(w, 2, 9);
  check(w.turn === t0 && w.inputs.length === n0, 'inspecting takes no turn and is not recorded');
  CONFIG.zombie.stagger = saved;
}

// Line of sight, light and what zombies see.
{
  const saved = CONFIG.zombie.stagger; CONFIG.zombie.stagger = 0;
  const savedWander = CONFIG.zombie.wanderChance; CONFIG.zombie.wanderChance = 0;
  const wall = (w, x, y) => { w.tiles[y * w.w + x] = TILE.WALL; };
  // Walls block sight; open floor doesn't.
  let w = emptyWorld();
  check(lineClear(w, 2, 2, 8, 6), 'clear line across open floor');
  wall(w, 5, 4);
  check(!lineClear(w, 2, 4, 8, 4), 'a wall blocks the line');
  // Squeezing exactly between two diagonal walls is blocked; one wall at a corner isn't.
  w = emptyWorld();
  wall(w, 3, 2);
  check(lineClear(w, 2, 2, 3, 3) && lineClear(w, 2, 2, 4, 4), 'one wall at a corner lets the line past');
  wall(w, 2, 3);
  check(!lineClear(w, 2, 2, 4, 4), 'two diagonal walls block the squeeze');
  // Symmetric on random rooms.
  let asym = 0;
  for (let s = 1; s <= 30; s++) {
    const r = createWorld(s);
    for (let i = 0; i < 200; i++) {
      const rr = createRng(s * 31 + i);
      const a = [rr.int(r.w), rr.int(r.h)], b = [rr.int(r.w), rr.int(r.h)];
      if (lineClear(r, a[0], a[1], b[0], b[1]) !== lineClear(r, b[0], b[1], a[0], a[1])) asym++;
    }
  }
  check(asym === 0, `line of sight is symmetric (${asym} mismatches)`);
  // Visibility is the tile's light level; dim light shrinks how far things are noticed.
  w = emptyWorld();
  const p = player(w); p.Position.x = 5; p.Position.y = 2;
  check(tileVisibility(w, p, 5, 10) === 3, 'daylight: tiles in sight are level 3');
  w.light[10 * w.w + 5] = 1;
  check(tileVisibility(w, p, 5, 10) === 1, 'a dim tile is level 1');
  const far = makeZombie(w, 5, 10);
  check(!canNotice(w, p, far), 'in dim light a zombie 8 tiles off goes unnoticed');
  w.light.fill(3);
  check(canNotice(w, p, far), 'in daylight you notice it');
  check(!canNotice(w, far, p), 'but it does not see you yet (poor eyes: 7 tiles)');
  wall(w, 5, 6);
  updatePlayerView(w);
  check(!canNotice(w, p, far) && !w.view[10 * w.w + 5], 'behind a wall: unseen, tile dark');
  // Adjacent is always noticed, even in pitch darkness.
  w.entities.delete(far.id);
  const near = makeZombie(w, 6, 2);
  w.light.fill(0);
  check(canNotice(w, p, near) && canNotice(w, near, p), 'next to you in the dark: noticed both ways');
  w.light.fill(3);
  w.entities.delete(near.id);

  // Out of sight a zombie doesn't chase; seeing you, it does; losing you, it goes to the
  // last spot, searches, then gives up.
  w = emptyWorld();
  const q = player(w); q.Position.x = 2; q.Position.y = 2;
  for (let y = 1; y < w.h - 1; y++) wall(w, 5, y); // a wall across the room
  const z = makeZombie(w, 8, 2);
  updatePlayerView(w);
  for (let i = 0; i < 10; i++) applyInput(w, { type: 'wait' });
  check(z.Position.x === 8 && z.Position.y === 2 && !z.Brain.goal, 'a zombie that cannot see you stays put');
  const events = [];
  for (const t of ['prey_spotted', 'prey_lost', 'search_gave_up']) w.events.on(t, () => events.push(t));
  q.Position.x = 8; q.Position.y = 7; // step into its view (5 tiles off)
  updatePlayerView(w);
  for (let i = 0; i < 3; i++) applyInput(w, { type: 'wait' });
  check(events.includes('prey_spotted') && z.Brain.goal && z.Brain.goal.why === 'seen', 'it spots you and makes for you');
  q.Position.x = 2; q.Position.y = 10; // gone behind the wall
  updatePlayerView(w);
  for (let i = 0; i < 4 && !events.includes('prey_lost'); i++) applyInput(w, { type: 'wait' });
  check(events.includes('prey_lost') && z.Brain.goal && z.Brain.goal.x === 8 && z.Brain.goal.y === 7,
    'it loses you and heads for where it last saw you');
  let searched = false;
  for (let i = 0; i < 80 && !events.includes('search_gave_up'); i++) {
    applyInput(w, { type: 'wait' });
    if (z.Brain.search) {
      searched = true;
      if (Math.abs(z.Position.x - 8) > CONFIG.zombie.searchRadius + 1 || Math.abs(z.Position.y - 7) > CONFIG.zombie.searchRadius + 1) {
        check(false, 'it searches near the last spot'); break;
      }
    }
  }
  check(searched && events.includes('search_gave_up'), 'it searches, then gives up');
  check(!z.Brain.goal && !z.Brain.search && z.Position.x > 5, 'after giving up it has no goal (and stayed its side)');

  // Messages: "comes into view"; being seen has no message (a ! badge shows instead).
  w = emptyWorld();
  const log = createMessageLog(w);
  const r = player(w); r.Position.x = 5; r.Position.y = 2;
  for (let x = 1; x < w.w - 1; x++) wall(w, x, 6);
  w.tiles[6 * w.w + 9] = TILE.FLOOR; // a gap at x=9
  makeZombie(w, 9, 9);
  updatePlayerView(w);
  log.inView = new Set();
  const texts = [];
  const tr = input => { log.clear(); applyInput(w, input); texts.push(log.text); };
  for (const [dx, dy] of [[1, 0], [1, 0], [1, 0], [1, 0], [0, 1], [0, 1]]) tr({ type: 'move', dx, dy });
  for (let i = 0; i < 4; i++) tr({ type: 'wait' });
  check(texts.includes('A zombie comes into view.'), 'a zombie coming into view says so');
  check(!texts.some(t => /seen you/.test(t)), 'being seen has no message (the ! badge shows it)');
  check([...w.entities.values()].some(e => e.Zombie && e.Brain.tracking), 'the zombie is tracking you (drawn with !)');
  r.Position.x = 2; r.Position.y = 2; updatePlayerView(w);
  check(describeTile(w, 2, 9) === "Can't see from here.", 'inspecting out of sight says so');

  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander;
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
let reached = 0;
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
  if (closest === 1) reached++;
  const a = player(w).Position, b = player(again).Position;
  const za = z.Position, zb = zombies(again)[0].Position;
  check(a.x === b.x && a.y === b.y && again.turn === w.turn && again.tick === w.tick
    && za.x === zb.x && za.y === zb.y, `seed ${s}: replay matches (player and zombie)`);
}

// Zombies only chase what they see, so a random walker isn't always found; most are.
check(reached >= SEEDS * 0.7, `the zombie reaches the random walker in most runs (${reached}/${SEEDS})`);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`headless: all checks passed (${SEEDS} seeds x ${TURNS} turns; zombie reached the random walker in ${reached})`);
