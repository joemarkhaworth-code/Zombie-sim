// Test building: a stone-walled room with one locked wooden door and two glass windows,
// set in a cleared yard so you can walk round it. Walls are WALL tiles; the door and
// windows are structure entities standing on floor tiles in gaps in the wall.
import { CONFIG } from '../../config.js';
import { TILE } from './testgrid.js';
import { makeDoor, makeWindow } from '../systems/structures.js';

export function buildTestBuilding(world) {
  const b = CONFIG.testGrid.building;
  if (!b) return;
  const set = (x, y, t) => { world.tiles[y * world.width + x] = t; };
  // Clear a 1-tile yard round it, then walls on the edge, floor inside.
  for (let y = b.y - 1; y <= b.y + b.h; y++) {
    for (let x = b.x - 1; x <= b.x + b.w; x++) {
      if (x <= 0 || y <= 0 || x >= world.width - 1 || y >= world.height - 1) continue;
      const inRect = x >= b.x && y >= b.y && x <= b.x + b.w - 1 && y <= b.y + b.h - 1;
      const edge = inRect && (x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1);
      set(x, y, edge ? TILE.WALL : TILE.FLOOR); // walls on the rectangle's edge; floor inside and in the yard
    }
  }
  const doorX = b.x + Math.floor(b.w / 2), doorY = b.y + b.h - 1;      // middle of the bottom wall
  const win1 = [b.x + b.w - 1, b.y + Math.floor(b.h / 2)];             // right wall
  const win2 = [b.x + 2, b.y];                                         // top wall
  for (const [x, y] of [[doorX, doorY], win1, win2]) set(x, y, TILE.FLOOR);
  makeDoor(world, doorX, doorY, { locked: true, lockId: CONFIG.items.key.lockId }); // the scattered door key fits it
  makeWindow(world, ...win1);
  makeWindow(world, ...win2);
  world.testBuilding = buildingInfo(b);
}

// Plain rect + an inside() helper (rebuilt after loading a save).
export function buildingInfo(b) {
  return { x: b.x, y: b.y, w: b.w, h: b.h, inside: (x, y) => x > b.x && y > b.y && x < b.x + b.w - 1 && y < b.y + b.h - 1 };
}
