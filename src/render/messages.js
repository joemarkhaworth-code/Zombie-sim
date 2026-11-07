// Turns sim events into the one-line status bar, and tiles into inspect text.
// All player-facing wording lives here. The sim only emits data.
import { TILE } from '../sim/gen/testscreen.js';
import { canNotice } from '../sim/systems/vision.js';

// Priorities: if several things happen in one turn, the most important message wins.
export const LEVEL = { info: 0, bump: 1, blocked: 2, danger: 3 };

export function createMessageLog(world) {
  const log = {
    text: '', level: -1,
    adjacent: new Set(),  // zombie ids next to the player at the end of the last turn
    inView: new Set(),    // zombie ids the player noticed at the end of the last turn
    say(text, level) {
      if (level >= log.level) { log.text = text; log.level = level; }
    },
    clear() { log.text = ''; log.level = -1; },
    // Inspect replaces the line without waiting for a turn.
    show(text) { log.text = text; log.level = LEVEL.info; },
  };
  const isPlayer = id => id === world.playerId;
  const ev = world.events;
  ev.on('entity_waited', ({ id }) => { if (isPlayer(id)) log.say('You wait.', LEVEL.info); });
  ev.on('move_blocked', ({ id, blockerId }) => {
    if (!isPlayer(id)) return;
    if (blockerId) {
      const b = world.entities.get(blockerId);
      log.say(`The ${b && b.Name ? b.Name.name : 'thing'} is in the way.`, LEVEL.bump);
    } else {
      log.say('A wall blocks the way.', LEVEL.blocked);
    }
  });
  // Fighting.
  const nameOf = id => { const e = world.entities.get(id); return e && e.Name ? e.Name.name : 'thing'; };
  ev.on('attacked', ({ id, targetId }) => {
    if (isPlayer(id)) log.say(`You hit the ${nameOf(targetId)}.`, LEVEL.info);
    else if (isPlayer(targetId)) log.say(`The ${nameOf(id)} bites you!`, LEVEL.danger);
  });
  ev.on('shoved', ({ id, targetId }) => { if (isPlayer(id)) log.say(`You shove the ${nameOf(targetId)}.`, LEVEL.info); });
  ev.on('entity_slammed', ({ id, blockerId }) => {
    if (!isPlayer(id)) log.say(`It slams into ${blockerId ? 'the ' + nameOf(blockerId) : 'the wall'}.`, LEVEL.info);
  });
  ev.on('entity_died', ({ id, by }) => {
    if (isPlayer(id)) log.say('You died.', LEVEL.danger + 1);
    else if (isPlayer(by)) log.say(`The ${nameOf(id)} goes down.`, LEVEL.info);
  });
  // Items.
  ev.on('item_picked_up', ({ id, itemId, inHand }) => {
    if (isPlayer(id)) log.say(inHand ? `No room. You carry the ${nameOf(itemId)}.` : `You pick up the ${nameOf(itemId)}.`, LEVEL.info);
  });
  ev.on('bag_full', ({ id, itemId }) => { if (isPlayer(id)) log.say(`No room for the ${nameOf(itemId)}.`, LEVEL.blocked); });
  ev.on('item_dropped', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You drop the ${nameOf(itemId)}.`, LEVEL.info); });
  ev.on('item_wielded', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You hold the ${nameOf(itemId)}.`, LEVEL.info); });
  ev.on('item_stowed', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You put the ${nameOf(itemId)} away.`, LEVEL.info); });
  ev.on('item_used', ({ id, type }) => {
    if (!isPlayer(id)) return;
    log.say({ beans: 'You eat the beans. Cold.', bandage: 'You bandage yourself up.' }[type] || 'Done.', LEVEL.info);
  });
  ev.on('use_refused', ({ id, itemId, why }) => {
    if (!isPlayer(id)) return;
    log.say(why === 'not_hurt' ? "You're not hurt." : why === 'no_room' ? `No room in the bag for the ${nameOf(itemId)}.` : 'Nothing to do with that.', LEVEL.blocked);
  });
  ev.on('item_thrown', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You throw the ${nameOf(itemId)}.`, LEVEL.info); });
  ev.on('thrown_hit', ({ id, targetId }) => { if (isPlayer(id)) log.say(`It hits the ${nameOf(targetId)}.`, LEVEL.info); });
  // A zombie seeing you has no message: a ! appears over it instead (show, don't tell).
  ev.on('turn_ended', () => {
    const p = world.entities.get(world.playerId);
    const now = new Set(), seen = new Set();
    for (const e of world.entities.values()) {
      if (!e.Zombie || !e.Position) continue;
      if (canNotice(world, p, e)) seen.add(e.id);
      if (Math.max(Math.abs(e.Position.x - p.Position.x), Math.abs(e.Position.y - p.Position.y)) === 1) now.add(e.id);
    }
    for (const id of seen) if (!log.inView.has(id)) log.say('A zombie comes into view.', LEVEL.info);
    for (const id of now) if (!log.adjacent.has(id)) log.say('The zombie is next to you!', LEVEL.danger);
    log.adjacent = now;
    log.inView = seen;
  });
  // Whatever's in view at the start doesn't announce itself.
  log.inView = new Set([...world.entities.values()]
    .filter(e => e.Zombie && canNotice(world, world.entities.get(world.playerId), e)).map(e => e.id));
  return log;
}

// Inspect wording. Dry, short, under ~30 characters.
const TILE_TEXT = {
  [TILE.FLOOR]: 'Bare floor. Seen better days.',
  [TILE.WALL]: 'A stone wall. Solid, at least.',
};
const THING_TEXT = {
  zombie: 'A zombie. Not a people person.',
  'zombie corpse': 'A dead zombie. Deader, anyway.',
  'tin of beans': 'A tin of beans. Cold, but beans.',
  bandage: 'A bandage. Fairly clean.',
  'cricket bat': 'A cricket bat. Well oiled.',
  'walking stick': 'A walking stick. Sturdy.',
};

// Cause of death, for the death screen. Deadpan.
export function deathText(gameOver) {
  const by = gameOver.killerName || 'something';
  return {
    bite: `Bitten by a ${by}.`,
    hit: `Beaten by a ${by}.`,
    shove: 'Slammed into a wall.',
    thrown: `Hit by something a ${by} threw.`,
  }[gameOver.cause] || 'Died.';
}

// Short names for remembered tiles (the line also says ", out of sight").
const TILE_NAME = { [TILE.FLOOR]: 'Bare floor', [TILE.WALL]: 'A wall' };

// Only what you can see. Out of sight, what you remember (never the live tile) with
// ", out of sight"; never seen is "Unexplored." Creatures you haven't noticed aren't there.
export function describeTile(world, x, y) {
  const p = world.entities.get(world.playerId);
  if (p.Position.x === x && p.Position.y === y) {
    const under = [...world.entities.values()].filter(e => e.Item && e.Position && e.Position.x === x && e.Position.y === y);
    return under.length ? `You're on a ${under[under.length - 1].Name.name}.` : "That's you.";
  }
  if (!world.view[y * world.w + x]) {
    const snap = p.Memory && p.Memory.tiles[y * world.w + x];
    if (!snap) return 'Unexplored.';
    const what = snap.things.length ? `A ${snap.things[snap.things.length - 1].name}` : (TILE_NAME[snap.t] || 'Something');
    return `${what}, out of sight.`;
  }
  // A creature you notice first, else the top thing on the tile, else the terrain.
  const here = [...world.entities.values()].filter(e => e.Position && e.Position.x === x && e.Position.y === y && e.Name);
  const who = here.find(e => e.Actor && canNotice(world, p, e)) || here.filter(e => !e.Actor).pop();
  if (who) return THING_TEXT[who.Name.name] || `A ${who.Name.name}.`;
  return TILE_TEXT[world.tiles[y * world.w + x]] || 'Nothing much.';
}
