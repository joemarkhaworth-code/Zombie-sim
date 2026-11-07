// Headless test run: the sim with no rendering. `node tests/headless.js`
import { CONFIG } from '../src/config.js';
import { createWorld, player, tileBlocks } from '../src/sim/world.js';
import { applyInput, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { makeZombie } from '../src/sim/world.js';
import { TILE } from '../src/sim/gen/testscreen.js';
import { createMessageLog, describeTile, LEVEL, deathText } from '../src/render/messages.js';
const deathTextOf = w => deathText(w.gameOver);
import { lineClear, canNotice, tileVisibility, updatePlayerView } from '../src/sim/systems/vision.js';
import { spreadNoise, makeNoise } from '../src/sim/systems/noise.js';
import { makeItem, meleeStats, itemsAt, carried } from '../src/sim/systems/items.js';
import { validThrowTargets, canThrowTo } from '../src/sim/systems/throwing.js';
import { saveWorld, loadWorld } from '../src/sim/save.js';
import { dayOf, clockOf, daysSurvived } from '../src/sim/time.js';

const zombies = w => [...w.entities.values()].filter(e => e.Zombie);
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
// An empty walled room with no zombie, for controlled checks.
function emptyWorld(seed = 1) {
  const w = createWorld(seed);
  for (const z of zombies(w)) w.entities.delete(z.id);
  for (const e of [...w.entities.values()]) if (e.Item && e.Position) w.entities.delete(e.id); // no stray items
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
  check(turn({ type: 'move', dx: 0, dy: 1 }) && log.text === 'You hit the zombie.', `walking into the zombie hits it (got "${log.text}")`);
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
  // Quiet noises don't pull a zombie off you; a loud one distracts it unless you're close.
  const z4 = makeZombie(w, 3, 5); updatePlayerView(w); // 2 tiles off
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  makeNoise(w, 9, 12, 1);
  check(z4.Brain.tracking && !z4.Brain.distracted, 'a quiet noise does not distract a zombie that is after you');
  makeNoise(w, 9, 12, 3);
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  check(z4.Brain.tracking && z4.Brain.goal.why === 'seen', 'within 2 tiles, a loud noise does not pull it off you');
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

// Combat: hearts, hits with knockback, bites, shove, death.
{
  const saved = CONFIG.zombie.stagger, savedWander = CONFIG.zombie.wanderChance, savedG = CONFIG.zombie.glimpseRange;
  CONFIG.zombie.stagger = 0; CONFIG.zombie.wanderChance = 0; CONFIG.zombie.glimpseRange = 99;
  let w = emptyWorld();
  const p = player(w);
  check(p.Health.hp === CONFIG.player.hearts * 2 && p.Health.hp === 6, 'you start with 3 hearts (6 halves)');
  p.Position.x = 5; p.Position.y = 3;
  const z = makeZombie(w, 5, 4);
  const heard = [];
  const z2 = makeZombie(w, 9, 8); // 5 tiles off: it should hear the fight (level 2)
  w.events.on('noise_heard', e => heard.push(e.id));
  // Hit: half... one point of damage, knocked back a tile, staggered.
  check(applyInput(w, { type: 'move', dx: 0, dy: 1 }), 'walking into a zombie attacks: takes a turn');
  check(z.Health.hp === CONFIG.zombie.health - 1, 'the hit does 1 damage');
  check(z.Position.y === 5 && p.Position.y === 3, 'it is knocked back a tile; you stay put');
  check(heard.includes(z2.id), 'the fight is noisy: another zombie hears it');
  if (CONFIG.knockback.staggerActions > 0) {
    const lost = [];
    w.events.on('entity_lost_action', e => lost.push(e.id));
    applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
    check(lost.includes(z.id), 'it is staggered: loses its next action');
  }
  // Knocked into a wall: stays put, still staggered.
  w = emptyWorld();
  const q = player(w); q.Position.x = 5; q.Position.y = 12;
  const zw = makeZombie(w, 5, 13); // against the bottom wall
  applyInput(w, { type: 'move', dx: 0, dy: 1 });
  check(zw.Position.y === 13, 'knocked into a wall: it stays put');
  // Three hits put it down, leaving a corpse you can walk over.
  applyInput(w, { type: 'move', dx: 0, dy: 1 }); applyInput(w, { type: 'move', dx: 0, dy: 1 });
  check(!w.entities.has(zw.id), 'three hits kill it');
  const corpse = [...w.entities.values()].find(e => e.Corpse);
  check(corpse && corpse.Position.y === 13 && corpse.Name.name === 'zombie corpse', 'it leaves a corpse');
  applyInput(w, { type: 'move', dx: 0, dy: 1 });
  check(q.Position.y === 13, 'you can walk over the corpse');
  check(q.Memory.tiles[13 * w.w + 5].things.some(t => t.name === 'zombie corpse'), 'the corpse is remembered');
  // Bites: half a heart each, never on the action it first spots you; six kill you.
  w = emptyWorld();
  const r = player(w); r.Position.x = 5; r.Position.y = 3;
  const zb = makeZombie(w, 5, 4); // right next to you, hasn't seen you yet
  const bites = [];
  w.events.on('attacked', e => { if (e.targetId === r.id) bites.push(w.turn); });
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  check(bites.length === 0 && zb.Brain.tracking === r.id, 'on the action it spots you it does not bite');
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  check(bites.length === 1 && r.Health.hp === 5, 'its next action is a bite: half a heart');
  for (let i = 0; i < 40 && !w.gameOver; i++) applyInput(w, { type: 'wait' });
  check(w.gameOver && bites.length === 6 && w.gameOver.cause === 'bite' && w.gameOver.killerName === 'zombie',
    'six bites and you are dead');
  const t0 = w.turn;
  check(!applyInput(w, { type: 'wait' }) && w.turn === t0, 'after death nothing takes a turn');
  check(/^(Bitten|Eaten) by a zombie/.test(deathTextOf(w)), `cause of death (${deathTextOf(w)})`);
  // Attacks reach 8 ways: you hit diagonally, it bites diagonally; not through a squeezed corner.
  w = emptyWorld();
  const dg = player(w); dg.Position.x = 5; dg.Position.y = 5;
  const zd = makeZombie(w, 6, 6);
  check(applyInput(w, { type: 'move', dx: 1, dy: 1 }) && zd.Health.hp === CONFIG.zombie.health - 1, 'you hit a zombie diagonally');
  check(zd.Position.x === 7 && zd.Position.y === 7 && dg.Position.x === 5, 'it is knocked back diagonally; you stay put');
  const t2 = w.turn;
  check(!applyInput(w, { type: 'move', dx: -1, dy: -1 }) && w.turn === t2 && dg.Position.x === 5, 'a diagonal with nothing there: no move, no turn');
  w = emptyWorld();
  const db = player(w); db.Position.x = 5; db.Position.y = 5;
  makeZombie(w, 6, 6);
  for (let i = 0; i < 6; i++) applyInput(w, { type: 'wait' });
  check(db.Health.hp < db.Health.max, 'a zombie bites you diagonally');
  w = emptyWorld();
  const dc = player(w); dc.Position.x = 5; dc.Position.y = 5;
  w.tiles[5 * w.w + 6] = TILE.WALL; w.tiles[6 * w.w + 5] = TILE.WALL; // two walls meeting at the corner
  const zc = makeZombie(w, 6, 6);
  check(!applyInput(w, { type: 'move', dx: 1, dy: 1 }) && zc.Health.hp === CONFIG.zombie.health, 'no hitting through a squeezed corner');
  for (let i = 0; i < 6; i++) applyInput(w, { type: 'wait' });
  check(dc.Health.hp === dc.Health.max, 'nor biting through one');
  // Shove: pushed and staggered, unhurt; into a wall it slams and takes half a heart's worth.
  w = emptyWorld();
  const u = player(w); u.Position.x = 5; u.Position.y = 3;
  const zs = makeZombie(w, 5, 4);
  check(applyInput(w, { type: 'shove', dx: 0, dy: 1 }), 'shove takes a turn');
  check(zs.Position.y === 5 && zs.Health.hp === CONFIG.zombie.health && zs.Staggered, 'shoved: pushed a tile, staggered, unhurt');
  check(w.noise[3 * w.w + 5] === CONFIG.noise.radiusByLevel[1], 'a shove is quieter than a hit (level 1)');
  zs.Position.y = 13; u.Position.y = 12;
  applyInput(w, { type: 'shove', dx: 0, dy: 1 });
  check(zs.Position.y === 13 && zs.Health.hp === CONFIG.zombie.health - 1, 'shoved into a wall: it slams and takes 1');
  const t1 = w.turn;
  check(!applyInput(w, { type: 'shove', dx: 1, dy: 0 }) && w.turn === t1, 'shoving nothing takes no turn');
  // One on one you usually win; you get hurt a bit. A crowd is the danger.
  let wins = 0, lostHp = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const f = createWorld(1000 + i);
    for (const zz of zombies(f)) f.entities.delete(zz.id);
    const me = player(f);
    for (let y = 1; y < f.h - 1; y++) for (let x = 1; x < f.w - 1; x++) f.tiles[y * f.w + x] = TILE.FLOOR;
    me.Position.x = 5; me.Position.y = 3;
    const foe = makeZombie(f, 5, 7);
    for (let k = 0; k < 200 && !f.gameOver && f.entities.has(foe.id); k++) {
      const d = Math.max(Math.abs(foe.Position.x - me.Position.x), Math.abs(foe.Position.y - me.Position.y));
      if (d === 1) applyInput(f, { type: 'move', dx: Math.sign(foe.Position.x - me.Position.x), dy: Math.sign(foe.Position.y - me.Position.y) });
      else applyInput(f, { type: 'wait' });
    }
    if (!f.gameOver) { wins++; lostHp += me.Health.max - me.Health.hp; }
  }
  check(wins / N > 0.95, `one on one with a weapon you nearly always win (${wins}/${N})`);
  console.log(`  one-on-one: won ${wins}/${N}, losing ${(lostHp / Math.max(1, wins) / 2).toFixed(2)} hearts on average`);
  // Crowds: zombies from several sides at once. Returns [wins, average hearts lost by winners].
  const crowd = (spots, base) => {
    let won = 0, lost = 0;
    for (let i = 0; i < N; i++) {
      const f = createWorld(base + i);
      for (const zz of zombies(f)) f.entities.delete(zz.id);
      for (let y = 1; y < f.h - 1; y++) for (let x = 1; x < f.w - 1; x++) f.tiles[y * f.w + x] = TILE.FLOOR;
      const me = player(f); me.Position.x = 5; me.Position.y = 7;
      const foes = spots.map(([x, y]) => makeZombie(f, x, y));
      for (let k = 0; k < 300 && !f.gameOver && foes.some(z => f.entities.has(z.id)); k++) {
        const near = foes.find(z => f.entities.has(z.id) && Math.max(Math.abs(z.Position.x - me.Position.x), Math.abs(z.Position.y - me.Position.y)) === 1);
        if (near) applyInput(f, { type: 'move', dx: Math.sign(near.Position.x - me.Position.x), dy: Math.sign(near.Position.y - me.Position.y) });
        else applyInput(f, { type: 'wait' });
      }
      if (!f.gameOver) { won++; lost += me.Health.max - me.Health.hp; }
    }
    return [won, lost / Math.max(1, won) / 2];
  };
  const [w3, l3] = crowd([[5, 10], [5, 4], [8, 7]], 2000);
  const [w5, l5] = crowd([[5, 10], [5, 4], [8, 7], [2, 7], [8, 4]], 3000);
  console.log(`  three at once: won ${w3}/${N}, losing ${l3.toFixed(2)} hearts; five at once: won ${w5}/${N}, losing ${l5.toFixed(2)} hearts`);
  check(l3 > lostHp / Math.max(1, wins) / 2, 'three at once hurts more than one');
  check(w5 < N * 0.8, 'five at once often kills you');
  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander; CONFIG.zombie.glimpseRange = savedG;
}

// Items, the bag grid and your hand.
{
  // You start holding a walking stick (in hand, not in the bag); test items lie about.
  const w0 = createWorld(1), p0 = player(w0);
  check(p0.Inventory.cols === CONFIG.player.bag.cols && p0.Inventory.rows === CONFIG.player.bag.rows, 'the bag is the configured size');
  // The bag panel fits inside the map on phones, full or empty, with its buttons on screen.
  {
    const { bagLayout } = await import('../src/render/bag.js');
    const wf = createWorld(2), pf = player(wf);
    for (let i = 0; i < 40; i++) { const it = makeItem(wf, i % 3 ? 'beans' : 'cricketBat', pf.Position.x, pf.Position.y); applyInput(wf, { type: 'pickup' }); }
    for (const [cw, ch] of [[320, 568], [360, 640], [390, 664], [390, 844], [430, 932]]) {
      const L = computeLayout(cw, ch);
      const B = bagLayout(wf, L, pf.Inventory.items[0].id);
      const bottom = Math.max(...B.hits.map(b => b.y + b.h));
      check(bottom <= B.y + B.h && B.gx + B.cell * B.inv.cols <= B.x + B.w, `bag panel fits on ${cw}x${ch} (cell ${B.cell})`);
      check(B.cell >= 36, `bag squares big enough to tap on ${cw}x${ch} (${B.cell})`);
    }
  }
  const stick = w0.entities.get(p0.Inventory.hand);
  check(stick && stick.Item.type === 'walkingStick' && p0.Inventory.items.length === 0, 'you start with the stick in hand and an empty bag');
  const lying = [...w0.entities.values()].filter(e => e.Item && e.Position).map(e => e.Item.type).sort();
  check(lying.join() === [...CONFIG.testScreen.items].sort().join(), `the test items are on the floor (${lying.join()})`);
  check([...w0.entities.values()].filter(e => e.Item && e.Position).every(e => !tileBlocks(w0, e.Position.x, e.Position.y)), 'none in walls');

  let w = emptyWorld();
  const p = player(w); p.Position.x = 1; p.Position.y = 5;
  const inv = p.Inventory;
  inv.cols = 4; inv.rows = 3; // the mechanics below are checked on a 4x3 bag
  const log = createMessageLog(w);
  const turn = i => { log.clear(); return applyInput(w, i); };
  const overlaps = () => {
    const g = new Set();
    for (const s of inv.items) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      if (x < 0 || y < 0 || x >= inv.cols || y >= inv.rows || g.has(`${x},${y}`)) return true;
      g.add(`${x},${y}`);
    }
    return false;
  };
  // Walking onto an item picks it up as part of the step, into the bag.
  const beans = makeItem(w, 'beans', 2, 5);
  check(turn({ type: 'move', dx: 1, dy: 0 }) && w.turn === 1, 'stepping onto an item is one turn');
  check(inv.items.some(s => s.id === beans.id) && !beans.Position, 'and puts it in the bag');
  check(log.text === 'You pick up the tin of beans.', `it says so (got "${log.text}")`);
  // Shapes: a bat takes 3 squares. Fill the 4x3 bag: 3 bats (9) + beans + 2 bandages = 12.
  for (let i = 0; i < 3; i++) makeItem(w, 'cricketBat', 3 + i, 5);
  makeItem(w, 'bandage', 6, 5); makeItem(w, 'bandage', 7, 5);
  for (let i = 0; i < 5; i++) turn({ type: 'move', dx: 1, dy: 0 });
  const cells = inv.items.reduce((n, s) => n + s.w * s.h, 0);
  check(inv.items.length === 6 && cells === 12, `items take their shapes: 3 bats, beans and 2 bandages fill 12 squares (${cells})`);
  check(!overlaps(), 'no two items overlap, all inside the grid');
  check(inv.items.filter(s => w.entities.get(s.id).Item.type === 'cricketBat').every(s => s.w * s.h === 3), 'each bat is 1x3, upright or turned');
  // Full: the next item stays on the floor.
  makeItem(w, 'beans', 8, 5);
  turn({ type: 'move', dx: 1, dy: 0 });
  check(itemsAt(w, 8, 5).length === 1 && log.text === 'No room for the tin of beans.', `a full bag leaves it on the floor (got "${log.text}")`);
  // Drop the beans from the bag: a 1x1 hole, and the tin on the floor fits it.
  check(turn({ type: 'drop', itemId: beans.id }) && itemsAt(w, 8, 5).length === 2, 'dropping takes a turn and leaves it at your feet');
  check(turn({ type: 'pickup' }) && inv.items.length === 6, 'tapping yourself picks up the top item');
  // Hold a bat: it leaves the bag for your hand, and the stick takes its place in the bag.
  const bat = inv.items.find(s => w.entities.get(s.id).Item.type === 'cricketBat').id;
  const stickId = inv.hand;
  check(turn({ type: 'use', itemId: bat }) && inv.hand === bat && inv.items.some(s => s.id === stickId) && !inv.items.some(s => s.id === bat),
    'HOLD swaps: the bat in hand, the stick into its space in the bag');
  check(!overlaps(), 'still no overlaps');
  check(meleeStats(w, p).damage === 2, 'the bat does 2');
  // Stow with no room: refused, no turn. Make room, then it goes in.
  const t0 = w.turn;
  check(!turn({ type: 'use', itemId: bat }) && w.turn === t0 && inv.hand === bat, 'stowing into a full bag is refused, no turn');
  check(log.text === 'No room in the bag for the cricket bat.', `it says so (got "${log.text}")`);
  // Drop the hand's weapon: bare hands.
  check(turn({ type: 'drop', itemId: bat }) && inv.hand === 0 && itemsAt(w, p.Position.x, p.Position.y).some(e => e.id === bat), 'you can drop what you hold');
  check(meleeStats(w, p).damage === 1 && !meleeStats(w, p).knockback, 'bare hands: 1, no knockback');
  // Tidying: fragmented space is repacked to fit a long item.
  w = emptyWorld();
  const q = player(w); q.Position.x = 5; q.Position.y = 5;
  const qi = q.Inventory;
  qi.hand = 0; qi.cols = 4; qi.rows = 3;
  // Four tins on the diagonal of the 4x3 grid leave no straight run of 3 free.
  const tins = [[0, 0], [1, 1], [2, 2], [3, 0]].map(([x, y]) => { const t = makeItem(w, 'beans'); qi.items.push({ id: t.id, x, y, w: 1, h: 1 }); return t; });
  const tidied = [];
  w.events.on('bag_tidied', () => tidied.push(1));
  makeItem(w, 'cricketBat', 5, 5);
  check(applyInput(w, { type: 'pickup' }) && qi.items.length === 5 && tidied.length === 1, 'the bag tidies itself to fit a long item');
  // A weapon that won't fit at all goes into empty hands.
  for (let i = 0; i < 5; i++) { makeItem(w, 'beans', 5, 5); applyInput(w, { type: 'pickup' }); }
  check(qi.items.reduce((n, s) => n + s.w * s.h, 0) === 12, 'nine tins and a bat fill all 12 squares');
  const bat2 = makeItem(w, 'cricketBat', 5, 5);
  check(applyInput(w, { type: 'pickup' }) && qi.hand === bat2.id, 'a weapon with no room in the bag goes into empty hands');
  // Healing: refused at full health (no turn); a bandage heals a heart and is used up.
  w = emptyWorld();
  const r = player(w); r.Position.x = 5; r.Position.y = 5;
  const band = makeItem(w, 'bandage', 5, 5); applyInput(w, { type: 'pickup' });
  const t1 = w.turn;
  check(!applyInput(w, { type: 'use', itemId: band.id }) && w.turn === t1, 'no healing at full health, no turn');
  r.Health.hp = 2;
  check(applyInput(w, { type: 'use', itemId: band.id }) && r.Health.hp === 4 && !w.entities.has(band.id) && r.Inventory.items.length === 0, 'a bandage heals a heart and is used up');
  // Items on the floor are remembered.
  makeItem(w, 'beans', 2, 2);
  updatePlayerView(w);
  check(r.Memory.tiles[2 * w.w + 2].things.some(t => t.name === 'tin of beans'), 'items on the floor are remembered');
  check(describeTile(w, 5, 5) === "That's you." && (makeItem(w, 'bandage', 5, 5), describeTile(w, 5, 5) === "You're on a bandage."), 'inspecting yourself says what you are on');
}

// Throwing: any item, up to 6 tiles in a clear line; it clatters where it lands (a lure).
{
  const saved = CONFIG.zombie.stagger, savedWander = CONFIG.zombie.wanderChance;
  CONFIG.zombie.stagger = 0; CONFIG.zombie.wanderChance = 0;
  let w = emptyWorld();
  const p = player(w); p.Position.x = 2; p.Position.y = 2;
  updatePlayerView(w);
  const tin = makeItem(w, 'beans', 2, 2); applyInput(w, { type: 'pickup' });
  check(canThrowTo(w, p, 2, 8) && !canThrowTo(w, p, 2, 9), 'range 6');
  check(!canThrowTo(w, p, 0, 2), 'not into a wall');
  check(validThrowTargets(w, p).every(t => canThrowTo(w, p, t.x, t.y)) && validThrowTargets(w, p).length > 20, 'one rule for targets');
  w.tiles[2 * w.w + 5] = TILE.WALL; updatePlayerView(w);
  check(!canThrowTo(w, p, 7, 2), 'not through a wall');
  // A lure: a zombie round the corner that can't see you hears the tin land and goes to it.
  w = emptyWorld();
  const q = player(w); q.Position.x = 2; q.Position.y = 2;
  for (let y = 1; y < 8; y++) w.tiles[y * w.w + 5] = TILE.WALL; // a wall between you and it
  const z = makeZombie(w, 8, 3);
  updatePlayerView(w);
  const tin2 = makeItem(w, 'beans', 2, 2); applyInput(w, { type: 'pickup' });
  const t0 = w.turn;
  check(!applyInput(w, { type: 'throw', itemId: tin2.id, x: 9, y: 9 }) && w.turn === t0, 'out of range or sight: refused, no turn');
  check(applyInput(w, { type: 'throw', itemId: tin2.id, x: 4, y: 7 }) && w.turn === t0 + 1, 'a throw takes a turn');
  check(itemsAt(w, 4, 7).some(e => e.id === tin2.id) && !carried(q).includes(tin2.id), 'the tin lands there and leaves your bag');
  check(w.noise[7 * w.w + 4] === CONFIG.noise.radiusByLevel[CONFIG.throw.landNoise], 'it clatters where it lands');
  check(z.Brain.goal && z.Brain.goal.why === 'heard' && z.Brain.goal.x === 4 && z.Brain.goal.y === 7, 'the zombie heard it and goes to look');
  // Hitting a zombie: 1 damage, it notices you; the item drops at its feet.
  w = emptyWorld();
  const r = player(w); r.Position.x = 5; r.Position.y = 2;
  const z2 = makeZombie(w, 5, 6);
  updatePlayerView(w);
  const tin3 = makeItem(w, 'beans', 5, 2); applyInput(w, { type: 'pickup' });
  check(applyInput(w, { type: 'throw', itemId: tin3.id, x: 5, y: 6 }), 'throw at the zombie');
  check(z2.Health.hp === CONFIG.zombie.health - 1 && z2.Brain.tracking === r.id, 'it hits for 1 and the zombie knows where you are');
  check(itemsAt(w, 5, 6).some(e => e.id === tin3.id), 'the tin drops at its feet');
  // You can throw what you hold.
  const stickId = r.Inventory.hand;
  check(applyInput(w, { type: 'throw', itemId: stickId, x: 2, y: 2 }) && r.Inventory.hand === 0 && itemsAt(w, 2, 2).length === 1, 'you can throw what you hold');
  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander;
}

// Distraction: a loud noise (a tin landing) pulls a zombie that's after you away for a few moves.
{
  const saved = CONFIG.zombie.stagger, savedWander = CONFIG.zombie.wanderChance, savedG = CONFIG.zombie.glimpseRange;
  CONFIG.zombie.stagger = 0; CONFIG.zombie.wanderChance = 0;
  const w = emptyWorld();
  const p = player(w); p.Position.x = 5; p.Position.y = 2;
  const z = makeZombie(w, 5, 6); // 4 tiles off
  updatePlayerView(w);
  CONFIG.zombie.glimpseRange = 99;
  applyInput(w, { type: 'wait' }); applyInput(w, { type: 'wait' });
  CONFIG.zombie.glimpseRange = savedG;
  check(z.Brain.tracking === p.id, 'it is after you (!)');
  const tin = makeItem(w, 'beans', 5, 2); applyInput(w, { type: 'pickup' });
  const before = { ...z.Position };
  const ev = [];
  w.events.on('prey_glimpsed', () => ev.push('glimpsed'));
  w.events.on('prey_spotted', () => ev.push('spotted'));
  const moves = [];
  w.events.on('entity_moved', e => { if (e.id === z.id) moves.push(e.to); });
  check(applyInput(w, { type: 'throw', itemId: tin.id, x: 8, y: 7 }), 'you throw a tin past it');
  for (let i = 0; i < 8; i++) applyInput(w, { type: 'wait' });
  const first = moves[0];
  check(first && dist(first, { x: 8, y: 7 }) < dist(before, { x: 8, y: 7 }), 'its next move is toward the tin, though it could see you');
  check(first && dist(first, p.Position) > dist(before, p.Position), 'and away from you');
  check(!z.Brain.distracted, 'one move only, then it is back to normal');
  check(ev[0] === 'glimpsed' && ev[1] === 'spotted', `when it sees you again it stares first, then comes (${ev.join()})`);
  CONFIG.zombie.stagger = saved; CONFIG.zombie.wanderChance = savedWander;
}

// Time, save/load and the game over screen.
{
  check(clockOf(0) === '08:00' && dayOf(0) === 1, 'a run starts at 08:00 on day 1');
  check(clockOf(30) === '09:00', 'a tick is 2 minutes');
  check(dayOf(480) === 2 && clockOf(480) === '00:00' && daysSurvived(480) === 0, 'midnight starts day 2');
  check(daysSurvived(720) === 1 && daysSurvived(719) === 0, 'a day survived is a full 24 hours');
  // A save taken mid-run, loaded, and played on with the same inputs ends exactly like the
  // uninterrupted run: player, zombie, items, bag, memory, RNG.
  const state = w => JSON.stringify({
    t: w.turn, k: w.tick, g: w.gameOver, s: w.stats,
    e: [...w.entities.values()].map(e => [e.id, e.Position, e.Health, e.Brain, e.Inventory, e.Staggered]),
    m: player(w).Memory.tiles,
  });
  let same = 0;
  for (let s = 1; s <= 20; s++) {
    const r = createRng(s * 31337);
    const inputs = [];
    for (let i = 0; i < 400; i++) {
      const dx = r.int(3) - 1, dy = r.int(3) - 1;
      inputs.push(r.chance(0.1) ? { type: 'wait' } : r.chance(0.05) ? { type: 'shove', dx, dy } : r.chance(0.05) ? { type: 'pickup' } : { type: 'move', dx, dy });
    }
    const a = createWorld(s);
    for (const i of inputs) { if (a.gameOver) break; applyInput(a, i); }
    const b = createWorld(s);
    let k = 0;
    for (; k < 150; k++) { if (b.gameOver) break; applyInput(b, inputs[k]); }
    const json = saveWorld(b);
    const c = loadWorld(createWorld, JSON.parse(JSON.stringify(json)));
    for (; k < inputs.length; k++) { if (c.gameOver) break; applyInput(c, inputs[k]); }
    if (state(a) === state(c)) same++;
    else check(false, `seed ${s}: a loaded save plays on exactly like the original`);
  }
  check(same === 20, `loaded saves play on exactly (${same}/20)`);
  // Saves are small, and the view is rebuilt on load.
  const w = createWorld(7);
  for (let i = 0; i < 50; i++) applyInput(w, { type: 'move', dx: i % 2 ? 1 : -1, dy: 0 });
  const json = saveWorld(w);
  check(json.length < 60000, `a save is small (${json.length} bytes)`);
  const back = loadWorld(createWorld, json);
  check(back.view && back.view.length === w.view.length && back.view.every((v, i) => v === w.view[i]), 'the view is rebuilt on load');
  // An old or broken save is refused (main.js then starts a fresh game).
  const old = JSON.parse(json); old.version = CONFIG.save.version - 1;
  let refused = 0;
  for (const bad of [JSON.stringify(old), '{nope', '', 'null', JSON.stringify({ version: CONFIG.save.version })]) {
    try { loadWorld(createWorld, bad); } catch (e) { refused++; }
  }
  check(refused === 5, `old and broken saves are refused (${refused}/5)`);
  // Kills count; the game over screen has its numbers; the cause is deadpan and steady.
  const k = emptyWorld();
  const me = player(k); me.Position.x = 5; me.Position.y = 5;
  const z = makeZombie(k, 5, 6);
  for (let i = 0; i < 6 && k.entities.has(z.id); i++) applyInput(k, { type: 'move', dx: z.Position.x - me.Position.x, dy: z.Position.y - me.Position.y });
  check(k.stats.kills === 1, 'killing a zombie counts');
  const d = emptyWorld();
  const you = player(d); you.Position.x = 5; you.Position.y = 5;
  makeZombie(d, 5, 6);
  for (let i = 0; i < 60 && !d.gameOver; i++) applyInput(d, { type: 'wait' });
  check(d.gameOver && Math.abs(d.gameOver.tick - d.tick) <= 1 && d.gameOver.heldName === 'walking stick',
    `game over records when, and what you held (${JSON.stringify(d.gameOver)}, tick ${d.tick})`);
  const line = deathText(d.gameOver, d.seed);
  check(/zombie/.test(line) && line === deathText(d.gameOver, d.seed), `a deadpan cause, the same each time ("${line}")`);
  check(deathText({ cause: 'bite', killerName: 'zombie', heldName: '', turn: 0 }, 0) === 'Bitten by a zombie, empty-handed.', 'empty-handed');
}

// Route-finding: zombies go round walls instead of freezing when the direct steps are blocked.
{
  const saved = CONFIG.zombie.stagger, savedWander = CONFIG.zombie.wanderChance;
  CONFIG.zombie.stagger = 0; CONFIG.zombie.wanderChance = 0;
  const w = emptyWorld();
  const p = player(w); p.Position.x = 1; p.Position.y = 1;
  // A wall across the room with one gap far to the right; the zombie hears a noise on the other side.
  for (let x = 1; x < w.w - 1; x++) if (x !== 9) w.tiles[7 * w.w + x] = TILE.WALL;
  // And a nook: walls left and below the zombie, so its direct steps toward the noise are blocked.
  w.tiles[10 * w.w + 2] = TILE.WALL; w.tiles[11 * w.w + 3] = TILE.WALL;
  const z = makeZombie(w, 3, 10);
  z.Vision.eyesight = 0; // it follows the noise only, not the sight of you
  updatePlayerView(w);
  makeNoise(w, 2, 4, 3);
  let reached = false, frozen = 0, last = '';
  for (let i = 0; i < 60 && !reached; i++) {
    applyInput(w, { type: 'wait' });
    const k = `${z.Position.x},${z.Position.y}`;
    frozen = k === last ? frozen + 1 : 0; last = k;
    if (frozen >= 4) break;
    reached = Math.abs(z.Position.x - 2) + Math.abs(z.Position.y - 4) <= 1;
  }
  check(reached, `a zombie finds its way round a wall to a noise (got to ${z.Position.x},${z.Position.y})`);
  // Searching from outside its search area: it heads back instead of standing still.
  const w2 = emptyWorld();
  const z2 = makeZombie(w2, 9, 12);
  z2.Brain.search = { x: 2, y: 2, left: 10 };
  const start = dist(z2.Position, { x: 2, y: 2 });
  for (let i = 0; i < 6; i++) applyInput(w2, { type: 'wait' });
  check(dist(z2.Position, { x: 2, y: 2 }) < start, 'a zombie outside its search area walks back to it');
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
  const { drawTopBar, drawActionBar, drawDeath } = await import('../src/render/ui.js');
  const { drawBag } = await import('../src/render/bag.js');
  const fake = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => {})),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const w = createWorld(3), log = createMessageLog(w), L = computeLayout(390, 664), r = createRng(5);
  let crashed = null;
  for (let i = 0; i < 200 && !crashed; i++) {
    try {
      drawMap(fake, w, L, i % 7 ? null : { x: 3, y: 3 }, i % 2 === 0, i % 5 ? null : validThrowTargets(w, player(w)));
      drawTopBar(fake, w, L, log, i % 2 === 0);
      drawActionBar(fake, L, { shoveArmed: i % 3 === 0, bagOpen: i % 4 === 0, aiming: i % 5 === 0 });
      drawBag(fake, w, L, i % 2 ? player(w).Inventory.hand : (player(w).Inventory.items[0] || {}).id);
      if (w.gameOver) drawDeath(fake, w, L);
    } catch (e) { crashed = e; }
    applyInput(w, { type: 'move', dx: r.int(3) - 1, dy: 0 });
    applyInput(w, { type: 'move', dx: 0, dy: r.int(3) - 1 });
  }
  if (!crashed) {
    try {
      const dw = createWorld(9); player(dw).Health.hp = 1;
      dw.gameOver = { cause: 'bite', killerName: 'zombie', heldName: 'walking stick', turn: 40, tick: 40 };
      drawDeath(fake, dw, L); drawTopBar(fake, dw, L, createMessageLog(dw), false);
    } catch (e) { crashed = e; }
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

// Random play over many seeds: no crashes, nobody inside a wall, replays match exactly.
// Two runs per seed: a normal one (you can die) and a stress run with an unkillable player.
const SEEDS = 100, TURNS = 500;
let reached = 0, deaths = 0, kills = 0;
const zombieState = w => zombies(w).map(z => `${z.id}:${z.Position.x},${z.Position.y},${z.Health.hp}`).join(';');
for (let s = 1; s <= SEEDS; s++) {
  for (const stress of [false, true]) {
    const w = createWorld(s);
    if (stress) player(w).Health.hp = player(w).Health.max = 1e9;
    const r = createRng(s * 7919 + (stress ? 1 : 0));
    let last = { ...player(w).Position };
    const z = zombies(w)[0];
    let zlast = { ...z.Position }, closest = Infinity;
    for (let i = 0; i < TURNS * 2 && w.turn < TURNS && !w.gameOver; i++) {
      const dx = r.int(3) - 1, dy = r.int(3) - 1;
      const inv = carried(player(w));
      const someItem = inv.length ? inv[r.int(inv.length)] : 0;
      const input = r.chance(0.1) ? { type: 'wait' } : r.chance(0.05) ? { type: 'shove', dx, dy }
        : r.chance(0.04) ? { type: 'pickup' } : (someItem && r.chance(0.05)) ? { type: r.chance(0.5) ? 'use' : 'drop', itemId: someItem }
        : (someItem && r.chance(0.03)) ? { type: 'throw', itemId: someItem, x: r.int(w.w), y: r.int(w.h) }
        : { type: 'move', dx, dy };
      applyInput(w, input);
      const p = player(w).Position;
      if (tileBlocks(w, p.x, p.y)) { check(false, `seed ${s}: player in a wall`); break; }
      if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 1) { check(false, `seed ${s}: moved diagonally`); break; }
      last = { ...p };
      if (!w.entities.has(z.id)) continue; // killed
      if (tileBlocks(w, z.Position.x, z.Position.y)) { check(false, `seed ${s}: zombie in a wall`); break; }
      // A step plus a (maybe diagonal) knockback in one turn moves it at most 2 tiles each way.
      if (Math.max(Math.abs(z.Position.x - zlast.x), Math.abs(z.Position.y - zlast.y)) > 2) { check(false, `seed ${s}: zombie jumped`); break; }
      if (z.Position.x === p.x && z.Position.y === p.y) { check(false, `seed ${s}: zombie on the player`); break; }
      zlast = { ...z.Position };
      closest = Math.min(closest, dist(z.Position, p));
    }
    if (!stress) { if (closest <= 1) reached++; if (w.gameOver) deaths++; if (!w.entities.has(z.id)) kills++; }
    const again = replay(createWorld, s, w.inputs);
    if (stress) player(again).Health.hp = 1e9; // (replayed after the fact: hp only matters if bitten to 0)
    const a = player(w), b = player(again);
    check(stress || (a.Position.x === b.Position.x && a.Position.y === b.Position.y && again.turn === w.turn
      && again.tick === w.tick && a.Health.hp === b.Health.hp && !!again.gameOver === !!w.gameOver
      && zombieState(again) === zombieState(w)), `seed ${s}: replay matches (player, zombie, health, death)`);
  }
}

// Zombies only chase what they see, so a random walker isn't always found; most are.
check(reached >= SEEDS * 0.7, `the zombie reaches the random walker in most runs (${reached}/${SEEDS})`);

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`headless: all checks passed (${SEEDS} seeds x ${TURNS} turns; random walker: reached by the zombie ${reached}, died ${deaths}, killed it ${kills})`);
