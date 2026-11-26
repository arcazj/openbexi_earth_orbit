"""Original procedural texture maps for the deployed spacecraft models."""
import math
import random
import struct
import zlib
from functools import lru_cache


def rgb_png(size, pixels):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    stride = size * 3
    rows = b"".join(b"\0" + pixels[start:start + stride] for start in range(0, len(pixels), stride))
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


@lru_cache(maxsize=1)
def station_solar_blanket():
    size = 256
    pixels = bytearray()
    for y in range(size):
        row, v = divmod(y, 12)
        for x in range(size):
            col, u = divmod(x, 16)
            tone = (row*17 + col*7) % 15 + (5 if v % 3 == 0 else 0)
            color = (54+tone, 44+tone, 66+tone)
            if u == 0 or v == 0:
                color = (103, 88, 95)
            elif u == 8 and v == 1:
                color = (169, 141, 112)
            pixels.extend(color)
    return rgb_png(size, pixels)


@lru_cache(maxsize=1)
def station_insulation():
    size = 256
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            u, v = (x + (y//64 % 2)*16) % 32, y % 64
            tone = int(4*math.sin(.23*u + .16*v) + 3*math.cos(.34*u - .19*v))
            if u <= 1 or v <= 1:
                tone -= 27
            elif u == 3 and v % 13 < 2:
                tone -= 44
            pixels.extend((210+tone, 209+tone, 201+tone))
    return rgb_png(size, pixels)


@lru_cache(maxsize=2)
def blue_solar_cells(indigo=False):
    # One UV rectangle per laminate. Leave dark kerfs and clipped cell corners
    # between the strings, with fine contacts that average down in the mipmaps.
    size = 512
    pixels = bytearray()
    rng = random.Random(3000)
    tints = [[rng.randrange(8) for _ in range(32)] for _ in range(32)]
    for y in range(size):
        row, v = divmod(y, 16)
        for x in range(size):
            column, u = divmod(x, 16)
            tint = tints[row][column]
            edge = min(u, 16 - u) + min(v, 16 - v)
            if u == 0 or v == 0 or edge <= 2:
                color = (23, 28, 52) if indigo else (52, 85, 108)
            elif v == 1 and 6 <= u <= 10:
                color = (146, 134, 125) if indigo else (142, 168, 181)
            else:
                finger = 7 if v % 4 == 0 else 0
                base = (44, 46, 112) if indigo else (66, 140, 197)
                color = tuple(value + tint + finger for value in base)
            pixels.extend(color)
    return rgb_png(size, pixels)


@lru_cache(maxsize=1)
def gravitas_laminate():
    """One Mega-class wing bay with dark cell strings and thin silver interconnects."""
    size = 384
    pixels = bytearray()
    for y in range(size):
        row,v = divmod(y,32)
        for x in range(size):
            col,u = divmod(x,48)
            corner = min(u,47-u) + min(v,31-v)
            if u == 0 or v == 0 or corner < 2:
                color = (96,99,103)
            elif (v in (1,30) and 22 <= u <= 25) or (u == 1 and 10 <= v <= 13):
                color = (140,140,138)
            else:
                tint = (col*5+row*7+row*col)%13 + (9 if v%4 == 0 else 0)
                tone = round(5*math.cos((u+.35*v)*math.pi/48))
                color = (24+tint+tone,29+tint+tone,42+tint+tone)
            pixels.extend(color)
    return rgb_png(size,pixels)


@lru_cache(maxsize=2)
def sstl_cells(blue=False):
    """Four photovoltaic wafers with collector fingers and silver solder tabs."""
    size = 256
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            tile_x, u = divmod(x, 128)
            tile_y, v = divmod(y, 128)
            tile = tile_y*2+tile_x
            sheen = round(5*math.cos((u+v*.28)*math.pi/128)) + (0,4,-3,6)[tile]
            fingers = (10 if v%6 == 3 else 0) + (8 if u in (39,88) else 0)
            value = sheen + fingers
            color = tuple(c+value for c in ((54,70,91) if blue else (32,38,53)))
            if (u < 3 or u > 124) and 22 < v < 105:
                color = (96, 101, 109)
            if (u < 8 and 25 < v < 39) or (u > 119 and 90 < v < 104):
                color = (181, 176, 165)
            pixels.extend(color)
    return rgb_png(size, pixels)


@lru_cache(maxsize=2)
def sstl_backplane(pale=False):
    """Fine copper grain, plated traces and edge mounting pads on each solar circuit board."""
    size = 384
    copper = (239,212,171) if pale else (195,127,77)
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            u, v = min(x,size-1-x), min(y,size-1-y)
            grain = (x*13 + (y%7)*19)%7 - 3
            grain += round(2*math.sin((y+x*.16)*.12))
            color = tuple(c+grain for c in copper)
            # The traces turn around cell strings and terminate at the edge of the board.
            if (u == 9 and 28 < v < 141) or (v == 27 and 10 <= u <= 30) or (
                v == 140 and 10 <= u <= 19) or (u == 30 and 18 < v <= 27):
                color = (218,199,163)
            if 4 <= (u-10)**2 + (v-18)**2 <= 12:
                color = (204,199,184)
            pixels.extend(color)
    return rgb_png(size, pixels)


@lru_cache(maxsize=2)
def spacebus_cells(violet=False):
    """Fine GaAs cell strings with the blue/violet coating visible on the flight artwork."""
    size = 256
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            shimmer = (1+math.cos((x+.67*y)*math.tau/size))*.5
            col, u = divmod(x, 12)
            row, v = divmod(y, 16)
            variation = (col*7+row*3)%9 + (4 if v%4 == 0 else 0)
            base = (46+37*shimmer,95-26*shimmer,141+13*shimmer) if violet else (62,99,151)
            scale = .70 if u == 0 or v == 0 else 1
            pixels.extend(int(c*scale+variation) for c in base)
    return rgb_png(size,pixels)


@lru_cache(maxsize=1)
def four_string_laminate():
    """Blue-green cells in the two-by-four electrical bays of one wing leaf."""
    size = 384
    pixels = bytearray()
    for y in range(size):
        string, v = divmod(y, size//4)
        for x in range(size):
            bank, u = divmod(x, size//2)
            grain = ((x//8)*11 + (y//12)*7) % 9
            shade = 5*bank + 2*string + grain
            color = (56+shade, 105+shade, 138+shade)
            if x % 8 == 0 or y % 12 == 0:
                color = (47+shade, 88+shade, 111+shade)
            if v < 3 or u < 3:
                color = (205, 210, 201)
            if 2 <= v < 8 and (20 <= u < 27 or 152 <= u < 159):
                color = (213, 182, 131)
            pixels.extend(color)
    return rgb_png(size, pixels)


@lru_cache(maxsize=1)
def pod_solar_cells():
    # Long busbars and fine cell contacts on the compact bronze/charcoal wings.
    size = 384
    pixels = bytearray()
    rng = random.Random(81)
    tints = [[rng.randrange(8) for _ in range(24)] for _ in range(12)]
    for y in range(size):
        row, v = divmod(y,32)
        for x in range(size):
            col, u = divmod(x,16)
            shade = tints[row][col]
            color = (65+shade, 57+shade, 52+shade)
            if u == 0 or v == 0:
                color = (26,26,30)
            elif y%96 in (1,2,3):
                color = (164,144,107)
            elif u%5 == 1:
                color = (80+shade,73+shade,64+shade)
            pixels.extend(color)
    return rgb_png(size, pixels)


@lru_cache(maxsize=1)
def horizons_solar_cells():
    """Original blue-violet cell banks with the copper contacts visible in the aft artwork."""
    size = 512
    pixels = bytearray()
    for y in range(size):
        row,v = divmod(y, 16)
        for x in range(size):
            col,u = divmod(x, 16)
            tint = (row*13+col*7)%15
            warm = ((row//8+col//8)%3)*12
            color = (54+warm+tint,43+tint,101+tint-warm)
            if u<1 or v<1 or min(u,16-u)+min(v,16-v)<3:
                color = (27,25,47)
            elif v%4==1:
                color = (66+warm+tint,56+tint,108+tint-warm)
            if y%128 in (0,1,2,3) or x%256 in (0,1,2):
                color = (191,107,65)
            if x%128 in range(55,65) and y%64 in range(4,11):
                color = (232,162,90)
            pixels.extend(color)
    return rgb_png(size,pixels)


@lru_cache(maxsize=1)
def radiator_mosaic():
    size = 384
    pixels = bytearray()
    for y in range(size):
        row,v = divmod(y,12)
        for x in range(size):
            col,u = divmod(x,12)
            tint = (row*5+col*11)%13
            color = (207+tint,216+tint,222+tint)
            if not u or not v:
                color = (112,130,150)
            elif u==1 or v==1:
                color = (214,222,230)
            pixels.extend(color)
    return rgb_png(size,pixels)


@lru_cache(maxsize=1)
def reflector_composite():
    size = 256
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            grain = (max(0,3-(x+y)%8) if (x//8+y//8)%2 else max(0,3-(x-y)%8))
            tint = ((x*29+y*13)%5) + 3*grain
            pixels.extend((79+tint,69+tint,77+tint))
    return rgb_png(size,pixels)


@lru_cache(maxsize=2)
def blanket_maps(wavefront=False):
    # Finite buckled ridges give the insulation a different response to light
    # as the spacecraft turns. Heights and slopes use the same panel UV space.
    size = 256
    step = 1 / size
    heights = [0.] * (size * size)
    rng = random.Random(36581)
    for _ in range(68):
        cx, cy = rng.uniform(-.05, 1.05), rng.uniform(-.05, 1.05)
        angle = rng.uniform(0, math.tau)
        along_x, along_y = math.cos(angle), math.sin(angle)
        length, width = rng.uniform(.09, .34), rng.uniform(.005, .020)
        lift, bend = rng.uniform(.004, .014), rng.uniform(-.15, .15)
        radius = length + 4 * width
        for y in range(max(0, int((cy - radius) * size)), min(size, math.ceil((cy + radius) * size))):
            dy = (y + .5) * step - cy
            for x in range(max(0, int((cx - radius) * size)), min(size, math.ceil((cx + radius) * size))):
                dx = (x + .5) * step - cx
                t = (dx * along_x + dy * along_y) / length
                if abs(t) < 1:
                    across = (dy * along_x - dx * along_y - bend * length * t * t) / width
                    heights[y * size + x] += lift * (1 - t * t) ** 2 * math.exp(-abs(across))
    normals, roughness = bytearray(), bytearray()
    for y in range(size):
        for x in range(size):
            dx = (heights[y*size + min(x+1, size-1)] - heights[y*size + max(x-1, 0)]) / (2 * step)
            dy = (heights[min(y+1, size-1)*size + x] - heights[max(y-1, 0)*size + x]) / (2 * step)
            # The authored tangent and bitangent point along increasing UV.
            length = math.sqrt(dx*dx + dy*dy + 1)
            normals.extend(round(127.5 * (1 + n / length)) for n in (-dx, dy if wavefront else -dy, 1))
            rough = round(161 + 68 * min(1, math.hypot(dx, dy)))
            roughness.extend((rough, rough, rough) if wavefront else (255, rough, 255))
    return rgb_png(size, normals), rgb_png(size, roughness)
