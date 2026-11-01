# Zombie Survival Sim — Project Guide for Claude

## The game
A 2D, turn-based, tile-based zombie survival game set in a procedurally generated UK Lake District: villages, woodland, fells, lakes, tarns, streams, roads and bridges. After the player takes a turn, the world and everything in it takes its turn. The goal is lots of simple systems that interact, so interesting and often funny stories emerge on their own (in the spirit of Dwarf Fortress and Brogue).

Goal: survive as many days as you can.

Look: simple 8-bit, inspired by old RPGs and UK Teletext. Until the art pass, everything is greybox: plain coloured squares and letters.

## Design pillars
1. Systems over scripts. Behaviour comes from rules interacting, never from one-off special cases. Feuds, affairs and murders are never scripted; they emerge from needs, traits, relationships, memory and ownership.
2. Every action has consequences. Noise, smell, light, fire, water and time spread through the world and other things react.
3. Show, don't tell. Stories come from what the player sees on the map, not lore or text. Keep on-screen text minimal.
4. 8-bit simple. Every system must be readable as a tile, a colour, a blink or a one-line status message. If it can't be, simplify the system; don't add UI. Use coarse values (levels 0–3, not percentages). NPCs get a few traits from a short list.
5. It must make sense. The world has ended: no services, deliveries or working infrastructure unless something in the simulation explains it. Comedy comes from people, animals and zombies keeping old habits, never from things that couldn't plausibly still be running.

## Platform and workflow
- Offline, single player only. No servers or accounts.
- Built entirely from a phone with Claude Code. Play-tested in a mobile browser.
- Stack: plain JavaScript (ES modules), HTML canvas, rot.js (scheduler, FOV, pathfinding, noise, map gen). No build step unless needed.
- Deploys to GitHub Pages on every push to main.
- Touch-first controls: tap anywhere to step one tile in that direction (8-way), tap on yourself to wait, long-press any tile to inspect it. Big tiles with the camera following the player. Portrait orientation.
- One system per session. Before finishing, the game must load and be playable, the headless test run must pass, and the change must be committed.

## Architecture rules
- Simulation is separate from rendering. src/sim/ never touches the DOM or canvas. src/render/ only reads world state.
- Entities + components. Everything (player, zombie, sheep, door, tin of beans, fire) is an entity with data components (Position, Health, Flammable, Noisy, Hunger, Blocks, Owner...). Systems act on any entity with the right components.
- Interactions come from shared properties: fire burns anything Flammable, zombies follow any Noise, herds flee any Fear source. No "X vs Y" special cases.
- Energy/speed turn scheduler, so slow things act less often.
- Event bus: systems emit events (noise_made, entity_bitten, door_broken, theft_seen...) and others subscribe. Internal plumbing only, not player-facing text.
- Seeded RNG for everything. Record all player inputs per turn, so any run can be replayed exactly from seed + inputs.
- All tuning numbers and rarity chances in src/config.js.
- Debug overlay: turn, seed, selected entity's components, and heatmaps for noise/scent.
- Headless test runner: the sim can run N turns without rendering to catch crashes and runaway behaviour.

## Folder layout
- index.html
- src/main.js (boot, input, loop)
- src/config.js
- src/sim/world.js, scheduler.js, events.js
- src/sim/systems/ (one file per system)
- src/sim/gen/ (procedural generation)
- src/render/greybox.js (later: teletext/8-bit)
- src/render/ui.js (status bar, HUD)
- src/render/messages.js (turns events into status-bar text)
- src/lib/ (vendored third-party code, when needed)
- tests/headless.js
- docs/interactions.md

## Roadmap (build in order; keep it playable after each step)

Phase 1 — Core loop (plain test grid)
1. Grid + player moves by tap + turn loop
2. Scheduler + one zombie that shambles toward the player
3. Event bus + one-line status bar
4. Field of view / line of sight
5. Map memory (seen tiles stay drawn, greyed out) + long-press to inspect a tile
6. Noise: actions make noise, zombies investigate
7. Stealth: sneak mode (slower, quieter) and hiding spots
8. Health, wounds, bleeding, simple melee (any creature can attack any other)
9. Ranged and thrown weapons; gunshots are very loud
10. Items and inventory
11. Materials: walls, doors, windows, barricades with HP
12. Save/load: autosave to localStorage every turn; resume on reopen
13. Game over: Teletext-style death screen (Ceefax page) showing days survived, cause of death, kills and seed

Phase 2 — One village (the MVP)
14. Generate one small village: pub, corner shop, church, cottages, phone box, allotments, lane, stream, bridge, trees, hedges, dry-stone walls
15. Day/night + light sources
16. Hunger, thirst, fatigue
17. Weather (rain, fog, snow) + getting wet and cold; weather affects sight, noise, scent and fire
18. Scent + tracks in mud/snow (you can track and be tracked)
19. Fire, smoke and explosions (gas bottles, car fuel)
20. Water: dirty water makes you ill, streams flood and wash out bridges, lakes freeze and ice can break
21. Death replay: on death, replay the whole run sped up from above
22. Watch mode: run the world with no player

Phase 3 — Living world
23. Animals: sheep herds, deer, foxes, dog packs, geese, crows. Herds stampede when scared; packs hunt; crows circle the dead
24. Plants, foraging, fishing, cooking (simple two-ingredient recipes)
25. Days since outbreak: food rots, power fails, gardens overgrow, livestock goes feral
26. Seasons: autumn, winter snow and ice, spring lambs; affect food, weather and animals
27. Zombie traits: return to old haunts (home, pub, church), rot and slow over time, sluggish in cold, form wandering hordes
28. Noise makers: car alarms, church bells, generators, barking dogs, beehives
29. Building and crafting: barricades, traps, veg patches, rain collectors (short recipe list)

Phase 4 — People
30. NPCs: 2–3 traits from a short list (brave, greedy, kind, drunk, paranoid, nosy, honest), needs, a home, a goal
31. Relationships, memory, ownership and witnesses (stealing seen = grudge)
32. NPC violence: NPCs fight, flee or surrender based on traits, morale and grudges; they defend against zombies, fight each other over grudges, theft or food, and can kill. Witnessed violence creates grudges and changes faction reputation
33. Hidden infection: bitten NPCs may hide it; suspicion and accusations
34. Factions: villagers, bandits (bridge tolls, raids), church cult (rings bells for the dead); reputation with the player
35. Morale and drink: NPCs can break down or get drunk; booze as trade goods
36. Legacy: when you die, continue as another survivor in the same world

Phase 5 — The region
37. Region map: fells, valleys, lakes, tarns, woods and villages joined by roads and bridges; travel between areas; hordes and herds move between them
38. Simulation LOD: nearby areas simulate fully, distant areas are simulated roughly
39. Daily seed: date-based seed so each day has its own world; shareable result text (offline)

Phase 6 — Polish
40. Sound: simple 8-bit sound effects
41. Art pass: 8-bit tiles + Teletext UI (blocky font, 8-colour palette)

Phase 7 — Moonshot systems
42. Zombie evolution: zombies have inherited hearing/sight/smell stats (0–3); bites pass the biter's stats on with small mutations, so populations adapt to the player's tactics
43. Pre-simulated history: before the player spawns, run the world headless for ~30 days so it starts with existing damage, factions, feuds and camps
44. Flowing water: tile-by-tile flow; rain fills tarns, streams overflow; dams can be built and broken
45. Avalanches and rockfalls: snow builds on fells in winter; loud noises or stampedes trigger slides
46. Food chain: grass, herds, predators, zombies, scavengers; populations boom and crash
47. Living villages: NPC groups farm, fortify, trade, raid and collapse without the player
48. Knowledge: skills learnt by doing and taught to others; lost if no one learnt them
49. Inheritance: homes, items and grudges pass to family when someone dies

Phase 8 — Fun moonshots
Rule: the core game is grim survival. Comedy comes from rare events and odd sightings, not constant gags. Rarity chances live in config.js.

Rare (small chance per run or per area):
- Zombie ice cream van: chime stuck on, roams lanes as a moving noise source; player can drive it to lure hordes
- Zombie Morris dancers: ankle bells make noise as they move, warning the player
- Village fête: villagers hold it anyway; band and crowd make huge noise
- Furious goose: most geese just honk (noise) and keep their distance; the odd one has a "furious" trait and chases anything nearby. Geese can't be infected
- Ringing phone box: rings at night (noise), drawing nearby zombies
- Bonfire Night: if a run reaches 5 Nov, villagers light a bonfire; fireworks found in sheds act as noise/light distractions and can start fires
- Carol singers: at Christmas a choir does its rounds, making noise at each door
- Caravan jam: a caravan blocks a narrow lane; can be looted or used as a tiny base

Occasional:
- Fell walkers: hikers ignore the apocalypse and keep walking the fells; later appear as zombies
- Drunk zombies: zombies infected at the pub stagger randomly
- Queueing: NPCs and zombie shoppers sometimes queue outside shops (habits)
- Curtain twitchers: "nosy" NPCs watch from windows and act as witnesses
- Honesty box farm stalls: honest NPCs pay, greedy ones don't; taking without paying while seen creates grudges
- Allotment feuds: NPCs compete for plots and sheds as a food source
- Sunday roast: villagers gather on Sundays; the cooking smell draws zombies
- Foxes knock over bins at night (noise, false alarms)

Always available (player tools):
- Tea: restores NPC morale; kettles whistle (noise); running out of tea crashes village morale
- Gut disguise: zombies ignore you while covered; rain washes it off
- Brolly: keeps rain off (protects gut disguise), weak weapon
- Decoys: scarecrows and gnomes fool zombies with poor sight
- Weapons: cricket bat, garden fork, walking stick, golf club

Interaction check: every new system must read from or affect at least one existing system. Keep the list in docs/interactions.md.

## MVP scope
Phases 1–2: one village, survive as many days as you can. When that's fun in greybox, carry on.

## Decisions
- Larger tiles for thumb-friendly tapping.
- The camera follows the player and scrolls the map.
- Scheduler is our own small energy scheduler (src/sim/scheduler.js), not rot.js's: rot.js uses its own global RNG, which would break seed + inputs replay. Each tick every Actor gains `speed` energy; acting costs 100. Player speed 100 (one action per turn), zombie speed 50 (acts every other turn). Actors act in entity-id order so runs are deterministic.
- Zombie movement is a greedy step toward the nearest entity with a Prey component (not just "the player"), with a small random stagger chance. Proper pathfinding waits until it's needed.
- Bumping a zombie does nothing and costs no turn until melee arrives (step 8).
- Event bus (src/sim/events.js) is synchronous and lives on the world. Event types and payloads are listed at the top of that file. Events carry data only; all player-facing wording lives in src/render/messages.js, which subscribes to the bus.
- Status bar: one line at the top. Turn number (T12) on the left, then the latest message. A new player action clears the line; if several things happen in one turn, the most important message wins (danger > blocked > bump > info). Danger messages are yellow. With no message, the seed shows dimmed on the right.
- Messages for now: "You wait.", "A wall blocks the way.", "The zombie is in the way.", "The zombie is next to you!" (when any actor newly ends a turn adjacent to the player). Keep messages under ~30 characters so they fit a phone screen.
- Field of view is our own strict line-of-sight check (src/sim/systems/vision.js), not rot.js: rot.js's shadowcasting let you see through diagonal gaps between walls and round corners. A tile is visible if the straight line between tile centres hits no wall; a line squeezing between two diagonal walls is blocked. Sight is symmetric: if you can see a zombie's tile, it could see yours given the range. Wall faces next to visible floor are shown so walls don't look patchy. rot.js stays available for later (pathfinding, map gen) but nothing is vendored until it's used.
- Vision has two separate parts. (1) Line of sight: blocked by opaque tiles (walls, later obstacles like hedges and trees); it has no distance limit of its own. (2) Light: CONFIG.light.range sets how far anyone can see in the open (clear day = 15, enough to cover the whole portrait screen), and world.light holds a 0–3 light level per tile (all 3 on a clear day). Day/night and weather will lower both. Every creature has eyesight 0–3 that scales the light range (factors in config): player 3 = full range, zombie 2 = half, so you usually see them first.
- Zombies only chase what they can see. Out of sight, a zombie walks to where it last saw you, then gives up and shuffles about at random.
- Until map memory (step 5), anything outside your view is drawn black.
- New messages: "A zombie comes into view." and "The zombie has seen you!" Both only fire for zombies on your screen: light range reaches past the sides of the portrait screen, so the message log (render side) checks the camera, not just the sim's line of sight.
- Visibility is a level per tile (0–3), not on/off, and it comes from light, not distance: a tile in line of sight and within range has visibility = its light level; otherwise 0. On a clear day everything in sight is level 3. A creature is only noticed if its tile is at or above vision.minLevelToSpot (1 for now); stealth can raise this later. You always see your own tile.
- Greybox rendering of visibility: level 3 full colour, 2 and 1 slightly darker (black overlay, alpha in config), 0 black. The art pass will use dithering for levels 2 and 1 instead of plain darkening.
- Map memory lives in the sim (src/sim/systems/memory.js), not the renderer. A Memory component (on the player for now) keeps a snapshot of each tile as it looked when last seen: terrain plus any non-creature things on it (items, doors...), and later damage, door state and barricade HP (add new tile state in snapshotTile()). Never the live tile. A snapshot only updates while the tile is in view (whenever the viewer's sight changes, and at the end of every turn), so the remembered map can be out of date: beans someone moved are still where you last saw them until you look again. Creatures are never remembered. Snapshots are plain data so they can be saved (step 12).
- Rendering memory: tiles out of sight are drawn from their snapshot, greyed out (own grey colours in config), with remembered things as grey letters. Never-seen tiles are black.
- Long-press (hold still for input.longPressMs = 450 ms) inspects the tile under your finger: a one-line description in the status bar plus a white outline on the tile, and a short phone vibration where supported. Inspecting takes no turn and isn't recorded as input. The next action clears it.
- Inspect wording (src/render/messages.js describeTile): in sight shows the creature there if noticed ("A zombie."), else the top thing on the tile ("A tin of beans."), else the terrain ("A wall.", "Open ground."); your own tile is "That's you.". Out of sight shows the remembered snapshot, never the live tile, plus ", out of sight". Never seen is "Unexplored."
- Noise (src/sim/systems/noise.js): makeNoise(x, y, level 0–3) is the one entry point. Level sets starting strength (radiusByLevel 0/4/8/12 in config); strength drops 1 per tile (8 directions) and by noise.wallCost (3) when passing through a wall, so walls muffle rather than block; the map edge blocks. Quiet noises die in a wall, loud ones carry through.
- Hearing is a 0–3 level per creature (Hearing component), like eyesight: it sets the weakest strength still heard (noise.minStrengthToHear). Zombies have good ears (3) and poor eyes (2); the player hears at 2.
- What makes noise for now: walking, via a Noisy { move } component (player footsteps level 1, about 3 tiles in the open; zombies 0, shuffling quietly). Waiting is silent. Bumping a wall makes no noise, because it takes no turn and would be a free lure. Later systems (fights, gunshots, doors, sneaking) call makeNoise or change Noisy.
- Zombies that hear a noise set their goal to its source and walk there, then give up (noise_investigated). The newest noise wins; seeing prey always wins over hearing. Brain.goal = { x, y, why: 'seen' | 'heard' } replaces lastSeen.
- No status message for hearing: you see the zombie turn toward you (show, don't tell).
- Debug: tap the top bar to toggle the noise heatmap (orange overlay with strength numbers, showing noise since your last action, including tiles out of sight). Takes no turn. world.noise holds the heatmap.
- Intentional: in daylight in the open, zombies see you (7 tiles) well before they hear your footsteps (3 tiles). Hearing matters when they can't see you: round corners, behind walls, in the dark. Night (step 15) will shrink sight and make hearing their main sense. Don't "fix" this by tuning.
