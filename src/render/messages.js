// Turns sim events into the one-line status bar, and tiles into inspect text.
// All player-facing wording lives here. The sim only emits data.
import { TILE } from '../sim/gen/testscreen.js';

// Priorities: if several things happen in one turn, the most important message wins.
export const LEVEL = { info: 0, bump: 1, blocked: 2, danger: 3 };

export function createMessageLog(world) {
  const log = {
    text: '', level: -1,
    adjacent: new Set(),  // zombie ids next to the player at the end of the last turn
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
  ev.on('turn_ended', () => {
    const p = world.entities.get(world.playerId);
    const now = new Set();
    for (const e of world.entities.values()) {
      if (!e.Zombie || !e.Position) continue;
      if (Math.abs(e.Position.x - p.Position.x) + Math.abs(e.Position.y - p.Position.y) === 1) now.add(e.id);
    }
    for (const id of now) if (!log.adjacent.has(id)) log.say('The zombie is next to you!', LEVEL.danger);
    log.adjacent = now;
  });
  return log;
}

// Inspect wording. Dry, short, under ~30 characters.
const TILE_TEXT = {
  [TILE.FLOOR]: 'Bare floor. Seen better days.',
  [TILE.WALL]: 'A stone wall. Solid, at least.',
};
const THING_TEXT = {
  zombie: 'A zombie. Not a people person.',
};

export function describeTile(world, x, y) {
  const p = world.entities.get(world.playerId);
  if (p.Position.x === x && p.Position.y === y) return "That's you.";
  for (const e of world.entities.values()) {
    if (e.Position && e.Position.x === x && e.Position.y === y && e.Name) {
      return THING_TEXT[e.Name.name] || `A ${e.Name.name}.`;
    }
  }
  return TILE_TEXT[world.tiles[y * world.w + x]] || 'Nothing much.';
}
