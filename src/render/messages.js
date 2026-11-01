// Turns sim events into one short status-line message per turn.
// Lives on the render side: the sim never produces text. Pure JS (no DOM), so it's headless-testable.

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Priority: higher replaces lower within the same turn. Danger always wins.
export const PRIORITY = { info: 0, bump: 1, blocked: 2, notice: 3, danger: 4 };

export function createMessageLog(world) {
  let current = null;            // { text, priority }
  let adjacentLastTurn = new Set();

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
  ev.on('entity_waited', (d) => { if (isPlayer(d.id)) say('You wait.', PRIORITY.info); });
  ev.on('move_blocked', (d) => {
    if (!isPlayer(d.id)) return;
    if (d.blockerId === null) say('A wall blocks the way.', PRIORITY.bump);
    else say(`The ${name(d.blockerId)} is in the way.`, PRIORITY.blocked);
  });
  const playerCanSee = (id) => {
    const p = world.entities.get(world.playerId), e = world.entities.get(id);
    return p && e && p.Vision.visible.has(e.Position.y * world.width + e.Position.x);
  };
  ev.on('entity_seen', (d) => {
    if (isPlayer(d.viewerId)) say(`A ${name(d.id)} comes into view.`, PRIORITY.notice);
  });
  // Only report a zombie noticing you if you can see it happen.
  ev.on('prey_spotted', (d) => {
    if (isPlayer(d.preyId) && playerCanSee(d.id)) say(`The ${name(d.id)} has seen you!`, PRIORITY.danger);
  });
  ev.on('turn_ended', () => {
    const now = adjacentActors();
    for (const id of now) {
      if (!adjacentLastTurn.has(id)) { say(`The ${name(id)} is next to you!`, PRIORITY.danger); break; }
    }
    adjacentLastTurn = now;
  });

  return {
    get message() { return current; },
  };
}
