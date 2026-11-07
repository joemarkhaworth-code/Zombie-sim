# Draws the proposed town plan for Brackenby (working name) on the real 25x25 screen grid.
# Coordinates are game tiles: the map is 179 x 279 tiles (screens step 7 across, 11 down).
from PIL import Image, ImageDraw, ImageFont

W, H = 179, 279
S = 4                      # pixels per tile
PAD = 14
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f_small = ImageFont.truetype(FONT, 11)
f_num = ImageFont.truetype(BOLD, 10)
f_label = ImageFont.truetype(BOLD, 15)
f_title = ImageFont.truetype(BOLD, 24)
f_leg = ImageFont.truetype(FONT, 13)
f_legb = ImageFont.truetype(BOLD, 14)

def P(x, y):
    return (PAD + x * S, PAD + 40 + y * S)

def poly(d, pts, fill, outline=None, width=1):
    d.polygon([P(x, y) for x, y in pts], fill=fill, outline=outline, width=width)

def line(d, pts, fill, width):
    d.line([P(x, y) for x, y in pts], fill=fill, width=width, joint='curve')

LEGEND_H = 1400
img = Image.new('RGB', (PAD * 2 + W * S, 40 + PAD * 2 + H * S + LEGEND_H), '#f4f1e6')
d = ImageDraw.Draw(img, 'RGBA')
d.text((PAD, 10), 'BRACKENBY (working name) - proposed town plan', font=f_title, fill='#222')

# --- Countryside base ---------------------------------------------------------------------
poly(d, [(0, 0), (W, 0), (W, H), (0, H)], '#cfe0b0')                       # farmland
# Field pattern (big fields, thorn hedges) on the flat Vale side
for x in range(0, W, 13):
    line(d, [(x, 0), (x + 4, H)], (110, 140, 80, 60), 1)
for y in range(0, H, 17):
    line(d, [(0, y), (W, y + 3)], (110, 140, 80, 60), 1)
# Moor rising to the west (Pennine side)
poly(d, [(0, 0), (16, 0), (22, 40), (14, 90), (6, 118), (0, 120)], '#b9a77f')
# Woods: gorge woods upstream, and a wood south-west
poly(d, [(0, 120), (14, 124), (30, 132), (44, 140), (50, 156), (36, 160), (18, 150), (0, 140)], '#7fa86a')
poly(d, [(0, 212), (40, 208), (55, 225), (48, 262), (0, 270)], '#7fa86a')
# Old quarry (south of the hamlet) and the south farms
poly(d, [(60, 224), (74, 222), (76, 234), (62, 236)], '#b8ad98', '#7a7060', 1)
d.rectangle([P(116, 258), P(128, 268)], fill='#c9a878', outline='#6a5a3a')
d.rectangle([P(4, 192), P(14, 200)], fill='#c9a878', outline='#6a5a3a')
# Golf course (north-west) and racecourse (north-east)
poly(d, [(18, 8), (66, 8), (70, 50), (24, 54)], '#b5dc96')
for gx, gy in [(30, 18), (52, 22), (40, 40), (60, 40)]:
    d.ellipse([P(gx - 1, gy - 1), P(gx + 1, gy + 1)], fill='#e8f5d8')
d.ellipse([P(146, 8), P(176, 92)], outline='#8a6a3a', width=10)
d.rectangle([P(139, 40), P(146, 60)], fill='#8a6a3a')
d.rectangle([P(104, 24), P(116, 34)], fill='#c9a878', outline='#6a5a3a')

# --- Districts ------------------------------------------------------------------------------
TOWN = '#cf8f6d'; INNER = '#ddb08a'; SUB = '#ead8ab'; EDGE_IND = '#b8b8c4'; HAMLET = '#e2c9a0'
poly(d, [(56, 112), (124, 112), (127, 140), (124, 152), (110, 160), (96, 163), (78, 161), (62, 152), (54, 134)], TOWN, '#8a4a2a', 2)
# Inner town: Victorian north (railway side), mill quarter west in the gorge, old cottages east
poly(d, [(54, 76), (132, 76), (134, 112), (124, 112), (56, 112), (50, 96)], INNER, '#9a6a40', 1)
poly(d, [(22, 128), (54, 128), (58, 146), (48, 150), (30, 142)], INNER, '#9a6a40', 1)
poly(d, [(124, 112), (138, 112), (140, 146), (127, 140)], INNER, '#9a6a40', 1)
# Suburbs
poly(d, [(18, 56), (54, 56), (54, 96), (40, 100), (20, 98)], SUB, '#a08a50', 1)          # NW: 1940s/60s semis
poly(d, [(112, 50), (146, 50), (148, 98), (132, 104), (132, 76), (114, 76)], SUB, '#a08a50', 1)   # NE: 1930s-40s
poly(d, [(134, 100), (168, 100), (170, 140), (142, 146), (138, 112)], SUB, '#a08a50', 1)  # E: 1970s estate
poly(d, [(126, 152), (146, 146), (150, 196), (140, 200), (128, 176)], SUB, '#a08a50', 1)  # SE: 1950s-70s on the crag top
poly(d, [(4, 96), (40, 100), (50, 112), (44, 126), (20, 124), (4, 118)], '#e4dcb8', '#a08a50', 1)  # W: big houses in walled grounds
poly(d, [(56, 184), (92, 182), (96, 200), (80, 212), (58, 206)], HAMLET, '#a08a50', 1)   # hamlet across the river
# Edge of town: industrial triangle, supermarket
poly(d, [(150, 146), (172, 140), (174, 206), (152, 210), (144, 196)], EDGE_IND, '#666', 1)
d.rectangle([P(128, 244), P(150, 258)], fill='#9fa3c8', outline='#555')
# Water meadows (ings) south of the river below the town
poly(d, [(98, 172), (126, 172), (136, 196), (112, 196), (96, 184)], '#a8d8a0')
# Cemetery, playing fields, allotments, park
d.rectangle([P(134, 160), P(144, 174)], fill='#9fb890')
d.rectangle([P(130, 180), P(142, 196)], fill='#bde3a0')
d.rectangle([P(116, 100), P(132, 110)], fill='#a6c46a')
poly(d, [(60, 92), (74, 92), (76, 108), (60, 108)], '#9ccd84')
d.rectangle([P(134, 80), P(146, 90)], fill='#bde3a0')

# --- The gorge and the river ------------------------------------------------------------------
RIVER = [(0, 126), (14, 130), (28, 138), (40, 143), (52, 147), (64, 152), (74, 158), (86, 163), (98, 166),
         (112, 166), (124, 170), (132, 180), (138, 194), (144, 206), (150, 220), (158, 234), (168, 246), (178, 254)]
line(d, RIVER[:13], '#8c8577', 34)          # gorge walls (crag) from upstream to below the castle
line(d, RIVER, '#4f86c6', 20)               # the river, 4-6 tiles wide
line(d, RIVER, '#78a8dc', 8)
# Weir at the mill
line(d, [(98, 162), (99, 170)], '#ffffff', 5)

# --- Railway ------------------------------------------------------------------------------------
RAIL_E = [(178, 88), (150, 96), (120, 104), (96, 112), (80, 116)]
RAIL_W = [(70, 164), (60, 180), (40, 205), (15, 230), (0, 240)]
for seg in (RAIL_E, RAIL_W):
    line(d, seg, '#222222', 5)
    line(d, seg, '#f4f1e6', 1)
line(d, [(78, 118), (74, 136), (72, 150)], (34, 34, 34, 140), 3)   # tunnel under the town (dashed-ish)
for t in range(0, 30, 4):
    pass
line(d, [(72, 150), (70, 164)], '#5a3a2a', 9)                        # the viaduct over the gorge
# The stopped train: carriages across the viaduct and back into the tunnel mouth
for k in range(4):
    y0 = 146 + k * 5
    d.rectangle([P(70.6 - 0.002 * k, y0), P(73.4, y0 + 4)], fill='#c0392b', outline='#2a0a0a', width=1)

# --- Roads ----------------------------------------------------------------------------------------
def road(pts, w=9):
    line(d, pts, '#7a7a7a', w + 3)
    line(d, pts, '#efefef', w)
def lane(pts, w=5):
    line(d, pts, '#8a7a5a', w + 2)
    line(d, pts, '#f6eccc', w)
road([(60, 134), (124, 134), (150, 130), (178, 124)], 12)                   # High Street / York Road
road([(60, 134), (56, 140), (50, 146), (48, 152), (40, 165), (20, 180), (0, 190)], 10)  # Bond End, Old Bridge, west road
road([(92, 134), (92, 100), (95, 60), (98, 0)], 10)                        # North Road (old Great North Road)
road([(110, 134), (118, 100), (130, 60), (150, 0)], 8)                     # north-east road
road([(58, 138), (40, 118), (20, 100), (0, 82)], 8)                       # Ripley-style road north-west
road([(124, 134), (134, 160), (144, 206), (150, 225), (166, 262), (178, 272)], 9)  # road south-east over East Bridge
road([(30, 190), (60, 226), (110, 242), (140, 246), (158, 234), (170, 212), (172, 150), (172, 126)], 12)  # the bypass
lane([(100, 148), (108, 158), (112, 166), (114, 172), (98, 184), (78, 194)])  # Briggate, Low Bridge, up to the hamlet
lane([(114, 172), (126, 178)])                                            # Abbey Road along the river
lane([(64, 158), (86, 163), (110, 164)], 4)                               # Waterside under the crag
lane([(64, 124), (84, 122), (110, 124)], 4)                               # Back Lane
lane([(78, 116), (78, 128)], 4)                                           # Station Road
lane([(20, 98), (8, 70), (6, 40)], 4)                                     # lane out to the garden centre / moor
lane([(95, 60), (110, 30)], 4)                                            # farm lane
# Market place: a big triangle between the High Street and the castle
poly(d, [(80, 136), (104, 136), (92, 150)], '#e9dcc0', '#7a7a7a', 2)
d.rectangle([P(89, 140), P(95, 145)], fill='#7a4a3a')                      # old town hall standing alone
# Castle on its crag, with its moat
d.ellipse([P(76, 148), P(96, 161)], outline='#5a5a5a', width=5)
d.rectangle([P(82, 151), P(90, 157)], fill='#6a6a6a')
# Church and graveyard at the top of the steep street
d.rectangle([P(60, 118), P(70, 128)], fill='#a9b896', outline='#555')
d.rectangle([P(63, 121), P(67, 126)], fill='#6a5a4a')

# --- Bridges ---------------------------------------------------------------------------------------
for (bx, by) in [(50, 147), (112, 166), (144, 206), (158, 234)]:
    d.rectangle([P(bx - 3, by - 3), P(bx + 3, by + 3)], fill='#d9c9a3', outline='#3a3a3a', width=2)
d.rectangle([P(15, 128), P(17, 134)], fill='#a07040', outline='#3a3a3a')    # wooden footbridge
d.ellipse([P(126, 176), P(131, 181)], outline='#1a4a8a', width=2)           # the ford (shallows)

# --- Screen grid and the start --------------------------------------------------------------------
for i in range(26):
    x = 7 * i + 2
    d.line([P(x, 0), P(x, H)], fill=(0, 0, 0, 22), width=1)
for j in range(26):
    y = 11 * j + 2
    d.line([P(0, y), P(W, y)], fill=(0, 0, 0, 22), width=1)
sx, sy = 11, 8   # proposed start screen (see doc)
d.rectangle([P(7 * sx, 11 * sy), P(7 * sx + 11, 11 * sy + 15)], outline='#d01060', width=3)

# --- Landmarks ------------------------------------------------------------------------------------
LM = [
    (92, 142, 'Market Place: big triangle, old Town Hall standing alone in it, market cross'),
    (84, 139, 'The Shambles: covered market row'),
    (86, 154, 'Castle ruins on the crag above the gorge, moat, keep, gardens'),
    (65, 123, "St John's church and graveyard, at the top of the steep street"),
    (60, 131, 'The Black Bull, at an angle to the church steps (top square)'),
    (101, 137, 'The Angel: coaching inn, archway to its stable yard'),
    (84, 132, 'Post office (the queueing zombies)'),
    (97, 132, 'Two banks, chemist, Woolworths-style shop, newsagent'),
    (80, 115, 'Railway station; the line runs in a tunnel under the town'),
    (66, 155, 'Viaduct with a train stopped on it: 1-tile aisles, luggage loot'),
    (50, 146, 'Old Bridge: medieval stone, 3 wide, the main road crossing'),
    (112, 166, 'Low Bridge: Briggate down to Waterside and Abbey Road'),
    (98, 166, 'Castle Mill and its weir'),
    (80, 164, 'Waterside: boat landing, cafe, riverside pub, cottages; steps up'),
    (56, 140, 'Bond End: steep setted street, church top to the river'),
    (36, 139, 'Low Mill by the river: weavers cottages, folds, mill terraces'),
    (67, 100, 'Victorian park with bandstand'),
    (100, 97, 'Board school (Victorian, stone)'),
    (124, 105, 'Allotments field beside the railway'),
    (44, 108, 'The Grange: old workhouse, now a hospital'),
    (104, 124, 'Methodist chapel on Back Lane'),
    (112, 128, 'Picture House cinema (1915)'),
    (118, 140, 'Police station, fire station, Co-op (1897, 3 storeys)'),
    (139, 167, 'Cemetery (1876)'),
    (136, 154, 'Swimming baths / leisure centre'),
    (136, 188, 'High school and playing fields; cricket club'),
    (126, 70, 'Parade of 1930s shops ("Top Shops")'),
    (140, 85, 'King George V playing field'),
    (152, 124, 'Small Co-op on its green; play area'),
    (163, 172, 'Industrial estate: brewery, car dealers, sheds, sewage works'),
    (158, 152, 'Football ground'),
    (166, 220, 'Caravan park on the low ground by the river'),
    (139, 251, 'Superstore at the bypass roundabout (opened 1990)'),
    (161, 50, 'Racecourse and grandstand'),
    (42, 30, 'Golf course and clubhouse'),
    (7, 66, 'Garden centre on the lane out'),
    (14, 118, 'The Hall and grounds by the river (crazy golf)'),
    (16, 131, 'Wooden footbridge in the gorge woods'),
    (44, 156, 'The Dropping Well: show cave on the far bank'),
    (76, 196, 'Hamlet across the river: pub on the junction, chapel, quarry cricket'),
    (128, 186, 'Water meadows (the ings); the ford: shallows, wellies needed'),
    (144, 206, 'East Bridge: the road south-east'),
    (158, 234, 'Bypass bridge (concrete, 1980s)'),
    (110, 30, 'Farm: farmhouse, barn, yard'),
    (126, 122, 'Park Row: old cottages built of castle stone; 1936 terraces'),
    (28, 246, 'Scout hut and archery range in the woods (bows and arrows)'),
    (122, 264, 'Farm south of the bypass'),
    (66, 230, 'Old quarry'),
    (8, 196, 'Farm on the west road; the moor road climbs on'),
]
for n, (x, y, _) in enumerate(LM, 1):
    cx, cy = P(x, y)
    d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill='#1d2a6b', outline='white', width=2)
    t = str(n)
    tw = d.textlength(t, font=f_num)
    d.text((cx - tw / 2, cy - 6), t, font=f_num, fill='white')

# District labels
def label(x, y, text, col='#3a2a1a'):
    cx, cy = P(x, y)
    tw = d.textlength(text, font=f_label)
    d.text((cx - tw / 2 + 1, cy + 1), text, font=f_label, fill=(255, 255, 255, 180))
    d.text((cx - tw / 2, cy), text, font=f_label, fill=col)
label(106, 126, 'TOWN CENTRE')
label(92, 84, 'INNER TOWN (Victorian)')
label(36, 76, 'SUBURBS 1940s-60s')
label(130, 58, 'SUBURBS 1930s')
label(152, 108, '1970s ESTATE')
label(140, 150, '1950s-70s')
label(26, 108, 'BIG HOUSES')
label(76, 204, 'HAMLET')
label(162, 190, 'INDUSTRIAL')
label(10, 30, 'MOOR', '#4a3a1a')
label(90, 20, 'FARMLAND', '#3a5a2a')
label(90, 262, 'FARMLAND', '#3a5a2a')
label(30, 238, 'WOODS', '#1a3a1a')
label(40, 176, 'RIVER KELL', '#1a3a7a')
label(92, 172, 'GORGE', '#3a3a3a')

# --- Legend ---------------------------------------------------------------------------------------
y0 = 40 + PAD * 2 + H * S + 6
d.text((PAD, y0), 'Key (numbers on the map)', font=f_legb, fill='#222')
col_w = (W * S) // 2
for n, (_, _, text) in enumerate(LM, 1):
    tx, ty = PAD, y0 + 24 + (n - 1) * 19
    d.ellipse([tx, ty + 1, tx + 15, ty + 16], fill='#1d2a6b')
    t = str(n)
    d.text((tx + 7.5 - d.textlength(t, font=f_num) / 2, ty + 2), t, font=f_num, fill='white')
    d.text((tx + 22, ty + 1), text, font=f_small, fill='#222')
ky = y0 + 24 + len(LM) * 19 + 10
items = [(TOWN, 'Town centre: most zombies, best loot'), (INNER, 'Inner town: Victorian terraces, mills'),
         (SUB, 'Suburbs: semis, estates, cul-de-sacs'), (EDGE_IND, 'Edge: industry, superstore, racecourse'),
         ('#4f86c6', 'River in a gorge (grey = crags)'), ('#7fa86a', 'Woods'), ('#b9a77f', 'Moor'),
         ('#cfe0b0', 'Farmland')]
for i, (c, t) in enumerate(items):
    tx, ty = PAD + (i % 2) * col_w, ky + (i // 2) * 22
    d.rectangle([tx, ty + 2, tx + 18, ty + 16], fill=c, outline='#555')
    d.text((tx + 24, ty), t, font=f_leg, fill='#222')
ky += 4 * 22 + 8
notes = [
    'Thick grey = main roads; cream = lanes; black = railway (faint = tunnel; brown = viaduct).',
    'Squares on the river = road bridges; brown = footbridge; blue ring = ford; white = weir.',
    'Faint grid = the 25 x 25 screens. Pink box = proposed start screen (your house).',
    'At true scale the whole map is about 270 m x 420 m, so the town is compressed:',
    'buildings are full size, but each district has a few representative streets.',
]
for i, t in enumerate(notes):
    d.text((PAD, ky + i * 20), t, font=f_leg, fill='#333')

out = 'docs/town-plan.png'  # run from the repo root: python3 docs/town-plan-map.py
img = img.crop((0, 0, img.width, ky + len(notes) * 20 + 14))
img.save(out)
print(out, img.size)
