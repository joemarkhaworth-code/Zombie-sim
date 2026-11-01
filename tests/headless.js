// Headless test run: drive the sim for N turns without rendering.
// Usage: node tests/headless.js [turns] [seed]
import { createWorld, tileAt, inBounds, query, isPassable } from '../src/sim/world.js';
import { TILE_INFO, TILE } from '../src/sim/gen/testgrid.js';
import { refreshAllVision, canSee, lineClear, visibilityAt, sightRadius } from '../src/sim/systems/vision.js';
import { rememberedAt } from '../src/sim/systems/memory.js';
import { spreadNoise, makeNoise } from '../src/sim/systems/noise.js';
import { addEntity } from '../src/sim/world.js';
import { playerAct, replay } from '../src/sim/turn.js';
import { createRng } from '../src/sim/rng.js';
import { CONFIG } from '../src/config.js';
import { createEventBus } from '../src/sim/events.js';
import { createMessageLog, PRIORITY, describeTile } from '../src/render/messages.js';

const TURNS = Number(process.argv[2] ?? 5000);
const SEEDS = process.argv[3] ? [Number(process.argv[3])] : [1, 42, 12345, 999999];

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

function snapshot(world) {
  const ents = [...world.entities.values()].map((e) => [e.id, e.Position, e.Actor]);
  return JSON.stringify({ turn: world.turn, tick: world.tick, ents, rng: world.rng.state });
}

function checkPositions(world, seed) {
  const seen = new Set();
  for (const e of query(world, 'Position')) {
    const { x, y } = e.Position;
    assert(inBounds(world, x, y), `seed ${seed}: entity ${e.id} out of bounds at ${x},${y}`);
    assert(!TILE_INFO[tileAt(world, x, y)].blocks, `seed ${seed}: entity ${e.id} inside a wall`);
    if (e.Blocks) {
      const k = `${x},${y}`;
      assert(!seen.has(k), `seed ${seed}: two blocking entities on ${k}`);
      seen.add(k);
    }
  }
}

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const zombieOf = (world) => query(world, 'Brain')[0];
const playerOf = (world) => world.entities.get(world.playerId);

// 0. Event bus basics.
{
  const bus = createEventBus();
  const got = [];
  const off = bus.on('x', (d) => got.push(d.n));
  bus.emit('x', { n: 1 }); off(); bus.emit('x', { n: 2 }); bus.emit('nobody_listens');
  assert(got.length === 1 && got[0] === 1, 'event bus on/off/emit');
}

for (const seed of SEEDS) {
  // 1. Random play: no crashes, no illegal positions, replay is exact.
  const world = createWorld(seed);
  const counts = {};
  const moves = new Map(); // id -> moves seen via events
  for (const t of ['action_attempted', 'entity_moved', 'move_blocked', 'entity_waited', 'entity_staggered', 'turn_ended', 'prey_spotted', 'prey_lost', 'entity_seen', 'noise_made', 'noise_heard', 'noise_investigated']) {
    world.events.on(t, (d) => {
      counts[t] = (counts[t] || 0) + 1;
      if (t === 'entity_moved') {
        assert(cheb(d.from, d.to) === 1, `seed ${seed}: entity_moved jumped ${JSON.stringify(d)}`);
        const e = world.entities.get(d.id);
        assert(e.Position.x === d.to.x && e.Position.y === d.to.y, `seed ${seed}: entity_moved before position updated`);
      }
    });
  }
  const log = createMessageLog(world);
  let sawDanger = false;
  const everSeen = new Set(playerOf(world).Vision.visible.keys());
  const driver = createRng(seed ^ 0xabcdef); // fake player input, separate from the sim RNG
  let acted = 0;
  for (let i = 0; i < TURNS; i++) {
    const r = driver.int(10);
    const action = r === 0 ? { type: 'wait' } : { type: 'move', dx: driver.int(3) - 1, dy: driver.int(3) - 1 };
    if (playerAct(world, action)) acted++;
    checkPositions(world, seed);
    const m = log.message;
    if (m) assert(typeof m.text === 'string' && m.text.length <= 32, `seed ${seed}: bad message ${JSON.stringify(m)}`);
    if (m && m.priority === PRIORITY.danger) sawDanger = true;
    for (const k of playerOf(world).Vision.visible.keys()) everSeen.add(k);
  }
  // Map memory = exactly the tiles ever seen; terrain matches (tiles don't change yet); no creatures.
  const mem = playerOf(world).Memory.tiles;
  for (let i = 0; i < mem.length; i++) {
    assert(!!mem[i] === everSeen.has(i), `seed ${seed}: memory mismatch at tile ${i}`);
    if (mem[i]) {
      assert(mem[i].tile === world.tiles[i], `seed ${seed}: remembered wrong tile at ${i}`);
      assert(mem[i].things.length === 0, `seed ${seed}: a creature got into memory at ${i}`);
    }
  }
  assert(JSON.parse(JSON.stringify(mem)).length === mem.length, 'memory should be plain, saveable data');
  assert(counts.turn_ended === acted, `seed ${seed}: turn_ended ${counts.turn_ended} != ${acted}`);
  assert(counts.action_attempted === TURNS, `seed ${seed}: action_attempted ${counts.action_attempted} != ${TURNS}`);
  assert(counts.move_blocked > 0 && counts.entity_moved > 0 && counts.entity_staggered > 0 && counts.prey_spotted > 0 && counts.entity_seen > 0 && counts.noise_heard > 0, `seed ${seed}: missing events ${JSON.stringify(counts)}`);
  assert(sawDanger, `seed ${seed}: never warned that the zombie was adjacent`);
  assert(counts.prey_spotted < acted / 10, `seed ${seed}: 'spotted' fired ${counts.prey_spotted} times - spamming`);
  assert(world.turn === acted, `seed ${seed}: turn ${world.turn} != actions ${acted}`);
  assert(world.inputs.length === acted, `seed ${seed}: inputs not recorded`);
  assert(!playerAct(world, { type: 'move', dx: 2, dy: 0 }), 'non-adjacent move accepted');

  // Scheduler: actions match speed ratio.
  const z = zombieOf(world);
  const expected = Math.floor((acted * CONFIG.zombie.speed) / CONFIG.player.speed);
  assert(Math.abs(z.Actor.actions - expected) <= 1, `seed ${seed}: zombie acted ${z.Actor.actions}, expected ~${expected}`);

  const replayed = replay(createWorld, seed, world.inputs);
  assert(snapshot(replayed) === snapshot(world), `seed ${seed}: replay diverged`);

  console.log(`seed ${seed}: ${world.turn} turns OK, events ${JSON.stringify(counts)}, zombie acted ${z.Actor.actions}x, replay matches`);
}
// 3. Field of view and zombie sight, on a hand-made open map.
function openWorld(walls = []) {
  const w = createWorld(7);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    const edge = x === 0 || y === 0 || x === w.width - 1 || y === w.height - 1;
    w.tiles[y * w.width + x] = edge ? TILE.WALL : TILE.FLOOR;
  }
  for (const [x, y] of walls) w.tiles[y * w.width + x] = TILE.WALL;
  playerOf(w).Memory.tiles.fill(null); // forget the generated map
  return w;
}
function place(w, e, x, y) { e.Position.x = x; e.Position.y = y; refreshAllVision(w); }
const seesTile = (w, e, x, y) => e.Vision.visible.has(y * w.width + x);
const range = (e) => sightRadius(e);

{ // Walls block sight; range is limited.
  const w = openWorld([[7, 5]]);
  const p = playerOf(w);
  place(w, p, 5, 5);
  place(w, zombieOf(w), 18, 26);
  assert(seesTile(w, p, 7, 5), 'fov: wall itself should be visible');
  assert(!seesTile(w, p, 8, 5) && !seesTile(w, p, 9, 5), 'fov: tiles behind a wall should be hidden');
  assert(seesTile(w, p, 5, 5 + range(p) - 1), 'fov: far tile in the open should be visible on a clear day');
  place(w, p, 2, 2);
  assert(!seesTile(w, p, 2 + range(p) + 1, 2 + range(p) + 1), 'fov: tile beyond light range should be hidden');
  const saved = CONFIG.light.range;
  CONFIG.light.range = 3; refreshAllVision(w);
  assert(seesTile(w, p, 2, 5) && !seesTile(w, p, 2, 7), 'fov: shorter light range should shorten sight');
  CONFIG.light.range = saved; refreshAllVision(w);
  console.log('fov: walls block sight, light range limits distance OK');
}

{ // No peeking through diagonal gaps; sight is symmetric; clear-day light covers the screen.
  const w = openWorld([[11, 10], [10, 11]]);
  const p = playerOf(w);
  place(w, p, 10, 10);
  assert(!seesTile(w, p, 11, 11) && !seesTile(w, p, 12, 12), 'fov: should not see through a diagonal gap');
  const w2 = createWorld(3);
  for (const a of w2.tiles.keys()) {
    const ax = a % w2.width, ay = Math.floor(a / w2.width);
    if (TILE_INFO[w2.tiles[a]].opaque) continue;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const bx = ax + dx, by = ay + dy;
      if (!inBounds(w2, bx, by) || TILE_INFO[tileAt(w2, bx, by)].opaque) continue;
      assert(lineClear(w2, ax, ay, bx, by) === lineClear(w2, bx, by, ax, ay), `fov: asymmetric between ${ax},${ay} and ${bx},${by}`);
    }
  }
  // Tall phone (20:9): ~5 tiles each side, ~11 up/down -> corner ~12.1 tiles away.
  assert(CONFIG.light.range >= Math.ceil(Math.hypot(Math.floor(CONFIG.view.tilesAcross / 2), 11)), 'config: clear-day light range does not cover the screen');
  console.log('fov: diagonal gaps blocked, symmetric, light covers screen OK');
}

{ // Visibility levels come from light, not distance; darkness hides; spot threshold.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 14); place(w, z, 18, 26);
  const lv = (x, y) => visibilityAt(w, p, x, y);
  for (const v of p.Vision.visible.values()) assert(v === CONFIG.light.ambient, `levels: clear day should be uniform, got ${v}`);
  assert(lv(10, 14) === 3 && lv(10, 24) === 3, 'levels: near and far tiles equally visible in daylight');

  w.light[16 * w.width + 10] = 1; w.light[17 * w.width + 10] = 2; refreshAllVision(w);
  assert(lv(10, 16) === 1 && lv(10, 17) === 2 && lv(10, 18) === 3, 'levels: visibility should equal tile light');

  w.light.fill(0); place(w, z, 11, 14);
  assert(lv(10, 14) === 1, 'levels: you always see your own tile');
  assert(lv(11, 14) === 0 && !canSee(w, p, z) && !canSee(w, z, p), 'levels: in pitch dark nobody sees anybody');

  w.light.fill(CONFIG.light.ambient); w.light[17 * w.width + 10] = 1; place(w, z, 10, 17);
  const saved = CONFIG.vision.minLevelToSpot;
  CONFIG.vision.minLevelToSpot = 2;
  assert(!canSee(w, p, z), 'levels: a zombie on a dim tile should not be noticed when level 2 is needed');
  CONFIG.vision.minLevelToSpot = saved;
  assert(canSee(w, p, z), 'levels: a dim zombie is noticed at the default threshold');
  console.log('levels: from light, darkness hides, spot threshold OK');
}

{ // "Comes into view" only for zombies on screen.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 12, 10); // 7 tiles to the side: in sight, but off a 5-tile half-width screen
  const offLog = createMessageLog(w, { onScreen: (x) => Math.abs(x - p.Position.x) <= 5 });
  playerAct(w, { type: 'wait' });
  assert(canSee(w, p, z), 'onscreen: zombie should be in sight');
  assert(offLog.message?.text !== 'A zombie comes into view.', 'onscreen: off-screen zombie should not be announced');
  console.log('onscreen: off-screen zombies not announced OK');
}

{ // Map memory keeps seen tiles after you leave; inspect describes what you know.
  const w = openWorld([[3, 3]]);
  const p = playerOf(w), z = zombieOf(w);
  p.Position.x = 4; p.Position.y = 4;
  place(w, z, 18, 26);
  assert(rememberedAt(w, p, 3, 3).tile === TILE.WALL, 'memory: seen wall remembered');
  assert(describeTile(w, 3, 3) === 'A wall.', `inspect: visible wall, got ${describeTile(w, 3, 3)}`);
  assert(describeTile(w, 5, 5) === 'Open ground.', 'inspect: visible floor');
  assert(describeTile(w, 4, 4) === "That's you.", 'inspect: own tile');
  place(w, p, 18, 12); // walk away: (3,3) is now beyond the light range
  assert(visibilityAt(w, p, 3, 3) === 0, 'memory: (3,3) should be out of sight now');
  assert(rememberedAt(w, p, 3, 3).tile === TILE.WALL, 'memory: wall still remembered out of sight');
  assert(describeTile(w, 3, 3) === 'A wall, out of sight.', `inspect: remembered wall, got ${describeTile(w, 3, 3)}`);
  assert(rememberedAt(w, p, 2, 26) === null && describeTile(w, 2, 26) === 'Unexplored.', 'inspect: never-seen tile');
  place(w, z, 18, 6);
  assert(describeTile(w, 18, 6) === 'A zombie.', 'inspect: visible zombie');
  place(w, p, 2, 26);
  assert(describeTile(w, 18, 6) === 'Open ground, out of sight.', 'inspect: zombie not remembered, only the ground');
  assert(describeTile(w, -1, 0) === 'Nothing there.', 'inspect: off the map');
  const log = createMessageLog(w);
  log.show(describeTile(w, 3, 3));
  assert(log.message.text === 'A wall, out of sight.', 'inspect: shows in status bar');
  playerAct(w, { type: 'wait' });
  assert(log.message.text === 'You wait.', 'inspect: next action replaces the inspect text');
  console.log('memory + inspect OK');
}

{ // Memory is a snapshot: it shows how a tile looked when last seen, not how it is now.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  p.Position.x = 4; p.Position.y = 4;
  const beans = addEntity(w, { Position: { x: 5, y: 5 }, Glyph: { char: '%', fg: '#fff', bg: '#000' }, Name: { name: 'tin of beans' } });
  place(w, z, 6, 6); // zombie in view: must not be remembered
  let snap = rememberedAt(w, p, 5, 5);
  assert(snap.things.length === 1 && snap.things[0].name === 'tin of beans', 'snapshot: item remembered');
  assert(rememberedAt(w, p, 6, 6).things.length === 0, 'snapshot: creature not remembered');

  place(w, p, 18, 26); // walk far away; (5,5) and (8,4) now out of sight
  assert(visibilityAt(w, p, 5, 5) === 0 && visibilityAt(w, p, 8, 4) === 0, 'snapshot: test tiles should be out of sight');
  // The world changes behind your back.
  w.entities.get(beans).Position.x = 7; // someone moves the beans
  w.tiles[4 * w.width + 8] = TILE.WALL; // a wall goes up where there was floor
  assert(rememberedAt(w, p, 5, 5).things[0]?.name === 'tin of beans', 'snapshot: still remembers beans where they were');
  assert(describeTile(w, 5, 5) === 'A tin of beans, out of sight.', `snapshot: inspect shows remembered beans, got ${describeTile(w, 5, 5)}`);
  assert(rememberedAt(w, p, 8, 4).tile === TILE.FLOOR && describeTile(w, 8, 4) === 'Open ground, out of sight.', 'snapshot: remembers the old floor, not the new wall');

  place(w, p, 4, 4); // come back: snapshots refresh
  assert(rememberedAt(w, p, 5, 5).things.length === 0, 'snapshot: beans gone from old spot once seen again');
  assert(rememberedAt(w, p, 7, 5).things[0]?.name === 'tin of beans', 'snapshot: beans remembered at new spot');
  assert(rememberedAt(w, p, 8, 4).tile === TILE.WALL, 'snapshot: new wall remembered once seen');
  assert(describeTile(w, 7, 5) === 'A tin of beans.', 'inspect: visible item');
  // Something appears in view while you stand still: remembered after the turn.
  addEntity(w, { Position: { x: 6, y: 3 }, Glyph: { char: '/', fg: '#fff', bg: '#000' }, Name: { name: 'cricket bat' } });
  playerAct(w, { type: 'wait' });
  assert(rememberedAt(w, p, 6, 3).things[0]?.name === 'cricket bat', 'snapshot: item appearing in view is remembered without moving');
  console.log('memory snapshots: stale until seen again, no creatures OK');
}

{ // A zombie that can see you closes in, and the status line says so.
  const w = openWorld();
  const log = createMessageLog(w);
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 5, 10 + range(z) - 1);
  assert(canSee(w, z, p), 'chase: zombie should see the player');
  let spotted = false, warned = false;
  w.events.on('prey_spotted', () => { spotted = true; });
  for (let i = 0; i < 40; i++) {
    playerAct(w, { type: 'wait' });
    if (log.message?.text === 'The zombie has seen you!') warned = true;
  }
  assert(spotted && warned, 'chase: zombie should spot the player and say so');
  assert(cheb(z.Position, p.Position) <= 1, `chase: zombie should reach the player, at ${cheb(z.Position, p.Position)}`);
  console.log('chase: zombie in sight closes in OK');
}

{ // A zombie that can't see you doesn't know where you are.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 3, 3); place(w, z, 16, 24);
  let spotted = false;
  w.events.on('prey_spotted', () => { spotted = true; });
  for (let i = 0; i < 20; i++) playerAct(w, { type: 'wait' });
  assert(!spotted && z.Brain.goal === null, 'blind: zombie out of sight should not track the player');
  console.log('blind: zombie out of sight just wanders OK');
}

{ // Break line of sight: the zombie goes to where it last saw you, then gives up.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 10); place(w, z, 5, 13);
  playerAct(w, { type: 'wait' }); playerAct(w, { type: 'wait' });
  assert(z.Brain.goal && z.Brain.goal.why === "seen", 'lastSeen: zombie should have spotted the player');
  const seenAt = { x: z.Brain.goal.x, y: z.Brain.goal.y };
  place(w, p, 17, 2); // vanish out of range
  let lost = false;
  w.events.on('prey_lost', () => { lost = true; });
  let reached = false;
  for (let i = 0; i < 60 && !lost; i++) {
    playerAct(w, { type: 'wait' });
    if (cheb(z.Position, seenAt) <= 1) reached = true;
  }
  assert(reached && lost, `lastSeen: zombie should search the last-seen spot then give up (reached ${reached}, lost ${lost})`);
  console.log('lastSeen: zombie searches last-seen spot, then gives up OK');
}

// 4. Noise.
{ // Spreads outward, fading with distance; walls muffle it.
  const w = openWorld();
  const R = CONFIG.noise.radiusByLevel;
  const f = spreadNoise(w, 10, 10, 2);
  const at = (field, x, y) => field.get(y * w.width + x) || 0;
  assert(at(f, 10, 10) === R[2], 'noise: full strength at the source');
  assert(at(f, 13, 10) === R[2] - 3 && at(f, 13, 13) === R[2] - 3, 'noise: loses 1 per tile (diagonals too)');
  assert(at(f, 10 + R[2], 10) === 0, 'noise: fades out at its radius');
  assert(spreadNoise(w, 10, 10, 0).size === 0, 'noise: level 0 is silent');

  // A wall right across the map, between source and listener.
  const wallCol = []; for (let y = 1; y < w.height - 1; y++) wallCol.push([12, y]);
  const w2 = openWorld(wallCol);
  const f2 = spreadNoise(w2, 10, 10, 2);
  const open = at(f, 14, 10), muffled = at(f2, 14, 10);
  assert(muffled > 0 && muffled === open - (CONFIG.noise.wallCost - 1), `noise: wall should muffle by wallCost (open ${open}, behind wall ${muffled})`);
  assert(at(spreadNoise(w2, 10, 10, 1), 13, 10) === 0, 'noise: quiet noise should not get through a wall');
  console.log('noise: spreads, fades, walls muffle OK');
}

{ // A zombie that can't see you hears your footsteps and goes to look.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  w.light.fill(0); // pitch dark: no seeing, only hearing
  place(w, p, 5, 10); place(w, z, 8, 12);
  assert(!canSee(w, z, p), 'hear: zombie should not see the player in the dark');
  let heard = null, investigated = false;
  w.events.on('noise_heard', (d) => { if (d.id === z.id) heard = d; });
  w.events.on('noise_investigated', (d) => { if (d.id === z.id) investigated = true; });
  playerAct(w, { type: 'move', dx: 0, dy: 1 }); // footsteps at (5,11)
  assert(heard && heard.x === 5 && heard.y === 11, 'hear: zombie should hear footsteps 3 tiles away');
  assert(z.Brain.goal && z.Brain.goal.why === 'heard', 'hear: zombie should head for the noise');
  assert(w.noise[11 * w.width + 5] === CONFIG.noise.radiusByLevel[CONFIG.player.footsteps], 'hear: heatmap records the noise');
  for (let i = 0; i < 40 && !investigated; i++) playerAct(w, { type: 'wait' });
  assert(investigated, 'hear: zombie should reach the noise and give up');
  assert(cheb(z.Position, { x: 5, y: 11 }) <= CONFIG.zombie.searchRadius, 'hear: zombie should end up searching around the noise');
  assert(w.noise.every((v) => v === 0), 'hear: waiting is silent and the heatmap clears');
  console.log('hear: zombie hears footsteps and investigates OK');
}

{ // Too far, or behind a wall: footsteps go unheard. Loud noises carry.
  const wallCol = []; for (let y = 1; y < 27; y++) wallCol.push([7, y]);
  const w = openWorld(wallCol);
  const p = playerOf(w), z = zombieOf(w);
  w.light.fill(0);
  place(w, p, 5, 10); place(w, z, 9, 10); // 4 tiles, wall in between
  let heard = false;
  w.events.on('noise_heard', (d) => { if (d.id === z.id) heard = true; });
  playerAct(w, { type: 'move', dx: 0, dy: 1 });
  assert(!heard && z.Brain.goal === null, 'hear: footsteps behind a wall should go unheard');
  makeNoise(w, 5, 11, 3, p.id); // something loud
  assert(heard && z.Brain.goal?.why === 'heard', 'hear: a loud noise should carry through the wall');
  console.log('hear: walls and distance stop quiet noises, loud ones carry OK');
}

// 5. Stealth.
{ // Sneak toggle: recorded, no turn; slower; silent.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 5, 5); place(w, z, 18, 26);
  let noises = 0, stance = null;
  w.events.on('noise_made', () => noises++);
  w.events.on('stance_changed', (d) => { stance = d.sneaking; });
  const turn0 = w.turn, tick0 = w.tick;
  assert(playerAct(w, { type: 'sneak', on: true }) === false && w.turn === turn0, 'sneak: toggling takes no turn');
  assert(stance === true && w.inputs.at(-1).action.type === 'sneak', 'sneak: toggle emits stance_changed and is recorded');
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(noises === 0, 'sneak: sneaking steps are silent');
  assert(w.tick - tick0 === CONFIG.stealth.sneakMoveCost, `sneak: a sneaking step should take ${CONFIG.stealth.sneakMoveCost} ticks, took ${w.tick - tick0}`);
  const t1 = w.tick;
  playerAct(w, { type: 'wait' });
  assert(w.tick - t1 === 1, 'sneak: waiting while sneaking is normal speed');
  playerAct(w, { type: 'sneak', on: false });
  playerAct(w, { type: 'move', dx: 1, dy: 0 });
  assert(noises === 1 && w.tick - t1 === 2, 'sneak: walking again is noisy and normal speed');
  const replayed = replay(createWorld, 7, w.inputs);
  assert(replayed.inputs.length === w.inputs.length, 'sneak: toggles replay');
  console.log('sneak: no turn, recorded, slower, silent OK');
}

{ // Noticing depends on distance, light and sneaking.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  const zr = sightRadius(z); // 7 on a clear day
  place(w, z, 10, 5);
  place(w, p, 10, 5 + zr - 1);
  assert(canSee(w, z, p), 'notice: walking in daylight, seen within the zombie\'s range');
  playerAct(w, { type: 'sneak', on: true });
  assert(!canSee(w, z, p), 'notice: sneaking at the same distance goes unnoticed');
  place(w, p, 10, 5 + Math.floor(zr * CONFIG.stealth.sneakNoticeFactor));
  assert(canSee(w, z, p), 'notice: sneaking is still noticed up close');
  place(w, p, 10, 6);
  assert(canSee(w, z, p), 'notice: adjacent is always noticed');
  playerAct(w, { type: 'sneak', on: false });
  place(w, p, 10, 9); // 4 tiles away, in daylight: seen
  assert(canSee(w, z, p), 'notice: 4 tiles in daylight is seen');
  w.light[9 * w.width + 10] = 1; refreshAllVision(w);
  assert(!canSee(w, z, p), 'notice: same spot in dim light is not');
  console.log('notice: distance x light x sneaking, adjacent always OK');
}

{ // Sneaking doesn't shake off a zombie that's already chasing you in plain sight.
  const w = openWorld();
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 5); place(w, z, 10, 9);
  playerAct(w, { type: 'wait' }); playerAct(w, { type: 'wait' });
  assert(z.Brain.seesPrey, 'track: zombie should be chasing');
  playerAct(w, { type: 'sneak', on: true });
  let lost = false;
  for (let i = 0; i < 6; i++) {
    playerAct(w, { type: 'move', dx: 1, dy: 0 });
    const d = Math.hypot(p.Position.x - z.Position.x, p.Position.y - z.Position.y);
    if (d <= sightRadius(z) && !z.Brain.seesPrey) lost = true;
  }
  assert(!lost, 'track: sneaking in plain sight should not lose a chasing zombie');
  // An unalerted zombie at the same kind of distance doesn't notice a sneaking player.
  const w2 = openWorld();
  const p2 = playerOf(w2), z2 = zombieOf(w2);
  place(w2, z2, 10, 5); place(w2, p2, 10, 10);
  playerAct(w2, { type: 'sneak', on: true });
  assert(!canSee(w2, z2, p2) && canSee(w2, z2, p2, { tracking: true }), 'track: sneaking only stops the first notice');
  // ...nor does ducking into a bush while it watches.
  const w3 = openWorld();
  w3.tiles[5 * w3.width + 14] = TILE.BUSH;
  const p3 = playerOf(w3), z3 = zombieOf(w3);
  place(w3, p3, 10, 5); place(w3, z3, 10, 9);
  playerAct(w3, { type: 'wait' }); playerAct(w3, { type: 'wait' });
  for (let i = 0; i < 4; i++) playerAct(w3, { type: 'move', dx: 1, dy: 0 });
  let gaveUp = false;
  for (let i = 0; i < 20 && cheb(z3.Position, p3.Position) > 1; i++) {
    playerAct(w3, { type: 'wait' });
    if (!z3.Brain.goal) gaveUp = true;
  }
  assert(!gaveUp && cheb(z3.Position, p3.Position) <= 1, 'track: a zombie that watched you enter a bush finds you');
  console.log('track: once noticed, sneaking and bushes do not hide you OK');
}

{ // Bushes: hidden unless adjacent - for you and for zombies.
  const w = openWorld();
  w.tiles[10 * w.width + 10] = TILE.BUSH;
  w.tiles[20 * w.width + 10] = TILE.BUSH;
  const p = playerOf(w), z = zombieOf(w);
  place(w, p, 10, 10); place(w, z, 10, 12);
  assert(visibilityAt(w, z, 10, 10) > 0, 'bush: bushes do not block sight');
  assert(!canSee(w, z, p), 'bush: player in a bush is hidden 2 tiles away');
  place(w, z, 10, 11);
  assert(canSee(w, z, p), 'bush: an adjacent zombie finds you');
  assert(describeTile(w, 10, 10) === 'You, hidden in a bush.', `bush: inspect own tile, got ${describeTile(w, 10, 10)}`);
  place(w, z, 10, 20); place(w, p, 10, 17);
  assert(!canSee(w, p, z) && describeTile(w, 10, 20) === 'A bush.', 'bush: a zombie in a bush is hidden from you too');
  console.log('bush: hidden unless adjacent, both ways OK');
}

{ // Generated maps have bushes, and they're walkable.
  const w = createWorld(5);
  const bushes = [...w.tiles].filter((t) => t === TILE.BUSH).length;
  assert(bushes > 5, `gen: expected some bushes, got ${bushes}`);
  assert(!TILE_INFO[TILE.BUSH].blocks && !TILE_INFO[TILE.BUSH].opaque && TILE_INFO[TILE.BUSH].cover, 'gen: bush is walkable, see-through cover');
  console.log(`gen: ${bushes} bush tiles OK`);
}

console.log('PASS');
