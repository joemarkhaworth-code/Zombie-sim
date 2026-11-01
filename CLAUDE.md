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
- src/lib/ (vendored third-party code, e.g. rot.js FOV files)
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
- Field of view uses rot.js recursive shadowcasting, vendored unmodified into src/lib/rot/ (only the files needed, with its BSD licence). No npm or build step.
- Sight is for every creature, not just the player: anything with a Vision component has a sight level 0–3 (radius 1/3/5/7 tiles, in config). Player sight 3, zombie sight 2, so you usually spot a zombie before it spots you. Opaque tiles (walls) block sight; creatures don't.
- Zombies only chase what they can see. Out of sight, a zombie walks to where it last saw you, then gives up and shuffles about at random.
- Until map memory (step 5), anything outside your view is drawn black.
- New messages: "A zombie comes into view." and "The zombie has seen you!" (the second only if you can see the zombie when it happens).
