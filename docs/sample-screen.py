# Draws a sample street screen (outside scale) and the inside of one house (true scale), greybox style.
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
f_tiny = ImageFont.truetype(BOLD, 11)

GAP, TOP, CAP = 30, 46, 236
W = COLS * T * 2 + GAP * 3
H = TOP + ROWS * T + CAP
img = Image.new('RGB', (W, H), '#f4f1e6')
d = ImageDraw.Draw(img)

def panel(ox, oy, title):
    d.text((ox, 12), title, font=f_title, fill='#222')
    d.rectangle([ox - 2, oy - 2, ox + COLS * T + 1, oy + ROWS * T + 1], outline='#222', width=2)

def R(ox, oy, x, y, w=1, h=1, t=T):
    return [ox + x * t, oy + y * t, ox + (x + w) * t - 1, oy + (y + h) * t - 1]

def glyph(ox, oy, x, y, ch, fg, bg=None, t=T):
    if bg:
        d.rectangle([ox + x * t + 3, oy + y * t + 3, ox + (x + 1) * t - 4, oy + (y + 1) * t - 4], fill=bg)
    bb = d.textbbox((0, 0), ch, font=f_glyph)
    d.text((ox + x * t + (t - (bb[2] - bb[0])) / 2 - bb[0], oy + y * t + (t - (bb[3] - bb[1])) / 2 - bb[1]), ch, font=f_glyph, fill=fg)

# ---------------- Left: a High Street screen, outside scale ----------------
ox, oy = GAP, TOP
panel(ox, oy, 'Outside: the High Street (one screen)')

def roof(x, y, w, h, col='#4f565e'):
    d.rectangle(R(ox, oy, x, y, w, h), fill=col)
    for k in range(h * 4):
        yy = oy + y * T + k * T // 4
        d.line([ox + x * T, yy, ox + (x + w) * T - 1, yy], fill='#454b52', width=1)
    d.line([ox + x * T, oy + y * T, ox + (x + w) * T - 1, oy + y * T], fill='#2a2e33', width=2)

def wall(x, y, w, h, col='#b3a688', course='#9a8e72'):
    d.rectangle(R(ox, oy, x, y, w, h), fill=col)
    for k in range(h * 3):
        yy = oy + y * T + k * T // 3
        d.line([ox + x * T, yy, ox + (x + w) * T - 1, yy], fill=course, width=1)

def door(x, y, col='#6a3a1a'):
    d.rectangle([ox + x * T + 8, oy + y * T + 6, ox + (x + 1) * T - 9, oy + (y + 1) * T - 1], fill=col)
    d.ellipse([ox + x * T + 24, oy + y * T + 20, ox + x * T + 28, oy + y * T + 24], fill='#d9c060')

def window(x, y, wide=1):
    d.rectangle([ox + x * T + 7, oy + y * T + 8, ox + (x + wide) * T - 8, oy + (y + 1) * T - 10], fill='#9ccbe8', outline='#e8e8e8', width=2)
    d.line([ox + x * T + 7 + ((wide * T - 15) // 2), oy + y * T + 8, ox + x * T + 7 + ((wide * T - 15) // 2), oy + (y + 1) * T - 10], fill='#e8e8e8', width=2)

# Row 0-4: a terrace of houses, 4 wide x 5 deep, fronts facing the street (down)
for i, x in enumerate([0, 4, 8]):
    w = 4 if x < 8 else 3
    roof(x, 0, w, 3)
    wall(x, 3, w, 2, '#b3a688' if i != 1 else '#a8463a', '#9a8e72' if i != 1 else '#8a3a2e')
    d.rectangle([ox + (x + 3) * T - 10, oy + 6, ox + (x + 3) * T + 2, oy + 30], fill='#6a5a50')   # chimney
    window(x, 3); window(x + 2, 3) if w == 4 else None
    door(x + 1, 4); window(x + 2, 4) if w == 4 else window(x, 4)
    d.line([ox + x * T, oy, ox + x * T, oy + 5 * T], fill='#2a2e33', width=2)     # party wall
# Row 5: pavement
for x in range(COLS):
    d.rectangle(R(ox, oy, x, 5), fill='#8d8b83', outline='#76746d')
# Row 6-9: the road, 4 wide, centre line
d.rectangle(R(ox, oy, 0, 6, COLS, 4), fill='#2e2f33')
for x in range(0, COLS * T, 30):
    d.line([ox + x, oy + 8 * T, ox + x + 16, oy + 8 * T], fill='#d8d8d0', width=3)
# Row 10: pavement
for x in range(COLS):
    d.rectangle(R(ox, oy, x, 10), fill='#8d8b83', outline='#76746d')
# Row 11-14: across the road: corner shop (5 wide), a ginnel, the pub (8 wide, goes off screen)
wall(0, 11, 5, 2, '#b3a688')
d.rectangle(R(ox, oy, 0, 11, 5, 1), fill='#2a5a3a')                         # shop fascia
d.text((ox + 14, oy + 11 * T + 12), 'NEWSAGENT', font=f_tiny, fill='#f0e8c0')
d.rectangle([ox + 8, oy + 12 * T + 6, ox + 3 * T - 6, oy + 13 * T - 4], fill='#9ccbe8', outline='#e8e8e8', width=2)  # shop window
door(3, 12)
roof(0, 13, 5, 2)
d.rectangle(R(ox, oy, 5, 11, 1, 4), fill='#6f6e68')                          # ginnel
for k in range(4):
    d.line([ox + 5 * T, oy + (11 + k) * T, ox + 6 * T - 1, oy + (11 + k) * T], fill='#5f5e58', width=1)
wall(6, 11, 5, 2, '#d9d2c0', '#c4bca8')                                      # pub: whitewashed
d.rectangle(R(ox, oy, 6, 11, 5, 1), fill='#1e2a4a')
d.text((ox + 6 * T + 10, oy + 11 * T + 12), 'THE ANGEL', font=f_tiny, fill='#e8d080')
window(6, 12); door(8, 12, '#2a1a10'); window(9, 12)
roof(6, 13, 5, 2, '#3e444b')
# Vehicles and things (outside sizes): car 2x3, van 2x4, bike 2x1
def car(x, y, length, col, horiz=True):
    x0, y0 = ox + x * T + 3, oy + y * T + 5
    x1, y1 = ox + (x + length) * T - 4, oy + (y + 2) * T - 6
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=col, outline='#111', width=2)
    d.rectangle([x1 - 34, y0 + 8, x1 - 22, y1 - 8], fill='#7ab0d0')            # windscreen
    d.rectangle([x0 + 14, y0 + 10, x1 - 46, y1 - 10], fill=col, outline='#00000040')
car(1, 6, 3, '#b8312f')                                                       # car, parked
car(6, 8, 4, '#e2e2dc')                                                       # van, other side
d.text((ox + 7 * T, oy + 8 * T + 30), 'VAN', font=f_tiny, fill='#555')
# Bike on the pavement (2x1)
bx, by = ox + 6 * T, oy + 5 * T
d.ellipse([bx + 4, by + 10, bx + 30, by + 34], outline='#111', width=3)
d.ellipse([bx + T + 10, by + 10, bx + T + 36, by + 34], outline='#111', width=3)
d.line([bx + 17, by + 22, bx + 40, by + 12, bx + T + 23, by + 22], fill='#1a4aa0', width=3)
# Lamp post and a bin
d.ellipse([ox + 2 * T + 14, oy + 10 * T + 14, ox + 2 * T + 26, oy + 10 * T + 26], fill='#333')
d.rectangle([ox + 10 * T + 10, oy + 5 * T + 8, ox + 10 * T + 30, oy + 5 * T + 32], fill='#3a5a3a')
# People: you and a zombie (1 tile each)
glyph(ox, oy, 4, 5, '@', '#111', '#ffdd33')
glyph(ox, oy, 5, 7, 'Z', '#6fcf4f')
glyph(ox, oy, 9, 10, 'Z', '#6fcf4f')

# ---------------- Right: inside the red-brick house, true scale ----------------
ix, iy = GAP * 2 + COLS * T, TOP
panel(ix, iy, 'Inside: the same house (its own screen)')
d.rectangle([ix, iy, ix + COLS * T - 1, iy + ROWS * T - 1], fill='#0a0a0a')
# The house is 5 x 7 tiles at true scale (walls included); drawn so it fills the screen (tiles x2).
Z = 2 * T
hx, hy = ix + (COLS * T - 5 * Z) // 2, iy + (ROWS * T - 7 * Z) // 2
def ri(x, y, w=1, h=1):
    return [hx + x * Z, hy + y * Z, hx + (x + w) * Z - 1, hy + (y + h) * Z - 1]
for y in range(7):
    for x in range(5):
        edge = x in (0, 4) or y in (0, 6)
        if edge:
            d.rectangle(ri(x, y), fill='#a8463a')
            for k in range(4):
                d.line([hx + x * Z, hy + y * Z + k * Z // 4, hx + (x + 1) * Z - 1, hy + y * Z + k * Z // 4], fill='#8a3a2e')
        else:
            d.rectangle(ri(x, y), fill='#7a5a3a')
            for k in range(0, Z, 16):
                d.line([hx + x * Z + k, hy + y * Z, hx + x * Z + k, hy + (y + 1) * Z - 1], fill='#6a4a2e')
# Partition between the back kitchen (top) and the front room (bottom), with an inside door
for x in (1, 3):
    d.rectangle(ri(x, 3), fill='#a8463a')
d.rectangle(ri(2, 3), fill='#7a5a3a')
d.rectangle([hx + 2 * Z + 10, hy + 3 * Z + Z // 2 - 6, hx + 3 * Z - 10, hy + 3 * Z + Z // 2 + 6], fill='#6a3a1a')
# Front door (bottom), back door (top), windows
d.rectangle([hx + 2 * Z + 14, hy + 6 * Z, hx + 3 * Z - 14, hy + 7 * Z - 1], fill='#6a3a1a')
d.rectangle([hx + 2 * Z + 14, hy, hx + 3 * Z - 14, hy + Z - 1], fill='#6a3a1a')
for (x, y) in [(1, 6), (3, 6), (1, 0)]:   # front windows either side of the door, one at the back (party walls: none at the sides)
    d.rectangle([hx + x * Z + 14, hy + y * Z + 14, hx + (x + 1) * Z - 15, hy + (y + 1) * Z - 15], fill='#9ccbe8', outline='#e8e8e8', width=3)
# Furniture: sofa 1x2 and fireplace in the front room; table, cooker and the stairs (1x2) in the kitchen
d.rectangle([hx + 1 * Z + 6, hy + 4 * Z + 6, hx + 2 * Z - 6, hy + 6 * Z - 6], fill='#4a6a8a', outline='#2a3a4a', width=3)   # sofa
d.rectangle([hx + 3 * Z + 20, hy + 4 * Z + 8, hx + 4 * Z - 4, hy + 5 * Z - 8], fill='#3a3a3a')                               # fireplace
d.rectangle([hx + 1 * Z + 10, hy + 1 * Z + 10, hx + 2 * Z - 10, hy + 2 * Z - 10], fill='#b08850', outline='#6a5030', width=3)  # table
d.rectangle([hx + 1 * Z + 6, hy + 2 * Z + 6, hx + 2 * Z - 6, hy + 3 * Z - 6], fill='#c8c8c8', outline='#777', width=3)      # cooker
d.rectangle([hx + 3 * Z + 4, hy + 1 * Z + 4, hx + 4 * Z - 4, hy + 3 * Z - 4], fill='#5a4030')                                # stairs up (1x2)
for k in range(7):
    yy = hy + 1 * Z + 12 + k * 20
    d.line([hx + 3 * Z + 8, yy, hx + 4 * Z - 8, yy], fill='#e0d0b0', width=3)
d.text((hx + 3 * Z + 26, hy + 1 * Z + 10), 'UP', font=f_tiny, fill='#ffffff')
# A tin on the table, you at the door
glyph(hx, hy, 1, 1, '%', '#d07030', None, Z)
glyph(hx, hy, 2, 5, '@', '#111', '#ffdd33', Z)

# ---------------- Captions ----------------
cap = [
    'Left: one screen of the High Street, 11 x 15 tiles. Terraced houses 4 x 5 (stone, red brick), pavements, a 4-wide',
    'road, a car (2 x 3, red), a van (2 x 4), a bike (2 x 1), you (@) and zombies (Z). Across the road: a newsagent',
    '(5 wide), a ginnel (1), and the Angel (8 x 8, carrying on into the next screen).',
    'Right: inside the red-brick house. At true scale it is only 5 x 7 tiles (walls included): a front room with a sofa',
    'and fire, a back kitchen with a table, cooker and stairs up, front and back doors (no side windows: party walls).',
    'Drawn with tiles twice the size so it fills the screen (the original guide\'s idea): that is what makes it feel',
    'bigger inside.',
    'Question: is that zoom right, or should interiors be roomier than true scale and drawn at normal tile size?',
]
for i, t in enumerate(cap):
    d.text((GAP, TOP + ROWS * T + 16 + i * 24), t, font=f_cap, fill='#222')
img.save('docs/sample-screen.png')
print(img.size)
