// Light: world.light holds a 0-3 level per tile, which vision reads.
// For now every tile has the ambient (daylight) level; day/night (step 15) and light
// sources will change it.
import { CONFIG } from '../../config.js';

export function initLight(world) {
  world.light = new Uint8Array(world.w * world.h).fill(CONFIG.light.ambient);
}
