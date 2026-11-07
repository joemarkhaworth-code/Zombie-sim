// Save/load: the whole game state as plain JSON (pure sim; main.js stores it).
// Saved: seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact state,
// tiles and light, stats, game over, and every entity with all its components (map memory,
// bag, brain...). Not saved, rebuilt on load: event wiring (createWorld installs it), the
// player's view (recomputed), the noise heatmap.
import { CONFIG } from '../config.js';
import { updatePlayerView } from './systems/vision.js';

export function saveWorld(world) {
  return JSON.stringify({
    version: CONFIG.save.version,
    seed: world.seed,
    turn: world.turn,
    tick: world.tick,
    nextId: world.nextId,
    playerId: world.playerId,
    rng: world.rng.state,
    inputs: world.inputs,
    tiles: Array.from(world.tiles),
    light: Array.from(world.light),
    stats: world.stats,
    gameOver: world.gameOver,
    entities: [...world.entities.values()],
  });
}

// Returns a world, or throws if the save can't be used (wrong version, broken JSON...).
export function loadWorld(createWorld, json) {
  const s = JSON.parse(json);
  if (!s || s.version !== CONFIG.save.version) throw new Error('save version');
  const world = createWorld(s.seed);
  if (s.tiles.length !== world.tiles.length) throw new Error('save size');
  world.tiles.set(s.tiles);
  world.light.set(s.light);
  world.turn = s.turn; world.tick = s.tick; world.nextId = s.nextId; world.playerId = s.playerId;
  world.rng.state = s.rng;
  world.inputs = s.inputs;
  world.stats = s.stats;
  world.gameOver = s.gameOver;
  world.entities = new Map(s.entities.map(e => [e.id, e]));
  if (!world.entities.get(world.playerId)) throw new Error('save has no player');
  updatePlayerView(world);
  return world;
}
