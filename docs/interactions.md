# System interactions

Every new system must read from or affect at least one existing system. One line per interaction.

| System | Reads from | Affects |
|---|---|---|
| Turn loop (step 1) | player input, tile blocking | player position, turn counter, input log |
| Scheduler (step 2) | Actor speed/energy | who acts and how often; hands control back to the player |
| Shamble (step 2) | Prey positions, tile + entity blocking, seeded RNG | zombie position; zombies block the player (and each other) |
| Event bus (step 3) | emitted by turn loop, movement, shamble | message log (status bar); future systems subscribe here |
| Status bar (step 3) | action_attempted, entity_waited, move_blocked, turn_ended + positions | one-line message shown to the player |
| Vision (step 4) | opaque tiles, entity positions, sight level | what the player sees (rendering), what zombies can chase, entity_seen events |
| Shamble (step 4 update) | Vision (can it see Prey?), last-seen memory | zombie chases, searches last-seen spot, or wanders |
| Visibility levels (step 4b) | line of sight, light range (config), world.light (0-3), eyesight | how bright tiles are drawn; whether creatures are noticed (minLevelToSpot). Future: day/night, weather, stealth lower it |
| Map memory (step 5) | Vision (visible tiles), terrain + non-creature things as seen, turn_ended | greyed-out remembered tiles; inspect text. Future: save/load, tiles changing out of sight |
| Inspect (step 5) | player Vision, Memory, entities on tile | status bar text + outline (no turn, not recorded) |
| Noise (step 6) | movement (Noisy), walls (opaque tiles muffle) | noise_heard for anything with Hearing; debug heatmap |
| Shamble + hearing (step 6) | noise_heard | zombie walks to the noise source to investigate (seeing prey takes priority) |
| Sneaking (step 7) | player toggle | footsteps (Noisy -> silent), move energy cost (scheduler), noticing distance (vision canSee) |
| Cover / bushes (step 7) | tile cover flag | noticing (only from adjacent), for player and zombies alike |
| Noticing (step 7) | line of sight, light level on target's tile, distance, sneaking, cover | whether zombies chase you / whether you see (and are shown) zombies |
| Melee (step 8) | Health, Melee, adjacency, Vision (zombies attack prey they see) | health, wounds/bleeding, blood on tiles, noise level 2 (draws zombies), death + corpse |
| Bleeding (step 8) | Bleeding level, scheduler ticks | health drain, blood on tiles (memory remembers it), death. Future: scent trail |
| Death (step 8) | health reaching 0 | corpse entity (memory, inspect), game over screen. Future: crows, infection |
| Sneak attack (step 8b) | target's awareness (zombie tracking / player sight), stealth | heavy bonus damage, guaranteed hit |
| Zombie reaction (step 8b) | first noticing prey or being hit | lost action (you get first strike), groan noise (other zombies hear) |
| Shove (shove) | adjacent creature, tile behind (blocked?) | position (entity_pushed: hook for water/fire/ledges), stagger (lost action), slam damage, noise level 1, target notices you |
| Items (step 9) | tiles (on the map), Inventory (carried), memory (items are remembered things) | health (eat), bleeding (bandage), melee damage (wielded weapon) |
| Throwing (step 10) | items, line of sight, range | item position (lands), noise at landing (lures zombies), stagger on any hit, damage if heavy |
| Guns (step 10) | wielded gun, ammo, line of sight, range | damage/wounds/blood, very loud noise at the shooter (shotgun draws everything) |
| Doors (step 11) | Door state, lock, barricade | movement, vision (closed = opaque), noise muffling, flight of thrown items/shots, memory |
| Windows (step 11) | Window state, barricade | movement (blocks), vision (see-through unless boarded), smash noise, broken glass |
| Broken glass (step 11) | anything moving onto it | noise (crunch) even when sneaking; memory |
| Bashing (step 11) | melee damage, structure/barricade health, zombie goals | structure health, noise, zombies breaking in to reach you |
| Barricades (step 11) | planks item, adjacent door/window | extra health, blocks movement and sight, hammering noise |
| Save/load (step 12) | the whole world state (all systems' data) | resumes the run exactly; version mismatch -> fresh game |
| Days + death page (step 13) | turn count, gameOver cause, kills, seed | top-bar day; Ceefax P302 page; save deleted |
| Village land (step 14a) | seed | Layered Lakeland village: sight blockers (walls, hedges, trees, rock), cover (bracken, bushes), movement cost (fellside, bracken, hedges, beck, scree; footpaths are quick), ground noise (beck, hedge, bracken, scree, shingle, creaking gates), gravestones block walking not sight, lake (impassable), typed building plots for 14b |
| Buildings (step 14b) | plots, materials table, structures | walls are tiles of the building's material (health, sight: glass walls see-through), doors and windows are structures (bash, lock, smash, board up, zombies bash in, noise muffled indoors), locked outside doors (keys 14d), rooms recorded for stairs (14c) and loot (14d), roofs recorded for fire (19) |
| Rough ground (step 14a) | tile moveCost / stepNoise | time taken per step for player and zombies (scheduler), noise heard by zombies |
