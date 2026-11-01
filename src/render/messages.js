// Turns sim events into one short status-line message per turn.
// Lives on the render side: the sim never produces text. Pure JS (no DOM), so it's headless-testable.

import { canSee, visibilityAt } from '../sim/systems/vision.js';
import { rememberedAt } from '../sim/systems/memory.js';
import { TILE_DESC, TILE_INFO } from '../sim/gen/testgrid.js';
import { inBounds, tileAt, query } from '../sim/world.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Priority: higher replaces lower within the same turn. Danger always wins.
export const PRIORITY = { info: 0, bump: 1, blocked: 2, notice: 3, danger: 4 };

// onScreen(x, y): is this tile currently on the player's screen? The sim can see
// further than the screen is wide, so "comes into view" only counts what's on screen.
// Defaults to always true (headless).
export function createMessageLog(world, { onScreen = () => true } = {}) {
  let current = null;            // { text, priority }
  let adjacentLastTurn = new Set();
  let inViewLastTurn = new Set();

  const say = (text, priority) => {
    if (!current || priority >= current.priority) current = { text, priority };
  };
  const name = (id) => world.entities.get(id)?.Name?.name ?? 'something';
  const isPlayer = (id) => id === world.playerId;
  const adjacentActors = () => {
    const p = world.entities.get(world.playerId);
    const out = new Set();
    if (!p) return out;
    for (const e of world.entities.values()) {
      if (e.id !== p.id && e.Actor && e.Position && cheb(e.Position, p.Position) <= 1) out.add(e.id);
    }
    return out;
  };

  const ev = world.events;
  ev.on('action_attempted', (d) => { if (isPlayer(d.id)) current = null; }); // new action clears the line
  ev.on('stance_changed', (d) => {
    if (isPlayer(d.id)) current = { text: d.sneaking ? 'You start sneaking.' : 'You stop sneaking.', priority: PRIORITY.info };
  });
  ev.on('entity_waited', (d) => { if (isPlayer(d.id)) say('You wait.', PRIORITY.info); });
  ev.on('move_blocked', (d) => {
    if (!isPlayer(d.id)) return;
    if (d.blockerId === null) say('A wall blocks the way.', PRIORITY.bump);
    else say(`The ${name(d.blockerId)} is in the way.`, PRIORITY.blocked);
  });
  const playerCanSee = (id) => {
    const p = world.entities.get(world.playerId), e = world.entities.get(id);
    return !!(p && e && canSee(world, p, e) && onScreen(e.Position.x, e.Position.y));
  };
  const actorsInView = () => {
    const out = new Set();
    for (const e of world.entities.values()) {
      if (e.Actor && e.Position && !isPlayer(e.id) && playerCanSee(e.id)) out.add(e.id);
    }
    return out;
  };
  // Only report a zombie noticing you if you can see it happen.
  ev.on('prey_spotted', (d) => {
    if (isPlayer(d.preyId) && playerCanSee(d.id)) say(`The ${name(d.id)} has seen you!`, PRIORITY.danger);
  });
  ev.on('turn_ended', () => {
    const inView = actorsInView();
    for (const id of inView) {
      if (!inViewLastTurn.has(id)) { say(`A ${name(id)} comes into view.`, PRIORITY.notice); break; }
    }
    inViewLastTurn = inView;
    const now = adjacentActors();
    for (const id of now) {
      if (!adjacentLastTurn.has(id)) { say(`The ${name(id)} is next to you!`, PRIORITY.danger); break; }
    }
    adjacentLastTurn = now;
  });

  return {
    get message() { return current; },
    // Show text right now (e.g. inspect). Cleared by the next action like any message.
    show(text, priority = PRIORITY.info) { current = { text, priority }; },
  };
}

// Long-press inspect: a one-line description of what the player knows about (x, y).
//  - In sight: a creature standing there (if noticed), else the top thing on the
//    tile (item, door...), else the terrain. All live.
//  - Out of sight but remembered: the snapshot from when it was last seen, never
//    the live tile, and never creatures.
//  - Never seen: unexplored.
export function describeTile(world, x, y) {
  const player = world.entities.get(world.playerId);
  if (!player || !inBounds(world, x, y)) return 'Nothing there.';
  if (visibilityAt(world, player, x, y) > 0) {
    if (x === player.Position.x && y === player.Position.y) {
      return TILE_INFO[tileAt(world, x, y)].cover ? `You, hidden in a ${TILE_INFO[tileAt(world, x, y)].name}.` : "That's you.";
    }
    const here = query(world, 'Position', 'Name').filter((e) => e.Position.x === x && e.Position.y === y);
    const creature = here.find((e) => e.Actor && canSee(world, player, e));
    if (creature) return `A ${creature.Name.name}.`;
    const thing = here.filter((e) => !e.Actor).pop();
    if (thing) return `A ${thing.Name.name}.`;
    return TILE_DESC[tileAt(world, x, y)];
  }
  const snap = rememberedAt(world, player, x, y);
  if (!snap) return 'Unexplored.';
  const thing = snap.things[snap.things.length - 1];
  const what = thing ? `A ${thing.name}.` : TILE_DESC[snap.tile];
  return `${what.slice(0, -1)}, out of sight.`;
}
