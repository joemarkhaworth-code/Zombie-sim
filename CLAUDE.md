# Zombie Survival — Project Guide for Claude

## The game
A free-roam, turn-based zombie survival game in the style of the original Zelda, set in a Yorkshire market town in the early 1990s. You explore a large world made of screens, scavenge by day, and get back to safety before night. After the player takes a turn, everything else takes its turn.

Goal: survive as many days as you can.

Look: simple 8-bit, inspired by old RPGs. Until the art pass, everything is greybox: plain coloured squares and letters.

## Design pillars
1. A game, not a simulation. Add a system only if it makes exploring or surviving more fun. A new idea should plug into an existing system; if it needs a new one, it must earn its place.
2. The daily rhythm. Go out by day, get home by night. Hunger, thirst, tiredness and darkness push you to plan your trips.
3. Explore to progress. Key items open new areas with better loot, like Zelda.
4. Numbers, not variety. There is only one zombie type, the slow shambler. One is manageable; a crowd is deadly.
5. Every action has a cost. Noise draws zombies, running tires you, looted places stay looted.
6. Readable on a phone. Everything shows as a tile, a colour or a one-line status message. Use coarse values (levels 0–3).

## Setting and tone
- A fictional Yorkshire market town inspired by Knaresborough and Wetherby (not a copy). Early 1990s, so no mobile phones. The outbreak starts on the August bank holiday weekend. Days shorten as the run goes on, towards winter.
- Tone: dry, understated British humour, never slapstick. Danger stays real; humour lives in small details.
- Humour goes in: one-line inspect text ("Tin of mushy peas. Desperate times."), deadpan cause-of-death lines ("Died of thirst next to a full kettle."), British items, and NPCs as familiar British types (market trader, publican, vicar, dog walker, retired major, farmer). No brand names.
- Tea: drinking tea reduces tiredness by one level; boiling a kettle whistles (noise). No morale system.
- Rare odd sightings, still normal shamblers: a zombie Morris dancer (ankle bells make noise as he moves), zombies queueing outside the post office.

## The world
- The town layout is the same every run: generated from a fixed world seed in config.js, with hand-placed overrides for key landmarks (market square, castle, church, pubs, bridges).
- Each run uses a separate run seed for what varies: loot, zombie positions, NPCs, and which bridges are blocked.
- Flip-screen world: a 10×10 grid of screens. Walk off an edge to go to the next screen.
- Districts, in rings from the centre:
  1. Town centre: market square, high street, pubs, shops, bank, post office, parish church, castle ruins on a hill, snickets and ginnels. Most zombies, best loot.
  2. River through town in a gorge: old stone bridge, weir, railway viaduct, riverside paths. Some bridges blocked by crashed cars. Fishing here.
  3. Inner town: Victorian stone terraces with back alleys and yards, school, park with bandstand, allotments.
  4. Suburbs: 1930s semis, 1970s estates and cul-de-sacs, leisure centre, garden centre. Fewer zombies, good safe-house territory.
  5. Edge of town: industrial estate, supermarket, golf course, racecourse, then farmland, woods and farms. Quiet, sparse supplies, good for foraging and farming.
- Danger and loot are highest in the centre and drop towards the edges.
- Building interiors are separate screens. Entering through a door switches to the interior; stairs and ladders lead to upstairs and cellar screens. Buildings keep their footprint on the street map; interiors use larger tiles to fill the screen, with room layouts roughly matching the building's size. Doors and windows link inside and outside: noise passes both ways, zombies can follow you in through open or broken doors and windows, barricades are placed from inside, and looking out of a window briefly shows the street. The outside world keeps running while you're indoors.

## Platform and workflow
- Offline, single player only. No servers or accounts.
- Built entirely from a phone with Claude Code. Play-tested in a mobile browser, portrait orientation.
- Stack: plain JavaScript (ES modules), HTML canvas, rot.js (scheduler, FOV, pathfinding). No build step unless needed.
- Deploys to GitHub Pages on every push to main. Work directly on main.
- One step per session. Before finishing, the game must load and be playable, the headless test must pass, and the change must be committed.

## Controls
- Tap an adjacent tile to move or act (attack, open a door). Tap your own tile to wait.
- Long-press any tile to inspect it in the status bar.
- A thumb-friendly action bar at the bottom: sneak toggle, shove, inventory, and later sleep.
- Tiles must be big enough to tap easily with a thumb.

## Architecture rules
- Simulation is separate from rendering. src/sim/ never touches the DOM or canvas. src/render/ only reads world state.
- Entities + components. Everything (player, zombie, door, tin of beans) is an entity with data components. Systems act on any entity with the right components. No "X vs Y" special cases.
- Energy/speed turn scheduler, so slow things act less often.
- Event bus: systems emit events and others subscribe. Internal only, not player-facing text.
- Seeded RNG for everything. Record player inputs per turn so a run can be replayed.
- All tuning numbers in src/config.js. A hidden tuning panel (from the debug overlay) lets values be changed in-game and saved locally.
- Debug overlay (tap the top bar): turn, day, seeds, selected entity's components, noise heatmap.
- Headless test runner: the sim can run N turns without rendering to catch crashes.
- Save version number: an incompatible old save starts a fresh game instead of crashing.
- Only simulate nearby screens in full; distant screens are simulated roughly.

## Lessons from the first prototype (follow these)
- Line of sight and light are separate. Walls block sight. Light range sets how far you see in the open: long by day, short at night. Each visible tile has a visibility level 0–3 from light.
- Map memory stores a snapshot of each tile as it was last seen (terrain, damage, doors, items), not the live tile. Creatures are not remembered.
- Zombies must feel dangerous when they reach you: most attacks land, about 3–4 bites kill a healthy player, and they search the last known position for a while before giving up.
- The player must be able to get the drop on zombies: a zombie that steps next to the player lets the player act first; attacking an unaware creature does heavy bonus damage; a zombie that has just noticed you spends a turn reacting.
- Shove: one-shot action; pushes an adjacent creature one tile and staggers it (loses its next turn); bumping into something blocked does minor damage.

## Scale
1 tile ≈ 1.5 m, about one person. Walls occupy tiles.
- Objects: bed 1×2, sofa 1×2, table 1×1 or 2×1, car 3×2, van 4×2, tractor 3×2.
- Buildings (outside, incl. walls): shed 3×3, greenhouse 3×4, terraced house 5×7, semi or farmhouse 7×9, corner shop 6×8, pub 10×12, church 9×18, barn 8×12.
- Paths: snicket/ginnel 1, pavement 1, lane 2–3, main road 4–5, bridge 3, river 4–6, wall/hedge 1.
- Buildings and objects are true scale. Open countryside at the edge of town is compressed.

## Materials
Stone, slate, brick, wood, glass, corrugated metal. Each has HP, flammability, see-through, and noise when hit or broken. Sheds can be wood or corrugated metal.

## Weapons
- Melee like the Zelda sword: every weapon hit damages and knocks the zombie back 1 tile, staggering it (loses its next turn). Unarmed hits are weak with no knockback (shove still available). One zombie is easy with a weapon; several at once is the danger.
- Melee: walking stick (starting weapon, weak, quick), cricket bat (all-rounder), garden fork (reach 2, light knockback), spade (heavy, big knockback, slow), golf club (strong, noisy), fire axe (best, rare). Light durability: weapons wear out and break.
- Ranged, distinctly British, no armouries: catapult with stones/marbles (main ranged weapon, quiet, weak), pub darts (thrown, recoverable), bow and arrows from a scout hut or archery club (quiet, arrows recoverable), air rifle (rare, quiet, few pellets), one rare farmer's shotgun (devastating, very loud, few cartridges). No other guns.
- Fireworks: a lure, not a weapon; zombies head to them.
- Throwables: bricks, bottles, tins (small damage or distraction).

## Food and water (about 12 food types)
1. Scavenging: tins, packets, biscuits, bottled water in buildings. Finite; looted places stay looted. Fresh food (bread, milk, fruit) goes off after a few days; tins keep.
2. Foraging: blackberries, apples, nettles, mushrooms in hedgerows and woods; amounts depend on season and thin out towards winter. Some mushrooms make you ill unless you have the mushroom guide. Fishing in the river with a rod: slow, quiet, exposed.
3. Light farming: seed potatoes and seed packets from sheds, allotments and the garden centre; plant in a veg patch near the safe house; crops grow over several days; zombies trample crops and desperate NPCs steal them.
- Water: bottled water → river water (boil it or risk illness) → rain collector.
- Cooking: raw fish, potatoes and mushrooms must be cooked on a stove or campfire; fires give off light visible at night.

## Roadmap (build in order; keep it playable after each step)

Phase 1 — Core loop (one test screen)
1. One screen grid that fits a phone in portrait, player moves by tap, turn loop
2. Scheduler + one zombie that shambles toward the player
3. Status bar + long-press inspect
4. Line of sight + light, visibility levels 0–3
5. Map memory (snapshot as last seen, greyed out)
6. Noise: actions make noise, walls muffle it, zombies investigate the source
7. Stealth: sneak toggle (slower, quieter) and hiding spots
8. Combat: health, bleeding, melee with knockback, sneak attacks, shove
9. Items and inventory: pick up, drop, use; weapons change damage; bandages stop bleeding
10. Throwing: any item can be thrown; it makes noise where it lands (distraction)
11. Save/load (autosave every turn) + game over screen (days survived, deadpan cause of death, seed)

Phase 2 — The town
12. Flip-screen world: 10×10 screens from the fixed world seed, walking between screens
13. Districts: generate the town centre, river, inner town, suburbs and edge of town as described in The world
14. Building interiors as separate screens, with doors (open/close/lock), windows (see-through, smashable, loud), barricades and upstairs/cellars, using the materials table

Phase 3 — Surviving
15. Day/night: light range shrinks at night; more zombies come out and wander; dawn pushes them back
16. Needs: hunger, thirst and tiredness (0–3). Empty hunger/thirst drains health. Tiredness rises with time awake, faster when running or fighting; warnings as it rises (edges dim, slower movement). At max tiredness you pass out where you stand, Stardew-style. Outcome depends on safety: barricaded safe house = wake fine; inside but unsecured = chance zombies find you; outside = high danger (lose items, wake badly hurt, rarely die). Choosing to sleep anywhere uses the same rules. Sleeping passes time to morning
17. Scavenging and water (Food and water, stage 1)
18. Safe house: claim a building, barricade it, sleep safely, store items in a chest

Phase 4 — Depth
19. Zombie numbers: numbers rise as the days pass, noise draws them into crowds, night brings more out
20. Key items, Zelda-style: bolt cutters (padlocked gates), torch (dark cellars, night), crowbar (boarded doors), bike (fast travel, can't fight while riding, carries less), wellies (wade the river shallows), mushroom guide. Locked areas hold better loot
21. Weapons: the full melee and British ranged set from Weapons
22. Foraging, fishing and cooking (Food and water, stage 2)
23. Light farming (Food and water, stage 3)
24. NPC survivors: NPCs follow the same rules as the player — they scavenge, eat, drink, sleep, avoid zombies and compete for the same finite loot. Each has one attitude: friendly (gets on with their own day), wary (keeps distance, fights if cornered) or hostile (attacks for your stuff). Desperation: when an NPC's hunger or thirst is low, they may steal or attack, even if friendly; giving them food or tea calms them. NPCs only remember whether the player attacked or helped them. No relationships, factions or gossip
25. Rare odd sightings from Setting and tone

Phase 5 — Polish
26. Juice and sound: screen shake, hit flashes, simple 8-bit sound effects
27. Art pass: 8-bit tiles and UI

## Not doing (keep it a game)
Other zombie types, morale, factions, NPC relationships, simulated history, zombie evolution, flowing water, complex ecosystems, crafting trees, procedurally generated towns. Only revisit after the game is finished and fun.

## Decisions
(Record decisions from playtesting here.)

### Step 1 (screen grid, tap to move, turn loop) - built
- One screen is CONFIG.screen = 11 x 15 tiles (portrait). The tile size is computed to fit the whole screen between the top bar (36 px) and the action bar (at least 72 px), so a screen never scrolls (flip-screen). The map sits flush under the top bar and any leftover height goes to the action bar, so there are no black bands top or bottom. Tiles are 32-41 px on common phones.
- No diagonal movement (Zelda-style, 4-way). The sim refuses diagonal moves (no turn), so every creature added later moves 4-way too.
- Tapping: your own tile waits; any other tile on the map steps one tile up, down, left or right, whichever way the tap is furthest from your tile's centre (measured in pixels, so there are no ties). A slightly-off tap still moves you the way you meant. Walking into a wall costs no turn. Arrow keys / WASD / numpad 8426 and space work on desktop.
- Turn loop (src/sim/turn.js applyInput): the player acts, then endTurn runs the rest of the world (the scheduler, step 2). Inputs { type: 'move', dx, dy } and { type: 'wait' } that take a turn are recorded in world.inputs; replay(createWorld, seed, inputs) rebuilds a run exactly.
- Seeded RNG (src/sim/rng.js, mulberry32). ?seed=N in the URL picks the run seed. The test screen (gen/testscreen.js) is a walled room with 10 seeded single-tile rocks.
- Entities are plain component bags in world.entities; the event bus (src/sim/events.js) lists its event types at the top.
- Top bar shows the turn (T12) on the left and the seed dimmed on the right. The action bar is empty until its buttons arrive.
- Deploy: .github/workflows/pages.yml runs the headless test, stamps imports with the commit for cache-busting, and publishes to GitHub Pages on every push to main.
- Tried and dropped: a Game Boy-style pad (d-pad, A/B, SELECT/START) under a shorter 11 x 12 screen. Tap-to-move on the bigger screen won.

### Step 2 (scheduler + one zombie) - built
- Scheduler (src/sim/scheduler.js) is our own small energy scheduler, not rot.js's: rot.js uses its own global RNG, which would break seed + inputs replay. Each tick every Actor gains `speed` energy; an action costs scheduler.actionCost (100). Actors act in entity-id order, so runs are deterministic. The player's action is spent by input (turn.js endTurn takes 100 energy), then advance() runs ticks until the player can act again. world.tick counts ticks (world time); world.turn counts player actions.
- Speeds: player 100 (one action a tick), zombie 50 (acts every other tick). So a zombie that steps next to you can't also act: you get to act first.
- Movement is one shared rule for everything (src/sim/systems/movement.js tryStep): 4-way only, refused into walls, blockers (anything with Blocks) and off the map. Emits entity_moved / move_blocked { blockerId }.
- Zombie brain (src/sim/systems/shamble.js): a greedy 4-way step toward the nearest entity with a Prey component (the player has Prey; later animals or NPCs can too). It tries the longer axis first, then the shorter one; equal distances pick an axis at random. zombie.stagger (15%) of its steps go a random open way instead, which also shakes it loose when it's stuck behind a rock. Next to its prey it does nothing yet (biting is step 8). It always knows where you are until line of sight (step 4). Proper pathfinding waits until it's needed.
- Walking into the zombie is blocked and costs no turn (attacking comes in step 8).
- The test screen gets one zombie (green Z) on open floor 5-9 steps from you (testScreen.zombieDist), placed from the run seed.
- Tests: one zombie per seed at the right distance; in an empty room it closes one tile every other turn while you wait and stops next to you; it can't be walked into; over 100 random runs it never enters a wall, never moves diagonally or onto you, always reaches you at some point, and replays match (player, zombie, turn and tick).

### Step 3 (status bar + long-press inspect) - built
- Status bar: one line at the top. Turn number (T12) on the left, then the latest message. Each new player action clears the line. If several things happen in one turn, the most important message wins (danger > blocked > bump > info). Danger messages are yellow. With no message, the seed shows dimmed on the right. Long messages shrink a little to fit a narrow phone.
- Wording lives only in src/render/messages.js, which subscribes to the sim's events (createMessageLog). The sim emits data only (entity_waited, move_blocked { blockerId }, turn_ended...).
- Messages so far: "You wait.", "A wall blocks the way." (blocked), "The zombie is in the way." (bump), "The zombie is next to you!" (danger: only when a zombie newly ends a turn next to you, not every turn it stays there). Keep messages under ~30 characters.
- Long-press: hold still for ui.longPressMs (450 ms) to inspect the tile under your finger: one line in the status bar, a white outline on the tile, and a short buzz where the phone supports it. It takes no turn and isn't recorded. The next action clears it.
- Because of long-press, a tap now acts when your finger lifts (not when it lands). A finger that slides more than ui.tapSlop (12 px) does nothing.
- Inspect wording (messages.js describeTile): your own tile "That's you."; a creature or thing on the tile; else the terrain. Dry and short, e.g. "A zombie. Not a people person.", "A stone wall. Solid, at least.", "Bare floor. Seen better days." Until line of sight (step 4) you can inspect anything on the screen.
- Tests: each message, blocked moves take no turn, the warning only fires on arrival, danger outranks waiting, the inspect lines (all 30 characters or fewer), and inspecting takes no turn.

### Step 4 (line of sight + light) - built
- Vision is our own code (src/sim/systems/vision.js), not rot.js: rot.js's shadowcasting lets you see through diagonal gaps and round corners. It has two separate parts:
  - Line of sight (lineClear): the straight line between tile centres, walking every tile it passes through. Opaque tiles in between block it (TILE_INFO opaque: walls). A line squeezing exactly between two diagonal walls is blocked; one wall at a corner isn't. It's symmetric (tested), and has no distance limit of its own.
  - Light: CONFIG.light.range (15, covers the whole screen) is how far anyone sees in the open on a clear day. world.light holds a 0-3 level per tile (src/sim/systems/light.js; all 3 for now, day/night is step 15). Eyesight 0-3 scales the range (vision.eyesightFactor): player 3 = full, zombie 2 = half (7 tiles), so you usually see them first.
- A tile's visibility (0-3) = its light level if it's in line of sight and in range, else 0. You always see your own tile. Wall faces next to a visible open tile are shown at its level, so walls don't look patchy. world.view holds the player's view, recomputed at the end of every turn.
- Noticing a creature (canNotice): its tile must be in sight with light >= vision.minLevelToSpot (1), and within sight radius x vision.noticeByLight[light] (1 / 0.67 / 0.34 for light 3/2/1). Anything right next to you (8 ways) with no wall between is always noticed, even in pitch darkness, both ways. You only see (and can inspect) creatures you notice.
- Drawn: visibility 3 full colour, 2 and 1 darker (render.dimAlpha), 0 black until map memory (step 5).
- Zombies only chase what they see (shamble.js, Brain { goal, search, tracking }):
  - prey in view: its spot is the goal; step toward it (prey_spotted when it newly sees you);
  - lost sight: walk to where it last saw you (prey_lost);
  - there, search: shuffle about within zombie.searchRadius (3) of that spot for zombie.searchActions (12) moves, about 24 of your turns, so it can stumble onto you nearby, then give up (search_gave_up);
  - nothing to do: stand about, shuffling a random way 30% of its actions (zombie.wanderChance).
  The stagger (15% random steps) still applies.
- Messages: "A zombie comes into view." (info, when a zombie you couldn't see appears; not for ones already in view at the start). Inspecting a tile you can't see: "Can't see from here."
- Badges instead of a "has seen you" message (playtest): a yellow ! at the top right of a zombie that's after you (Brain.tracking), a grey ? on one that has lost you and is heading for the last spot or searching. Only on zombies you can see.
- Out-of-sight look (playtest): tried 'dim' (the layout always shown, darkened) and 'dither' (under an 8-bit checker); chose black plus map memory (step 5).
- Test screen: as well as 10 rocks, 3 short straight walls (testScreen.wallRuns, 3-5 long) to hide behind; any floor sealed off from the start is filled in.
- Tests: walls block, the diagonal squeeze, symmetry over 30 rooms, light levels, dim light shrinks noticing, eyesight 7 vs 15, behind a wall unseen and dark, adjacent noticed in the dark; a zombie that can't see you stays put, spots you, loses you, goes to the last spot, searches near it and gives up; both messages; inspect out of sight. Random play: the zombie still reaches a random walker in ~97 of 100 runs.

### Step 5 (map memory) - built
- Map memory lives in the sim (src/sim/systems/memory.js), not the renderer. The player has Memory { tiles: { index: { t, things } } }: a snapshot of each tile as it looked when last seen, the terrain plus any non-creature things on it (anything with a Glyph and no Actor: items, doors later; add new tile state such as damage, door state or barricade health in snapshotTile()). Never the live tile, and creatures are never remembered.
- A snapshot only updates while the tile is in view: updatePlayerView (end of every turn, and at the start) snapshots everything in view. So the remembered map can be out of date: beans someone moved are still where you last saw them until you look again. Plain data, so saves (step 11) can store it.
- Drawn: tiles in view in full colour; out of sight, remembered tiles in their own dark greys (colours.memory, keeping each tile's shapes) with remembered things as grey letters; never seen is black.
- Inspect out of sight shows the remembered snapshot, never the live tile, plus ", out of sight" ("A wall, out of sight.", "A tin of beans, out of sight."); never seen is "Unexplored."
- Headless now has a drawing smoke test: a short run is drawn every turn into a fake canvas that accepts any call, so a broken draw function fails the test instead of the phone (it caught two).
- Tests: in view remembered, behind a wall not, creatures not, things are; out of sight a moved thing stays where you saw it and a changed tile stays as it was; inspect shows the memory; looking again updates it; memory survives JSON.

### Step 6 (noise) - built
- Noise (src/sim/systems/noise.js): makeNoise(world, x, y, level 0-3, byId) is the one entry point. Level sets the starting strength (noise.radiusByLevel 0/4/8/12); strength drops 1 per tile (8 ways) and noise.wallCost (3) more when entering a wall or anything solid, so walls muffle rather than block; the map edge blocks. Quiet noises die in a wall (a footstep), loud ones carry through (level 2 comes out the other side of a 1-tile wall at 3).
- Hearing is a 0-3 level per creature (Hearing { level }), like eyesight: noise.minStrengthToHear [never, 3, 2, 1] is the faintest strength still heard. Zombies have good ears (3) and poor eyes (2); the player hears at 2 (used from later steps). A creature doesn't hear its own noise.
- What makes noise for now: walking, via Noisy { move }: your footsteps are level 1 (heard by a zombie about 3 tiles off in the open, round corners too), zombies 0 (they shuffle quietly). Waiting is silent. Bumping makes no noise (it takes no turn and would be a free lure). Later systems (fights, thrown things, doors, sneaking) call makeNoise or change Noisy.
- Zombies that hear a noise make its source their goal (Brain.goal why 'heard'), walk there, search round it like a lost sighting, then give up. The newest noise wins; seeing prey always wins over hearing. No status message for hearing: you see it turn your way, with a ? over it (show, don't tell).
- Debug overlay: tap the top bar to toggle (takes no turn, not recorded). It shows the noise heatmap (orange tiles with strength numbers: noise since your last action, out of sight too) and "DEBUG tick N seed S" in the top bar. world.noise holds the heatmap; it's cleared at the start of each player action.
- Intentional: in daylight in the open, zombies see you (7 tiles) well before they hear your footsteps (3). Hearing matters when they can't see you: round corners, behind walls, and at night (step 15). Don't "fix" this by tuning.
- Tests: strength per tile and diagonals; a footstep dies in a wall, a loud noise carries through muffled; a zombie behind a wall hears a loud noise, walks to it, searches and gives up; the newest noise wins; footsteps are heard round a wall 2-3 tiles off but not far off, waiting is silent; seeing beats hearing; the heatmap clears each action.
