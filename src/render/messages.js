// Turns sim events into the one-line status bar, and tiles into inspect text.
// All player-facing wording lives here. The sim only emits data.
import { TILE, TILE_INFO } from '../sim/tiles.js';
import { S, O, STRUCT, OBJECT, roofRegion } from '../sim/map.js';
const OBJECT_LABEL = o => OBJECT[o][2];
import { canNotice } from '../sim/systems/vision.js';

// Priorities: if several things happen in one turn, the most important message wins.
export const LEVEL = { info: 0, bump: 1, blocked: 2, danger: 3 };

export function createMessageLog(world) {
  const log = {
    text: '', level: -1,
    adjacent: new Set(),  // zombie ids next to the player at the end of the last turn
    inView: new Set(),    // zombie ids the player noticed at the end of the last turn
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
  ev.on('move_blocked', ({ id, x, y, blockerId, cliff }) => {
    if (!isPlayer(id)) return;
    if (blockerId) {
      const b = world.entities.get(blockerId);
      log.say(`The ${b && b.Name ? b.Name.name : 'thing'} is in the way.`, LEVEL.bump);
    } else {
      if (cliff) {
        // You're still on the tile you tried to leave: higher there is a drop, lower a cliff.
        const me = world.entities.get(id).Position;
        const down = world.height[y * world.w + x] < world.height[me.y * world.w + me.x];
        log.say(down ? 'A drop. Find a way down.' : 'A cliff. Find some steps.', LEVEL.blocked);
      } else log.say(blockedText(world, x, y), LEVEL.blocked);
    }
  });
  // Fighting.
  const nameOf = id => { const e = world.entities.get(id); return e && e.Name ? e.Name.name : 'thing'; };
  ev.on('attacked', ({ id, targetId }) => {
    if (isPlayer(id)) log.say(`You hit the ${nameOf(targetId)}.`, LEVEL.info);
    else if (isPlayer(targetId)) log.say(`The ${nameOf(id)} bites you!`, LEVEL.danger);
  });
  ev.on('shoved', ({ id, targetId }) => { if (isPlayer(id)) log.say(`You shove the ${nameOf(targetId)}.`, LEVEL.info); });
  ev.on('entity_slammed', ({ id, blockerId }) => {
    if (!isPlayer(id)) log.say(`It slams into ${blockerId ? 'the ' + nameOf(blockerId) : 'the wall'}.`, LEVEL.info);
  });
  ev.on('entity_died', ({ id, by }) => {
    if (isPlayer(id)) log.say('You died.', LEVEL.danger + 1);
    else if (isPlayer(by)) log.say(`The ${nameOf(id)} goes down.`, LEVEL.info);
  });
  // Items.
  ev.on('item_picked_up', ({ id, itemId, inHand }) => {
    if (isPlayer(id)) log.say(inHand ? `No room. You carry the ${nameOf(itemId)}.` : `You pick up the ${nameOf(itemId)}.`, LEVEL.info);
  });
  ev.on('bag_full', ({ id, itemId }) => { if (isPlayer(id)) log.say(`No room for the ${nameOf(itemId)}.`, LEVEL.blocked); });
  ev.on('item_dropped', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You drop the ${nameOf(itemId)}.`, LEVEL.info); });
  ev.on('item_wielded', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You hold the ${nameOf(itemId)}.`, LEVEL.info); });
  ev.on('item_stowed', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You put the ${nameOf(itemId)} away.`, LEVEL.info); });
  ev.on('item_used', ({ id, type }) => {
    if (!isPlayer(id)) return;
    log.say({ beans: 'You eat the beans. Cold.', bandage: 'You bandage yourself up.' }[type] || 'Done.', LEVEL.info);
  });
  ev.on('use_refused', ({ id, itemId, why }) => {
    if (!isPlayer(id)) return;
    log.say(why === 'not_hurt' ? "You're not hurt." : why === 'no_room' ? `No room in the bag for the ${nameOf(itemId)}.` : 'Nothing to do with that.', LEVEL.blocked);
  });
  ev.on('item_thrown', ({ id, itemId }) => { if (isPlayer(id)) log.say(`You throw the ${nameOf(itemId)}.`, LEVEL.info); });
  ev.on('thrown_hit', ({ id, targetId }) => { if (isPlayer(id)) log.say(`It hits the ${nameOf(targetId)}.`, LEVEL.info); });
  // Arriving somewhere: the place's name, Pokémon-style.
  log.place = placeAt(world);
  ev.on('turn_ended', () => {
    const now = placeAt(world);
    if (now && now !== log.place) log.say(PLACE_TEXT[now] || `${now}.`, LEVEL.info);
    log.place = now;
  });
  // A zombie seeing you has no message: a ! appears over it instead (show, don't tell).
  ev.on('turn_ended', () => {
    const p = world.entities.get(world.playerId);
    const now = new Set(), seen = new Set();
    for (const e of world.entities.values()) {
      if (!e.Zombie || !e.Position) continue;
      if (canNotice(world, p, e)) seen.add(e.id);
      if (Math.max(Math.abs(e.Position.x - p.Position.x), Math.abs(e.Position.y - p.Position.y)) === 1) now.add(e.id);
    }
    for (const id of seen) if (!log.inView.has(id)) log.say('A zombie comes into view.', LEVEL.info);
    for (const id of now) if (!log.adjacent.has(id)) log.say('The zombie is next to you!', LEVEL.danger);
    log.adjacent = now;
    log.inView = seen;
  });
  // Whatever's in view at the start doesn't announce itself.
  log.inView = new Set([...world.entities.values()]
    .filter(e => e.Zombie && canNotice(world, world.entities.get(world.playerId), e)).map(e => e.id));
  return log;
}

// The place you're in (layout.places), or the landmark label you're near on an editor map
// (within 2 tiles), or null in the wilds.
function placeAt(world) {
  const p = world.entities.get(world.playerId), L = world.layout;
  if (!p || !p.Position || !L) return null;
  const { x, y } = p.Position;
  if (L.labels && L.labels.length) {
    const near = L.labels.find(lb => Math.abs(lb.x - x) <= 2 && Math.abs(lb.y - y) <= 2);
    if (near) return near.text;
  }
  if (!L.places) return null;
  const pl = L.places.find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  return pl ? pl.name : null;
}
const PLACE_TEXT = {
  Haverly: 'Haverly. Pop. 2,140. Was.', 'Carrick Mills': 'Carrick Mills. Pop. 1,302.',
  'Loon Lake': 'Loon Lake. Summer people only.', 'Apple Hill': 'Apple Hill. Pop. 212.',
  "Cooper's Corner": "Cooper's Corner. Gas. Eats.", 'Spruce Hollow': 'Spruce Hollow. Pop. 480.',
  Ledgeview: 'Ledgeview. Granite since 1871.',
};

// Inspect wording. Dry, short, under ~30 characters. By tile key (src/sim/tiles.js).
const TILE_TEXT = {
  FLOOR: 'Bare floor. Seen better days.', WALL: 'A stone wall. Solid, at least.',
  GRASS: 'Grass. Wants cutting.', FIELD: 'Corn. Nobody to harvest it.', MOOR: 'Scree. Loose underfoot.',
  GREEN: 'Mown grass. Someone cared.', SAND: 'Sand. Gets everywhere.', ROAD: 'The road. No traffic now.',
  ROAD_LINE_H: 'The road. No traffic now.', ROAD_LINE_V: 'The road. No traffic now.', PAVEMENT: 'Sidewalk. Mind the cracks.',
  SETTS: 'Setts. Murder on the ankles.', TRACK: 'A dirt road. Rutted.', PATH: 'A trail.', YARD: 'Flagstones. A yard.',
  DOORSTEP: 'A doorstep. No milk today.', GATE: 'A gate. Shut it behind you.', STEPS: 'Stone steps. Steep ones.',
  BRIDGE: 'A bridge. Solid enough.', WATER: 'Cold, deep water.', SHALLOWS: 'The shallows. Knee-deep.',
  WEIR: 'The dam. Slippery.', CRAG: 'A crag. Long way down.', ROCK: 'A boulder.', LOWWALL: 'An old stone wall.',
  HEDGE: 'A hedge. Thick, thorny.', FENCE: 'A fence.', TREE: "A tree. Climbing's for kids.", RAIL: 'Railroad track. No trains.',
  PLATFORM: 'The platform. Mind the gap.', CROSSING: 'A railroad crossing.', TUNNEL: 'The old mine. Pitch black.',
  GRAVE: 'A headstone. Rest in peace.', RUIN: "Castle ruins. Cromwell's work.", BARRIER: 'A police roadblock. Abandoned.',
  ARCH: 'An archway.', BEDS: 'Turned earth. Ready to plant.', CARPARK: 'A parking lot. Plenty of room.', DRIVE: 'A driveway.',
  MARKET_CROSS: 'The market cross.', PARAPET: "A parapet. Don't look down.",
  MARSH: 'Swamp. Smells like it, too.', PADLOCK: 'A padlocked gate. Private.',
  GRAVEL: 'Gravel. Crunchy underfoot.', MEADOW: 'Meadow. Ticks, probably.', CRACKED: 'Cracked asphalt. Frost heave.',
  NEEDLES: 'Pine needles. Soft, quiet.', LEAVES: 'Dead leaves. Crunchy.', MOSS: 'Moss. Soft underfoot.',
  GRANITE: 'Granite ledge. Very Maine.', MUD: 'Mud. Early for mud season.', CORN: 'Corn. Nobody to pick it.',
  PUMPKINS: "Pumpkins. Halloween's off.", BLUEBERRY: 'Blueberry barrens. Picked.', STREAM: 'A rocky stream. Cold.',
  LINO: 'Linoleum. Peeling.', CARPET: 'Shag carpet. Brown, of course.', CHECKER: 'Diner tiles. Black and white.',
  CONCRETE: 'Concrete. Oil stains.',
};
// Walking into something.
const BLOCKED_TEXT = {
  WATER: 'Too deep to wade.', SHALLOWS: 'Too deep without waders.', CRAG: 'A sheer drop. Not that way.',
  HEDGE: 'The hedge is too thick.', TREE: "A tree's in the way.", FENCE: 'A fence blocks the way.',
  RUIN: 'The ruins block the way.', GRAVE: "A headstone's in the way.", ROCK: "A boulder's in the way.",
  BARRIER: 'The road out is blocked.', TUNNEL: 'Too dark in there. For now.', CARRIAGE: "The carriage door's shut.",
  CARRIAGE_END: "The carriage door's shut.", MARKET_CROSS: 'The market cross. In the way.', PARAPET: 'A parapet. Long way down.',
  PADLOCK: "It's padlocked. Bolt cutters?",
};
// Buildings, by name, then by kind.
const NAMED_TEXT = {
  'your house': 'Your house. Still standing.', 'the post office': 'Post office. Back in 5 mins.',
  'the Black Bull': 'The Black Bull. Free house.', 'the Angel': 'The Angel. Coaching inn, 1720.',
  "St John's church": "St John's. Bells gone quiet.", 'the station': 'The station. No trains today.',
  'the superstore': 'The superstore. Big car park.', 'the Town Hall': "Town Hall. Council's out.",
  'the Shambles': 'The Shambles. Old market.', 'the Picture House': "Picture House. Matinee's off.",
  'the Co-op': 'The Co-op. Divi stamps.', 'the police station': 'Police station. Nobody in.',
  'the fire station': 'Fire station. Engines out.', "the World's End": "The World's End. Apt name.",
  'Castle Mill': "Castle Mill. Wheel's still.", 'the board school': 'The board school. 1876.',
  'the Grange hospital': 'The Grange. Hospital, just.', 'the Hall': "The Hall. His lordship's out.",
  'the bandstand': 'The bandstand. No band.', 'the swimming baths': 'The baths. Verruca socks.',
  'the high school': 'High school. Summer hols.', 'the football stand': 'The stand. Nil-nil, probably.',
  'the scout hut': 'Scout hut. Bows inside?', 'the golf club': 'The golf club. Members only.',
  'the grandstand': 'The grandstand. No runners.', 'the KGV pavilion': 'Cricket pavilion. Tea urn.', 'the garden centre': 'Garden centre. Seeds, maybe.',
  'the rear carriage': 'A carriage. Bags on the racks.', 'the middle carriage': 'A carriage. Bags on the racks.',
  'the front carriage': 'The front carriage. Cab dark.',
};
const KIND_TEXT = {
  terrace: 'A terraced house. Nets drawn.', cottage: 'A stone cottage. Low beams.', semi: 'A semi. Pebbledash, sadly.',
  detached: 'A detached house. Posh.', bighouse: 'A big house. Gravel drive.', bungalow: 'A bungalow. Very beige.',
  farmhouse: 'A farmhouse. Smells of dog.', shop: 'A shop. Shutters down.', pub: 'A pub. Last orders, ever.',
  bank: 'A bank. Vault, presumably.', factory: 'A factory unit. Shut.', barn: 'A barn. Hay and diesel.',
  shed: 'A shed. Spiders, mostly.', garage: 'A garage.', greenhouse: 'A greenhouse. Tomatoes.', hall: 'A big old building.',
  school: 'A school. Summer hols.', church: 'A church.', cinema: 'A cinema.', pavilion: 'A pavilion.', carriage: 'A carriage.',
};
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
function buildingText(b) {
  if (NAMED_TEXT[b.name]) return NAMED_TEXT[b.name];
  if (b.name) {
    const flavour = (KIND_TEXT[b.kind] || '').split('. ')[1];
    const line = `${capital(b.name)}.${flavour ? ' ' + flavour : ''}`;
    return line.length <= 30 ? line : `${capital(b.name)}.`;
  }
  return KIND_TEXT[b.kind] || 'A building.';
}
function buildingAt(world, x, y) {
  const L = world.layout;
  const n = L && L.buildingAt[y * world.w + x];
  return n ? L.buildings[n - 1] : null;
}
// Editor maps: the top layer you can see on the tile.
const STRUCT_TEXT = {
  [S.WALL]: 'A wall. Solid, at least.', [S.CLAPBOARD]: 'Clapboard. Needs paint.', [S.LOG]: 'A log wall. Chinked tight.',
  [S.BRICK]: 'Brick. Mill-town red.', [S.CINDER]: 'Cinder block. Ugly, sturdy.', [S.BARN]: 'Barn boards. Red, faded.',
  [S.WINDOW]: 'A window. Grimy.', [S.DOOR]: 'A door. Unlocked, for now.', [S.GARAGEDOOR]: 'A garage door. Shut.',
  [S.STONEWALL]: 'A stone wall. Old as the farm.', [S.FENCE]: 'A split-rail fence.', [S.PICKET]: 'A picket fence. Peeling.',
  [S.CHAINLINK]: 'Chain-link. Rusty.', [S.BARBED]: 'Barbed wire. Mind yourself.', [S.BOARDFENCE]: 'A board fence.',
  [S.GATE]: 'A gate. Shut it after you.', [S.HEDGE]: 'A hedge. Thick, thorny.', [S.GUARDRAIL]: 'A guardrail. Dented.',
  [S.BRIDGE]: 'A bridge. Solid enough.', [S.DOCK]: 'A dock. Creaky.', [S.TRACKS]: 'Railroad track. No trains.',
  [S.STEPS]: 'Steps. Mind your footing.', [S.LEDGE]: 'A ledge. You could hop down.',
};
const OBJECT_TEXT = {
  [O.CAR]: 'A car. Keys? Doubtful.', [O.PICKUP]: 'A pickup. Gun rack, empty.', [O.WAGON]: 'A station wagon. Wood panels.',
  [O.VAN]: 'A van. Rust holding it up.', [O.CAMPER]: 'A camper. Smells of sardines.', [O.BUS]: 'A school bus. Field trip over.',
  [O.LOGTRUCK]: 'A logging truck. Loaded.', [O.TRACTOR]: 'A tractor. Out of diesel.', [O.WRECK]: 'A wreck. Nobody walked away.',
  [O.CANOE]: 'A canoe. Paddle missing.', [O.TREE]: 'A maple. Leaves turning.', [O.PINE]: 'A white pine. Tall.',
  [O.BIRCH]: 'A birch. Peeling bark.', [O.APPLE]: 'An apple tree. Windfalls.', [O.SHRUB]: 'A shrub.',
  [O.BERRY]: 'A berry bush. Picked over.', [O.STUMP]: 'A stump.', [O.BOULDER]: 'A boulder. Glacier left it.',
  [O.HAY]: 'A hay bale.', [O.WOODPILE]: "A woodpile. Winter's coming.", [O.OUTHOUSE]: 'An outhouse. Vacant.',
  [O.TENT]: 'A tent. Zipped shut.', [O.FIRERING]: 'A campfire ring. Cold ashes.', [O.FISHING]: 'A fishing spot. Bites here.',
  [O.PUMP]: 'A gas pump. 1.29 a gallon.', [O.PHONE]: 'A payphone. No dial tone.', [O.MAILBOX]: 'A mailbox. Flag up.',
  [O.DRUM]: 'An oil drum.', [O.DUMPSTER]: 'A dumpster. Ripe.', [O.TRASH]: 'A trash can.', [O.LAMP]: 'A lamppost. Out.',
  [O.BILLBOARD]: 'A billboard. Faded.', [O.FLAG]: 'A flagpole.', [O.CRATE]: 'Shelves. Mostly empty.',
  [O.BENCH]: 'A bench. In loving memory.', [O.BED]: 'A bed. Unmade.', [O.TABLE]: 'A table.', [O.CHAIR]: 'A chair.',
  [O.SOFA]: 'A sofa. Plaid.', [O.COUNTER]: 'A counter.', [O.STOVE]: 'A wood stove. Cold.', [O.FRIDGE]: "A fridge. Don't open it.",
  [O.BATH]: 'A bathtub. Ring round it.', [O.DESK]: 'A desk.',
};
const objectBlocked = o => { const n = OBJECT_LABEL(o); const t2 = `A ${n} is in the way.`; return t2.length <= 30 ? t2 : "Something's in the way."; };
const STRUCT_BLOCKED = {
  [S.WINDOW]: "A window. It's not a door.", [S.GARAGEDOOR]: "The garage door's down.", [S.HEDGE]: 'The hedge is too thick.',
  [S.BARBED]: 'Barbed wire. Not that way.', [S.STONEWALL]: 'A stone wall blocks the way.', [S.GUARDRAIL]: 'A guardrail blocks the way.',
};
const structBlocked = st => STRUCT_BLOCKED[st] || (STRUCT[st][3].wall ? 'A wall blocks the way.' : STRUCT[st][3].fence ? 'A fence blocks the way.' : null);
function layeredText(world, x, y) {
  const i = y * world.w + x, p = world.entities.get(world.playerId);
  if (world.roof[i] && !roofRegion(world.roof, world.w, world.h, p.Position.y * world.w + p.Position.x).has(i)) return 'A roof. Shingles missing.';
  const o = world.obj[i];
  if (o === O.SIGN) {
    const sg = world.layout.objects.find(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
    return `A sign: ${(sg && sg.text) || 'blank'}.`.slice(0, 30);
  }
  if (o) return OBJECT_TEXT[o];
  if (world.struct[i]) return STRUCT_TEXT[world.struct[i]];
  return null;
}

function tileText(world, x, y, tile) {
  if (world.struct) { const tx = layeredText(world, x, y); if (tx) return tx; }
  const b = buildingAt(world, x, y);
  if (b) return buildingText(b);
  const sign = world.layout && world.layout.signs.find(s => s.x === x && s.y === y);
  if (sign) return `A sign: ${sign.text}.`;
  return TILE_TEXT[TILE_INFO[tile].key] || 'Nothing much.';
}
export function blockedText(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return 'A wall blocks the way.';
  const tile = world.tiles[y * world.w + x], info = TILE_INFO[tile];
  if (world.struct) {
    const i = y * world.w + x;
    if (world.obj[i]) return objectBlocked(world.obj[i]);
    const sb = world.struct[i] && STRUCT[world.struct[i]][3].blocks && structBlocked(world.struct[i]);
    if (sb) return sb;
  }
  if (info.part === 'door') return "The door's locked. For now.";
  if (info.part) return "A building's in the way.";
  return BLOCKED_TEXT[info.key] || 'A wall blocks the way.';
}
const THING_TEXT = {
  zombie: 'A zombie. Not a people person.',
  'zombie corpse': 'A dead zombie. Deader, anyway.',
  'tin of beans': 'Tin of beans. Cold, but beans.',
  bandage: 'A bandage. Fairly clean.',
  'cricket bat': 'A cricket bat. Well oiled.',
  'walking stick': 'A walking stick. Sturdy.',
};

// Cause of death, for the game over screen. Deadpan. A few wordings per cause, picked from the
// seed and turn so it's the same every time you look at the same death.
export function deathText(gameOver, seed = 0) {
  const by = gameOver.killerName || 'something';
  const held = gameOver.heldName ? `, ${gameOver.heldName} in hand` : ', empty-handed';
  const lines = {
    bite: [
      `Bitten by a ${by}${held}.`,
      `Eaten by a ${by}. Mostly.`,
      `Bitten by a ${by}. It was nothing personal.`,
    ],
    hit: [`Beaten by a ${by}${held}.`],
    shove: ['Slammed into a wall. The wall was fine.'],
    thrown: [`Hit by something a ${by} threw. Unlucky.`],
  }[gameOver.cause] || ['Died. Nobody saw how.'];
  return lines[((seed >>> 0) + gameOver.turn) % lines.length];
}


// Short names for remembered tiles (the line also says ", out of sight"): the inspect line up
// to its first full stop.
function rememberedName(world, x, y, tile) {
  const text = tileText(world, x, y, tile);
  return text.split('. ')[0].replace(/\.$/, '');
}

// Only what you can see. Out of sight, what you remember (never the live tile) with
// ", out of sight"; never seen is "Unexplored." Creatures you haven't noticed aren't there.
export function describeTile(world, x, y) {
  const p = world.entities.get(world.playerId);
  if (p.Position.x === x && p.Position.y === y) {
    const under = [...world.entities.values()].filter(e => e.Item && e.Position && e.Position.x === x && e.Position.y === y);
    return under.length ? `You're on a ${under[under.length - 1].Name.name}.` : "That's you.";
  }
  if (!world.view[y * world.w + x]) {
    const snap = p.Memory && p.Memory.tiles[y * world.w + x];
    if (!snap) return 'Unexplored.';
    const what = snap.things.length ? `A ${snap.things[snap.things.length - 1].name}` : rememberedName(world, x, y, snap.t);
    return `${what}, out of sight.`;
  }
  // A creature you notice first, else the top thing on the tile, else the terrain.
  const here = [...world.entities.values()].filter(e => e.Position && e.Position.x === x && e.Position.y === y && e.Name);
  const who = here.find(e => e.Actor && canNotice(world, p, e)) || here.filter(e => !e.Actor).pop();
  if (who) return THING_TEXT[who.Name.name] || `A ${who.Name.name}.`;
  return tileText(world, x, y, world.tiles[y * world.w + x]);
}
