# Draws the region plan (New England, early 1980s) on the real 25x25 screen grid.
# Everything runs on the grid, like the movement: roads, trails, the railway and the river go
# only north-south or east-west, with square corners; places, fields, the lake and the mountains
# have blocky edges. Coordinates are game tiles (179 x 279; screens step 7 across, 11 down).
# Run from the repo root: python3 docs/region-plan-map.py  ->  docs/region-plan.png
from PIL import Image, ImageDraw, ImageFont
import random

W, H, S, PAD = 179, 279, 4, 14
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f_small = ImageFont.truetype(FONT, 11); f_num = ImageFont.truetype(BOLD, 10)
f_big = ImageFont.truetype(BOLD, 16); f_title = ImageFont.truetype(BOLD, 21)
f_leg = ImageFont.truetype(FONT, 13); f_legb = ImageFont.truetype(BOLD, 14); f_tag = ImageFont.truetype(BOLD, 13)

P = lambda x, y: (PAD + x * S, PAD + 40 + y * S)
def box(d, x0, y0, x1, y1, fill, outline=None, width=1):
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1))
    d.rectangle([P(x0, y0), P(x1, y1)], fill=fill, outline=outline, width=width)
def way(d, pts, w, fill):
    """A way of width w tiles along orthogonal corner points (centre line)."""
    h = w / 2
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        assert x0 == x1 or y0 == y1, ('not straight', (x0, y0), (x1, y1))
        box(d, min(x0, x1) - h, min(y0, y1) - h, max(x0, x1) + h, max(y0, y1) + h, fill)
def dashed(d, pts, fill, w=1):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        assert x0 == x1 or y0 == y1
        n = int(abs(x1 - x0) + abs(y1 - y0))
        for k in range(0, n, 4):
            a, b = k / n, min(1, (k + 2) / n)
            box(d, x0 + (x1 - x0) * a - w / 2, y0 + (y1 - y0) * a - w / 2, x0 + (x1 - x0) * b + w / 2, y0 + (y1 - y0) * b + w / 2, fill)

img = Image.new('RGB', (PAD * 2 + W * S, 40 + PAD * 2 + H * S + 1300), '#f2ead6')
d = ImageDraw.Draw(img, 'RGBA')
d.text((PAD, 10), 'The region: New England, early 1980s (plan v2: on the grid)', font=f_title, fill='#222')

# Forest everywhere, as square trees.
box(d, 0, 0, W, H, '#4f7d3c')
rnd = random.Random(1981)
for _ in range(2200):
    x, y = rnd.randrange(0, W), rnd.randrange(0, H)
    box(d, x, y, x + 1, y + 1, (36, 84, 36, 150))
# Mountains: a stepped band along the top; the notch road climbs through it.
for (x0, x1, y1) in [(0, 30, 40), (30, 58, 46), (58, 84, 38), (84, 92, 30), (100, 116, 30), (116, 140, 44), (140, 179, 36)]:
    box(d, x0, 0, x1, y1, '#8f8a80')
for (x, y) in [(14, 16), (44, 20), (70, 14), (128, 20), (158, 14)]:
    box(d, x - 6, y - 4, x + 6, y + 6, '#a8a398', '#6a665e'); box(d, x - 2, y - 4, x + 2, y - 1, '#ffffff')
# Loon Lake: blocky, with its island. Pine Pond, the swamp, the quarry, the fire tower hill.
for (x0, y0, x1, y1) in [(8, 50, 60, 90), (14, 46, 52, 52), (16, 88, 48, 96), (58, 58, 64, 84)]:
    box(d, x0, y0, x1, y1, '#4a86c8')
box(d, 28, 64, 38, 72, '#4f7d3c', '#2a4a2a')
box(d, 22, 228, 34, 238, '#4a86c8')
box(d, 78, 222, 102, 238, '#6f8a5a')
for k in range(30):
    x, y = rnd.randrange(80, 100), rnd.randrange(224, 236); box(d, x, y, x + 2, y + 0.6, '#4a86c8')
box(d, 40, 246, 56, 262, '#b8ad98', '#7a7060', 2)
box(d, 110, 58, 126, 72, '#6a8a50')
# Farmland round Apple Hill: rectangular fields; orchard rows.
box(d, 0, 146, 64, 210, '#b9c97e')
for gx in range(0, 64, 10): box(d, gx, 146, gx + 0.4, 210, (60, 90, 40, 140))
for gy in range(146, 210, 9): box(d, 0, gy, 64, gy + 0.4, (60, 90, 40, 140))
for (x, y) in [(50, 196), (50, 200), (50, 204), (6, 196), (6, 200), (6, 204)]:
    for k in range(5): box(d, x + k * 2, y, x + k * 2 + 1, y + 1, '#2f6a2a')

# The Kennock River (5 wide): out of the lake, down past Haverly, the gorge, then east through
# Carrick Mills (the falls) and off the map.
RIVER = [(56, 92), (56, 104), (72, 104), (72, 160), (100, 160), (100, 214), (178, 214)]
way(d, [(72, 140), (72, 160), (96, 160)], 11, '#7a7166')          # the gorge's crags
way(d, RIVER, 5, '#3f78c0')
box(d, 119, 211.5, 121, 216.5, '#ffffff')                           # the falls and the dam

# Places: compact, rectangular, with streets on the grid and their exits marked (yellow).
PLACES = [
    ((80, 108, 114, 152), '#d9a37a', 'HAVERLY'),
    ((112, 204, 148, 240), '#c98b6a', 'CARRICK MILLS'),
    ((66, 58, 90, 84), '#e2c28e', 'LOON LAKE'),
    ((16, 158, 46, 190), '#e8d29a', 'APPLE HILL'),
    ((140, 96, 162, 114), '#dcb98a', "COOPER'S CORNER"),
    ((152, 58, 176, 86), '#c9a87a', 'SPRUCE HOLLOW'),
    ((60, 242, 86, 266), '#d8c6a8', 'LEDGEVIEW'),
]
for (x0, y0, x1, y1), col, _ in PLACES:
    box(d, x0, y0, x1, y1, col, '#6a4a2a', 2)
grey = '#7a7a7a'
way(d, [(80, 130), (114, 130)], 4, grey); way(d, [(97, 108), (97, 152)], 3, grey)        # Haverly: Main Street, Elm Street
way(d, [(86, 116), (108, 116)], 2, grey); way(d, [(86, 144), (108, 144)], 2, grey); way(d, [(86, 116), (86, 144)], 2, grey)
box(d, 89, 122, 95, 127, '#8fbf6a'); box(d, 91, 119, 93, 122, '#ffffff', '#555')         # the green and the white church
way(d, [(112, 222), (148, 222)], 3, grey); way(d, [(124, 204), (124, 240)], 3, grey)      # Carrick Mills
for k in range(3): box(d, 113 + k * 5, 206, 117 + k * 5, 212, '#9a4a3a', '#5a2a1a')       # mills on the north bank
box(d, 128, 212, 131, 217, '#8a3a2a', '#222', 1)                                         # the covered bridge
way(d, [(66, 72), (90, 72)], 2, grey); way(d, [(78, 58), (78, 84)], 2, grey)              # Loon Lake
way(d, [(16, 170), (46, 170)], 3, grey); way(d, [(30, 158), (30, 190)], 2, grey)          # Apple Hill
for (x, y) in [(18, 160), (38, 178), (18, 180)]: box(d, x, y, x + 5, y + 6, '#a8382a', '#5a1a10')   # barns
way(d, [(140, 104), (162, 104)], 3, grey); way(d, [(151, 96), (151, 114)], 3, grey)       # the crossroads
box(d, 154, 107, 161, 113, '#333', '#999')                                               # the drive-in
way(d, [(152, 72), (176, 72)], 3, grey); way(d, [(164, 58), (164, 86)], 3, grey)          # Spruce Hollow
box(d, 167, 76, 175, 84, '#b08a5a', '#5a3a1a'); box(d, 154, 60, 161, 66, '#7a5a3a', '#3a2a1a')   # lumber yard, sawmill
way(d, [(60, 254), (86, 254)], 3, grey); way(d, [(72, 242), (72, 266)], 2, grey)          # Ledgeview
box(d, 62, 244, 68, 250, '#9a9a96', '#555')                                              # granite sheds
# Small places to find in the woods: cabins, camps, the dump, a wreck...
SPOTS = [(40, 120), (130, 160), (6, 124), (168, 150), (44, 134), (112, 176), (140, 176), (8, 232),
         (170, 190), (126, 94), (150, 262), (108, 270), (30, 112), (164, 232)]
for (x, y) in SPOTS: box(d, x - 2, y - 2, x + 2, y + 2, '#a0784a', '#3a2a1a', 1)

# Roads between the places (gold); red: roadblocks where they leave the map.
GOLD = '#e8c860'
ROADS = [
    [(0, 170), (16, 170)],                                         # Route 9 west
    [(46, 170), (52, 170), (52, 130), (80, 130)],                  # Route 9: Apple Hill to Haverly (iron bridge)
    [(114, 130), (130, 130), (130, 104), (140, 104)],              # Route 9 east to the crossroads
    [(162, 104), (178, 104)],                                      # Route 9 out east
    [(97, 108), (97, 92), (78, 92), (78, 84)],                     # Lake Road
    [(78, 58), (78, 50), (96, 50), (96, 0)],                       # Notch Road (rockslide in the notch)
    [(106, 152), (106, 198), (124, 198), (124, 204)],              # River Road to Carrick Mills
    [(151, 114), (151, 120), (156, 120), (156, 222), (148, 222)],  # County Road (county bridge)
    [(156, 222), (178, 222)],                                      # out east
    [(151, 96), (151, 90), (164, 90), (164, 86)],                  # logging road to Spruce Hollow
    [(36, 190), (36, 254), (60, 254)],                              # Quarry Road: Apple Hill to Ledgeview
    [(124, 240), (124, 254), (86, 254)],                            # Mills Road: Carrick Mills to Ledgeview
    [(72, 266), (72, 279)],                                         # out south
]
for r in ROADS: way(d, r, 4, '#6a5a3a')
for r in ROADS: way(d, r, 3, GOLD)
way(d, [(164, 58), (164, 40)], 2, '#c9b98f')
for (x, y) in [(1, 170), (177, 104), (72, 277), (177, 222), (96, 2)]:
    box(d, x - 2, y - 2, x + 2, y + 2, '#d02020')
box(d, 161, 54, 167, 56, '#333')                                  # the padlocked gate
box(d, 93, 26, 99, 30, '#6a665e')                                 # the rockslide
# Crossings: the iron bridge, the county bridge, the lake footbridge; the shallows (waders).
for (x0, y0, x1, y1) in [(68, 128, 76, 132), (153, 211, 159, 217), (54, 90, 58, 94)]:
    box(d, x0, y0, x1, y1, '#d9c9a3', '#222', 2)
box(d, 97, 182, 103, 188, None, '#9fd0ff', 3)

# Trails (dashed): the shortcuts and the ways to the wild places.
for t in [[(90, 66), (118, 66), (118, 72)], [(108, 108), (108, 80), (118, 80), (118, 72)], [(30, 190), (30, 228)],
          [(112, 236), (90, 236), (90, 246), (80, 246)], [(46, 160), (50, 160), (50, 100), (24, 100), (24, 96)],
          [(10, 92), (6, 92), (6, 40)], [(46, 186), (88, 186), (88, 222)],
          [(52, 120), (40, 120), (40, 134), (44, 134)], [(40, 120), (30, 120), (30, 112), (6, 112), (6, 124)],
          [(106, 176), (112, 176)], [(156, 150), (168, 150)], [(156, 176), (140, 176)], [(130, 130), (130, 160)],
          [(156, 190), (170, 190)], [(130, 104), (130, 94), (126, 94)], [(36, 232), (8, 232)],
          [(124, 262), (150, 262)], [(86, 266), (86, 270), (108, 270)], [(156, 232), (164, 232)]]:
    dashed(d, t, '#f6efe0', 1.2)

# The railway: from the east edge past the crossroads to Haverly depot, west across Haverly and
# over the gorge on the trestle, down to Apple Hill halt and off the map west.
RAIL = [(178, 120), (114, 120), (114, 146), (60, 146), (60, 184), (0, 184)]
way(d, RAIL, 2, '#222'); way(d, RAIL, 0.5, '#bbb')
box(d, 64, 144.5, 80, 147.5, '#5a3a2a')                           # the trestle
for k in range(3): box(d, 79 - k * 6.2, 145.2, 84 - k * 6.2, 146.8, '#c0392b', '#2a0a0a')   # the stopped train

# Screen grid, home, labels.
for i in range(26): d.line([P(7 * i + 2, 0), P(7 * i + 2, H)], fill=(0, 0, 0, 25), width=1)
for j in range(26): d.line([P(0, 11 * j + 2), P(W, 11 * j + 2)], fill=(0, 0, 0, 25), width=1)
box(d, 22, 164, 28, 168, None, '#ff2a8a', 3)
d.text(P(17, 150.5), 'HOME', font=f_tag, fill='#ff2a8a')
for (x0, y0, x1, y1), _, name in PLACES:
    cx, cy = P((x0 + x1) / 2, y1 + 1)
    tw = d.textlength(name, font=f_big)
    cx = min(cx, PAD + W * S - tw / 2 - 6)
    d.rectangle([cx - tw / 2 - 4, cy, cx + tw / 2 + 4, cy + 20], fill=(255, 255, 255, 215))
    d.text((cx - tw / 2, cy + 1), name, font=f_big, fill='#3a1a0a')

LM = [
    (92, 124, 'Haverly: Main Street, the green and the white church, diner, stores, bank, post office, police, theater'),
    (114, 124, 'Haverly train depot'),
    (72, 146, 'The trestle over the gorge, a passenger train stopped on it: 1-tile aisles, luggage loot'),
    (72, 130, 'Iron bridge: Route 9 over the river into Haverly'),
    (120, 214, 'Carrick Mills: brick mills on the falls, the dam, row houses, the covered bridge'),
    (78, 70, 'Loon Lake village: summer cabins, the lodge, boathouse and marina'),
    (33, 68, 'The island on the lake (needs a boat)'),
    (30, 176, 'Apple Hill: farms, barns, orchards, feed store, grange hall. Home.'),
    (151, 101, "Cooper's Corner: gas station, motel, bar"),
    (157, 110, 'The drive-in'),
    (118, 65, 'Fire tower on the hill: see the whole region'),
    (96, 28, 'Ketchum Notch: road blocked by a rockslide; the ranger station beyond'),
    (164, 46, 'Logging camp up the mountain, behind a padlocked gate (bolt cutters)'),
    (14, 30, 'Old mine in the mountains (dark: flashlight)'),
    (28, 233, 'Summer camp on Pine Pond: archery range (bows)'),
    (90, 230, 'The swamp'),
    (48, 254, 'The granite quarry'),
    (100, 185, 'River shallows (waders)'),
    (56, 92, 'Footbridge at the lake outlet'),
    (11, 200, 'Orchard and cider mill'),
    (156, 214, 'County bridge'),
    (164, 72, 'Spruce Hollow: logging town. Sawmill, lumber yard, bunkhouse, company store, the gun shop'),
    (73, 254, 'Ledgeview: quarry village. Granite sheds, the Odd Fellows hall, the school, the church'),
    (40, 120, 'Hunting camp: three cabins in the woods'),
    (6, 124, "Hermit's cabin by the lake"),
    (30, 112, 'Ranger cabin on the lake shore'),
    (44, 134, 'Sugar shack (maple syrup) in the woods'),
    (130, 160, "Trapper's cabin"),
    (112, 176, 'The town dump (good junk)'),
    (140, 176, 'Campground: tents and RVs, left in a hurry'),
    (168, 150, 'Cabin colony in the pines'),
    (170, 190, 'Radio tower on the hill'),
    (126, 94, 'Hilltop cemetery'),
    (8, 232, 'Abandoned farmhouse'),
    (150, 262, 'A light aircraft down in the woods'),
    (108, 270, 'Fishing shack on Mud Pond'),
    (164, 232, 'Boarded-up roadside motel'),
]
for n, (x, y, _) in enumerate(LM, 1):
    cx, cy = P(x, y)
    d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill='#1d2a6b', outline='white', width=2)
    t = str(n); d.text((cx - d.textlength(t, font=f_num) / 2, cy - 6), t, font=f_num, fill='white')
y0 = 40 + PAD * 2 + H * S + 6
d.text((PAD, y0), 'Key (numbers on the map)', font=f_legb, fill='#222')
for n, (_, _, text) in enumerate(LM, 1):
    tx, ty = PAD, y0 + 24 + (n - 1) * 19
    d.ellipse([tx, ty + 1, tx + 15, ty + 16], fill='#1d2a6b')
    t = str(n); d.text((tx + 7.5 - d.textlength(t, font=f_num) / 2, ty + 2), t, font=f_num, fill='white')
    d.text((tx + 22, ty + 1), text, font=f_small, fill='#222')
ky = y0 + 24 + len(LM) * 19 + 10
notes = [
    'Everything on the grid, like movement: roads, trails, the railway and the river only run N-S or E-W,',
    'with square corners. Places, fields, the lake and the mountains have blocky edges.',
    'Gold = roads (red: roadblocks at the edge). Dashed = trails. Black = railway. Grey = the gorge.',
    'Seven places (3x3 to 5x4 screens); small brown squares = cabins and finds in the woods.',
    'Danger and loot: highest in Haverly, then Carrick Mills, the lake, the crossroads; Apple Hill is quietest.',
]
for i, t in enumerate(notes): d.text((PAD, ky + i * 20), t, font=f_leg, fill='#333')
img = img.crop((0, 0, img.width, ky + len(notes) * 20 + 14))
img.save('docs/region-plan.png'); print(img.size)
