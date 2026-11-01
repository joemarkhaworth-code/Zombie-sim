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
//   stance_changed   { id, sneaking }        started or stopped sneaking
//   attack_hit       { id, targetId, damage, sneak }   sneak = target hadn't noticed the attacker
//   entity_reacted   { id, preyId }          a hunter spent its action reacting to noticing prey (groan)
//   attack_missed    { id, targetId }
//   entity_damaged   { id, amount, hp }
//   bleeding_started { id, level }           a wound opened or got worse
//   bleeding_stopped { id }
//   entity_died      { id, name, killerId, cause, x, y }
//   entity_shoved    { id, by, dx, dy }      someone shoved it
//   entity_pushed    { id, by, from, to, dx, dy }  forced movement (shoves; later knockback,
//                                            currents...). Water/fire/ledges react to `to`.
//   entity_slammed   { id, x, y, blockerId } pushed into something solid at (x, y)
//   entity_staggered_hit { id, actions }     will lose its next n actions
//   entity_lost_action { id }                a staggered creature's action was wasted
//   item_picked_up   { id, itemId }
//   pickup_failed    { id, itemId, reason }  'full'
//   item_dropped     { id, itemId }
//   item_used        { id, itemId, name, how }   how: 'eaten' | 'bandaged' (item is gone)
//   item_wielded / item_unwielded { id, itemId }
//   use_failed       { id, itemId, reason }  e.g. 'not_bleeding' (bandage kept, no turn)
//   item_thrown      { id, itemId, x, y }    lands at (x, y) and clatters (noise there)
//   thrown_hit       { id, itemId, targetId, heavy }
//   shot_fired       { id, itemId, x, y, ammo }
//   shot_hit         { id, targetId, damage }
//   shot_missed      { id, targetId }
//   fire_failed      { id, itemId, reason }  'empty'
//   door_opened / door_closed { id, doorId }  id = who
//   door_locked      { id, doorId }          tried a locked door
//   door_blocked     { id, doorId }          can't close: someone in the doorway
//   door_lock / door_unlock { id, doorId }
//   structure_damaged { id, by, part, hp }   part: 'barricade' | 'door' | 'window'
//   structure_changed { id }                 state changed (open/shut/broken/barricaded)
//   window_smashed / door_broken { id, by }
//   barricade_built  { id, structureId }     barricade_broken { id, by }
//   glass_crunched   { id, x, y }            something stepped on broken glass
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
