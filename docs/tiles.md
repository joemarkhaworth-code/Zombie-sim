# Tiles, for redesigning the art

Everything the game draws on the map, generated from the game's own data (`node tools/tiles-doc.mjs`).
The picture [tiles.png](tiles.png) shows each one as it's drawn now (greybox).

**How tiles work**

- One tile is one square, about one person. On a phone a tile is drawn at 32-41 px (art at 16 x 16 or 32 x 32 scales cleanly).
- The camera looks north, a little from above: you see the tops of things and the south faces of walls.
- Each map tile is a stack of layers, drawn bottom to top: height, ground, structure, object, roof. Markers are editor-only.
- Height: each level (0-3) is drawn a shade lighter, and a cliff face appears on the lower tile wherever the next tile up is higher (tall face on the north side, a lip on the others). Steps and ledges sit on the edge.
- Remembered tiles (out of sight) are drawn again in dark greys worked out from the colours, so every tile needs to read in greyscale too.
- "Char" is the character in the map text; never change one (maps depend on them).
- Some tiles take their direction from their neighbours (fences, rails, bridges, doors, carriages): they need a north-south and an east-west version, and ideally ends and corners.

## 1. Ground

What you walk on. Colours are [base, mark].

| Char | Name | Key | Blocks | See through | Footsteps | Colours |
|---|---|---|---|---|---|---|
| `.` | grass | GRASS |  | yes |  | `#5d8a3c` `#6c9a48` |
| `L` | lawn | GREEN |  | yes |  | `#7cc05a` `#88cc66` |
| `M` | meadow | MEADOW |  | yes |  | `#7a9a4a` `#a0b860` |
| `=` | road | ROAD |  | yes |  | `#2e2f33` `#38393e` |
| `c` | cracked road | CRACKED |  | yes |  | `#3a3b40` `#5a5b60` |
| `d` | dirt road | TRACK |  | yes |  | `#8e7a58` `#7a684a` |
| `p` | parking lot | CARPARK |  | yes |  | `#38393e` `#d8d8d0` |
| `r` | driveway | DRIVE |  | yes |  | `#9a958a` `#86817a` |
| `-` | sidewalk | PAVEMENT |  | yes |  | `#8d8b83` `#7a7870` |
| `:` | path | PATH |  | yes |  | `#b0a07c` `#9c8c6a` |
| `,` | gravel | GRAVEL |  | yes | loud | `#9a948a` `#b4aea2` |
| `n` | pine needles | NEEDLES |  | yes | quiet | `#7a5a3a` `#94704a` |
| `l` | dead leaves | LEAVES |  | yes | loud | `#a8642a` `#d08a30` |
| `o` | moss | MOSS |  | yes | quiet | `#4a7a3a` `#5e9448` |
| `k` | granite ledge | GRANITE |  | yes |  | `#a09a94` `#86807a` |
| `s` | sand | SAND |  | yes |  | `#d8c88a` `#c8b87a` |
| `u` | mud | MUD |  | yes |  | `#5e4a34` `#4a3a28` |
| `b` | bog | MARSH |  | yes |  | `#4e6a44` `#5a8ad0` |
| `"` | hayfield | FIELD |  | yes |  | `#a89a52` `#8e8044` |
| `C` | cornfield | CORN |  | yes |  | `#c8b048` `#5a8a2a` |
| `P` | pumpkins | PUMPKINS |  | yes |  | `#5d7a3c` `#e07a20` |
| `B` | blueberry barrens | BLUEBERRY |  | yes |  | `#6a5a6a` `#3a4a9a` |
| `#` | ploughed earth | BEDS |  | yes |  | `#5a4430` `#4a8a3a` |
| `R` | rocky stream | STREAM |  | yes | loud | `#4a7ab8` `#9a948a` |
| `w` | shallow water | SHALLOWS | yes | yes |  | `#5a8ed0` `#8ab4e4` |
| `~` | deep water | WATER | yes | yes |  | `#2f62a8` `#5a8ad0` |
| `_` | wood floor | FLOOR |  | yes |  | `#8a6a44` `#6e5234` |
| `i` | linoleum | LINO |  | yes |  | `#c8c0a0` `#a8a080` |
| `a` | carpet | CARPET |  | yes | quiet | `#7a3a3a` `#8a4a44` |
| `t` | diner tiles | CHECKER |  | yes |  | `#e8e8e0` `#2a2a2a` |
| `x` | concrete | CONCRETE |  | yes |  | `#a8a8a2` `#94948e` |

## 2. Structures

Walls, openings, fences and crossings, on top of the ground.

| Char | Name | Blocks movement | Blocks sight | Muffles noise | Notes |
|---|---|---|---|---|---|
| `#` | plaster wall | yes | yes | yes | building wall |
| `C` | clapboard wall | yes | yes | yes | building wall |
| `L` | log wall | yes | yes | yes | building wall |
| `K` | brick wall | yes | yes | yes | building wall |
| `Y` | cinder block | yes | yes | yes | building wall |
| `A` | barn boards | yes | yes | yes | building wall |
| `W` | window | yes |  | yes | goes in a wall |
| `+` | door |  |  | yes | goes in a wall, walkable over anything |
| `G` | garage door | yes | yes | yes | goes in a wall |
| `S` | fieldstone wall | yes |  |  | fence line |
| `|` | split-rail fence | yes |  |  | fence line |
| `p` | picket fence | yes |  |  | fence line |
| `c` | chain-link fence | yes |  |  | fence line |
| `b` | barbed wire | yes |  |  | fence line |
| `f` | board fence | yes | yes |  | fence line |
| `g` | gate |  |  |  | walkable over anything |
| `%` | hedge | yes | yes | yes | fence line |
| `u` | guardrail | yes |  |  |  |
| `H` | bridge |  |  |  | walkable over anything |
| `D` | dock |  |  |  | walkable over anything, loud footsteps |
| `T` | railroad track |  |  |  | loud footsteps |
| `^` | steps |  |  |  | walkable over anything, joins two heights |
| `v` | ledge |  |  |  | one-way drop |

Wall colours [base, lines]: plaster `#d8ccb0` `#b0a488`, clapboard `#ece8dc` `#b8b4a8`, log `#8a5e34` `#5e3e20`, brick `#a8463a` `#7a2e24`, cinder `#a8a8a2` `#7e7e78`, barn `#a83a2a` `#7a2618`.

## 3. Objects

Things with a footprint (width x height in tiles; turned, they swap). Drawn whole over their footprint.

| Char | Name | Size | Blocks movement | Blocks sight | Colour |
|---|---|---|---|---|---|
| | **Vehicles** | | | | |
| `c` | car | 3 x 2 | yes |  | `#b8312f` |
| `p` | pickup | 3 x 2 | yes |  | `#3a6a9a` |
| `w` | station wagon | 3 x 2 | yes |  | `#8a6a3a` |
| `v` | van | 4 x 2 | yes | yes | `#e2e2dc` |
| `R` | camper | 4 x 2 | yes | yes | `#e8dcc0` |
| `B` | school bus | 6 x 2 | yes | yes | `#e8b820` |
| `L` | logging truck | 5 x 2 | yes | yes | `#6a4a2a` |
| `t` | tractor | 3 x 2 | yes |  | `#3a8a3a` |
| `X` | wrecked car | 3 x 2 | yes |  | `#5a4a44` |
| `k` | canoe | 2 x 1 | yes |  | `#c05030` |
| | **Trees and the woods** | | | | |
| `T` | maple | 1 x 1 | yes | yes | `#c05a28` |
| `N` | pine | 1 x 1 | yes | yes | `#1e4a24` |
| `j` | birch | 1 x 1 | yes | yes | `#d8c040` |
| `a` | apple tree | 1 x 1 | yes | yes | `#3a7a2a` |
| `y` | shrub | 1 x 1 | yes |  | `#3a6a2a` |
| `q` | berry bush | 1 x 1 | yes |  | `#2e5a24` |
| `u` | stump | 1 x 1 | yes |  | `#8a6a44` |
| `Y` | boulder | 1 x 1 | yes |  | `#8a847c` |
| `h` | hay bale | 1 x 1 | yes |  | `#d8b860` |
| `W` | woodpile | 2 x 1 | yes |  | `#8a5a30` |
| `O` | outhouse | 1 x 1 | yes | yes | `#8a6a44` |
| `e` | tent | 2 x 2 | yes | yes | `#c08030` |
| `r` | campfire ring | 1 x 1 |  |  |  |
| `f` | fishing spot | 1 x 1 |  |  |  |
| | **Roadside** | | | | |
| `s` | sign | 1 x 1 | yes |  |  |
| `g` | gas pump | 1 x 1 | yes |  | `#c03030` |
| `P` | payphone | 1 x 1 | yes |  | `#c0c8d0` |
| `m` | mailbox | 1 x 1 | yes |  | `#5a5a60` |
| `o` | oil drum | 1 x 1 | yes |  | `#3a5a8a` |
| `d` | dumpster | 2 x 1 | yes | yes | `#3a6a3a` |
| `n` | trash can | 1 x 1 | yes |  | `#8a8a8a` |
| `l` | lamppost | 1 x 1 | yes |  | `#2a2a2a` |
| `A` | billboard | 3 x 1 | yes | yes | `#e8e0c0` |
| `F` | flagpole | 1 x 1 | yes |  | `#c03030` |
| | **Indoors** | | | | |
| `x` | shelves | 1 x 1 | yes |  | `#b08850` |
| `b` | bench | 2 x 1 | yes |  | `#8a5a30` |
| `E` | bed | 1 x 2 | yes |  | `#4a6aa8` |
| `Q` | table | 2 x 1 | yes |  | `#9a7040` |
| `z` | chair | 1 x 1 | yes |  | `#7a5430` |
| `V` | sofa | 2 x 1 | yes |  | `#6a7a4a` |
| `K` | counter | 1 x 1 | yes |  | `#c8c0b0` |
| `H` | wood stove | 1 x 1 | yes |  | `#2a2a2a` |
| `G` | fridge | 1 x 1 | yes | yes | `#e8e8e0` |
| `U` | bathtub | 2 x 1 | yes |  | `#f0f0f0` |
| `J` | desk | 2 x 1 | yes |  | `#7a5430` |

## 4. Roofs

A roof covers a building: shown from outside, hidden while you're inside it. Needs edges (eaves) and ideally a ridge.

| Char | Name | Colours |
|---|---|---|
| `R` | red roof | `#a84a3a` `#7a3428` |
| `S` | slate roof | `#5c636b` `#3e444b` |
| `B` | brown roof | `#7a5a3a` `#54402a` |
| `G` | green roof | `#4a7a4a` `#2e5a2e` |
| `T` | tin roof | `#9aa2a8` `#6e767c` |
| `W` | white roof | `#e8e8e0` `#b0b0a8` |

## 5. Markers (editor only)

| Char | Name |
|---|---|
| `@` | player start |
| `Z` | zombie spawn |
| `L` | landmark label |
| `I` | loot spot |
| `K` | key-item spot |
| `W` | blocked-road spot |
| `N` | NPC spot |

## 6. Creatures and items

Drawn as letters for now, always one tile.

| Glyph | What | Colour |
|---|---|---|
| @ | you | `#ffdd33` |
| Z | zombie | `#6fcf4f` |
| % | zombie corpse | `#7a2a2a` |
| / | walking stick | `#b08850` |
| / | cricket bat | `#e8d8a0` |
| % | tin of beans | `#d07030` |
| + | bandage | `#f0f0f0` |

Badges over zombies: yellow `!` (after you), grey `?` (looking for you).

## 7. Old region tiles

Used only by the built-in region map (src/sim/gen/region.js) until your maps replace it; not in the editor. wall, moor, road line h, road line v, setts, yard, doorstep, gate, steps, bridge, weir, crag, rock, lowwall, hedge, fence, tree, rail, platform, crossing, tunnel, grave, ruin, carriage, carriage end, barrier, arch, market cross, parapet, padlock, and the building-token roofs and walls (slate / red tiles / metal / flat / glass roofs by slope; stone / brick / render / wood / metal walls with windows, doors and shopfronts).
