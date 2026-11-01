// Event bus: systems emit events, other systems (and the UI) subscribe.
// Internal plumbing only: events carry data, never player-facing text.
//
// Event types (payloads):
//   action_attempted { id, action }          an actor tries to act (before it succeeds or fails)
//   entity_moved     { id, from, to }        an entity changed tile
//   move_blocked     { id, x, y, blockerId } a move failed; blockerId null = tile/edge
//   entity_waited    { id }
//   entity_staggered { id }                  a shambler lurched randomly
//   prey_spotted     { id, preyId }          a hunter saw prey it wasn't already tracking
//   prey_lost        { id, x, y }            a hunter reached the last-seen spot and gave up
//   noise_made       { x, y, level, sourceId }
//   noise_heard      { id, x, y, strength, sourceId }  a listener heard a noise from (x, y)
//   noise_investigated { id, x, y }          a hunter reached (or got stuck going to) a noise
//   entity_seen      { viewerId, id }        an actor came into the player's view (end of turn)
//   vision_updated   { id }                  a viewer's visible tiles were recomputed
//   turn_ended       { turn }                the world finished its turn
export function createEventBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => this.off(type, fn);
    },
    off(type, fn) {
      const list = handlers.get(type);
      if (list) handlers.set(type, list.filter((f) => f !== fn));
    },
    emit(type, data = {}) {
      const list = handlers.get(type);
      if (!list) return;
      for (const fn of [...list]) fn(data, type);
    },
  };
}
