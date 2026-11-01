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
9. Items and inventory
10. Ranged and thrown weapons; gunshots are very loud
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
- Intentional: in daylight in the open, zombies see you (7 tiles) well before they hear your footsteps (3 tiles). Hearing matters when they can't see you: round corners, behind walls, in the dark. Night (step 15) will shrink sight and make hearing their main sense. Don't "fix" this by tuning.
- Sneaking (src/sim/systems/stealth.js): toggled by a big SNEAK button in a bottom bar (72 px, full width, yellow "SNEAKING" when on). Toggling takes no turn but is recorded as an input ({ type: 'sneak', on }) so replays match. While sneaking: each step costs 2x energy (zombies get twice the time), footsteps drop from level 1 to 0 (silent), and you can only be noticed from two-thirds of the usual distance (stealth.sneakNoticeFactor 0.67). Waiting costs the same as normal. A sneaking creature is drawn dimmer.
- Noticing (vision.js canSee) combines line of sight, light and distance: the target's tile must be in sight with light >= minLevelToSpot, and within sight radius x noticeByLight[light level] (1 / 0.67 / 0.34 for light 3/2/1) x stealth.sneakNoticeFactor if sneaking. Adjacent creatures are always noticed if there's any light. The same rule works both ways: you don't see zombies you haven't noticed (they aren't drawn).
- Hiding spots: bush tiles (TILE_INFO cover: true) are walkable and see-through, but anything standing in one can only be noticed from an adjacent tile. Works for zombies too: a zombie in a bush is invisible until you're next to it. Creatures in a bush are drawn with leaf marks over them. Test grid scatters a few bush clumps (config testGrid).
- Bottom bar (action bar) holds big buttons side by side, split evenly: SNEAK (toggle) and SHOVE (one-shot). The map area shrinks to fit between the status bar and it. Add future actions here rather than new UI.
- Sneaking and bushes stop you being noticed; they don't shake off a zombie that already has you in view (it watched you duck into the bush). A zombie that saw you on its last look keeps tracking you at its normal range, ignoring sneak and cover, while you stay in line of sight. To lose a pursuer, break line of sight with walls first, then hide.
- When a zombie loses you (or reaches a noise), it searches: shuffles about within 2 tiles of the spot for 4 moves (zombie.searchActions / searchRadius) before giving up, so it can stumble onto you hiding nearby.
- Health is a whole number (Health { hp, max }): player 6, zombie 4. Shown in the top bar as one red block per point (dark when lost), between the turn number and the message. The blocks blink while you're bleeding.
- Melee (src/sim/systems/combat.js): moving into any creature with Health attacks it instead of moving; it takes a turn. Any creature with a Melee component can attack any creature with Health. Melee { damage, hitChance, woundChance, verb }: player hit 1 dmg 80%, zombie bite 1 dmg 60%. Rolls use the seeded RNG. The input is recorded as a plain move, so replays re-derive the attack. Zombies attack prey they can see when adjacent. Every swing makes noise level 2 (about 8 tiles), so fights draw other zombies.
- Wounds and bleeding (src/sim/systems/bleeding.js): a hit may wound, raising Bleeding level by 1 (max 3). Bleeding drains 1 health every 12/7/4 ticks (by level), drips blood each time, and may clot down a level (30% per drip). Runs per scheduler tick via an onTick hook. Zombies bleed too.
- Blood: world.blood is a 0–3 level per tile, drawn as red spots (more for higher levels). It's tile state, so memory snapshots record it (greyed spots out of sight). Inspect: "Blood on the ground."
- Death: the creature is removed and leaves a corpse (a non-creature thing named "<name> corpse", walkable, remembered, inspectable). If the player dies, world.gameOver = { cause, killerName, turn } and the scheduler stops (world.fallenPlayer keeps the last view for the camera), and the death screen shows (see Game over below).
- Headless tests: the random-play runs now often end in death, so there's also a stress run per seed with an unkillable player for crash/runaway coverage.
- Draw order: things (corpses, items) first, then creatures, then the player on top, so you're never hidden under something you're standing on.
- Who strikes first: moving uses a creature's action, so a zombie that steps next to you can't also attack; at half speed you get two actions before its next one (checked in tests). If you step into reach of a zombie that's already watching you, it may swing first - fair, it was waiting for you.
- Reacting: when a zombie first notices prey (or is hit by something it hadn't noticed), its next action is a reaction (zombie.reactActions = 1): it stays put and groans (noise level zombie.groanNoise = 1, which other zombies can hear). So a zombie can never strike on the same action it notices you.
- Sneak attacks: attacking a creature that hadn't noticed you (a zombie that wasn't tracking you on its last look) always hits (melee.sneakAttackHitChance = 1) and adds melee.sneakAttackBonus = 3 damage, so a 4-health zombie dies in one blow. If it survives, it reacts before it can strike back. Status: "Sneak attack!". The player counts as aware of anything they can see.
- Shove (src/sim/systems/shove.js): tap SHOVE (turns orange, "armed"), then tap toward an adjacent creature; the direction works like movement (8-way, forgiving). Tapping yourself, tapping SHOVE again, or a direction with nothing shoveable cancels it, with no turn spent. The input is { type: 'shove', dx, dy } and takes a normal turn. The creature is pushed one tile directly away; if that tile is blocked (wall, creature, map edge) it slams into it instead and takes shove.slamDamage = 1 (the thing behind is unhurt). Either way it's staggered and loses its next action (shove.staggerActions = 1). Shoving makes noise level 1 and the target notices who shoved it. No damage bonus for shoving an unaware creature (that's what sneak attacks are for).
- Staggered { actions } is a general component: the scheduler still charges the creature's time, but its action is wasted (entity_lost_action). Any future system can stagger things.
- Forced movement hook: anything moved by force goes through pushEntity(), which emits entity_pushed { id, by, from, to, dx, dy }. Water, fire, ledges and the like subscribe to it and react to the destination tile, without knowing who pushed or why. Slamming emits entity_slammed { id, x, y, blockerId }.
- Other attack types (ranged, thrown) wait until weapons exist (step 10).
- Items (src/sim/systems/items.js): an item is an entity with Item { type, slots } + Glyph + Name. On the map it has a Position; carried, it has none and its id is in Inventory.items. Item types live in CONFIG.items as data; effects are properties, not special cases: heal (eat: +health, used up), stanch (bandage: stops bleeding, used up, refused if you're not bleeding), weapon (wield/stow; replaces bare-hands melee numbers). Test items: tin of beans (%, heals 1 until hunger exists in step 16), bandage (+), cricket bat (/, damage 2), scattered on open tiles (CONFIG.testGrid.items).
- Inventory { items, capacity, wielded }: capacity is in slots (player 6; beans/bandage 1, bat 2). A full bag leaves the item on the tile ("Your bag is full.").
- Picking up: walking onto an item picks it up as part of the step, free. Tapping yourself while standing on an item picks it up (takes a turn) instead of waiting - for things you dropped or couldn't fit. Inspecting your own tile says "You're on a <item>."
- BAG is the third action-bar button. It opens an 8-bit list over the map (Teletext blue): header "BAG used/capacity" + CLOSE, one 56 px row per item with a coloured glyph, name, slots, and two big buttons: use (EAT / USE / WIELD / STOW) and DROP. Opening takes no turn. Use and drop take a turn and close the bag so you see what happened. Wielded item is marked "> name, in hand".
- Inputs: { type: 'pickup' }, { type: 'use', itemId }, { type: 'drop', itemId } are recorded; item ids are deterministic from the seed, so replays match. Random-play tests include them.
- Melee stats come from meleeStats(): a wielded weapon's numbers override the Melee component's.
- Your view is screen-shaped: the player's Vision has clip { x: tilesAcross/2 = 5, y: view.sightHalfHeight = 9 }, so you only see, notice and remember tiles the screen can show (light range 15 still sets the limit in the dark/fog later). Without this, you'd remember off-screen tiles and items you were never shown. The box is fixed in config, not measured from the device, so replays don't depend on the phone; taller screens just show a few extra dark rows. Zombies have no box.
- Throwing (src/sim/systems/ranged.js): any item can be thrown. BAG rows have three buttons (use, THROW, DROP); THROW closes the bag and starts aiming. Range throw.range = 6 (round), the tile must be in sight with a clear line and not solid. The item lands on the tile and clatters there (noise level throw.landNoise = 2, ~8 tiles), so throwing beans is a lure: zombies go to investigate the landing spot. If a creature is on the tile it may be hit (75%): any hit staggers it (loses its next action, throw.staggerActions = 1), and heavy items (slots >= 2: bat, guns) also do 1 damage. So a tin of beans is worth throwing at a zombie to buy a turn. Input { type: 'throw', itemId, x, y }, takes a turn.
- Guns are items with a `ranged` property and their own ammo (Item.ammo, shown in the bag). Wield one and a FIRE button (showing ammo, e.g. "FIRE 3") joins the action bar. The noise is at the shooter. Air rifle: range 8, 1 damage, quiet (noise 1), 10 pellets. Shotgun: range 4, 4 damage (kills a zombie), very loud (noise 3, ~12 tiles), 4 shells. Both work as clubs when wielded (1 damage). An empty gun clicks ("Click. Out of ammo."), no turn. Input { type: 'fire', x, y }. A shot hits the creature on the target tile; creatures in between are ignored for now. Guns don't get sneak-attack bonuses.
- Aiming (throw or fire): valid targets come from validTargets() (one rule for the sim and the highlight). Valid tiles get a yellow tint, ones with a creature orange. The action bar becomes one big CANCEL; tapping yourself also cancels; tapping an invalid tile says "Can't aim there." and keeps aiming. If nothing is in range it says so and doesn't enter aiming.
- Ammo is part of the gun for now (no separate ammo items); finding ammo comes with the village (step 14).
- Materials table (CONFIG.materials): stone, slate, brick, wood, glass, corrugatedMetal, thatch. Each has hp (blows to break at 1 damage), flammability 0-3 (does it catch fire and spread flames), heatDamage 1-3 (how fast fire wears it down even if it never catches - nothing is fireproof: glass shatters, slate splits, metal buckles, stone and brick spall; fire is step 19), seeThrough (does sight pass while intact), hitNoise and breakNoise (0-3), and glass has shards (leaves broken glass). Everything structural reads its numbers from here; nothing hard-codes them. CONFIG.build says what things are made of for now: walls stone, doors wood, windows glass, barricades wood (planks). A structure's material decides its health, whether it blocks sight (a glass door doesn't; a metal-sheet window does) and how loud each blow and the final break are (corrugated metal clangs at 3; thatch is a soft 1). Walls stay tiles with health in world.tileHp (nothing damages walls yet; explosions later). Doors and windows are entities (Structure { material, hp, max } + Door { open, locked, broken } or Window { broken }) standing on floor tiles in wall gaps, indexed in world.structures. Barricade { material, hp, max } soaks blows first. Their Blocks/Opaque/glyph/name are recomputed from state and material by refresh(), so memory snapshots record open/shut/broken/boarded automatically.
- Closed doors block movement and sight; open or broken doors block neither. Intact windows block movement but not sight; broken windows can be climbed through. Anything solid (closed door, window, barricade) also muffles noise like a wall and stops thrown items and shots (lineClear takes a blocking rule). A door or window changing state refreshes everyone's vision.
- Door controls: walk into a closed, unlocked door to open it (a turn, you don't move). Tap exactly on an adjacent door tile to toggle it open/closed ({ type: 'door', x, y }, a turn); tapping further in that direction walks through. A door can't be closed with someone in the doorway.
- Bashing is deliberate: tap exactly on an adjacent window, locked door or barricade ({ type: 'bash', x, y }, a turn) to bash it with your melee damage. Walking (tap-anywhere) into one never breaks it: no turn, just a hint ("Tap the window to smash it.", "Locked. Tap it to bash it.", "Boarded up. Tap it to bash."). This stops stray taps smashing windows. Each blow makes the material's hitNoise; the final blow its breakNoise (glass 3, wood 2). Blows hit a barricade before the thing behind it. A destroyed door becomes a broken door (always open); a smashed window scatters broken glass on its tile and maybe beside it.
- Broken glass is tile state (world.glass 0-3, in memory snapshots, shown as light-blue shards, inspect "Broken glass."). Anything stepping on it makes noise level 1, sneaking or not ("Glass crunches underfoot.").
- Zombies can't use handles. When their greedy step toward a goal (prey seen, noise heard) is a closed door, window or barricade, they bash it with their bite damage. So a zombie that sees you through a window, or hears you inside, breaks in noisily. If you can't see the zombie but hear the blow: "Something bangs on a door!"
- Planks (item, 2 slots): use next to a closed door or window to board it up (barricade +6 health, blocks movement and sight, hammering is noise level 2, planks used up). Picks the first adjacent candidate (N, E, S, W, then diagonals). Door key (item): use next to a closed door to lock/unlock it.
- Test building (CONFIG.testGrid.building, src/sim/gen/building.js): 8x6 stone room with a cleared 1-tile yard, a locked wooden door in the bottom wall, glass windows in the top and right walls, and loot inside (beans, bandage). Planks and the key are scattered outside. Get in by finding the key, bashing the door, or smashing a window.
- Save/load (src/sim/save.js, pure sim; main.js stores it): the whole game state is serialised to JSON - seed, turn, tick, next entity id, player id, recorded inputs, the RNG's exact state, tile arrays (terrain, light, blood, glass, wall health), the player's sightings, the test building's rect, and every entity with all its components (memory snapshots, inventory, brain, doors, barricades). Not saved, rebuilt on load: visible sets (vision is recomputed), the noise heatmap, event wiring (createWorld installs it, then the save is poured in), world.structures lookup. A loaded game plays on exactly like the original (tested).
- Autosave: main.js saves to localStorage (CONFIG.save.key) after every player action that reaches the sim, including free ones like sneak toggles; on start it loads the save if there is one. ?seed=N in the URL always starts that seed fresh. Dying deletes the save, so reopening after death starts a new run. If storage is blocked or full, the game plays on unsaved.
- Save version: CONFIG.save.version (1). Bump it whenever the saved shape changes in a way old saves can't be read with. A save from another version, or one that fails to load for any reason, is discarded and a fresh game starts with "Old save lost. New game." - never a crash.
- New game: a small, dim NEW GAME button at the bottom of the BAG panel (out of the way of play), then a confirm screen "Start a new game? This run will be lost." with big YES (red) / NO buttons. YES clears the save and starts a fresh random seed.
- Days: CONFIG.time.turnsPerDay = 300 player turns make a day (src/sim/time.js: dayOf, daysSurvived). The top bar shows the day you're on ("D1") where the turn number used to be; the turn count is on the death page. Day/night (step 15) builds on this and may retune it.
- Run stats: world.stats.kills counts zombies (creatures with a Brain) killed by the player. Saved; older saves without stats load with 0 (an additive change, so no save-version bump).
- Game over (step 13): on death the last view is darkened and a plain prototype-style screen shows "YOU DIED", the cause of death, days survived, zombies killed, turns and the seed, with a flashing "Tap for a new game". It deliberately uses the same greybox look as the rest of the game; the final look (e.g. a Teletext/Ceefax page) is decided at the art pass, step 41, not before.
- Causes of death come from world.gameOver.cause: bite -> "Bitten by a zombie", bleeding -> "Bled out", hit -> "Beaten by a ...", shot -> "Shot by a ...", thrown, shove ("Slammed into a wall"). Wording lives in src/render/messages.js deathText().
- Taps are ignored for ui.deathTapDelayMs (1 s) after death so a fast tapper sees the screen; then any tap starts a new game with a fresh seed. The save is deleted on death.

## Decisions for step 14 (village) - recorded now, built then
- Buildings can have an upstairs and/or a cellar. Each extra floor is a small separate map, reached by stairs or a ladder from a tile in the ground floor (and back). Creatures, items, noise and sight work per map; travelling between maps takes a turn on the stairs/ladder tile.
- Ladders can be pulled up from the top: a pulled-up ladder can't be climbed from below, so zombies can't follow you up (you can lower it again). Stairs can't be pulled up (barricade them instead).
- Building types are generated at step 14, each with its own rooms: cottage, pub, shop, church, shed, greenhouse. Room layouts and contents (and which have upstairs/cellars) are decided then.
- Building materials are chosen at generation from the materials table: e.g. sheds are either wood or corrugated metal (picked per shed, seeded), greenhouses are mostly glass, cottages stone or brick with slate or thatch roofs. CONFIG.build becomes per-building choices instead of one global default.
