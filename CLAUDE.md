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
- A thumb-friendly action bar at the bottom: shove, bag, and later sleep.
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
- Zombies must feel dangerous when they reach you, and they search the last known position for a while before giving up. (Health is now Zelda hearts: every bite lands and takes half a heart; see step 8.)
- The player must be able to get the drop on zombies: a zombie that steps next to the player lets the player act first, and a zombie that has just noticed you spends a turn reacting. (No sneak-attack bonus damage: dropped in playtesting.)
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
- Melee like the Zelda sword: every weapon hit damages and knocks the zombie back 1 tile (staggering too was tried: it made zombies unable to ever bite; see step 8). Unarmed hits are weak with no knockback (shove still available). One zombie is easy with a weapon; several at once is the danger.
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
7. ~~Stealth: sneak toggle and hiding spots~~ (built, then dropped in playtesting: see Decisions)
8. Combat: Zelda-style hearts (each hit takes half a heart), melee with knockback, shove. No bleeding, no sneak attacks
9. Items and inventory: pick up, drop, use; weapons change damage; bandages heal a heart (no bleeding)
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
Other zombie types, a sneak mode or hiding spots (tried, step 7), morale, factions, NPC relationships, simulated history, zombie evolution, flowing water, complex ecosystems, crafting trees, procedurally generated towns. Only revisit after the game is finished and fun.

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
  - Light: CONFIG.light.range (15, covers the whole screen) is how far anyone sees in the open on a clear day. world.light holds a 0-3 level per tile (src/sim/systems/light.js; all 3 for now, day/night is step 15). Eyesight 0-3 scales the range (vision.eyesightFactor): player 3 = full, zombie 2 = 0.35 (5 tiles; was half, 7, cut after playtesting: too easy to be spotted), so you usually see them first.
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
- Intentional: in daylight in the open, zombies see you (5 tiles) before they hear your footsteps (3). Hearing matters when they can't see you: round corners, behind walls, and at night (step 15). Don't "fix" this by tuning.
- Tests: strength per tile and diagonals; a footstep dies in a wall, a loud noise carries through muffled; a zombie behind a wall hears a loud noise, walks to it, searches and gives up; the newest noise wins; footsteps are heard round a wall 2-3 tiles off but not far off, waiting is silent; seeing beats hearing; the heatmap clears each action.

### Playtest: too easy to be spotted (after step 6) - built
- "Remember the main rule of this game is fun": being spotted from 7 tiles on an 11-wide screen meant nearly always being caught, with no room to sneak. Two changes:
  - Zombie sight 7 -> 5 tiles (vision.eyesightFactor[2] = 0.35).
  - Glimpses (zombie.glimpseRange = 2): a zombie that first catches sight of you further off than 2 tiles stops and stares (spends that action, ? badge, Brain.goal why 'glimpsed', prey_glimpsed). If it still sees you on its next look, it has spotted you (!, prey_spotted) and comes. If you've ducked out of view, it only shuffles over to check the spot, then searches and gives up. A stare costs zombie.glimpseCost (50) energy, half an action, so it looks again sooner: you get one move to get out of sight (two felt too generous in playtesting). Within 2 tiles there's no stare: it comes at once.
- Tests: stay in view: glimpse, then spotted one move later; one move to cover: never spotted, it goes to check; two moves to cover: too slow; within 2 tiles: comes at once.

### Step 7 (stealth) - built, then dropped
- Built a SNEAK toggle (silent footsteps, 2x slower steps, noticed from two-thirds of the distance) and bush tiles (walkable, see-through, hide anything in them except from next to it). Playtest: "Sneaking makes it too easy to lose them and so do bushes. I'm not sure what it adds to the game." On top of the ? stare and 5-tile zombie sight, losing a zombie became a formality with no real choice. Removed both (git revert of the step 7 commit; it's in the history if ever wanted).
- So: cover comes from walls (later buildings, doors, cars); the ? stare is your one chance to react; your footsteps always make noise. Getting the drop on a zombie (step 8 sneak attacks) means reaching it while it hasn't seen you: from behind cover, or while it's busy with a noise.
- The action bar is empty again until step 8 (shove).

### Step 8 (combat: hearts, knockback, shove) - built
- Playtest direction before building: "I don't want sneak attacks or bleeding; we keep it simple: health hearts that lose half a heart an attack at a time."
- Health is a whole number of half-hearts (Health { hp, max }). You have player.hearts = 3 (6 halves), drawn as blocky red hearts in the top bar after the turn number (half-filled for a half). Every hit takes damage = 1 (half a heart). No misses, no bleeding, no bonus damage.
- Melee (src/sim/systems/combat.js): walking into any creature with Health attacks it (the input stays a move; it takes a turn). Melee { damage, knockback, noise } is a component, so anything with it can attack anything with Health. Your melee (your walking stick until items, step 9): 1 damage, knocks the target back a tile (if that tile is free; into a wall it stays put), noise level 2, so fights draw other zombies. A zombie's bite: 1 damage (half a heart), no knockback, noise 2. Zombies have 3 health: three hits.
- A zombie bites when it's next to its prey (4 ways) and it was already tracking it on its last look, so never on the action it first spots you (it reacts first): you always get to act. A hit or a shove makes the target notice who did it.
- Knockback without stagger (balance): with knockback AND a stagger, a zombie could never bite (each hit cost it two actions at half speed); 300 one-on-one and 300 three-on-one fights were all won without a scratch. Now knockback.staggerActions = 0: a hit costs it the action of walking back. Measured (a bot that just hits whatever is next to it, open room): one zombie: always won, no damage; three at once: always won, about 1.5 hearts lost; five at once: always dead. One is manageable, a crowd is deadly. A zombie knocked into a wall or another zombie stays next to you, so corners are dangerous.
- Shove (SHOVE button in the action bar; F on a keyboard): tap SHOVE (it turns orange, "SHOVE: TAP A WAY"), then tap a direction like moving. Tapping yourself cancels; a direction with nothing there says "Nothing to shove there." and costs no turn. The input is { type: 'shove', dx, dy }. The creature is pushed a tile directly away and staggered (loses its next action, shove.staggerActions = 1), unhurt; if the tile behind is blocked it slams into it instead and takes shove.slamDamage = 1. Shoving is quieter than hitting (noise 1).
- Staggered { actions } is a general component: the scheduler still charges the time, but the action is wasted (entity_lost_action). Forced movement goes through pushEntity(), which emits entity_pushed (later water, fire and the like can react to where things land).
- Death: a creature is removed and leaves a corpse (a "zombie corpse" thing: walkable, remembered, inspectable "A dead zombie. Deader, anyway."). If you die, world.gameOver = { cause, killerName, turn }, the world stops and nothing else takes a turn. For now a plain placeholder: the map darkened, "YOU DIED", the cause ("Bitten by a zombie."), turns lasted, and "Tap to start again" (taps ignored for ui.deathTapDelayMs = 1 s). The real game over screen is step 11.
- Attacks and shoves reach all 8 neighbours; movement stays 4-way (playtest: "attacking should be 8 directions even if movement is 4"). Same for zombies: they bite diagonally. Not through a gap squeezed between two walls meeting at a corner (combat.js inReach uses the sight rule). Tapping a creature you can see diagonally next to you hits it (or shoves it, when armed); tapping an empty diagonal tile moves you 4-way as before; a diagonal input with nothing there takes no turn. Knockback and shoves push along the line of the blow, so diagonally too. "The zombie is next to you!" now counts diagonals.
- Messages: "You hit the zombie.", "The zombie bites you!" (danger), "You shove the zombie.", "It slams into the wall.", "The zombie goes down.", "You died."
- Tests: 3 hearts; a hit does 1, knocks back a tile, is heard 5 tiles off; into a wall it stays put; three hits kill and leave a walkable, remembered corpse; no bite on the action it spots you, then half a heart per bite, six kill you, then nothing takes a turn; shove pushes and staggers unhurt, slams into a wall for 1, nothing there costs no turn; the fight numbers above. Random play now has a normal run (you can die; replays must match exactly, health and death included) and a stress run with an unkillable player.

### Step 9 (items and the bag) - built
- Items (src/sim/systems/items.js): an item is an entity with Item { type } + Glyph + Name. On the map it has a Position; carried, it has none. Item types are data in CONFIG.items; effects are properties, not special cases: size [w, h] (squares in the bag), heal (half-hearts), weapon { damage, knockback, noise }, verb (the use button's word).
- So far: walking stick (/, 1x3, 1 damage, knockback), cricket bat (/, 1x3, 2 damage, knockback: a zombie in 2 hits), tin of beans (%, 1x1, heals half a heart for now: hunger, step 16, will give food its real job), bandage (+, 1x1, heals a heart; bandages heal rather than stop bleeding, since there is no bleeding).
- The bag is a grid, a little like Tetris (playtest: "different items are different sizes in the bag"). Inventory { cols, rows, items: [{ id, x, y, w, h }], hand }: player.bag 5 x 4 squares (was 4 x 3; playtest: "we should be able to fit a few more items in there"). The panel's squares shrink to fit smaller phones (64 px at most, 36+ on a 320 px-wide phone). A new item goes in the first free spot that takes its shape, row by row, upright or turned on its side; if no spot is free but the squares would fit after rearranging, the bag tidies itself (repacks everything, biggest first; bag_tidied). It's only refused when it can't fit at all. (Dragging items to rearrange by hand could come later.)
- What you hold is in your hand, not in the bag (playtest: "wielded items are not in the bag when they are in hand"). Inventory.hand: you start holding the walking stick with an empty bag (player.startHolding). HOLD takes a weapon from the bag into your hand, and what you held goes into the bag (refused, no turn, if it won't fit: "No room in the bag for the ..."). STOW puts the held weapon in the bag (same refusal). You can DROP what you hold. Bare hands (nothing held): 1 damage, no knockback, as the guide says. meleeStats(): the held weapon's numbers replace the Melee component's.
- Picking up: walking onto an item picks it up as part of the step, free, into the bag. If it won't fit it stays there ("No room for the ..."), except a weapon with your hands empty, which you carry in hand. Tapping yourself while standing on an item picks it up (a turn) instead of waiting. Inspecting your own tile: "You're on a bandage."
- The test screen scatters beans, beans, a bandage and a cricket bat (testScreen.items) on open floor.
- BAG is the second action-bar button (orange while open). The Teletext-blue panel over the map shows: BAG and CLOSE; IN HAND (the held item, or "Bare hands"); IN THE BAG, the grid with each item drawn as a block over the squares it takes; then the selected item's name and two big buttons: use (EAT / USE / HOLD / STOW) and DROP. Tap an item (in hand or in the grid) to select it. Opening and selecting take no turn; use and drop take a turn and close the bag so you see what happened. Healing at full health is refused with no turn ("You're not hurt.").
- Inputs: { type: 'pickup' }, { type: 'use', itemId }, { type: 'drop', itemId }, all recorded; item ids and bag placement are deterministic, so replays match. Random play includes them.
- Draw order: things (corpses, items) first, then creatures, then you on top. Items lying about are remembered by map memory. Inspect puts a creature you notice before an item on the same tile.
- Messages: "You pick up the cricket bat.", "No room for the ...", "No room. You carry the ...", "You drop the ...", "You hold the ...", "You put the ... away.", "You eat the beans. Cold.", "You bandage yourself up.", "You're not hurt." Inspect: "A tin of beans. Cold, but beans.", "A bandage. Fairly clean.", "A cricket bat. Well oiled.", "A walking stick. Sturdy."
- Keyboard: I or B bag, G pick up.
- Tests: you start with the stick in hand and an empty bag; the test items are on the floor; stepping onto an item picks it up in the same turn; the bag is the configured size and its panel fits on five phone sizes, full, with tappable squares; shapes fill a 4x3 grid exactly (3 bats, beans, 2 bandages) with no overlaps (the mechanics tests pin a 4x3 bag); a full bag leaves it; drop and pick up; HOLD swaps the bat into your hand and the stick into the bag; stowing into a full bag is refused; dropping what you hold leaves bare hands; a fragmented bag tidies itself to fit a bat; a weapon with no room goes into empty hands; healing refused at full health, a bandage heals a heart and is used up; items on the floor are remembered.
- Item sizes: tried sizing items up (a tin 2x2, a bat 2x8, in a 10x8 bag); playtest: "keep the bag small and how you had it; we'll work out sizes and the bag later." Back to 5x4 with 1x3 / 1x1 items for now.

### Step 10 (throwing) - built
- Throwing (src/sim/systems/throwing.js): any carried item, from the bag or your hand. It lands on the target tile and clatters there: makeNoise at the landing spot, level throw.landNoise = 2 (heard about 7 tiles off), so a zombie that isn't already after you goes to look. A tin of beans is a lure.
- Targets (validThrowTargets / canThrowTo, one rule for the sim and the highlight): within throw.range = 6 tiles, a tile you can see, with a clear straight line (lineClear), not a wall. Creatures in the way are ignored (it's lobbed).
- A creature on the target tile is hit (no misses): it takes the item's throwDamage (tins, the stick and the bat 1; bandages 0) and notices the thrower (it now knows where you are, so throwing at a zombie draws it to you rather than luring it away). The item drops at its feet. Thrown items stay where they land, so you can go and get them back.
- Controls: in the bag, a selected item has three buttons: use, THROW and DROP. THROW closes the bag and starts aiming ("Tap where to throw it."): valid tiles are tinted yellow, ones with a creature orange; the action bar becomes one big CANCEL THROW. Tap a tinted tile to throw (a turn). Tapping yourself or CANCEL backs out with no turn; tapping anywhere else says "Can't throw there." and keeps aiming. If there's nowhere to throw, it says "Nowhere to throw it." and doesn't aim.
- Input { type: 'throw', itemId, x, y }, recorded; random play includes throws.
- Messages: "You throw the tin of beans.", "It hits the zombie." Cause of death if a thrown thing ever kills you: "Hit by something a ... threw."
- Tests: range 6, not into or through a wall, one rule for targets; out of range refused with no turn; a throw takes a turn, the tin lands and leaves the bag, it clatters at level 2, and a zombie behind a wall hears it and goes to look; throwing at a zombie hits for 1 and it tracks you, the tin at its feet; you can throw what you hold.

### Playtest: throwing didn't change what zombies did (after step 10) - built
- "Throwing didn't make a difference to the zombies' movements." Cause: seeing always beat hearing, and a zombie after you (!) ignored noises, so in a small room the clatter was overridden at once.
- Distraction (zombie.distractLevel 2, distractActions 1; 3 was tried and was "too powerful a distraction"): a zombie that hears a loud noise (level 2+: a thing landing, a fight) turns to it for its next move (Brain.distracted), heading for the noise even if it can see you and even if it was after you (it drops the !, shows ?). It snaps back to you if you're within zombie.glimpseRange (2), so you can't throw a tin mid-fight to escape a bite. Quiet noises (footsteps, a shove) don't distract. Being hit or shoved cancels it (the hit one turns on you). When the distraction ends it follows the normal rules: if it sees you again it stares (?) before coming.
- Throwing at a zombie: the clatter happens first, then the zombie that was hit turns on the thrower, so a direct hit still draws it to you.
- Fight balance unchanged (one/three/five zombies: same numbers).
- With 1 move: the zombie steps toward the noise, then has to spot you again with the usual stare: about 3 of your turns in all, enough to step out of sight, not to stroll off.
- Tests: a quiet noise doesn't distract a zombie that's after you; within 2 tiles a loud noise doesn't pull it off you; a tin thrown past a zombie that's after you distracts it: its next move is toward the tin and away from you though it could see you, then it's back to normal, and when it spots you again it stares first.

### Step 11 (save/load + game over) - built
- Time (src/sim/time.js): the clock runs on scheduler ticks, so slow actions take longer. CONFIG.time.minutesPerTick = 2 (a day is 720 ticks); a run starts at 08:00 on day 1 (time.startHour), the bank holiday Saturday. Helpers: dayOf(tick), clockOf(tick) -> "HH:MM", daysSurvived(tick) (full 24 hours since the start). Day/night (step 15) builds on this.
- The top bar now starts with the day and clock ("D1 08:24") instead of the turn number; the turn number is in the debug view ("T12 tick N seed S"). After death the clock shows the moment you died.
- Save/load (src/sim/save.js, pure sim; main.js stores it): the whole game state as JSON: seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact state, tiles and light, stats, game over, and every entity with all its components (map memory, bag, brain, stagger...). Not saved, rebuilt on load: event wiring (createWorld installs it, then the save is poured in), the player's view (recomputed), the noise heatmap. A loaded game plays on exactly like the original (tested on 20 seeds). A save is ~10-20 KB on the test screen.
- Autosave: main.js saves to localStorage (CONFIG.save.key) after every action that reaches the sim; on start it loads the save if there is one. ?seed=N in the URL always starts that seed fresh. Dying deletes the save, so reopening after death starts a new run. If storage is blocked or full, the game plays on unsaved.
- Save version: CONFIG.save.version (1). Bump it whenever the saved shape changes in a way old saves can't be read with. A save from another version, or one that fails to load for any reason, is discarded and a fresh game starts with "Old save lost. New game." - never a crash.
- Run stats: world.stats.kills counts zombies the player puts down.
- Game over screen (replaces the step 8 placeholder): the map darkened, "YOU DIED", a deadpan cause of death, when ("Day 1, 08:44"), days survived, zombies put down, turns, the seed, and "Tap for a new game" (taps ignored for the first second). Plain greybox for now; the final look (e.g. a Teletext page) is decided at the art pass.
- Causes of death (messages.js deathText): a few wordings per cause, picked from the seed and turn so the same death always reads the same: bite: "Bitten by a zombie, walking stick in hand." / "..., empty-handed." / "Eaten by a zombie. Mostly." / "Bitten by a zombie. It was nothing personal."; shove: "Slammed into a wall. The wall was fine."; thrown: "Hit by something a ... threw. Unlucky." world.gameOver records cause, killer, what you held, turn and tick.
- Tests: the clock (08:00 start, 2 minutes a tick, midnight is day 2, a full day survived); a save taken mid-run and loaded plays on exactly like the uninterrupted run on 20 seeds; a save is small and the view is rebuilt; old-version, broken, empty and player-less saves are refused; kills count; game over records when and what you held; the cause wording is steady and deadpan. The drawing smoke test draws a game over screen.
