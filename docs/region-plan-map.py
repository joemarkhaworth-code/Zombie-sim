# Draws the region plan (New England, early 1980s) on the real 25x25 screen grid.
# Coordinates are game tiles: the map is 179 x 279 tiles (screens step 7 across, 11 down).
# Run from the repo root: python3 docs/region-plan-map.py  ->  docs/region-plan.png
from PIL import Image, ImageDraw, ImageFont

W, H, S, PAD = 179, 279, 4, 14
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f_small = ImageFont.truetype(FONT, 11); f_num = ImageFont.truetype(BOLD, 10)
f_label = ImageFont.truetype(BOLD, 14); f_big = ImageFont.truetype(BOLD, 17)
f_title = ImageFont.truetype(BOLD, 21); f_leg = ImageFont.truetype(FONT, 13); f_legb = ImageFont.truetype(BOLD, 14)

P = lambda x, y: (PAD + x * S, PAD + 40 + y * S)
def poly(d, pts, fill, outline=None, width=1): d.polygon([P(x, y) for x, y in pts], fill=fill, outline=outline, width=width)
def line(d, pts, fill, width): d.line([P(x, y) for x, y in pts], fill=fill, width=width, joint='curve')
def dashed(d, pts, fill, width=3, on=3, off=2):
    import math
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / (on + off)))
        for k in range(n):
            a, b = k / n, (k + on / (on + off)) / n
            line(d, [(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill, width)

img = Image.new('RGB', (PAD * 2 + W * S, 40 + PAD * 2 + H * S + 1300), '#f2ead6')
d = ImageDraw.Draw(img, 'RGBA')
d.text((PAD, 10), 'The region: New England, early 1980s (plan)', font=f_title, fill='#222')

# Wilderness: forest everywhere, with clearings, fields round the farm village.
poly(d, [(0, 0), (W, 0), (W, H), (0, H)], '#4f7d3c')
import random
rnd = random.Random(1981)
for _ in range(1400):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    r = rnd.uniform(0.8, 1.6)
    d.ellipse([P(x - r, y - r), P(x + r, y + r)], fill=(40, 90, 40, 120))
# Mountains along the top, Mount Ketchum, the notch.
MOUNT = [(0, 0), (W, 0), (W, 34), (160, 44), (138, 36), (112, 46), (100, 30), (92, 30), (82, 44), (60, 38), (36, 46), (0, 40)]
poly(d, MOUNT, '#8f8a80')
for (x, y) in [(20, 18), (50, 14), (72, 22), (124, 16), (150, 20), (170, 12)]:
    poly(d, [(x - 9, y + 10), (x, y - 8), (x + 9, y + 10)], '#a8a398', '#6a665e')
    poly(d, [(x - 3, y - 2), (x, y - 8), (x + 3, y - 2)], '#ffffff')
line(d, [(96, 46), (96, 30), (96, 0)], '#c9b98f', 6)   # Ketchum Notch road
# Farmland round Apple Hill, orchards.
poly(d, [(0, 150), (60, 146), (66, 200), (40, 212), (0, 206)], '#b9c97e')
for gx in range(4, 62, 9):
    line(d, [(gx, 150), (gx + 2, 206)], (90, 110, 50, 90), 1)
for (x, y) in [(52, 160), (56, 168), (52, 176), (8, 196), (14, 200)]:
    for k in range(4):
        d.ellipse([P(x + k * 1.6 - 0.7, y - 0.7), P(x + k * 1.6 + 0.7, y + 0.7)], fill='#2f6a2a')
# Loon Lake (with its island), Pine Pond, the swamp.
LAKE = [(10, 52), (48, 46), (68, 54), (66, 64), (62, 84), (46, 96), (22, 94), (8, 74)]
poly(d, LAKE, '#4a86c8')
d.ellipse([P(28, 66), P(38, 74)], fill='#4f7d3c', outline='#2a4a2a')
d.ellipse([P(22, 228), P(34, 238)], fill='#4a86c8')
poly(d, [(80, 214), (104, 212), (108, 232), (86, 236)], '#6f8a5a')
for k in range(30):
    x, y = rnd.uniform(82, 106), rnd.uniform(215, 233)
    d.line([P(x, y), P(x + 1.5, y)], fill='#4a86c8', width=2)
# The quarry, the fire tower hill.
d.ellipse([P(62, 244), P(80, 258)], fill='#b8ad98', outline='#7a7060', width=2)
d.ellipse([P(110, 56), P(128, 72)], fill='#6a8a50')

# The Kennock River: from the lake, past Haverly through its gorge, over the falls at the mills.
RIVER = [(62, 88), (68, 100), (74, 116), (76, 132), (78, 148), (84, 162), (96, 176), (110, 190), (122, 204), (128, 214),
         (138, 230), (152, 246), (166, 256), (178, 262)]
line(d, RIVER[3:8], '#7a7166', 28)        # the gorge (crags) below Haverly
line(d, RIVER, '#3f78c0', 18)
line(d, RIVER, '#6fa0dc', 6)
line(d, [(124, 211), (132, 211)], '#ffffff', 5)   # the falls and the dam

# Settlements: compact, each a few screens, with a strong identity.
PLACES = [
    ((80, 108, 114, 152), '#d9a37a', 'HAVERLY', 'the town'),
    ((112, 204, 148, 240), '#c98b6a', 'CARRICK MILLS', 'the mill town'),
    ((66, 58, 90, 84), '#e2c28e', 'LOON LAKE', 'the lake village'),
    ((16, 158, 46, 190), '#e8d29a', 'APPLE HILL', 'the farm village'),
    ((140, 96, 162, 114), '#dcb98a', "COOPER'S CORNER", 'the crossroads'),
]
for (x0, y0, x1, y1), col, _, _ in PLACES:
    d.rounded_rectangle([P(x0, y0), P(x1, y1)], radius=10, fill=col, outline='#6a4a2a', width=2)
# Hint at their streets.
def street(pts, w=4): line(d, pts, '#7a7a7a', w)
street([(80, 130), (114, 130)], 5); street([(97, 108), (97, 152)], 4); street([(86, 116), (108, 116)], 3); street([(86, 144), (108, 144)], 3)
d.rectangle([P(92, 124), P(102, 129)], fill='#8fbf6a')                       # the town green
d.rectangle([P(95, 121), P(99, 124)], fill='#ffffff', outline='#555')        # the white church
street([(112, 222), (148, 222)], 4); street([(126, 204), (126, 240)], 4)
for k in range(3): d.rectangle([P(114 + k * 5, 208), P(118 + k * 5, 214)], fill='#9a4a3a', outline='#5a2a1a')   # the mills
street([(66, 72), (90, 72)], 3); street([(78, 58), (78, 84)], 3)
street([(16, 175), (46, 175)], 4); street([(30, 158), (30, 190)], 3)
for (x, y) in [(20, 162), (38, 182), (22, 182)]: d.rectangle([P(x, y), P(x + 5, y + 6)], fill='#a8382a', outline='#5a1a10')   # barns
street([(140, 105), (162, 105)], 4); street([(151, 96), (151, 114)], 4)
d.rectangle([P(154, 108), P(162, 114)], fill='#333', outline='#999')          # the drive-in screen lot

# Roads between the places (gold), roadblocks where they leave the map (red).
def road(pts, w=7):
    line(d, pts, '#6a5a3a', w + 3); line(d, pts, '#e8c860', w)
road([(0, 176), (16, 175)]); road([(46, 175), (60, 156), (70, 136), (80, 130)])          # Route 9 west: Apple Hill to Haverly
road([(114, 130), (128, 118), (140, 105)]); road([(162, 105), (178, 100)])            # Route 9 east: the crossroads
road([(97, 108), (102, 98), (92, 90), (84, 84)])                                       # Lake Road
road([(78, 58), (88, 48), (96, 46)], 5)                                                # up to the notch
road([(104, 152), (112, 170), (118, 186), (126, 204)])                                 # River Road to the mills
road([(126, 240), (128, 279)]); road([(151, 114), (156, 160), (156, 196), (148, 222)])  # county road; south out
road([(148, 222), (178, 226)])
road([(151, 96), (150, 82)], 5); line(d, [(150, 82), (150, 52)], '#c9b98f', 5)       # logging road past the gate
for (x, y) in [(1, 176), (177, 100), (128, 277), (177, 226), (96, 2)]:
    d.rectangle([P(x - 2, y - 2), P(x + 2, y + 2)], fill='#d02020')
# Trails (dashed).
for t in [[(90, 70), (110, 64), (118, 64)], [(108, 110), (114, 80), (118, 70)], [(30, 190), (28, 212), (28, 228)],
          [(126, 236), (110, 236), (96, 232), (80, 240), (72, 246)], [(46, 160), (40, 120), (24, 98)], [(16, 92), (10, 60), (18, 40)],
          [(46, 190), (70, 200), (84, 214)]]:
    dashed(d, t, '#f6efe0', 3)

# The railway: east edge, the crossroads, Haverly depot, over the gorge on the trestle, Apple Hill halt, west edge.
RAIL = [(178, 128), (150, 120), (114, 136), (100, 140), (88, 150), (80, 158), (70, 166), (46, 178), (16, 186), (0, 190)]
line(d, RAIL, '#222', 5); line(d, RAIL, '#f2ead6', 1)
line(d, [(86, 151), (73, 164)], '#5a3a2a', 9)     # the trestle
for k in range(3):
    cx, cy = 85 - k * 4.2, 152.5 + k * 4.2
    d.polygon([P(cx - 1, cy - 2.6), P(cx + 2.6, cy + 1), P(cx + 1, cy + 2.6), P(cx - 2.6, cy - 1)], fill='#c0392b', outline='#2a0a0a')

# Crossings of the river.
for (x, y, col) in [(70, 136, '#d9c9a3'), (126, 212, '#8a3a2a'), (64, 92, '#a07040')]:
    d.rectangle([P(x - 3, y - 2), P(x + 3, y + 2)], fill=col, outline='#222', width=2)
d.ellipse([P(105, 184), P(111, 190)], outline='#1a4a8a', width=3)   # the shallows (waders)

# Screen grid and home.
for i in range(26): d.line([P(7 * i + 2, 0), P(7 * i + 2, H)], fill=(0, 0, 0, 25), width=1)
for j in range(26): d.line([P(0, 11 * j + 2), P(W, 11 * j + 2)], fill=(0, 0, 0, 25), width=1)
d.rectangle([P(22, 164), P(28, 170)], outline='#ff2a8a', width=3)
d.text(P(18, 152), 'HOME', font=f_label, fill='#ff2a8a')

for (x0, y0, x1, y1), col, name, what in PLACES:
    cx, cy = P((x0 + x1) / 2, y1 + 1)
    tw = d.textlength(name, font=f_big)
    d.rectangle([cx - tw / 2 - 4, cy, cx + tw / 2 + 4, cy + 21], fill=(255, 255, 255, 215))
    d.text((cx - tw / 2, cy + 1), name, font=f_big, fill='#3a1a0a')

LM = [
    (97, 126, "Haverly: Main Street, the green and the white church, diner, general store, bank, post office, police, theater"),
    (110, 136, 'Haverly train depot'),
    (80, 157, 'The trestle over the gorge, a passenger train stopped on it: 1-tile aisles, luggage loot'),
    (70, 136, 'Iron bridge: Route 9 over the river into Haverly'),
    (126, 212, 'Carrick Mills: brick mills on the falls, the dam, row houses, the covered bridge'),
    (78, 70, 'Loon Lake village: summer cabins, the lodge, boathouse and marina'),
    (33, 70, 'The island on the lake (needs a boat)'),
    (30, 172, 'Apple Hill: farms, barns, orchards, feed store, grange hall. Home.'),
    (151, 105, "Cooper's Corner: gas station, motel, bar"),
    (158, 111, 'The drive-in'),
    (118, 64, 'Fire tower on the hill: see the whole region'),
    (96, 24, 'Ketchum Notch: road blocked by a rockslide; the ranger station beyond'),
    (150, 66, 'Logging camp behind a padlocked gate (bolt cutters)'),
    (20, 30, 'Old mine in the mountains (dark: flashlight)'),
    (28, 233, 'Summer camp on Pine Pond: archery range (bows)'),
    (94, 224, 'The swamp'),
    (71, 251, 'The quarry'),
    (108, 187, 'River shallows (waders)'),
    (64, 92, 'Footbridge at the lake outlet'),
    (12, 198, 'Orchard and cider mill'),
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
    'Gold = roads (red squares: roadblocks where they leave the map). Dashed = trails. Black = railway.',
    'Grey round the river below Haverly = the gorge. White on the river = the falls and dam.',
    'Each place is 2x2 to 5x4 screens; everything else is wilderness. Faint grid = the 25 x 25 screens.',
    'Walking Apple Hill to Haverly: ~9 screens (~2 game hours). Haverly to Carrick Mills: ~8 screens.',
    'Danger and loot: highest in Haverly, then Carrick Mills, the lake, the crossroads; Apple Hill is quietest.',
]
for i, t in enumerate(notes): d.text((PAD, ky + i * 20), t, font=f_leg, fill='#333')
img = img.crop((0, 0, img.width, ky + len(notes) * 20 + 14))
img.save('docs/region-plan.png'); print(img.size)
