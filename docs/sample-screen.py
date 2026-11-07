# Draws a sample street screen (outside scale) and the inside of one house (true scale), greybox style.
# One camera angle everywhere (looking north, a little from above): you see every roof, and only the
# walls that face you. Buildings that face away show their roof and back, with a hanging sign over
# the pavement. Inside, Pokemon-style: the back wall as a strip, the floor filling the screen, no
# outer walls drawn round it.
# Run from the repo root: python3 docs/sample-screen.py  ->  docs/sample-screen.png
from PIL import Image, ImageDraw, ImageFont

T = 40                       # pixels per tile
COLS, ROWS = 11, 15          # one screen
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
f_title = ImageFont.truetype(BOLD, 20)
f_cap = ImageFont.truetype(FONT, 14)
f_glyph = ImageFont.truetype(MONO, 26)
f_big = ImageFont.truetype(MONO, 60)
f_tiny = ImageFont.truetype(BOLD, 10)

GAP, TOP, CAP = 30, 46, 250
W = COLS * T * 2 + GAP * 3
H = TOP + ROWS * T + CAP
img = Image.new('RGB', (W, H), '#f4f1e6')
d = ImageDraw.Draw(img)

def panel(ox, oy, title):
    d.text((ox, 12), title, font=f_title, fill='#222')
    d.rectangle([ox - 2, oy - 2, ox + COLS * T + 1, oy + ROWS * T + 1], outline='#222', width=2)

def glyph(px, py, size, ch, fg, bg=None, font=f_glyph):
    if bg:
        d.rectangle([px + 3, py + 3, px + size - 4, py + size - 4], fill=bg)
    bb = d.textbbox((0, 0), ch, font=font)
    d.text((px + (size - (bb[2] - bb[0])) / 2 - bb[0], py + (size - (bb[3] - bb[1])) / 2 - bb[1]), ch, font=font, fill=fg)

# ---------------- Left: a High Street screen, outside scale ----------------
ox, oy = GAP, TOP
panel(ox, oy, 'Outside: the High Street (one screen)')
X = lambda x: ox + x * T
Y = lambda y: oy + y * T

def pitched_roof(x, y, w, h, far='#5c636b', near='#474d54', ridge_at=0.5):
    """A pitched roof seen from the south: the far slope (lit) above the ridge, the near slope below."""
    ry = Y(y) + int(h * T * ridge_at)
    d.rectangle([X(x), Y(y), X(x + w) - 1, ry], fill=far)
    d.rectangle([X(x), ry, X(x + w) - 1, Y(y + h) - 1], fill=near)
    def shade(c, f):
        c = c.lstrip('#'); return '#' + ''.join(f'{max(0, int(int(c[i:i + 2], 16) * f)):02x}' for i in (0, 2, 4))
    for k in range(1, h * 3):                       # slate courses, a touch darker than the slope
        yy = Y(y) + k * T // 3
        if abs(yy - ry) < 4:
            continue
        d.line([X(x), yy, X(x + w) - 1, yy], fill=shade(far if yy < ry else near, 0.9), width=1)
    d.line([X(x), ry, X(x + w) - 1, ry], fill='#2a2e33', width=3)              # ridge
    d.line([X(x), Y(y + h) - 1, X(x + w) - 1, Y(y + h) - 1], fill='#2a2e33', width=2)  # eaves

def stack(px, ry):                                   # a shared chimney stack on the ridge
    d.rectangle([px - 9, ry - 16, px + 9, ry + 6], fill='#6a5a50', outline='#3a2e28')
    for k in (-5, 4):
        d.rectangle([px + k - 2, ry - 20, px + k + 3, ry - 15], fill='#8a6a50')

def front_wall(x, y, w, h, col, course):
    d.rectangle([X(x), Y(y), X(x + w) - 1, Y(y + h) - 1], fill=col)
    for k in range(1, h * 3):
        yy = Y(y) + k * T // 3
        d.line([X(x), yy, X(x + w) - 1, yy], fill=course, width=1)

def door(x, y, col='#6a3a1a'):
    d.rectangle([X(x) + 9, Y(y) + 4, X(x + 1) - 10, Y(y + 1) - 1], fill=col)
    d.ellipse([X(x) + 24, Y(y) + 20, X(x) + 28, Y(y) + 24], fill='#d9c060')
    d.rectangle([X(x) + 7, Y(y + 1) - 4, X(x + 1) - 8, Y(y + 1) - 1], fill='#cfc8b8')   # step

def window(x, y, w=1):
    d.rectangle([X(x) + 7, Y(y) + 8, X(x + w) - 8, Y(y + 1) - 9], fill='#9ccbe8', outline='#ece8e0', width=2)
    mx = (X(x) + 7 + X(x + w) - 8) // 2
    d.line([mx, Y(y) + 8, mx, Y(y + 1) - 9], fill='#ece8e0', width=2)

# North side of the street: a terrace, fronts facing you (south). Each house 4 wide x 5 deep:
# roof 3 rows (ridge along the row, chimney stacks on the party walls), front wall 2 rows (two storeys).
houses = [(0, 4, '#b3a688', '#9a8e72'), (4, 4, '#a8463a', '#8a3a2e'), (8, 3, '#b3a688', '#9a8e72')]
for x, w, col, course in houses:
    pitched_roof(x, 0, w, 3, ridge_at=0.45)
for x, w, col, course in houses:
    front_wall(x, 3, w, 2, col, course)
    window(x, 3); window(x + 2, 3) if w == 4 else window(x + 1, 3)
    door(x + 1, 4); window(x + 2, 4) if w == 4 else None
ry = Y(0) + int(3 * T * 0.45)
for px in (X(4), X(8)):
    stack(px, ry)
for px in (X(4), X(8)):
    d.line([px, Y(3), px, Y(5) - 1], fill='#5a4a3a', width=2)             # party walls between fronts

# Pavement, road (4 wide, centre line), pavement
for x in range(COLS):
    d.rectangle([X(x), Y(5), X(x + 1) - 1, Y(6) - 1], fill='#8d8b83', outline='#76746d')
    d.rectangle([X(x), Y(10), X(x + 1) - 1, Y(11) - 1], fill='#8d8b83', outline='#76746d')
d.rectangle([X(0), Y(6), X(COLS) - 1, Y(10) - 1], fill='#2e2f33')
for x in range(0, COLS * T, 30):
    d.line([X(0) + x, Y(8), X(0) + x + 16, Y(8)], fill='#d8d8d0', width=3)
d.line([X(0), Y(6), X(COLS), Y(6)], fill='#5a5a55', width=3)                   # kerbs
d.line([X(0), Y(10) - 1, X(COLS), Y(10) - 1], fill='#5a5a55', width=3)

# South side of the street: the newsagent and the Angel face north (away from you), so you see
# their roofs (near slope at the bottom) and a hanging sign and doorstep on the pavement side.
pitched_roof(0, 11, 5, 4, far='#474d54', near='#5c636b', ridge_at=0.55)        # newsagent
d.rectangle([X(5), Y(11), X(6) - 1, Y(15) - 1], fill='#6f6e68')               # ginnel
for k in range(4):
    d.line([X(5), Y(11 + k), X(6) - 1, Y(11 + k)], fill='#5f5e58', width=1)
pitched_roof(6, 11, 5, 4, far='#3e444b', near='#535960', ridge_at=0.55)         # the Angel (8 wide, carries on east)
stack(X(6) + 30, Y(11) + int(4 * T * 0.55))
# Doorsteps on the street side (their doors are on the far side of the roof from you)
for x in (3, 8):
    d.rectangle([X(x) + 6, Y(11) - 2, X(x + 1) - 7, Y(11) + 5], fill='#cfc8b8', outline='#8a8478')
# Hanging signs over the pavement, on brackets from the front wall
def sign(x, text, bg, fg):
    bx = X(x) + 20
    d.line([bx, Y(11), bx, Y(10) + 6], fill='#222', width=3)
    d.line([bx, Y(10) + 6, bx + 26, Y(10) + 6], fill='#222', width=3)
    d.rectangle([bx + 4, Y(10) + 10, bx + 58, Y(10) + 34], fill=bg, outline='#222', width=2)
    d.text((bx + 8, Y(10) + 16), text, font=f_tiny, fill=fg)
sign(1, 'PAPERS', '#2a5a3a', '#f0e8c0')
sign(9, 'ANGEL', '#1e2a4a', '#e8d080')

# Vehicles (outside sizes): car 2x3, van 2x4 (width x length; here parked along the road), bike 2x1
def vehicle(x, y, length, col, label=None):
    x0, y0, x1, y1 = X(x) + 3, Y(y) + 5, X(x + length) - 4, Y(y + 2) - 6
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=col, outline='#111', width=2)
    d.rectangle([x1 - 30, y0 + 7, x1 - 20, y1 - 7], fill='#7ab0d0')
    d.rectangle([x0 + 12, y0 + 9, x1 - 40, y1 - 9], fill=col, outline='#00000055')
    if label:
        d.text((x0 + 20, (y0 + y1) // 2 - 6), label, font=f_tiny, fill='#555')
vehicle(1, 6, 3, '#b8312f')
vehicle(6, 8, 4, '#e2e2dc', 'VAN')
bx, by = X(6), Y(5)
d.ellipse([bx + 4, by + 10, bx + 30, by + 34], outline='#111', width=3)
d.ellipse([bx + T + 10, by + 10, bx + T + 36, by + 34], outline='#111', width=3)
d.line([bx + 17, by + 22, bx + 40, by + 12, bx + T + 23, by + 22], fill='#1a4aa0', width=3)
d.ellipse([X(4) + 14, Y(10) + 14, X(4) + 26, Y(10) + 26], fill='#333')        # lamp post
d.rectangle([X(10) + 10, Y(5) + 8, X(10) + 30, Y(5) + 32], fill='#3a5a3a')    # bin
glyph(X(4), Y(5), T, '@', '#111', '#ffdd33')
glyph(X(5), Y(7), T, 'Z', '#6fcf4f')
glyph(X(7), Y(10), T, 'Z', '#6fcf4f')

# ---------------- Right: inside the red-brick house, Pokemon-style ----------------
ix, iy = GAP * 2 + COLS * T, TOP
panel(ix, iy, 'Inside: the same house (its own screen)')
d.rectangle([ix, iy, ix + COLS * T - 1, iy + ROWS * T - 1], fill='#0a0a0a')
# True scale: a 5 x 7 house is a 3 x 5 floor (kitchen behind, front room in front, a wall between).
# Shown as the floor filling the screen, with the back wall as a strip along the top. No outer walls.
FW, FH = 3, 5
Z = min((COLS * T) // FW, (ROWS * T) // (FH + 1))      # tile size inside: as big as fits (100 px)
hx = ix + (COLS * T - FW * Z) // 2
hy = iy + (ROWS * T - (FH + 1) * Z) // 2 + Z           # floor starts below the back-wall strip
def ri(x, y, w=1, h=1, pad=0):
    return [hx + x * Z + pad, hy + y * Z + pad, hx + (x + w) * Z - 1 - pad, hy + (y + h) * Z - 1 - pad]
# Back wall strip: wallpaper, the back door and the kitchen window
d.rectangle([hx, hy - Z, hx + FW * Z - 1, hy - 1], fill='#c9b48a')
for k in range(0, FW * Z, 14):
    d.line([hx + k, hy - Z, hx + k, hy - 1], fill='#b9a47a', width=2)
d.rectangle([hx, hy - 12, hx + FW * Z - 1, hy - 1], fill='#7a5a3a')               # skirting
d.rectangle([hx + 1 * Z + 22, hy - Z + 14, hx + 2 * Z - 22, hy - 1], fill='#6a3a1a')  # back door
d.rectangle([hx + 2 * Z + 16, hy - Z + 18, hx + 3 * Z - 16, hy - 30], fill='#9ccbe8', outline='#ece8e0', width=3)
# Floorboards
for y in range(FH):
    for x in range(FW):
        d.rectangle(ri(x, y), fill='#8a6a44')
        for k in range(0, Z, 20):
            d.line([hx + x * Z + k, hy + y * Z, hx + x * Z + k, hy + (y + 1) * Z - 1], fill='#7a5a38', width=2)
# The wall between the kitchen (rows 0-1) and the front room (rows 3-4), with an open door in the middle
d.rectangle(ri(0, 2), fill='#c9b48a'); d.rectangle(ri(2, 2), fill='#c9b48a')
d.rectangle([hx, hy + 2 * Z + Z - 12, hx + FW * Z - 1, hy + 3 * Z - 1], fill='#7a5a3a')
d.rectangle(ri(1, 2), fill='#8a6a44')
# Kitchen: table with a tin on it, the cooker, stairs up along the side
d.rectangle(ri(0, 0, pad=14), fill='#b08850', outline='#6a5030', width=3)
glyph(hx, hy, Z, '%', '#d07030', font=f_big)
d.rectangle(ri(0, 1, pad=10), fill='#d0d0d0', outline='#777', width=3)
for k in (0, 1):
    d.ellipse([hx + 22 + k * 36, hy + Z + 22, hx + 46 + k * 36, hy + Z + 46], outline='#555', width=3)
d.rectangle(ri(2, 0, 1, 2, pad=8), fill='#5a4030')
for k in range(8):
    yy = hy + 16 + k * 22
    d.line([hx + 2 * Z + 12, yy, hx + 3 * Z - 12, yy], fill='#e0d0b0', width=3)
d.text((hx + 2 * Z + 38, hy + 2 * Z - 34), 'UP', font=f_tiny, fill='#fff')
# Front room: sofa (1x2), fireplace, rug; front door at the bottom edge with a mat
d.rectangle(ri(0, 3, 1, 2, pad=10), fill='#4a6a8a', outline='#2a3a4a', width=3)
d.rectangle([hx + 2 * Z + 30, hy + 3 * Z + 10, hx + 3 * Z - 4, hy + 4 * Z - 10], fill='#3a3a3a', outline='#222', width=2)
d.rectangle([hx + 2 * Z + 38, hy + 3 * Z + 34, hx + 3 * Z - 12, hy + 4 * Z - 30], fill='#d06020')
d.rectangle(ri(1, 3, 1, 2, pad=16), fill='#8a3a3a')
d.rectangle([hx + 1 * Z + 18, hy + 5 * Z - 8, hx + 2 * Z - 18, hy + 5 * Z + 6], fill='#6a3a1a')   # front door (into the street)
glyph(hx + Z, hy + 4 * Z, Z, '@', '#111', '#ffdd33', f_big)

# ---------------- Captions ----------------
cap = [
    'Left: one screen of the High Street, 11 x 15 tiles, seen from one angle (looking north): you see every roof, and',
    'only walls that face you. Top: terraced houses 4 x 5 facing you: pitched slate roofs, shared chimney stacks on the',
    'party walls, two-storey fronts. Road 4 wide with a car (2 x 3) and a van (2 x 4); a bike (2 x 1) on the pavement.',
    'Bottom: the newsagent and the Angel face away from you, so you see their roofs, doorsteps on the pavement and',
    'painted hanging signs (a Wetherby feature). The Angel carries on into the next screen.',
    'Right: inside the red-brick house, Pokemon-style: the back wall as a strip (back door, kitchen window), then the',
    'floor filling the screen, no outer walls round it. True scale it is a 3 x 5 floor: kitchen (table, cooker,',
    'stairs up), a wall with a doorway, the front room (sofa, fire, rug). Tiles are drawn much bigger inside, so the',
    'little house feels roomy, while the rooms stay realistically cramped for a fight.',
]
for i, t in enumerate(cap):
    d.text((GAP, TOP + ROWS * T + 16 + i * 24), t, font=f_cap, fill='#222')
img.save('docs/sample-screen.png')
print(img.size)
