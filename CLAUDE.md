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

## Scale
Use this everywhere: generation, buildings, objects, and anything placed on the map. The numbers live in CONFIG.scale (src/config.js); code reads them from there, never hard-codes sizes.
- 1 tile is about 1.5 m, about one person. Walls take up whole tiles.
- Objects and buildings are true scale. The countryside is compressed: fields are 10–20 tiles across, and villages are 60–120 tiles apart (region map, step 37).
- Sizes are width × length in tiles. A building's size is its outside, walls included. Width is the frontage (the side facing the street or yard) and length runs back from it. The generator may turn a building to fit (the church lies along the street).
- Objects:
  - bed 1×2, sofa 1×2
  - table 1×1 or 2×1
  - car 3×2, van 4×2, tractor 3×2, caravan 4×2
- Buildings:
  - shed 3×3, greenhouse 3×4
  - terraced cottage 5×7
  - detached cottage 7×9, farmhouse 7×9
  - corner shop 6×8
  - pub 10×12
  - church 9×18
  - barn 8×12
- Ways (widths):
  - ginnel 1, pavement 1
  - lane 2–3, main road 4–5 (picked per map from the seed)
  - bridge 3 (narrower than the road; the road pinches onto it)
  - beck 2–3
  - wall 1, hedge 1

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
9. Items and inventory
10. Ranged and thrown weapons; gunshots are very loud
11. Materials: walls, doors, windows, barricades with HP
12. Save/load: autosave to localStorage every turn; resume on reopen
13. Game over: Teletext-style death screen (Ceefax page) showing days survived, cause of death, kills and seed

Phase 2 — One village (the MVP)
14. Generate one small village: pub, corner shop, church, cottages, phone box, allotments, lane, stream, bridge, trees, hedges, dry-stone walls
    - 14a. Land, generated in layers: valley + beck + fellside, main road + stone bridge, high street (pavements, terraced plots), ginnels + back lanes + walled yards, green + church graveyard, outskirts (farms, walled fields, footpaths, trees, a wood); buildings left as empty plots
    - 14b. Buildings on the plots: cottage, pub, shop, church, shed, greenhouse - walls, doors, windows, rooms; materials chosen per building
    - 14c. Upstairs and cellars: small separate maps reached by stairs or ladders; ladders can be pulled up
    - 14d. Village life: phone box, allotments, loot by building type, zombies placed around the village, play-test and tune
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
- Zombies that hear a noise set their goal to its source and walk there, search around it, then give up (noise_investigated). The newest noise wins; seeing prey always wins over hearing. Brain.goal = { x, y, why: 'seen' | 'heard' } replaces lastSeen.
- No status message for hearing: you see the zombie turn toward you (show, don't tell).
- Debug: tap the top bar to toggle the noise heatmap (orange overlay with strength numbers, showing noise since your last action, including tiles out of sight). Takes no turn. world.noise holds the heatmap.
- Tuning panel (src/sim/tuning.js + main.js): with the debug overlay on, a small orange TUNE button sits at the top right of the map. It opens a panel with -/+ rows for zombie speed, bite hit chance, bite damage, bite bleed chance, zombie health, search length, search radius, zombie eyesight, zombie hearing and light range (TUNABLES lists path, step, min, max). Changed values show yellow; RESET restores config.js defaults; CLOSE. Changes apply at once (syncWorld pushes zombie values into zombies already on the map; vision is recomputed) and are saved in localStorage under 'zombie-sim-tuning', separate from the game save, and applied to CONFIG at every boot. config.js stays the shipped default: when a tuned value feels right, copy it into config.js in a Claude session. Changing tuning mid-run means that run's inputs no longer replay exactly (it's a balance tool).
- Intentional: in daylight in the open, zombies see you (7 tiles) well before they hear your footsteps (3 tiles). Hearing matters when they can't see you: round corners, behind walls, in the dark. Night (step 15) will shrink sight and make hearing their main sense. Don't "fix" this by tuning.
- Sneaking (src/sim/systems/stealth.js): toggled by a big SNEAK button in a bottom bar (72 px, full width, yellow "SNEAKING" when on). Toggling takes no turn but is recorded as an input ({ type: 'sneak', on }) so replays match. While sneaking: each step costs 2x energy (zombies get twice the time), footsteps drop from level 1 to 0 (silent), and you can only be noticed from two-thirds of the usual distance (stealth.sneakNoticeFactor 0.67). Waiting costs the same as normal. A sneaking creature is drawn dimmer.
- Noticing (vision.js canSee) combines line of sight, light and distance: the target's tile must be in sight with light >= minLevelToSpot, and within sight radius x noticeByLight[light level] (1 / 0.67 / 0.34 for light 3/2/1) x stealth.sneakNoticeFactor if sneaking. Adjacent creatures are always noticed, even in pitch darkness (you'd bump into them; step 15), as long as no wall is between. The same rule works both ways: you don't see zombies you haven't noticed (they aren't drawn).
- Hiding spots: bush tiles (TILE_INFO cover: true) are walkable and see-through, but anything standing in one can only be noticed from an adjacent tile. Works for zombies too: a zombie in a bush is invisible until you're next to it. Creatures in a bush are drawn with leaf marks over them. Test grid scatters a few bush clumps (config testGrid).
- Bottom bar (action bar) holds big buttons side by side, split evenly: SNEAK (toggle) and SHOVE (one-shot). The map area shrinks to fit between the status bar and it. Add future actions here rather than new UI.
- Sneaking and bushes stop you being noticed; they don't shake off a zombie that already has you in view (it watched you duck into the bush). A zombie that saw you on its last look keeps tracking you at its normal range, ignoring sneak and cover, while you stay in line of sight. To lose a pursuer, break line of sight with walls first, then hide.
- When a zombie loses you (or reaches a noise), it goes to the last known spot and searches: shuffles about within 3 tiles of it for 12 moves (zombie.searchActions / searchRadius, ~24 of your turns) before giving up, so it can stumble onto you hiding nearby. Any new noise it hears (mid-search or not) replaces its goal and restarts the hunt there.
- Health is a whole number (Health { hp, max }): player 6, zombie 4. Shown in the top bar as one red block per point (dark when lost), between the turn number and the message. The blocks blink while you're bleeding.
- Melee (src/sim/systems/combat.js): moving into any creature with Health attacks it instead of moving; it takes a turn. Any creature with a Melee component can attack any creature with Health. Melee { damage, hitChance, woundChance, verb }: player hit 1 dmg 80%, zombie bite 2 dmg 85% (see balance targets below). Rolls use the seeded RNG. The input is recorded as a plain move, so replays re-derive the attack. Zombies attack prey they can see when adjacent. Every swing makes noise level 2 (about 8 tiles), so fights draw other zombies.
- Wounds and bleeding (src/sim/systems/bleeding.js): a hit may wound, raising Bleeding level by 1 (max 3). Bleeding drains 1 health every 12/7/4 ticks (by level), drips blood each time, and may clot down a level (30% per drip). Runs per scheduler tick via an onTick hook. Zombies bleed too.
- Blood: world.blood is a 0–3 level per tile, drawn as red spots (more for higher levels). It's tile state, so memory snapshots record it (greyed spots out of sight). Inspect: "Blood on the ground."
- Death: the creature is removed and leaves a corpse (a non-creature thing named "<name> corpse", walkable, remembered, inspectable). If the player dies, world.gameOver = { cause, killerName, turn } and the scheduler stops (world.fallenPlayer keeps the last view for the camera), and the death screen shows (see Game over below).
- Headless tests: the random-play runs now often end in death, so there's also a stress run per seed with an unkillable player for crash/runaway coverage.
- Draw order: things (corpses, items) first, then creatures, then the player on top, so you're never hidden under something you're standing on.
- Zombie balance targets (tested in headless.js): most attacks land (bite hitChance >= 0.8, now 0.85); 3-4 bites kill a healthy player (bite damage 2 vs 6 health = 3 bites, more like 3 with bleeding); bites usually draw blood (woundChance >= 0.6, now 0.7, higher than the player's). Zombies stay slow (half speed), so one-on-one with bare hands you still usually win (about 98% in a 300-fight sim) but lose ~2 health plus whatever the bleeding takes; the danger is numbers, being caught bleeding, and noise drawing more of them.
- Who strikes first: moving uses a creature's action, so a zombie that steps next to you can't also attack; at half speed you get two actions before its next one (checked in tests). If you step into reach of a zombie that's already watching you, it may swing first - fair, it was waiting for you.
- Reacting: when a zombie first notices prey (or is hit by something it hadn't noticed), its next action is a reaction (zombie.reactActions = 1): it stays put and groans (noise level zombie.groanNoise = 1, which other zombies can hear). So a zombie can never strike on the same action it notices you.
- Sneak attacks: attacking a creature that hadn't noticed you (a zombie that wasn't tracking you on its last look) always hits (melee.sneakAttackHitChance = 1) and adds melee.sneakAttackBonus = 3 damage, so a 4-health zombie dies in one blow. If it survives, it reacts before it can strike back. Status: "Sneak attack!". The player counts as aware of anything they can see.
- Shove (src/sim/systems/shove.js): tap SHOVE (turns orange, "armed"), then tap toward an adjacent creature; the direction works like movement (8-way, forgiving). Tapping yourself, tapping SHOVE again, or a direction with nothing shoveable cancels it, with no turn spent. The input is { type: 'shove', dx, dy } and takes a normal turn. The creature is pushed one tile directly away; if that tile is blocked (wall, creature, map edge) it slams into it instead and takes shove.slamDamage = 1 (the thing behind is unhurt). Either way it's staggered and loses its next action (shove.staggerActions = 1). Shoving makes noise level 1 and the target notices who shoved it. No damage bonus for shoving an unaware creature (that's what sneak attacks are for).
- Staggered { actions } is a general component: the scheduler still charges the creature's time, but its action is wasted (entity_lost_action). Any future system can stagger things.
- Forced movement hook: anything moved by force goes through pushEntity(), which emits entity_pushed { id, by, from, to, dx, dy }. Water, fire, ledges and the like subscribe to it and react to the destination tile, without knowing who pushed or why. Slamming emits entity_slammed { id, x, y, blockerId }.
- Other attack types (ranged, thrown) wait until weapons exist (step 10).
- Items (src/sim/systems/items.js): an item is an entity with Item { type, slots } + Glyph + Name. On the map it has a Position; carried, it has none and its id is in Inventory.items. Item types live in CONFIG.items as data; effects are properties, not special cases: food / drink (feeds / waters you, step 16), heal (+health), stanch (bandage: stops bleeding, used up, refused if you're not bleeding), weapon (wield/stow; replaces bare-hands melee numbers). Test items: tin of beans (%, food), bandage (+), cricket bat (/, damage 2), scattered on open tiles (CONFIG.testGrid.items).
- Inventory { items, capacity, wielded }: capacity is in slots (player 6; beans/bandage 1, bat 2). A full bag leaves the item on the tile ("Your bag is full.").
- Picking up: walking onto an item picks it up as part of the step, free. Tapping yourself while standing on an item picks it up (takes a turn) instead of waiting - for things you dropped or couldn't fit. Inspecting your own tile says "You're on a <item>."
- BAG is the third action-bar button. It opens an 8-bit list over the map (Teletext blue): header "BAG used/capacity" + CLOSE, one 56 px row per item with a coloured glyph, name, slots, and two big buttons: use (EAT / USE / WIELD / STOW) and DROP. Opening takes no turn. Use and drop take a turn and close the bag so you see what happened. Wielded item is marked "> name, in hand".
- Inputs: { type: 'pickup' }, { type: 'use', itemId }, { type: 'drop', itemId } are recorded; item ids are deterministic from the seed, so replays match. Random-play tests include them.
- Melee stats come from meleeStats(): a wielded weapon's numbers override the Melee component's.
- Your view is screen-shaped: the player's Vision has clip { x: tilesAcross/2 = 5, y: view.sightHalfHeight = 9 }, so you only see, notice and remember tiles the screen can show (light range 15 still sets the limit in the dark/fog later). Without this, you'd remember off-screen tiles and items you were never shown. The box is fixed in config, not measured from the device, so replays don't depend on the phone; taller screens just show a few extra dark rows. Zombies have no box.
- Throwing (src/sim/systems/ranged.js): any item can be thrown. BAG rows have three buttons (use, THROW, DROP); THROW closes the bag and starts aiming. Range throw.range = 6 (round), the tile must be in sight with a clear line and not solid. The item lands on the tile and clatters there (noise level throw.landNoise = 2, ~8 tiles), so throwing beans is a lure: zombies go to investigate the landing spot. If a creature is on the tile it may be hit (75%): any hit staggers it (loses its next action, throw.staggerActions = 1), and heavy items (slots >= 2: bat, guns) also do 1 damage. So a tin of beans is worth throwing at a zombie to buy a turn. Input { type: 'throw', itemId, x, y }, takes a turn.
- Guns are items with a `ranged` property and their own ammo (Item.ammo, shown in the bag). Wield one and a FIRE button (showing ammo, e.g. "FIRE 3") joins the action bar. The noise is at the shooter. Air rifle: range 8, 1 damage, quiet (noise 1), 10 pellets. Shotgun: range 4, 4 damage (kills a zombie), very loud (noise 3, ~12 tiles), 4 shells. Both work as clubs when wielded (1 damage). An empty gun clicks ("Click. Out of ammo."), no turn. Input { type: 'fire', x, y }. A shot hits the creature on the target tile; creatures in between are ignored for now. Guns don't get sneak-attack bonuses.
- Aiming (throw or fire): valid targets come from validTargets() (one rule for the sim and the highlight). Valid tiles get a yellow tint, ones with a creature orange. The action bar becomes one big CANCEL; tapping yourself also cancels; tapping an invalid tile says "Can't aim there." and keeps aiming. If nothing is in range it says so and doesn't enter aiming.
- Guns come with some ammo, and ammo items (box of shells, tin of pellets: ammoFor + rounds) load a carried gun of their type (USE shows LOAD; the emptiest gun; "No gun to load." otherwise). Found in the village (14d).
- Materials table (CONFIG.materials): stone, slate, brick, wood, glass, corrugatedMetal, thatch. Each has hp (blows to break at 1 damage), flammability 0-3 (does it catch fire and spread flames), heatDamage 1-3 (how fast fire wears it down even if it never catches - nothing is fireproof: glass shatters, slate splits, metal buckles, stone and brick spall; fire is step 19), seeThrough (does sight pass while intact), hitNoise and breakNoise (0-3), and glass has shards (leaves broken glass). Everything structural reads its numbers from here; nothing hard-codes them. CONFIG.build says what things are made of for now: walls stone, doors wood, windows glass, barricades wood (planks). A structure's material decides its health, whether it blocks sight (a glass door doesn't; a metal-sheet window does) and how loud each blow and the final break are (corrugated metal clangs at 3; thatch is a soft 1). Walls stay tiles with health in world.tileHp (nothing damages walls yet; explosions later). Doors and windows are entities (Structure { material, hp, max } + Door { open, locked, broken } or Window { broken }) standing on floor tiles in wall gaps, indexed in world.structures. Barricade { material, hp, max } soaks blows first. Their Blocks/Opaque/glyph/name are recomputed from state and material by refresh(), so memory snapshots record open/shut/broken/boarded automatically.
- Closed doors block movement and sight; open or broken doors block neither. Intact windows block movement but not sight; broken windows can be climbed through. Anything solid (closed door, window, barricade) also muffles noise like a wall and stops thrown items and shots (lineClear takes a blocking rule). A door or window changing state refreshes everyone's vision.
- Door controls: walk into a closed, unlocked door to open it (a turn, you don't move). Tap exactly on an adjacent door tile to toggle it open/closed ({ type: 'door', x, y }, a turn); tapping further in that direction walks through. A door can't be closed with someone in the doorway.
- Bashing is deliberate: tap exactly on an adjacent window, locked door or barricade ({ type: 'bash', x, y }, a turn) to bash it with your melee damage. Walking (tap-anywhere) into one never breaks it: no turn, just a hint ("Tap the window to smash it.", "Locked. Tap it to bash it.", "Boarded up. Tap it to bash."). This stops stray taps smashing windows. Each blow makes the material's hitNoise; the final blow its breakNoise (glass 3, wood 2). Blows hit a barricade before the thing behind it. A destroyed door becomes a broken door (always open); a smashed window scatters broken glass on its tile and maybe beside it.
- Broken glass is tile state (world.glass 0-3, in memory snapshots, shown as light-blue shards, inspect "Broken glass."). Anything stepping on it makes noise level 1, sneaking or not ("Glass crunches underfoot.").
- Zombies can't use handles. When their greedy step toward a goal (prey seen, noise heard) is a closed door, window or barricade, they bash it with their bite damage. So a zombie that sees you through a window, or hears you inside, breaks in noisily. If you can't see the zombie but hear the blow: "Something bangs on a door!"
- Planks (item, 2 slots): use next to a closed door or window to board it up (barricade +6 health, blocks movement and sight, hammering is noise level 2, planks used up). Picks the first adjacent candidate (N, E, S, W, then diagonals).
- Keys go on a Keyring { keys }, not in the bag: they take no slot and aren't bag rows (the bag shows one "Keys: ..." line). A key opens doors whose Door.lockId matches its Item.lockId (the test building's door and the scattered door key share 'test-building'). No USE button: walking into a locked door you have the key for unlocks and opens it ("You unlock and open the door."); closing a door you have the key for locks it behind you ("You close and lock the door."). The wrong key does nothing. Picking one up: "Door key on your keyring." Old saves with a key in the bag are migrated onto the keyring on load.
- Test building (CONFIG.testGrid.building, src/sim/gen/building.js): 8x6 stone room with a cleared 1-tile yard, a locked wooden door in the bottom wall, glass windows in the top and right walls, and loot inside (beans, bandage). Planks and the key are scattered outside. Get in by finding the key, bashing the door, or smashing a window.
- Save/load (src/sim/save.js, pure sim; main.js stores it): the whole game state is serialised to JSON - seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact state, tile arrays (terrain, light, blood, glass, wall health), the player's sightings, the test building's rect, and every entity with all its components (memory snapshots, inventory, brain, doors, barricades). Not saved, rebuilt on load: visible sets (vision is recomputed), the noise heatmap, event wiring (createWorld installs it, then the save is poured in), world.structures lookup. Tile arrays are run-length encoded and Memory saves only remembered tiles, so saves stay small on big maps. A loaded game plays on exactly like the original (tested).
- Autosave: main.js saves to localStorage (CONFIG.save.key) after every player action that reaches the sim, including free ones like sneak toggles; on start it loads the save if there is one. ?seed=N in the URL always starts that seed fresh. Dying deletes the save, so reopening after death starts a new run. If storage is blocked or full, the game plays on unsaved.
- Save version: CONFIG.save.version (8 now). Bump it whenever the saved shape changes in a way old saves can't be read with. A save from another version, or one that fails to load for any reason, is discarded and a fresh game starts with "Old save lost. New game." - never a crash.
- New game: a small, dim NEW GAME button at the bottom of the BAG panel (out of the way of play), then a confirm screen "Start a new game? This run will be lost." with big YES (red) / NO buttons. YES clears the save and starts a fresh random seed.
- Time (src/sim/time.js): the clock runs on scheduler ticks, not player turns, so slow actions take longer - a normal step, wait or attack is 1 tick, a sneaking step 2 (anything that costs more energy costs more time). CONFIG.time.minutesPerTick = 2, so a day is 720 ticks and an 8-hour night about 240 steps; a run starts at 08:00 (time.startHour) on day 1 and the day rolls over at midnight. Helpers: dayOf(tick), clockOf(tick) -> "HH:MM", daysSurvived(tick) (full 24 hours since the start). The top bar shows day and clock, e.g. "D1 08:00". world.tick is already saved, so saves carry the time. Day/night (step 15) builds on this.
- Run stats: world.stats.kills counts zombies (creatures with a Brain) killed by the player. Saved; older saves without stats load with 0 (an additive change, so no save-version bump).
- Game over (step 13): on death the last view is darkened and a plain prototype-style screen shows "YOU DIED", the cause of death, when you died ("day 3, 22:15"), days survived, zombies killed, turns and the seed, with a flashing "Tap for a new game". It deliberately uses the same greybox look as the rest of the game; the final look (e.g. a Teletext/Ceefax page) is decided at the art pass, step 41, not before.
- Causes of death come from world.gameOver.cause: bite -> "Bitten by a zombie", bleeding -> "Bled out", hit -> "Beaten by a ...", shot -> "Shot by a ...", thrown, shove ("Slammed into a wall"). Wording lives in src/render/messages.js deathText().
- Taps are ignored for ui.deathTapDelayMs (1 s) after death so a fast tapper sees the screen; then any tap starts a new game with a fresh seed. The save is deleted on death.

## Decisions for step 14a (village land) - built
- Maps: CONFIG.world.map picks what a new game uses: 'village' (default) or 'testgrid' (the phase-1 grid, kept for testing). createWorld(seed, { map }). Saves record their map (older saves load as testgrid). Debug overlay (tap the top bar) shows a TO GRID / TO VILL. button under TUNE that switches and starts a new game; ?map=testgrid|village in the URL does the same. The choice is remembered in localStorage ('zombie-sim-map').
- The village (src/sim/gen/village.js, 112 x 200 tiles, top = valley head) is built at the Scale above and generated in layers, the way real Lakeland villages grew. Each layer claims ("lays") its tiles; later layers only build on unclaimed ground, so nothing overwrites the street. Numbers in CONFIG.village; all sizes and widths from CONFIG.scale. About 20 ms per village.
  1. Valley: a valley floor (grass) following the road, narrow at the head, wider toward the foot and widest round the village; rising fellside on both sides. The lower fellside (12 tiles) is walled into intake fields under a fell wall; above it is open fell (bracken, rock, scree high up, odd thorn trees). Fellside and bracken are slow going (moveCost 2, scree 3). A beck (2-3 wide) winds down the floor, fed by 1-tile gills off the fell on its own side, into a lake at the foot of the dale with a shingle shore.
  2. Main road: tarmac (ROAD, 4-5 wide) down the whole valley, wandering gently outside the village and dead straight through it. It crosses the beck once on a 3-wide stone bridge (the road pinches onto it; the pavements stop at the bank). The village centres on this crossing and the player starts on the bridge. The beck runs on one side of the road above the bridge and the other side below it.
  3. High street (44-48 rows each side of the bridge): pavements (PAVEMENT, 1) both sides. Behind them a street block deep enough for the pub plus a yard (12 + 3 = 15), then a back lane (LANE, 2-3). Terrace rows of plots (TILE.PLOT) front straight onto the pavement: the pub (10x12) first by the bridge on one street, the corner shop (6x8) first on the other street, then 3-5 terraced cottages (5x7) per row. Every street plot has a walled yard (cobbled YARD) filling the block behind it, party walls between yards, and a gate in the back wall. The far end of each street is kept for a detached cottage (7x9) in its own walled garden, with a front gate and path; a few spare rows become a walled garden.
  4. Ginnels: a 1-tile ginnel (GINNEL) between terrace rows, from the pavement through to the back lane. A lane at each end of every street joins pavement to back lane; at the bridge end it runs along the beck. Beyond the back lane is the beck's bank (with trees) or a field wall, sometimes a hedge.
  5. Green and church: on one side of one street, by the bridge, an open green (10-12 rows) with a tree or two, then a ginnel, then the church (9x18, lying along the street) in a walled graveyard with 2 rows of graves all round. A lychgate (GATE) on the pavement with a short path to the door, a back gate onto the back lane, gravestones (GRAVE: block walking, not sight) in rows with walkways between.
  6. Outskirts: a side lane (LANE, lane width, walled; each row starts at that row's own road edge since the road bends) off the main road to a farm or two, one above the village and one below, on the side away from the beck. A farm is a walled farmyard (YARD) with the farmhouse (7x9) and barn (8x12) along the far wall facing the yard, and a lane-wide gate. Walled fields 10-20 tiles across (jittered grid of seeds, nearest seed wins, with a wobble so the walls wander). The main road is walled outside the village. Every field gets a gate (GATE) onto the road, lane or path it borders, most neighbouring fields a gate between them, some a gate onto the open fell. Footpaths (PATH, normal speed even on the fell) run from behind each farm and from the far end of each beck-side back lane, over the beck on a footbridge, up the fellside to the map edge, with a gate wherever they cross a wall. Trees along the beck, a wood (radius 12) on the beck side below the village, field trees.
  Last, every walkable tile is made reachable from the bridge: the shortest way out of any pocket is knocked through, a dry-stone wall becoming a gate (never through the lake).
- world.plots = [{ x, y, w, h, kind, building, facing, front, back?, turned? }]: kind is cottage | detached | pub | shop | church | farmhouse | barn; building is its CONFIG.scale.buildings key and the plot is exactly that size (turned if it lies the other way); facing is the side its front faces (N/E/S/W). front is the walkable tile outside the front door (the pavement for street plots). back is the yard/garden tile behind. Also world.green, world.graveyard ({ x, y, w, h }), world.farms ({ x, y, w, h, gate }), world.bridgeRow, world.widths (road/lane/beck/bridge as picked). 14b builds on these.
- Tiles are properties, not special cases (TILE_INFO in gen/testgrid.js, shared by both maps): blocks, opaque, cover, moveCost (time multiplier for a step onto it), stepNoise (noise level when stepped on; sneaking makes it one less), material. Road, pavement, lane, ginnel, yard, footpath and building plot are all separate tiles so they read differently on screen and in inspect.
  - Dry-stone walls, trees, rock: block movement and sight. Gravestones block movement only.
  - Gates: walkable openings in walls; they creak (noise 1, "The gate creaks.").
  - Hedges: block sight, can be pushed through slowly (moveCost 3) and rustle (noise 1).
  - Beck and gills: wade slowly (moveCost 2) and noisily (splash 2). Lake: too deep. Shingle crunches (1). Bracken: cover, rustles. Scree clatters (2).
  - Rough ground slows zombies too (Actor.nextCost).
- Greybox look: each tile has a colour plus a simple mark.
  - Road: dark tarmac with one faded centre line down the middle, however wide.
  - Pavement and ginnel: grey flagstones (the ginnel darker).
  - Lane: brown gravel dots. Yard: cobble dots. Footpath: worn tan earth.
  - Building plot: dark bare earth with a dot.
  - Gate: wooden five-bar gate. Gravestone: a headstone on grass.
  - Dry-stone walls: stone courses. The bridge is plain pale road surface with dark parapet strips only on its sides facing water, so it never looks like a wall.
  - Also leaf dots for hedges, a dark round crown for trees, ripples for water, fronds for bracken, a peak for rock, pebbles for scree.
  - Remembered tiles use a dark grey of each tile's own colour, so they keep their shapes.
- Save version 4 (14b): the village now has buildings, so older saves start a new game. Saves stay small on the big map: tile arrays are run-length encoded and map memory saves only the remembered tiles (~65 KB, ~2.5 ms per autosave).
- The test grid still gets its single test zombie (8-20 tiles away) and scattered test items; the village gets its own loot and zombies from 14d (gen/life.js).

## Decisions for step 14b (buildings) - built
- 14a decides where every building goes: each plot has a size from CONFIG.scale, a facing and a front tile. 14b (src/sim/gen/buildings.js, buildVillage, called by createWorld after the land) builds every plot with one generic builder. Nothing is special-cased per map position.
- Outbuildings are plots too, reserved in 14a:
  - a shed (3x3) in some terraced/shop back yards (CONFIG.village.yardShed), in the far corner, using the yard's walls as its own (the yard gate moves to the other side);
  - a greenhouse (3x4, turned) in every detached cottage's back garden, sometimes a shed in the other corner (gardenShed);
  - a shed in each farmyard corner by the gate wall.
  All face their house/yard.
- Terraced cottages (and the pub/shop at a terrace's end) share party walls: each plot starts on the last row of the one before, so a row of n cottages is 4n+1 long and there are no double walls. Their yard walls are shared the same way.
- Frame: each building is laid out in its own frame from its facing: u along the front (0..W-1), v back from it (0..L-1). So a turned building (the church along the street, the greenhouse) or one facing a farmyard uses the same layouts. The front door goes where the plot's front tile is (the middle of the front).
- What a building is: walls round the edge as wall tiles of its material (TILE.WALL_STONE / _BRICK / _WOOD / _METAL / _GLASS: they block, and block sight unless the material is seeThrough, so greenhouses are see-through). A floor inside (FLOOR_WOOD floorboards, _FLAGS flagstones, _CONCRETE, _EARTH). Partition walls between rooms (same material), each with an inside door (wood, starts open 70%: innerDoorOpen). Outside doors and windows are the existing structure entities (Door, Window) standing on floor tiles in gaps in the wall, so everything from step 11 works: bash, lock, smash glass, board up, zombies bashing in, noise muffled by walls. Wall health comes from the wall tile's material (initTileHp reads TILE_INFO material).
- CONFIG.buildingTypes per type: walls and roof (weighted material choices; roof 'walls' = same as walls), floor, outside door material ('walls' = same: glass greenhouse doors, metal shed doors), lockFront / lockBack chances. Current picks:
  - terraced/detached cottages: stone or brick, slate or thatch roof, floorboards;
  - shop: stone or brick, floorboards;
  - pub: stone or brick, flagstones;
  - church: stone, flagstones;
  - farmhouse: stone, flagstones;
  - barn: stone or corrugated metal, concrete;
  - shed: wood or corrugated metal, concrete;
  - greenhouse: glass, earth.
  Roofs aren't drawn (top-down, you see inside); they're recorded for fire (step 19).
- Locks: one lockId per building ('building-N'), shared by its front and back doors. Most front doors are locked (cottages 60%, shop 90%, pub 80%, church 30%, barn 10%). Keys are placed with loot in 14d; until then get in by bashing a door or smashing a window, which is noisy.
- Room layouts (LAYOUTS in buildings.js, in the building's frame):
  - terraced cottage 5x7: front room and kitchen, an inside door to one side; front door and windows on the street, back door and window onto the yard.
  - detached cottage / farmhouse 7x9: living room across the front; kitchen and scullery behind; side windows. The back door is into the kitchen.
  - corner shop 6x8: a shop floor with a wide shop window; stock room behind.
  - pub 10x12: the bar across the front; kitchen and store behind; back door to the yard.
  - church 18x9 (lying along the street): nave and vestry; windows every 3 tiles front and back. The front door is at the end of the lychgate path.
  - barn 8x12: one space, double doors onto the yard, slit windows if stone.
  - shed, greenhouse: one tiny room and a door.
- Safety rules in the builder: no back door unless the tile behind is walkable (farm buildings back onto the yard wall: none). No window onto a wall (shared party walls get none). The land's reachability pass (14a) never routes through a building plot, so walls never cut anything off.
- world.buildings = [{ kind, building, x, y, w, h, facing, walls, roof, floor, lockId, rooms: [{ name, x, y, w, h }] }], in the same order as world.plots. 14c hangs stairs and ladders on rooms; 14d puts loot, keys and zombies in them. Rebuilt from the seed on load; door and window state is saved with the entities.
- Greybox look:
  - stone building walls: neat courses (rougher than dry-stone field walls);
  - brick: red with offset bricks;
  - wood: brown vertical boards;
  - corrugated metal: grey ridges;
  - glass: pale blue with a glazing bar;
  - floors: floorboards (brown planks), flagstones (grey slabs), concrete (plain grey), earth (dark with specks).
- Tests: one building per plot; every type appears; materials come from the type's table; the front door sits by the plot's front tile; every room is reachable from the front door; doors and windows on the outer wall open onto walkable ground; some front doors locked; glass walls see-through; wall health from material. Checked on 150 seeds.

## Decisions for step 14c (upstairs, cellars, lofts) - built
- Each extra floor is a small separate map: a walled pocket in a band of void below the valley.
  - The village world is CONFIG.village.height (200) land rows plus floorRows (48) band rows; world.landHeight marks where the band starts. 150 seeds use at most ~31 band rows.
  - VOID tiles (TILE.VOID) block movement and sight, and sound never enters them (TILE_INFO silent). So each floor is cut off from everything else, yet every existing system (sight, noise, memory, items, combat, doors) works there unchanged. No per-map refactor.
  - Pockets are shelf-packed left to right with 2 tiles of void between them (gen/floors.js).
- A pocket keeps its building's facing. Its stairs or ladder sits on the same (u, v) in the building's frame as the ground-floor end, so the two line up as if stacked.
- Plans (PLANS in gen/floors.js, in the building frame: rect covered, link spot, partitions, inside doors, rooms). Links are placed clear of the ground floor's door approaches. Which buildings get which: CONFIG.floors.chance.
  - terraced cottage: upstairs by stairs (front and back bedrooms).
  - detached cottage: upstairs by stairs (front bedroom, back bedroom, bathroom).
  - farmhouse: upstairs by stairs, plus a cellar by ladder half the time.
  - corner shop: upstairs flat by stairs, plus a stock cellar by ladder half the time.
  - pub: upstairs by stairs (sitting room, two bedrooms) and a beer cellar under the bar by ladder.
  - church: a bell loft over the vestry, up a ladder.
  - barn: a hayloft over the back half, up a ladder (80%).
  - Upstairs floors are floorboards, cellars flagstones, walls the building's material.
- No upstairs windows yet: they would look out over the void. A view out of an upstairs window needs sight across maps; that's a later system.
- Links are pairs of entities, one on each floor: Stairs { kind: 'stairs' | 'ladder', top, link, pulled } (systems/floors.js).
  - Glyphs: stairs show < going up and > going down; a ladder is H. A pulled-up ladder is = lying on the floor at the top and a ^ hatch out of reach at the bottom.
  - world.links (tile -> linked tile) and world.stairsAt (tile -> entity) are rebuilt from the entities, after loading too.
  - Links are things on a tile, so map memory remembers them.
- Climbing ({ type: 'climb' }, a turn): you move to the other end (blocked if something stands there).
  - It takes stairsCost (1x) or ladderCost (2x) time and emits entity_climbed, then entity_moved, so sight, footsteps and memory follow.
  - Pulling up or lowering a ladder ({ type: 'ladder', up }, a turn) only works from the top end. It clatters (noise 1).
  - A pulled-up ladder can't be climbed from below ("The ladder's pulled up."). From above you must lower it first ("Lower the ladder first.").
- Controls: standing on stairs or a ladder adds an UP or DOWN button to the action bar, and at the top of a ladder a PULL UP / LOWER button. Stepping onto one names it in the status bar ("A staircase up.").
- Sound goes through links: noise reaching a link tile continues on the other floor, losing floors.linkNoiseCost (3, like a wall).
  - Whoever hears it there hears it coming from the stairs: noise_heard x, y is the stairs tile on the listener's floor, with sourceX/sourceY kept.
  - So a zombie downstairs that hears you upstairs walks to the foot of the stairs.
- Zombies follow: a zombie that reaches its goal and finds it's stairs or a ladder climbs it, then searches the other side.
  - Its goal can be stairs because it heard you through them, or because it saw you there last.
  - A pulled-up ladder stops it: it searches at the bottom instead. That makes lofts with ladders a safe spot.
  - Stairs can't be pulled up (barricading them comes later).
- world.floors and each building's floors: [{ building, name, via, x, y, w, h, rooms }] (rooms inside the walls). 14d puts loot and zombies in them.
- Save version 5. The tiles (with the band), Stairs entities and pulled state are saved; links are rebuilt on load.
- Tests: every terraced/detached cottage has an upstairs, the pub an upstairs and a cellar, the church a loft. Every pocket is ringed by void and every link pairs up, joining the ground to a floor. Everything walkable is reachable using links.
  - Climbing takes the ladder's time; upstairs you only see upstairs.
  - A noise upstairs is heard below as coming from the ladder, and the zombie climbs after you.
  - A pulled-up ladder stops it, you can't climb down until you lower it, and saves keep pulled ladders.
  Checked on 150 seeds.

## Decisions for step 14d (village life) - built
- Phone box (land, gen/village.js): a red phone box on the green by the pavement near the bridge, world.phoneBox. TILE.PHONEBOX: you can step into it, glazed so you're still seen, the line is dead ("A red phone box. The line is dead."). It's there for the ringing phone box later (Phase 8).
- Allotments (land, gen/village.js), world.allotments:
  - A hedged site (CONFIG.village.allotments: 2 x 3 plots of 5 x 5) at the far end of one street, beyond its back lane on the side away from the beck. Its gate goes through the field wall onto the back lane.
  - Plots of dug-over beds (TILE.ALLOTMENT, walkable) between grass paths, with a central path.
  - About half the plots have a shed (a 3x3 plot built by 14b) facing the central path.
- Population (src/sim/gen/life.js, populateVillage, run by createWorld after the floors). All from the seed; the test zombie and test items are test grid only now.
  - Loot by room name (CONFIG.loot.rooms: n = [min, max] items per room, weighted table), on open floor tiles (not on doors, windows or stairs). Upstairs, cellars and lofts count.
    - kitchens: food and knives;
    - living/front rooms: walking sticks, golf clubs;
    - bedrooms: bandages and the odd air rifle and pellets;
    - bathrooms: first aid;
    - shop and stock rooms: beans, crisps, chocolate;
    - the bar, store and beer cellar: ale, crisps, planks;
    - the vestry: first aid;
    - cellars: food and planks;
    - barns and haylofts: forks, planks, shells;
    - sheds: forks, planks, golf clubs.
  - Per-building extras (CONFIG.loot.extras): farmhouse shotgun 60% and shells 70%; a cricket bat at the pub; sometimes a bat or air rifle in a detached cottage. About 100 items per village.
  - New items (CONFIG.items), as data like the rest:
    - weapons: garden fork (2 dmg), walking stick (1, accurate), golf club (2), kitchen knife (1, bleeds);
    - food and drink (step 16): bag of crisps, bar of chocolate, bottle of ale; plus bottles of water and cans of pop;
    - first aid kit: stops bleeding and heals 1; refused if you're not hurt;
    - box of shells / tin of pellets: ammo.
    Anything can still be thrown as a lure.
  - Keys: every building with a locked outside door gets one key (named for the building: "cottage key", "pub key", "shed key"; its lockId opens that building).
    - If the building has a resident zombie, it usually carries the key (keyResident 0.7), in an Inventory.
    - Else it's often left on the front tile (keyDoorstep 0.4).
    - Else it's lost: bash or smash your way in.
  - Anything a creature carries (Inventory, Keyring) falls where it dies (kill() in combat.js; not the player's). So killing a resident gets you its key.
  - Zombies (CONFIG.village.zombies), made by makeZombie() in world.js:
    - 12 residents in rooms of houses, the pub, the shop and the church (upstairs too). Often they're shut in behind locked doors, and they bash their way out when they hear you.
    - 18 about the streets (road, pavements, lanes, ginnels, yards, green, paths) within the village rows.
    - 5 out in the fields and on the fell.
    - None start within 14 tiles of you (off your screen), and nothing sees you at the start.
- Play-test (a simple bot that fights adjacent zombies, bandages, eats when low, grabs items it sees and otherwise wanders; 60 seeds x 1500 turns, about two days):
  - With 9/11/4 zombies only 15% of runs died and the first sighting took ~440 turns, too quiet. Raised to 12/18/5.
  - That gives ~33% deaths over two days, mostly bled out: the bot never gets into the locked houses where the bandages are. Walking down the street you meet zombies within a few dozen steps.
  - A turn takes ~2 ms with 35 zombies. Tune further by playing: CONFIG.village.zombies and CONFIG.loot are the knobs.
- Save version 6.
- Tests:
  - a phone box you can step into;
  - allotments with beds and a gate;
  - plenty of items, none in walls, food in a kitchen;
  - every key fits a locked building, and carried keys are in zombies' pockets;
  - the zombie count, none near the start, residents indoors, nothing sees you at the start;
  - a resident's key drops where it dies and opens its building;
  - shells load a shotgun, and pellets with no air rifle are refused.
  Checked on 150 seeds.

## Decisions for step 15 (day/night + light sources) - built
- src/sim/systems/light.js owns world.light (0-3 per tile), which vision already reads: a tile's visibility = its light level, and noticing distance x noticeByLight (1 / 0.67 / 0.34).
- Ambient light by the hour (CONFIG.light.byHour, a November day in the Lakes): 1 (moonlight) until 07:00, 2 at 07:00 (dawn), 3 from 08:00 to 15:59, 2 at 16:00 (dusk), 1 from 17:00. A run starts at 08:00, so night falls after about 270 turns.
  - Indoor floors (TILE_INFO indoor: floorboards, flagstones, concrete; not the greenhouse's earth) are indoorDim (1) darker: dim by day, pitch black at night.
  - The void band follows the same rule.
- Light sources: any item with a light property (CONFIG.items) that's lit (Item.lit), with Item.charge in ticks.
  - torch: radius 6, level 3, about 16 hours of battery.
  - candle: radius 2, level 2, about 6 hours, then gone (burnsOut).
  - USE in the bag switches it ON / OFF; the bag shows on/off/spent. A spent torch won't switch on ("It's spent.").
  - Carried, it lights from its carrier's tile; dropped or thrown, from where it lies. So a lit torch thrown down the street lights it up.
  - It lights every tile it has a clear line to (like sight: through windows, not walls): its level within radius, one less for falloff (2) tiles more. Lit tiles only ever get brighter (max with ambient).
  - A lit tile makes a lit target: carrying a torch, zombies notice you from their full sight range (7 tiles) instead of about 2 in moonlight, and you see them too. Darkness hides you; light shows you.
  - Lit things burn down every tick (tickLight, in the scheduler's onTick). At 0 they go out ("Your torch dies." / "Your candle burns out.").
- Loot: torches in kitchens, sculleries, stock rooms, sheds and barns; candles in kitchens, bedrooms, the nave and plenty in the vestry.
- Noticing in the dark: anything right next to you is noticed even at light 0 (if no wall is between), both ways. So zombies still bite in a pitch-black house, and you know they're there. Two tiles away in the dark, nothing is seen; hearing is all you have.
- Updating:
  - updateLight runs at the end of every player turn. It only recomputes when the hour's light changed or a light moved, came on or went out (key of light positions).
  - world.lightBase (the hour's light per tile) is only rebuilt when the hour changes; lights are laid over a copy.
  - On a change of hour, everyone's vision is refreshed; otherwise only creatures near a light that changed. About 2.5 ms a turn carrying a lit torch with 35 zombies about.
  - Loading a save recomputes the light for the saved time.
- Messages: "It's getting dark." (dusk), "Night falls." (night), "Dawn breaks.", "You light the torch." / "You put out the torch."
- Play-test bot (it never uses lights or sneaks), 40 seeds x 1500 turns, now including a night: deaths rose from ~33% to ~55%. It walks into zombies it can't see. Intended: night is when hearing and light matter. The knobs are light.byHour, indoorDim, the item radii and charge, and vision.noticeByLight.
- Save version 7 (items carry lit/charge).
- Tests:
  - the hourly levels;
  - by day outside bright and indoors dim; at night moonlit outside and pitch black indoors ("Night falls." event);
  - 6 tiles apart on a moonlit road neither notices the other; with a torch both do, and the torch lights 4 tiles off;
  - a torch left inside lights the tile outside its window;
  - a candle burns away and a torch goes flat; a flat torch won't switch on;
  - saves keep the night and the lit torch;
  - adjacent creatures are noticed in pitch darkness.
  Checked on 150 seeds.

## Decisions for step 16 (hunger, thirst, fatigue) - built
- src/sim/systems/needs.js. The player has Needs { hunger, thirst, fatigue }, counted in ticks (2 min). Each shows as a level 0-3: ticks / CONFIG.needs.perLevel, capped at 3 (pillar 4: coarse levels on screen).
  - hunger: a level every 12 h; thirst every 8 h; fatigue every 6 h awake.
  - From 08:00 you're thirsty and tired by mid-afternoon, hungry by evening.
  - Exhausted by about 02:00 if you don't sleep; parched after a day without drinking; starving after a day and a half without food.
- Effects (all from world.tick, so runs replay exactly):
  - Starving (hunger 3): lose 1 health every 12 h. Parched (thirst 3): every 6 h. You can die of either ("Starved to death", "Died of thirst").
  - Exhausted (fatigue 3): every action takes 1.5x the time (turn.js endTurn), so zombies get more turns.
  - Healing (no healing before step 16 except food and first aid): asleep and not starving/parched, +1 health every 2 h. Awake, fed, watered and rested (all <= 1) and not bleeding, +1 every 8 h.
- Food and drink are properties of items, in ticks off a need:
  - tin of beans: a full level of hunger;
  - chocolate and crisps: less;
  - bottle of water: a level of thirst;
  - ale and pop: both, a bit of each.
  - Using food or drink you don't need is refused ("You're not hungry.").
  - Food no longer heals; first aid still does. Water and pop are in kitchens, the shop and stock rooms; pop in the bar.
- Drinking from the beck, the lake or a pond: a DRINK button appears when you're thirsty and on or next to water ({ type: 'drink' }, a turn). It takes a level of thirst off and splashes (noise 1). Dirty water making you ill comes with step 20.
- Sleep:
  - A SLEEP button appears when you're tired (fatigue >= 1). Refused if anything is in sight ("Not with them about.").
  - { type: 'sleep' } is one recorded input. You fall asleep (Asleep component) and the world runs on a turn at a time until you wake. While asleep, fatigue falls 3 ticks per tick, so 6 h clears 3 levels.
  - You wake when:
    - rested (fatigue 0);
    - you hear a noise (any noise_heard: a zombie bashing the door, glass breaking);
    - you're hurt;
    - hunger or thirst reaches 3;
    - or after 12 h at most.
  - Zombies shuffle silently, so one can walk up and bite you in your sleep. Sleep somewhere safe: a pulled-up loft, a locked house.
  - Replays exactly (tested).
- Top bar: H (hunger), T (thirst), Z (tired) after the health blocks, only at level 1+, coloured yellow / orange / red; level 3 blinks.
  - Messages when a level gets worse: "You're getting hungry." / "You're hungry." / "You're starving!", "You're thirsty." / "You're very thirsty." / "You're parched!", "You're tired." / "You're very tired." / "You're exhausted!".
  - Waking: "You wake, rested.", "A noise wakes you!", "You wake in pain!", "Hunger wakes you."
  - Inspecting yourself lists how you are ("You: hungry, very tired.").
- Tuning by the play-test bot (now eats, drinks from the bag or the beck and sleeps when tired and nothing's in sight; 40 seeds x 1500 turns):
  - The first rates (hunger 8 h, thirst 6 h, damage every 4 h / 2 h) killed every run, a third from hunger or thirst inside two days. Too harsh.
  - The slower rates above leave bites and bleeding as the main killers; hunger and thirst finish off a wounded bot that never looks for food or water.
  - Knobs: CONFIG.needs and the items' food/drink values.
- Save version 8 (the player carries Needs).
- Tests:
  - levels rise with time and say so;
  - water, ale and beans relieve needs; not needed means refused;
  - parched and starving hurt and can kill;
  - exhausted actions take ~1.5x;
  - sleep: refused when not tired, one input that wakes you rested and healed, a noise wakes you, refused with a zombie in sight, and a natural run with sleep replays exactly;
  - drinking from the beck by the bridge, and not away from water;
  - needs are saved.
  Checked on 150 seeds.

## Decisions for step 14 (village) - recorded now, built in 14b-14d
- Upstairs, cellars and lofts: built in 14c (above).
- Building types have their own rooms (built in 14b, below); contents and which have upstairs/cellars are decided in 14c/14d.
- Building materials are chosen per building from the materials table (built in 14b); CONFIG.build is now only the test grid's defaults.
