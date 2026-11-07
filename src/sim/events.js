// Synchronous event bus. Internal plumbing only; player-facing wording lives in src/render/.
// Event types (payloads):
//   entity_moved   { id, from: {x, y}, to: {x, y} }
//   move_blocked   { id, x, y, blockerId }  (tried to step onto a wall, or into blockerId; 0 = a wall)
//   entity_waited  { id }
//   prey_spotted   { id, preyId }       (a zombie newly sees its prey)
//   prey_lost      { id }               (a zombie lost sight of its prey; it heads for the last spot)
//   search_gave_up { id }               (a zombie finished searching and gave up)
//   noise_made     { x, y, level, by }  (level 1-3; by = the maker's id, 0 for none)
//   noise_heard    { id, x, y, strength, by } (id heard a noise from x, y)
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
