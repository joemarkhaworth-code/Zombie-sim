// Synchronous event bus. Internal plumbing only; player-facing wording lives in src/render/.
// Event types (payloads):
//   entity_moved   { id, from: {x, y}, to: {x, y} }
//   move_blocked   { id, x, y }          (tried to step onto a blocking tile)
//   turn_ended     { turn }
export function createEvents() {
  const subs = new Map();
  return {
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, []);
      subs.get(type).push(fn);
      return () => subs.set(type, subs.get(type).filter(f => f !== fn));
    },
    emit(type, data) {
      for (const fn of subs.get(type) || []) fn(data);
    },
  };
}
