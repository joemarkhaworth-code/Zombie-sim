# System interactions

Every new system must read from or affect at least one existing system. One line per interaction.

| System | Reads from | Affects |
|---|---|---|
| Turn loop (step 1) | player input, tile blocking | player position, turn counter, input log |
| Scheduler (step 2) | Actor speed/energy | who acts and how often; hands control back to the player |
| Shamble (step 2) | Prey positions, tile + entity blocking, seeded RNG | zombie position; zombies block the player (and each other) |
