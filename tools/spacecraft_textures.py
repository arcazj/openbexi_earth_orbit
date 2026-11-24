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
