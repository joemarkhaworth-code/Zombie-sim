// Headless test run: the sim with no rendering. `node tests/headless.js`
import { CONFIG } from '../src/config.js';
import { createWorld, player, tileBlocks } from '../src/sim/world.js';
import { applyInput, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { makeZombie } from '../src/sim/world.js';
import { TILE } from '../src/sim/gen/testscreen.js';
import { createMessageLog, describeTile, LEVEL } from '../src/render/messages.js';
import { lineClear, canNotice, tileVisibility, updatePlayerView } from '../src/sim/systems/vision.js';
import { spreadNoise, makeNoise } from '../src/sim/systems/noise.js';

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
  const savedG = CONFIG.zombie.glimpseRange; CONFIG.zombie.glimpseRange = 99; // no glimpse pause here
  const z = makeZombie(w, 5, 7); // 5 tiles off: within its sight
  const ds = [];
  for (let i = 0; i < 8; i++) { applyInput(w, { type: 'wait' }); ds.push(dist(z.Position, p.Position)); }
  check(ds.join() === '5,4,4,3,3,2,2,1', `zombie moves every other turn (got ${ds.join()})`);
  CONFIG.zombie.glimpseRange = savedG;
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
  q.Position.x = 8; q.Position.y = 6; // step into its view (4 tiles off)
  updatePlayerView(w);
  for (let i = 0; i < 6 && !events.includes('prey_spotted'); i++) applyInput(w, { type: 'wait' });
  check(events.includes('prey_spotted') && z.Brain.goal && z.Brain.goal.why === 'seen', 'it spots you and makes for you');
  q.Position.x = 2; q.Position.y = 10; // gone behind the wall
  updatePlayerView(w);
  for (let i = 0; i < 4 && !events.includes('prey_lost'); i++) applyInput(w, { type: 'wait' });
  check(events.includes('prey_lost') && z.Brain.goal && z.Brain.goal.x === 8 && z.Brain.goal.y === 6,
    'it loses you and heads for where it last saw you');
  let searched = false;
  for (let i = 0; i < 80 && !events.includes('search_gave_up'); i++) {
    applyInput(w, { type: 'wait' });
    if (z.Brain.search) {
      searched = true;
      if (Math.abs(z.Position.x - 8) > CONFIG.zombie.searchRadius + 1 || Math.abs(z.Position.y - 6) > CONFIG.zombie.searchRadius + 1) {
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
  check(describeTile(w, 2, 9) === 'Unexplored.', `a tile never seen is unexplored (got "${describeTile(w, 2, 9)}")`);

  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander;
}

// Noise: strength drops per tile, walls muffle, zombies investigate, footsteps.
{
  const saved = CONFIG.zombie.stagger, savedWander = CONFIG.zombie.wanderChance;
  CONFIG.zombie.stagger = 0; CONFIG.zombie.wanderChance = 0;
  const wall = (w, x, y) => { w.tiles[y * w.w + x] = TILE.WALL; };
  let w = emptyWorld();
  const at = (s, x, y) => s[y * w.w + x];
  let s = spreadNoise(w, 2, 7, 1);
  check(at(s, 2, 7) === 4 && at(s, 3, 7) === 3 && at(s, 5, 7) === 1 && at(s, 6, 7) === 0, 'level 1: strength 4 at the source, 1 less per tile');
  check(at(s, 3, 8) === 3, 'diagonals count as one tile');
  for (let y = 1; y < w.h - 1; y++) wall(w, 4, y); // a wall across the room
  s = spreadNoise(w, 3, 7, 1);
  check(at(s, 5, 7) === 0, 'a quiet noise dies in a wall');
  s = spreadNoise(w, 3, 7, 2);
  // 8 at the source; into the wall 8 - 1 - 3 = 4; out the other side 3.
  check(at(s, 5, 7) === 3, `a loud noise carries through, muffled (got ${at(s, 5, 7)})`);

  // A zombie behind the wall that can't see you hears a loud noise, goes there, searches, gives up.
  const z = makeZombie(w, 7, 7);
  const p = player(w); p.Position.x = 2; p.Position.y = 2; updatePlayerView(w);
  const events = [];
  for (const t of ['noise_heard', 'search_gave_up']) w.events.on(t, e => events.push(t));
  makeNoise(w, 3, 10, 2);
  check(events.includes('noise_heard') && z.Brain.goal && z.Brain.goal.why === 'heard' && z.Brain.goal.x === 3,
    'the zombie hears the noise through the wall and makes it its goal');
  let reachedWall = false;
  for (let i = 0; i < 12; i++) { applyInput(w, { type: 'wait' }); if (z.Position.x === 5) reachedWall = true; }
  check(reachedWall, 'it walks toward the noise (up to the wall)');
  for (let i = 0; i < 80 && !events.includes('search_gave_up'); i++) applyInput(w, { type: 'wait' });
  check(events.includes('search_gave_up'), 'it searches there, then gives up');
  // Newest noise wins.
  makeNoise(w, 6, 2, 2); makeNoise(w, 6, 12, 2);
  check(z.Brain.goal && z.Brain.goal.y === 12, 'the newest noise wins');

  // Footsteps: level 1, heard about 3 tiles off out of sight; waiting is silent.
  w = emptyWorld();
  const q = player(w); q.Position.x = 2; q.Position.y = 7;
  for (let y = 4; y < 11; y++) wall(w, 4, y); // a short wall between you and it, open at both ends
  const z2 = makeZombie(w, 5, 5); // just behind the wall: it can't see you
  updatePlayerView(w);
  check(!canNotice(w, z2, q), 'the zombie cannot see you round the wall');
  for (let i = 0; i < 6; i++) applyInput(w, { type: 'wait' });
  check(!z2.Brain.goal, 'waiting is silent');
  // Walk up past the end of the wall: footsteps carry round it.
  q.Position.x = 3; q.Position.y = 4; updatePlayerView(w);
  applyInput(w, { type: 'move', dx: 0, dy: -1 });
  check(w.noise[3 * w.w + 3] === 4, 'your footstep is a level-1 noise where you land');
  check(z2.Brain.goal && z2.Brain.goal.why === 'heard', 'a zombie 3 tiles off hears your footsteps');
  const z3 = makeZombie(w, 9, 12);
  applyInput(w, { type: 'move', dx: 0, dy: 1 });
  check(!z3.Brain.goal || z3.Brain.goal.why !== 'heard', 'a zombie far off does not');
  // A zombie that sees you ignores noises.
  const z4 = makeZombie(w, 3, 6); updatePlayerView(w);
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  makeNoise(w, 9, 12, 3);
  check(z4.Brain.tracking && z4.Brain.goal.why === 'seen', 'seeing you beats hearing a noise');
  // The heatmap clears at your next action.
  makeNoise(w, 9, 12, 3);
  applyInput(w, { type: 'wait' });
  check(w.noise[12 * w.w + 9] === 0, 'the heatmap shows only noise since your last action');
  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander;
}

// Glimpses: a zombie that catches sight of you at a distance stares (?) before it comes (!).
{
  const saved = CONFIG.zombie.stagger, savedWander = CONFIG.zombie.wanderChance;
  CONFIG.zombie.stagger = 0; CONFIG.zombie.wanderChance = 0;
  const wall = (w, x, y) => { w.tiles[y * w.w + x] = TILE.WALL; };
  // Stay in view: glimpse, then spotted on its next look.
  let w = emptyWorld();
  const p = player(w); p.Position.x = 5; p.Position.y = 3;
  const z = makeZombie(w, 5, 7); // 4 tiles off
  const ev = [];
  for (const t of ['prey_glimpsed', 'prey_spotted']) w.events.on(t, () => ev.push(t));
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  check(ev.join() === 'prey_glimpsed' && z.Position.y === 7 && z.Brain.goal.why === 'glimpsed', 'first look: it stops and stares');
  applyInput(w, { type: 'wait' });
  check(ev.join() === 'prey_glimpsed,prey_spotted' && z.Brain.tracking, 'still in view one move later: it comes for you');
  // Duck out of view in time: it only goes to check the spot, it never spots you.
  w = emptyWorld();
  const q = player(w); q.Position.x = 5; q.Position.y = 3;
  for (let x = 1; x <= 4; x++) wall(w, x, 4); // cover one step to the left: a wall under (1..4, 4)
  const z2 = makeZombie(w, 5, 7);
  const ev2 = [];
  for (const t of ['prey_glimpsed', 'prey_spotted']) w.events.on(t, () => ev2.push(t));
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  check(ev2.join() === 'prey_glimpsed', 'it glimpses you');
  applyInput(w, { type: 'move', dx: -1, dy: 0 }); // one move: (4,3), behind the wall
  for (let i = 0; i < 2; i++) applyInput(w, { type: 'wait' });
  check(!ev2.includes('prey_spotted') && z2.Brain.goal && z2.Brain.goal.why === 'glimpsed', `one move to cover in time: it goes to check, no ! (${ev2.join()})`);
  // Two moves to cover is too slow.
  w = emptyWorld();
  const q2 = player(w); q2.Position.x = 5; q2.Position.y = 3;
  for (let x = 1; x <= 3; x++) wall(w, x, 4);
  makeZombie(w, 5, 7);
  const ev3 = [];
  w.events.on('prey_spotted', () => ev3.push('spotted'));
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  applyInput(w, { type: 'move', dx: -1, dy: 0 }); applyInput(w, { type: 'move', dx: -1, dy: 0 });
  check(ev3.length === 1, 'two moves to cover: too slow, it has spotted you');
  // Close up there's no stare: within glimpseRange it comes straight away.
  w = emptyWorld();
  const r = player(w); r.Position.x = 5; r.Position.y = 3;
  const z3 = makeZombie(w, 5, 5); // 2 tiles off
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  check(z3.Brain.tracking, 'close up it comes for you at once');
  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander;
}

// Map memory: a snapshot of each tile as last seen, never the live tile; creatures never.
{
  const w = emptyWorld();
  const p = player(w); p.Position.x = 2; p.Position.y = 2;
  for (let y = 1; y < w.h - 1; y++) w.tiles[y * w.w + 5] = TILE.WALL; // wall across the room
  const z = makeZombie(w, 3, 3);
  w.entities.get(z.id).Actor.brain = ''; // keep it still
  p.Memory.tiles = {}; // forget the room as it was before the wall went up
  updatePlayerView(w);
  const mem = p.Memory.tiles, at = (x, y) => mem[y * w.w + x];
  check(at(3, 7) && at(3, 7).t === TILE.FLOOR, 'a tile in view is remembered');
  check(!at(8, 7), 'a tile behind the wall is not');
  check(describeTile(w, 8, 7) === 'Unexplored.', 'never seen: "Unexplored."');
  check(at(3, 3).things.length === 0, 'creatures are not remembered');
  // A thing (no Actor) on a tile is remembered with it.
  w.entities.set(999, { id: 999, Position: { x: 4, y: 9 }, Glyph: { ch: '%', colour: '#fff' }, Name: { name: 'tin of beans' } });
  updatePlayerView(w);
  check(at(4, 9).things.length === 1 && at(4, 9).things[0].name === 'tin of beans', 'things on a tile are remembered');
  // Go behind the wall: the old side stays remembered but stops updating.
  p.Position.x = 8; p.Position.y = 7;
  updatePlayerView(w);
  check(!w.view[9 * w.w + 4], 'the beans are now out of sight');
  w.entities.get(999).Position.x = 3; // someone moves the beans behind your back
  w.tiles[2 * w.w + 2] = TILE.WALL;   // and a wall appears where you stood
  updatePlayerView(w);
  check(at(4, 9).things.length === 1 && at(3, 9).things.length === 0, 'out of sight the beans stay where you last saw them');
  check(at(2, 2).t === TILE.FLOOR, 'out of sight the remembered tile is the old one, not the live one');
  check(describeTile(w, 4, 9) === 'A tin of beans, out of sight.', `inspect shows what you remember (got "${describeTile(w, 4, 9)}")`);
  check(describeTile(w, 2, 2) === 'Bare floor, out of sight.', 'inspect never shows the live tile');
  // Look again and it updates.
  p.Position.x = 2; p.Position.y = 4;
  updatePlayerView(w);
  check(at(3, 9).things.length === 1 && at(4, 9).things.length === 0 && at(2, 2).t === TILE.WALL, 'looking again updates memory');
  // Memory is plain data (saveable).
  check(JSON.parse(JSON.stringify(p.Memory)).tiles[2 * w.w + 2].t === TILE.WALL, 'memory survives JSON');
}

// Drawing smoke test: render every frame of a short run into a fake canvas that accepts any
// call, so a broken draw function fails here, not on the phone.
{
  const { drawMap } = await import('../src/render/greybox.js');
  const { drawTopBar, drawActionBar } = await import('../src/render/ui.js');
  const fake = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => {})),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const w = createWorld(3), log = createMessageLog(w), L = computeLayout(390, 664), r = createRng(5);
  let crashed = null;
  for (let i = 0; i < 200 && !crashed; i++) {
    try {
      drawMap(fake, w, L, i % 7 ? null : { x: 3, y: 3 }, i % 2 === 0);
      drawTopBar(fake, w, L, log, i % 2 === 0);
      drawActionBar(fake, L);
    } catch (e) { crashed = e; }
    applyInput(w, { type: 'move', dx: r.int(3) - 1, dy: 0 });
    applyInput(w, { type: 'move', dx: 0, dy: r.int(3) - 1 });
  }
  check(!crashed, `drawing never throws (${crashed && crashed.message})`);
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
