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
