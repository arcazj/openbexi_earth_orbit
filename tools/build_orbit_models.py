"""Build the orbit viewer's GLBs, searchable index and static manifest from checked-in profiles.

Run with Python 3 from any directory. Pass leo, meo or geo to rebuild just those orbits.
Dimensions are metres. Catalog outlines encode only the components named by the source.
"""
import json
import hashlib
import math
import re
import struct
import sys
import zlib
from functools import lru_cache
from pathlib import Path

if __package__:
    from .geo_geometry import ats6, communications_spacecraft, ekran, gorizont, tdrs, weather_spacecraft
    from .geo_fleet_geometry import fleet_spacecraft
    from .horizons_3e import engine_bell, gantry_plate, petal_frame
    from .spacecraft_textures import blanket_maps, blue_solar_cells, horizons_solar_cells, pod_solar_cells, radiator_mosaic, reflector_composite
else:
    from geo_geometry import ats6, communications_spacecraft, ekran, gorizont, tdrs, weather_spacecraft
    from geo_fleet_geometry import fleet_spacecraft
    from horizons_3e import engine_bell, gantry_plate, petal_frame
    from spacecraft_textures import blanket_maps, blue_solar_cells, horizons_solar_cells, pod_solar_cells, radiator_mosaic, reflector_composite

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "json/satellites"
MANIFEST = ROOT / "json/display_satellite_models.json"
TAU = 2 * math.pi
# Linear RGB, metallic and roughness factors for original schematic surfaces.
SURFACES = {
    "Thermal blanket": ([.58, .32, .076], .34, .52),
    "Equipment panels": ([.54, .59, .61], .24, .55),
    "Ivory radome": ([.83, .78, .63], .08, .63),
    "Structural alloy": ([.33, .39, .44], .48, .48),
    "Graphite": ([.07, .086, .10], .21, .58),
    "Array backsheet": ([.28,.31,.34], .23, .66),
    "Carbon reflector": ([.095,.115,.098], .23, .67),
    "Solar cells": ([1, 1, 1], .11, .40),
    "Reflector glass": ([.35, .50, .60], .39, .22),
    "Reference blue": ([.16, .39, .55], .12, .58),
    "Gold insulation": ([.87, .74, .55], .45, .57),
    "Gold thermal foil": ([.96, .54, .10], .27, .44),
    "Gold multilayer insulation": ([.80, .40, .048], .40, .69),
    "Silver multilayer insulation": ([.49, .53, .57], .60, .57),
    "Black multilayer insulation": ([.065, .074, .085], .35, .63),
    "Charcoal thermal blanket": ([.055, .051, .054], .18, .78),
    "Silver thermal panel": ([.55, .62, .70], .50, .34),
    "White reflector coating": ([.88, .90, .91], .035, .52),
    "Blue photovoltaic cells": ([1, 1, 1], .10, .55),
    "Indigo photovoltaic cells": ([1, 1, 1], .13, .49),
    "Pod photovoltaic cells": ([1, 1, 1], .20, .51),
    "Copper-traced photovoltaic cells": ([1, 1, 1], .09, .52),
    "Silver radiator mosaic": ([1, 1, 1], .16, .49),
    "Woven reflector composite": ([1, 1, 1], .19, .55),
    "Nozzle liner": ([.24, .113, .071], .55, .49),
    "Radiator tiles": ([.78, .79, .80], .20, .52),
    "Antenna face": ([.50, .51, .48], .30, .53),
    "Concentrator film": ([.80, .84, .88], .66, .26),
    "Gold mesh": ([.83, .55, .12], .46, .50),
    "Relay mesh": ([.60, .63, .66], .39, .52),
}


def unit(v):
    length = math.sqrt(sum(c * c for c in v))
    return tuple(c / length for c in v)


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def aim_z(direction):
    """Quaternion orienting the local +Z axis along direction."""
    x, y, z = unit(direction)
    return unit((-y, x, 0, 1 + z)) if z > -.99999999 else (1, 0, 0, 0)


def ring(n, radius=.5, z=0):
    return [(radius * math.cos(TAU*i/n), radius * math.sin(TAU*i/n), z) for i in range(n)]


@lru_cache(maxsize=1)
def reflector_fabric():
    # Tileable diamond weave. Alpha leaves the truss visible through the aperture.
    size = 64
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            wire = (x+y) % 8 < 2 or (x-y) % 8 < 2
            pixels.extend((240,240,240,242) if wire else (216,216,216,85))
    def chunk(kind, data):
        return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data))
    header = struct.pack(">IIBBBBB",size,size,8,6,0,0,0)
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",header)+chunk(b"IDAT",zlib.compress(pixels))+chunk(b"IEND",b"")


class Surface:
    def __init__(self):
        self.points, self.normals, self.uvs, self.indices = [], [], [], []

    def face(self, points, normals=None, uvs=None):
        if normals is None:
            a, b, c = points[:3]
            normal = unit(cross(tuple(y-x for x, y in zip(a, b)), tuple(y-x for x, y in zip(a, c))))
            normals = [normal] * len(points)
        start = len(self.points)
        self.points.extend(points)
        self.normals.extend(normals)
        if uvs:
            self.uvs.extend(uvs)
        for i in range(1, len(points)-1):
            self.indices.extend((start, start+i, start+i+1))

    def planar_tangents(self):
        # The blanket faces have flat normals, independent vertices and affine
        # UVs. Resolve the texture U direction and the UV winding on each face.
        tangents = [None] * len(self.points)
        for start in range(0, len(self.indices), 3):
            a, b, c = self.indices[start:start+3]
            edge_b = [end-origin for origin,end in zip(self.points[a], self.points[b])]
            edge_c = [end-origin for origin,end in zip(self.points[a], self.points[c])]
            ub, vb = (end-origin for origin,end in zip(self.uvs[a], self.uvs[b]))
            uc, vc = (end-origin for origin,end in zip(self.uvs[a], self.uvs[c]))
            determinant = ub * vc - uc * vb
            tangent = unit([(vc*x - vb*y) / determinant for x,y in zip(edge_b, edge_c)])
            for vertex in (a, b, c):
                tangents[vertex] = (*tangent, math.copysign(1, determinant))
        return tangents


@lru_cache(maxsize=None)
def primitive(kind, sides=24):
    s = Surface()
    if kind in ("box", "foil-box", "panel"):
        bottom = [(-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5)]
        top = [(x, y, .5) for x, y, z in bottom]
        if kind == "panel":
            s.face(top, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
        else:
            uv = [(0,0),(1,0),(1,1),(0,1)] if kind == "foil-box" else None
            s.face(top, uvs=uv)
            s.face(bottom[::-1], uvs=uv)
            for i in range(4):
                j = (i+1) % 4
                s.face([bottom[i], bottom[j], top[j], top[i]], uvs=uv)
    elif kind == "blanketed chassis":
        # Cut corners expose the edges of the thermal blankets and their seams.
        outline = [(-.40,-.50),(.40,-.50),(.50,-.40),(.50,.40),
                   (.40,.50),(-.40,.50),(-.50,.40),(-.50,-.40)]
        low = [(x,y,-.5) for x,y in outline]
        high = [(x,y,.5) for x,y in outline]
        cap_uv = [(x+.5,y+.5) for x,y in outline]
        s.face(high, uvs=cap_uv)
        s.face(low[::-1], uvs=cap_uv[::-1])
        for i in range(len(low)):
            j = (i+1) % len(low)
            s.face([low[i],low[j],high[j],high[i]], uvs=[(0,0),(1,0),(1,1),(0,1)])
    elif kind == "quilted foil":
        # Raised folds give an insulated panel changing highlights as the viewer rotates it.
        for row in range(3):
            for col in range(4):
                x, y = col/4-.5, row/3-.5
                corners = [(x,y,0), (x+.25,y,0), (x+.25,y+1/3,0), (x,y+1/3,0)]
                crest = (x+.09+.06*((row+col)%2), y+.10+.13*((2*col+row)%3)/2,
                         .025+.017*((row+2*col)%3))
                for index, corner in enumerate(corners):
                    s.face([corner,corners[(index+1)%4],crest])
    elif kind == "drum-cells":
        low, high = ring(sides,.5,-.5), ring(sides,.5,.5)
        for i in range(sides):
            j = (i+1)%sides
            s.face([low[i],low[j],high[j],high[i]],uvs=[(0,1),(1,1),(1,0),(0,0)])
    elif kind == "delta":
        low = [(-.5,-.5,-.5),(.5,-.5,-.5),(0,.5,-.5)]
        high = [(x,y,.5) for x,y,z in low]
        s.face(high)
        s.face(low[::-1])
        for i in range(3):
            j=(i+1)%3
            s.face([low[i],low[j],high[j],high[i]])
    elif kind in ("cylinder", "frustum", "nose"):
        top_radius = {"cylinder": .5, "frustum": .29, "nose": .025}[kind]
        low, high = ring(sides, .5, -.5), ring(sides, top_radius, .5)
        s.face(low[::-1])
        s.face(high)
        normals = [unit((x*2, y*2, .5-top_radius)) for x, y, z in low]
        for i in range(sides):
            j = (i+1) % sides
            ns = [normals[i], normals[j], normals[j], normals[i]] if sides > 10 else None
            s.face([low[i], low[j], high[j], high[i]], ns)
    elif kind in ("sphere", "poly", "telstar-cells"):
        rows = sides // 2
        for row in range(rows):
            def direction(level, col):
                lat = math.pi*(level/rows-.5)
                lon = TAU*col/sides
                return (math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat))
            for i in range(sides):
                corners = [(row,i),(row,i+1),(row+1,i+1),(row+1,i)]
                if row == 0:
                    corners.pop(0)
                elif row == rows-1:
                    corners.pop(2)
                ns = [direction(level, col) for level, col in corners]
                points = [tuple(.5*n for n in v) for v in ns]
                if kind == "telstar-cells":
                    center = [sum(v[j] for v in points)/len(points) for j in range(3)]
                    points = [tuple(.78*v[j]+.225*center[j] for j in range(3)) for v in points]
                    uv = [(0,0),(1,0),(1,1),(0,1)][:len(points)]
                    s.face(points,uvs=uv)
                else:
                    s.face(points,ns if kind == "sphere" else None)
    elif kind == "tetra":
        p = [(.5,.5,.5),(-.5,-.5,.5),(-.5,.5,-.5),(.5,-.5,-.5)]
        for a,b,c in [(0,2,1),(0,1,3),(0,3,2),(1,2,3)]:
            s.face([p[a],p[b],p[c]])
    elif kind in ("annulus","thin annulus"):
        outer_low, outer_high = ring(sides,.5,-.5), ring(sides,.5,.5)
        inner = .465 if kind == "thin annulus" else .32
        inner_low, inner_high = ring(sides,inner,-.5), ring(sides,inner,.5)
        for i in range(sides):
            j = (i+1) % sides
            s.face([outer_low[i],outer_low[j],outer_high[j],outer_high[i]])
            s.face([inner_low[j],inner_low[i],inner_high[i],inner_high[j]])
            s.face([outer_high[i],outer_high[j],inner_high[j],inner_high[i]])
            s.face([outer_low[j],outer_low[i],inner_low[i],inner_low[j]])
    elif kind == "helix":
        rings = []
        for i in range(49):
            a = TAU*2*i/48
            points = []
            for j in range(6):
                b = TAU*j/6
                radius = .43+.06*math.cos(b)
                points.append((radius*math.cos(a),radius*math.sin(a),i/48-.5+.04*math.sin(b)))
            if rings:
                for j in range(6):
                    k=(j+1)%6
                    s.face([rings[-1][j],points[j],points[k],rings[-1][k]])
            rings.append(points)
    elif kind == "bowed panel":
        # Rolled thin sheet, convex across its width. The side strips close the
        # cut edges so the side profile and highlights both follow the curvature.
        def section(i):
            x = i / sides - .5
            z = .5 - 2*x*x
            return (x,-.5,z), (x,.5,z), (x,-.5,z-.06), (x,.5,z-.06)

        for i in range(sides):
            a, b, e, f = section(i)
            c, d, h, k = section(i+1)
            left, right = unit((4*a[0],0,1)), unit((4*c[0],0,1))
            s.face([a,c,d,b], [left,right,right,left])
            s.face([f,k,h,e], [tuple(-v for v in n) for n in (left,right,right,left)])
            s.face([e,h,c,a])
            s.face([b,d,k,f])
            if i == 0:
                s.face([e,a,b,f])
            if i == sides-1:
                s.face([c,h,k,d])
    elif kind == "petal reflector frame":
        petal_frame(s,sides)
    elif kind == "pierced gantry plate":
        gantry_plate(s)
    elif kind in ("bell jacket","bell interior"):
        engine_bell(s,sides,interior=kind=="bell interior")
    elif kind in ("paraboloid", "shaped reflector", "net reflector", "reflector shell", "rounded reflector shell", "composite reflector shell"):
        # Ring depth follows r squared. Smooth normals hold across the front of the aperture.
        previous = None
        for band in range(1,7):
            radius = band / 12
            current = ring(sides, radius, .80 * radius**2)
            if kind in ("shaped reflector", "rounded reflector shell"):
                # Orbital's superelliptical single shells have four rounded corners.
                exponent = .40 if kind == "rounded reflector shell" else .62
                current = [(radius * math.copysign(abs(x/radius)**exponent,x),
                            radius * math.copysign(abs(y/radius)**exponent,y),z) for x,y,z in current]
            for i in range(sides):
                j = (i + 1) % sides
                face = [(0,0,0), current[i], current[j]] if previous is None else [
                    previous[i], current[i], current[j], previous[j]]
                uv = [(4*(x+.5),4*(y+.5)) for x,y,_ in face] if kind == "net reflector" else None
                if kind == "composite reflector shell":
                    uv = [(x+.5,y+.5) for x,y,_ in face]
                normals = [unit((-1.6*x,-1.6*y,1)) for x,y,_ in face]
                s.face(face, normals, uv)
                if kind in ("reflector shell", "rounded reflector shell", "composite reflector shell"):
                    thickness = .045
                    s.face([(x,y,z-thickness) for x,y,z in reversed(face)],
                           [tuple(-v for v in n) for n in reversed(normals)],uvs=uv[::-1] if uv else None)
                    if band == 6:
                        a, b = current[i], current[j]
                        s.face([(a[0],a[1],a[2]-thickness), (b[0],b[1],b[2]-thickness), b, a],
                               uvs=[(0,0),(1,0),(1,1),(0,1)] if uv else None)
            previous = current
    elif kind == "dish":
        # Shallow, concave reflector with a finished rim and a continuous back.
        edge = ring(sides,.5,.20)
        mid = ring(sides,.25,.05)
        back = ring(sides,.5,.16)
        for i in range(sides):
            j = (i+1) % sides
            s.face([(0,0,0),mid[i],mid[j]])
            s.face([mid[i],edge[i],edge[j],mid[j]])
            s.face([(0,0,-.06),back[j],back[i]])
            s.face([back[i],back[j],edge[j],edge[i]])
    else:
        raise ValueError(kind)
    return s


def reflector_faces(count):
    """Distribute the documented number of reflectors in an illustrative equal-area pattern."""
    s = Surface()
    for i in range(count):
        z = 1 - 2*(i+.5)/count
        az = math.pi*(3-math.sqrt(5))*i
        r = math.sqrt(1-z*z)
        n = (r*math.cos(az), r*math.sin(az), z)
        u = unit(cross((0,0,1),n))
        v = cross(n,u)
        radius = .69 / math.sqrt(count)
        points = [tuple(.501*n[j] + radius*(x*u[j]+y*v[j]) for j in range(3))
                  for x,y,_ in ring(6 if count == 2146 else 12,1)]
        s.face(points,[n]*len(points))
    return s


class Glb:
    def __init__(self, profile):
        self.profile = profile
        self.binary = bytearray()
        self.g = {key: [] for key in ("nodes","meshes","materials","bufferViews","accessors")}
        self.geometries, self.meshes, self.materials = {}, {}, {}

    def buffer_view(self, data, target=None):
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        item = {"buffer":0,"byteOffset":len(self.binary),"byteLength":len(data)}
        if target:
            item["target"] = target
        self.binary.extend(data)
        self.g["bufferViews"].append(item)
        return len(self.g["bufferViews"])-1

    def accessor(self, rows, size, index=False, bounds=False):
        flat = rows if index else [x for row in rows for x in row]
        fmt = "H" if index else "f"
        view = self.buffer_view(struct.pack("<"+str(len(flat))+fmt,*flat),34963 if index else 34962)
        a = {"bufferView":view,"componentType":5123 if index else 5126,"count":len(rows),
             "type":{1:"SCALAR",2:"VEC2",3:"VEC3",4:"VEC4"}[size]}
        if bounds:
            a.update(min=list(map(min,zip(*rows))),max=list(map(max,zip(*rows))))
        self.g["accessors"].append(a)
        return len(self.g["accessors"])-1

    def texture(self, png, panel=False):
        view = self.buffer_view(png)
        images = self.g.setdefault("images", [])
        textures = self.g.setdefault("textures", [])
        texture = {"source":len(images)}
        if panel:
            # Clamp each laminate or blanket to its own UV rectangle.
            self.g.setdefault("samplers", [{"magFilter":9729,"minFilter":9987,"wrapS":33071,"wrapT":33071}])
            texture["sampler"] = 0
        textures.append(texture)
        images.append({"bufferView":view,"mimeType":"image/png"})
        return {"index":len(textures)-1}

    def material(self, name):
        if name not in self.materials:
            color, metal, rough = SURFACES[name]
            pbr = {"baseColorFactor":[*color,1],"metallicFactor":metal,"roughnessFactor":rough}
            if name in ("Solar cells", "Gold insulation", "Gold mesh", "Relay mesh"):
                if name in ("Gold mesh","Relay mesh"):
                    image = reflector_fabric()
                else:
                    filename = "spacecraft_cells.png" if name == "Solar cells" else "spacecraft_gold_blanket.png"
                    image = (ROOT/"obj/leo/Textures"/filename).read_bytes()
                pbr["baseColorTexture"] = self.texture(image)
            self.materials[name] = len(self.g["materials"])
            material = {"name":name,"pbrMetallicRoughness":pbr}
            if name in ("Blue photovoltaic cells", "Indigo photovoltaic cells"):
                pbr["baseColorTexture"] = self.texture(blue_solar_cells(indigo=name == "Indigo photovoltaic cells"), panel=True)
            if name == "Pod photovoltaic cells":
                pbr["baseColorTexture"] = self.texture(pod_solar_cells(), panel=True)
            maps = {"Copper-traced photovoltaic cells":horizons_solar_cells,
                    "Silver radiator mosaic":radiator_mosaic,"Woven reflector composite":reflector_composite}
            if name in maps:
                pbr["baseColorTexture"] = self.texture(maps[name](),panel=True)
            if name in ("Gold multilayer insulation", "Silver multilayer insulation", "Black multilayer insulation", "Charcoal thermal blanket"):
                normals, roughness = blanket_maps()
                strength = .30 if name=="Charcoal thermal blanket" else .60
                material["normalTexture"] = {**self.texture(normals, panel=True), "scale":strength}
                pbr["metallicRoughnessTexture"] = self.texture(roughness, panel=True)
            if name in ("Gold mesh","Relay mesh","Antenna face","Carbon reflector"):
                material["doubleSided"] = True
            if name in ("Gold mesh","Relay mesh"):
                material["alphaMode"] = "BLEND"
            self.g["materials"].append(material)
        return self.materials[name]

    def part(self, name, kind, material, scale, xyz=(0,0,0), rotation=None, sides=24):
        key = (kind,sides)
        if key not in self.geometries:
            s = reflector_faces(sides) if kind == "reflectors" else primitive(kind,sides)
            attrs = {"POSITION":self.accessor(s.points,3,bounds=True),"NORMAL":self.accessor(s.normals,3)}
            if s.uvs:
                attrs["TEXCOORD_0"] = self.accessor(s.uvs,2)
            self.geometries[key] = {"attributes":attrs,"indices":self.accessor(s.indices,1,index=True)}
        mesh_key = (key,material)
        if mesh_key not in self.meshes:
            entry = {**self.geometries[key],"material":self.material(material)}
            if "normalTexture" in self.g["materials"][entry["material"]]:
                tangents = primitive(kind, sides).planar_tangents()
                entry["attributes"] = {**entry["attributes"], "TANGENT":self.accessor(tangents, 4)}
            self.meshes[mesh_key] = len(self.g["meshes"])
            self.g["meshes"].append({"name":name,"primitives":[entry]})
        node = {"name":name,"mesh":self.meshes[mesh_key],"scale":scale,"translation":xyz}
        if rotation:
            node["rotation"] = rotation
        self.g["nodes"].append(node)

    def rod(self, name, start, end, diameter, material="Structural alloy"):
        delta = [y-x for x,y in zip(start,end)]
        length = math.sqrt(sum(x*x for x in delta))
        center = [(x+y)/2 for x,y in zip(start,end)]
        self.part(name,"cylinder",material,(diameter,diameter,length),center,aim_z(delta),8)

    def inspection_camera(self, key, label, target, direction, radius):
        direction = unit(direction)
        self.g["nodes"].append({"name":"Inspection_"+key,"camera":0,"rotation":aim_z(direction),
            "translation":[t+d*radius*3.2 for t,d in zip(target,direction)],
            "extras":{"inspectionView":key,"label":label,"target":target,"radius":radius}})

    def bytes(self):
        view = (.35,-.62,1.12)
        appearance = self.profile.get("appearance", {})
        if self.profile["design"].startswith("geo-"):
            view = appearance.get("previewDirection", (.30,-.76,.95))
        preview = {"name":"OpenBEXIPreview","camera":0,"rotation":aim_z(view),"translation":[10*x for x in view]}
        if "previewUp" in appearance:
            # Roll the embedded camera about its optical axis to project the
            # requested spacecraft up vector vertically in a glTF viewer.
            up = appearance["previewUp"]
            x,y,z,w = preview["rotation"]
            right = (1-2*(y*y+z*z), 2*(x*y+w*z), 2*(x*z-w*y))
            vertical = (2*(x*y-w*z), 1-2*(x*x+z*z), 2*(y*z+w*x))
            roll = math.atan2(-sum(a*b for a,b in zip(up,right)), sum(a*b for a,b in zip(up,vertical))) / 2
            sine, cosine = math.sin(roll), math.cos(roll)
            preview["rotation"] = (x*cosine+y*sine, y*cosine-x*sine, z*cosine+w*sine, w*cosine-z*sine)
            preview["extras"] = {"previewUp":up}
        self.g["nodes"].append(preview)
        # Profile labels and provenance can differ while every vertex, material and
        # transform is identical. Those profiles share a single physical GLB.
        fingerprint = hashlib.sha256(json.dumps(self.g,separators=(",",":")).encode())
        fingerprint.update(self.binary)
        self.g.update(asset={"version":"2.0","generator":"OpenBEXI orbit model builder"},
                      cameras=[{"type":"perspective","perspective":{"yfov":.65,"znear":.001}}],
                      scenes=[{"name":self.profile["name"],"nodes":list(range(len(self.g["nodes"])))}],scene=0,
                      buffers=[{"byteLength":len(self.binary)}],
                      extras={"units":"m","representation":self.profile["description"],
                              "toScale":self.profile["design"] != "unknown",
                              "catalogCredit":"Jonathan McDowell, GCAT, CC BY 4.0. Adapted spacecraft profiles.",
                              "source":"https://planet4589.org/space/gcat/index.html",
                              "catalogLicense":"https://creativecommons.org/licenses/by/4.0/"})
        if "modelCredit" in self.profile:
            self.g["extras"] = {"units": "m", "representation": self.profile["description"],
                                **self.profile["modelCredit"]}
        if self.profile["meta"].get("references"):
            self.g["extras"]["visualReferences"] = self.profile["meta"]["references"]
            self.g["extras"]["dimensionNote"] = self.profile["meta"]["dimension_note"]
            if self.profile["meta"].get("reference_status"):
                self.g["extras"]["referenceStatus"] = self.profile["meta"]["reference_status"]
            if self.profile["meta"].get("flight_references"):
                self.g["extras"]["flightReferences"] = self.profile["meta"]["flight_references"]
        doc = json.dumps(self.g,separators=(",",":"),allow_nan=False).encode()
        doc += b" " * (-len(doc) % 4)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        return fingerprint.digest(), (struct.pack("<4sII",b"glTF",2,28+len(doc)+len(self.binary))
                +struct.pack("<I4s",len(doc),b"JSON")+doc
                +struct.pack("<I4s",len(self.binary),b"BIN\0")+self.binary)


def wings(g, count, core_width, span, chord, segments, array_length=None):
    # Single wings extend to the positive side. Opposing wings share the full span.
    reach = max((span-core_width)/(1 if count == 1 else 2),core_width*.20)
    neck = reach-array_length if array_length and reach > array_length else reach*.15
    width = (reach-neck)/segments
    thickness = min(chord*.035,width*.045)
    for i in range(count):
        angle = TAU*i/count
        dx,dy = math.cos(angle),math.sin(angle)
        rotation = (0,0,math.sin(angle/2),math.cos(angle/2))
        root = core_width/2
        g.rod("Solar array drive",(dx*(root-.06*core_width),dy*(root-.06*core_width),0),
              (dx*(root+neck),dy*(root+neck),0),max(thickness*1.8,core_width*.03))
        for j in range(segments):
            distance = root+neck+(j+.5)*width
            x,y = dx*distance,dy*distance
            g.part("Array frame","box","Structural alloy",(width,chord,thickness),(x,y,0),rotation)
            g.part("Photovoltaic laminates","panel","Solar cells",(width*.95,chord*.96,thickness),
                   (x,y,thickness*.04),rotation)


def navigation_bus(g, p, length, width, span):
    design = p["design"]
    axial = design in ("glonass","glonass-m")
    galileo = design.startswith("galileo")
    # Box buses run lengthwise along Y. The Russian pressurized bus runs vertically along Z.
    if axial:
        height, depth = length*.80, width
        g.part("Pressurized service module","cylinder","Equipment panels",(width,width,height))
        for offset in (-.34,.05,.34):
            g.part("Equipment belt","cylinder","Structural alloy",(width*1.025,width*1.025,width*.05),(0,0,height*offset))
        g.part("Navigation deck support","frustum","Thermal blanket",(width*.98,width*.98,length*.17),
               (0,0,height/2+length*.075))
        deck = height/2+length*.16
    else:
        height, depth = p["meta"]["geometry"].get("body_height_m",width*.85), length
        bus_surface = "Equipment panels" if design in ("gps-i","galileo-iov","beidou-3-secm","glonass-k2") else "Thermal blanket"
        g.part("Equipment bus","box",bus_surface,(width,depth,height))
        g.part("Payload deck","box","Equipment panels",(width*1.025,depth*1.015,height*.045),(0,0,height*.507))
        for side in (-1,1):
            g.part("Radiator","box","Equipment panels",(width*.025,depth*.62,height*.68),
                   (side*width*.506,-depth*.06,0))
            for j in range(4):
                g.part("Radiator channel","box","Structural alloy",(width*.01,depth*.54,height*.018),
                       (side*width*.521,-depth*.06,(j-1.5)*height*.14))
        deck = height*.532
    y = 0 if axial else -.15*depth
    aperture = width*(.79 if galileo else .85)
    g.part("Navigation antenna base","cylinder","Graphite",(aperture,aperture,width*.055),(0,y,deck+width*.027))
    if design in ("gps-iir","gps-i","gps-ii","glonass","glonass-m"):
        for n,r in [(4,.13),(8,.31)]:
            for j in range(n):
                a = TAU*j/n
                g.part("Navigation antenna element","frustum","Ivory radome",(width*.12,width*.12,width*.14),
                       (r*width*math.cos(a),y+r*width*math.sin(a),deck+width*.125),sides=12)
    else:
        g.part("Navigation antenna cover","frustum","Ivory radome",(aperture*.96,aperture*.96,width*.13),
               (0,y,deck+width*.115),sides=6 if design == "giove-a" else 32)
    if galileo or design.startswith(("beidou","glonass-k")):
        g.part("Retroreflector panel","box","Graphite",(width*.33,width*.27,width*.035),
               (width*.22,depth*.31,deck+width*.018))
        for i in range(3):
            for j in range(3):
                g.part("Corner cube","cylinder","Reflector glass",(width*.069,width*.069,width*.012),
                       (width*(.22+(i-1)*.095),depth*.31+(j-1)*width*.075,deck+width*.04),sides=8)
    panels = {"gps-i":2,"gps-ii":2,"gps-iir":3,"gps-iif":3,"galileo-iov":5,
              "galileo-foc":5,"beidou-3-secm":2,"glonass-k1":2,"giove-a":2,"giove-b":2}
    array_length = 5 if galileo else {"giove-a":1.74,"giove-b":1.49}.get(design)
    wings(g,2,width,span,1.082 if galileo else width*.88,panels.get(design,3),array_length)


def component_count(shape, component):
    match = re.search(r"(?:(\d+)\s*)?"+component,shape)
    return int(match.group(1) or 1) if match else 0


def outline(g, p, length, width, span):
    shape = p["shape"].lower().replace("22 pan","2 pan").replace("wing","pan")
    body = shape.split("+")[0].strip()
    if "truss" in body:
        low, high = ring(4,width*.5,-length/2),ring(4,width*.5,length/2)
        for i in range(4):
            j = (i+1)%4
            for a,b in [(low[i],high[i]),(low[i],low[j]),(high[i],high[j]),(low[i],high[j])]:
                g.rod("Structure",a,b,width*.045)
    else:
        sides = next((n for prefix,n in (("oct",8),("hex",6),("tri",3),("pent",5),("hept",7)) if prefix in body),24)
        kind = "cylinder"
        if "sphere" in body or body == "ell": kind = "sphere"
        elif "annulus" in body: kind = "annulus"
        elif "tetra" in body: kind = "tetra"
        elif "poly" in body: kind,sides = "poly",10
        elif "frust" in body or "trunc" in body or "taper" in body: kind = "frustum"
        elif "cone" in body or "pyramid" in body: kind = "nose"
        elif any(part in body for part in ("box","cube","plate","pallet")): kind = "box"
        g.part("Spacecraft body",kind,"Equipment panels",(width,width,length),sides=sides)
        if "dom" in shape:
            g.part("Dome","sphere","Structural alloy",(width*.97,width*.97,length*.32),(0,0,length*.44))
        if "+ cone" in shape:
            g.part("Conical section","nose","Structural alloy",(width*.9,width*.9,length*.34),(0,0,length*.62))
        if "step" in shape or ("cyl" in shape and kind in ("box","nose")):
            g.part("Cylindrical section","cylinder","Structural alloy",(width*.8,width*.8,length*.25),
                   (0,0,length*.52))
        if p["meta"]["bus"].lower().startswith("cubesat"):
            for i in (-1,1):
                for j in (-1,1):
                    g.part("Dispenser rail","box","Structural alloy",(width*.07,width*.07,length*1.02),
                           (i*width*.48,j*width*.48,0))
            g.part("Body-mounted cells","panel","Solar cells",(width*.78,width*.78,length),(0,0,length*.008))
    panels = component_count(shape,"pan")
    if panels:
        wings(g,panels,width,span,min(length,width)*.85,2 if span > width*3 else 1)
    for i in range(component_count(shape,"dish")):
        d = width*.78
        x = (i-.5*(component_count(shape,"dish")-1))*width*.92
        g.part("Reflector dish","dish","Ivory radome",(d,d,d),(x,0,length*.54))
        g.rod("Feed support",(x+d*.42,0,length*.54+d*.15),(x,0,length*.54+d*.32),d*.025)
    antennas = component_count(shape,"ant") or component_count(shape,"boom")
    for i in range(antennas):
        angle = TAU*i/antennas+.3
        dx,dy = math.cos(angle),math.sin(angle)
        end = max(width*.68, (span/2 if not panels else width*.7))
        g.rod("Antenna boom",(dx*width*.34,dy*width*.34,length*.31),
              (dx*end,dy*end,length*.53),min(length,width)*.024)
    for i in range(component_count(shape,"wheel")):
        side = 1 if i%2 else -1
        g.part("External wheel","cylinder","Graphite",(width*.52,width*.52,width*.1),
               (side*width*.52,0,0),aim_z((1,0,0)))


def dish_antenna(g, name, center, diameter):
    x,y,z=center
    g.part(name,"dish","Ivory radome",(diameter,diameter,diameter),center,sides=32)
    tip=(x,y,z+diameter*.37)
    for i in range(3):
        a=TAU*i/3
        g.rod("Feed strut",(x+diameter*.45*math.cos(a),y+diameter*.45*math.sin(a),z+diameter*.17),
              tip,diameter*.014)
    g.part("Feed","cylinder","Graphite",(diameter*.085,diameter*.085,diameter*.10),tip,sides=12)


def solar_drum(g, width, height, center):
    g.part("Drum structure","cylinder","Structural alloy",(width,width,height),center,sides=40)
    g.part("Solar-cell belt","drum-cells","Solar cells",(width*1.008,width*1.008,height*.92),center,sides=40)


def kuiper(g, design, length, width, span):
    """The local +Z face points toward Earth. The solar drive runs along X."""
    production = design == "kuiper-production"
    deck = length * (.63 if production else .88)
    depth = deck * (.90 if production else .81)
    height = width * (.43 if production else .42)
    g.part("Equipment chassis", "foil-box", "Equipment panels", (deck, depth, height))
    g.part("Nadir payload deck", "box", "Graphite", (deck*.96, depth*.96, height*.07),
           (0, 0, height*.53))
    if production:
        # Three leaves hinge to three sides of the central equipment section (Fig. 4).
        for dx, dy in ((-1, 0), (1, 0), (0, 1)):
            x, y, z = dx*deck, dy*depth, height*.53
            g.part("Deployed antenna leaf", "box", "Structural alloy", (deck*.98, depth*.98, height*.10), (x,y,z))
            for tile in (-1, 1):
                g.part("Planar antenna tile", "box", "Reflector glass", (deck*.464, depth*.94, height*.019),
                       (x+tile*deck*.24,y,z+height*.058))
            for offset in (-.32, .32):
                hx, hy = (x*.5, offset*depth) if dx else (offset*deck, y*.5)
                axis = (0,1,0) if dx else (1,0,0)
                g.part("Antenna leaf hinge", "cylinder", "Structural alloy", (height*.23,height*.23,deck*.19),
                       (hx,hy,z), aim_z(axis))
        drive_y, drive_z = -depth*.73, -height*1.15
    else:
        g.part("Prototype phased array", "box", "Antenna face", (deck*.61, depth*.72, height*.08),
               (-deck*.14,0,height*.60))
        drive_y, drive_z = 0, -height*.61

    enclosures = ((-.29,-.19),(-.29,.22),(.13,.22)) if production else ((.32,.16),)
    for x, y in enclosures:
        g.part("Payload electronics enclosure","box","Equipment panels",(deck*.21,depth*.20,height*.16),
               (x*deck,y*depth,height*.64))
        g.part("Enclosure cooling plate","box","Radiator tiles",(deck*.18,depth*.17,height*.025),
               (x*deck,y*depth,height*.73))
    for side in (-1,1):
        g.part("Chassis longeron","box","Structural alloy",(deck*1.012,depth*.032,height*.86),
               (0,side*depth*.49,0))

    shoulder = deck*(.27 if production else .53)
    for sign in (-1,1):
        g.rod("Solar drive support", (sign*deck*.25,-depth*.34,-height*.43),
              (sign*shoulder,drive_y,drive_z), deck*.038)
    g.rod("Solar drive shaft", (-shoulder,drive_y,drive_z), (shoulder,drive_y,drive_z), deck*.09)
    # An example sun-tracking angle exposes the backsheet and the independent PV plane.
    angle = math.radians(52)
    rotation = (math.sin(angle/2),0,0,math.cos(angle/2))
    count = 4 if production else 5
    pitch = (span*.5-shoulder)/count
    chord = deck*(.60 if production else .62)
    thickness = chord*.028
    for side in (-1,1):
        for station in range(count):
            x = side*(shoulder+pitch*(station+.5))
            g.part("Solar panel frame", "box", "Array backsheet", (pitch*.99,chord,thickness),
                   (x,drive_y,drive_z), rotation)
            g.part("Solar cell panel", "panel", "Solar cells", (pitch*.965,chord*.96,thickness*.10),
                   (x,drive_y-thickness*.56*math.sin(angle),drive_z+thickness*.56*math.cos(angle)),rotation)

    dish_antenna(g, "Gateway antenna", (deck*.27,-depth*.21,height*.58), deck*(.32 if production else .30))
    for side in (-1,1):
        axis = aim_z((side,0,0))
        g.part("Optical terminal", "cylinder", "Equipment panels", (height*.49,height*.49,deck*.09),
               (side*deck*.53,depth*.21,0), axis)
        g.part("Optical aperture", "cylinder", "Graphite", (height*.31,height*.31,deck*.012),
               (side*deck*.58,depth*.21,0), axis)
    g.part("Electric propulsion outlet", "annulus", "Graphite", (deck*.17,deck*.17,height*.14),
           (0,0,-height*.55), sides=24)


def mission_model(g, p, length, width, span):
    design = p["design"]
    shape = p["shape"].lower()
    count = component_count(shape,"pan")
    if design in ("weather-spinner","comms-spinner"):
        solar_drum(g,width,length*.66,(0,0,-length*.17))
        solar_drum(g,width*.88,length*.35,(0,0,length*.32))
        if design=="comms-spinner":
            dish_antenna(g,"Despun antenna",(0,0,length*.52),width*.92)
        else:
            g.part("Instrument opening","box","Graphite",(width*.32,width*.11,length*.20),(0,-width*.48,0))
            g.part("Antenna tower","frustum","Equipment panels",(width*.38,width*.38,length*.25),(0,0,length*.60))
        return
    if design=="orbiter":
        g.part("Fuselage","sphere","Equipment panels",(width*1.42,length,width*1.14))
        g.part("Delta wings","delta","Equipment panels",(span,length*.69,width*.12),(0,-length*.14,0))
        g.part("Cockpit glazing","sphere","Graphite",(width*.82,length*.105,width*.32),(0,length*.33,width*.28))
        g.part("Vertical tail","delta","Equipment panels",(width*1.34,length*.29,width*.12),
               (0,-length*.33,width*.54),aim_z((1,0,0)))
        for x,z in [(-.35,0),(.35,0),(0,.48)]:
            g.part("Main engine bell","frustum","Graphite",(width*.41,width*.41,width*.56),
                   (x*width,-length*.42,z*width),aim_z((0,1,0)))
        return
    if design=="telescope":
        g.part("Optical telescope assembly","cylinder","Equipment panels",(width,width,length),sides=48)
        g.part("Entrance aperture","cylinder","Graphite",(width*.91,width*.91,width*.025),(0,0,length*.505),sides=48)
        g.part("Open aperture door","cylinder","Equipment panels",(width*.92,width*.92,.08),
               (0,width*.61,length*.57),aim_z((0,-.83,.55)),sides=32)
        for z in (-.38,-.22,.26):
            g.part("Equipment collar","cylinder","Structural alloy",(width*1.04,width*1.04,length*.04),(0,0,z*length))
        wings(g,2,width,span,length*.27,2)
        return
    if design=="capsule":
        g.part("Trunk","cylinder","Equipment panels",(width,width,length*.48),(0,0,-length*.23))
        g.part("Return capsule","frustum","Ivory radome",(width,width,length*.46),(0,0,length*.24))
        if count:
            wings(g,count,width,span,width*.65,3)
        else:
            g.part("Trunk cells","drum-cells","Solar cells",(width*1.008,width*1.008,length*.38),(0,0,-length*.23),sides=28)
        return
    if design=="iridium-classic":
        g.part("Triangular core","cylinder","Thermal blanket",(width,width,length),sides=3)
        for i in range(3):
            angle=TAU*i/3
            n=(math.cos(angle)*.87,math.sin(angle)*.87,-.5)
            center=(width*.72*math.cos(angle),width*.72*math.sin(angle),-length*.23)
            g.part("Main mission antenna","box","Equipment panels",(width*.90,length*.58,width*.075),center,aim_z(n))
        wings(g,2,width,span,width*.8,2)
        return
    height=min(length,width)*.90
    g.part("Equipment module","box","Thermal blanket",(width,length,height))
    g.part("Payload deck","box","Equipment panels",(width*1.02,length*1.01,height*.045),(0,0,height*.51))
    g.part("Thermal radiator","box","Equipment panels",(width*.035,length*.72,height*.67),
           (width*.512,0,0))
    if design=="weather":
        g.part("Instrument housing","box","Ivory radome",(width*.69,length*.49,height*.32),(0,-length*.15,height*.69))
        g.part("Optical baffle","cylinder","Graphite",(width*.42,width*.42,height*.12),
               (0,-length*.16,height*.89),sides=32)
        g.part("Optical aperture","cylinder","Reflector glass",(width*.30,width*.30,height*.018),
               (0,-length*.16,height*.958),sides=32)
        if "boom" in shape:
            g.rod("Instrument boom",(-width*.45,0,0),(-width*.98,-length*.77,height*.75),width*.033)
    elif design=="sar":
        g.part("Radar antenna","box","Structural alloy",(width*.10,12,width*.85),(width*.61,0,0))
        for i in range(5):
            g.part("Antenna panel","box","Thermal blanket",(width*.045,2.32,width*.80),
                   (width*.685,(i-2)*2.4,0))
    elif design=="relay":
        for sign in (-1,1):
            center=(0,sign*(length/2+2.1),height*.62)
            g.rod("Antenna arm",(0,sign*length*.45,height*.3),center,width*.055)
            dish_antenna(g,"Single-access antenna",center,4.9)
    elif design=="large-reflector":
        center=(0,length*.5+3.9,height*.68)
        g.rod("Reflector arm",(0,length*.42,height*.32),center,width*.07)
        dish_antenna(g,"L-band antenna",center,9.0)
    if count:
        wings(g,count,width,span,min(width,length)*.85,5 if p["name"]=="GOES-R series" else 3)


def model(profile):
    g = Glb(profile)
    shape = profile["meta"]["geometry"]
    length,width,span = (shape.get(key,1) for key in ("body_length_m","body_width_m","span_m"))
    design = profile["design"]
    if design in ("kuiper-protoflight", "kuiper-production"):
        kuiper(g, design, length, width, span)
    elif design == "geo-fleet":
        fleet_spacecraft(g, profile["appearance"], length, width, span)
    elif design == "geo-telecom":
        communications_spacecraft(g, profile["appearance"], length, width, span)
    elif design == "geo-weather":
        weather_spacecraft(g, profile["appearance"], length, width, span)
    elif design == "geo-relay":
        tdrs(g, profile["appearance"], length, width, span)
    elif design == "geo-broadcast":
        build = {"Ekran": ekran, "Gorizont": gorizont}[profile["appearance"]["broadcast"]]
        build(g, length, width, span)
    elif design == "geo-experiment":
        ats6(g, profile["appearance"]["diameter"], length, width, span)
    elif design == "unknown":
        g.part("Schematic marker","poly","Reference blue",(1,1,1),sides=8)
    elif design == "vanguard":
        g.part("Aluminum sphere","sphere","Equipment panels",(width,width,width),sides=32)
        for axis in range(3):
            for sign in (-1,1):
                direction = [sign if j == axis else 0 for j in range(3)]
                g.rod("Whip antenna",[d*width*.47 for d in direction],[d*span/2 for d in direction],width*.018)
                direction[(axis+1)%3] = .80
                n = unit(direction)
                g.part("Body-mounted solar cell","panel","Solar cells",(width*.19,width*.19,width*.004),
                       [d*width*.501 for d in n],aim_z(n))
    elif design == "telstar":
        g.part("Faceted shell","poly","Equipment panels",(width,width,width),sides=12)
        g.part("Body-mounted solar cells","telstar-cells","Solar cells",(width,width,width),sides=12)
        g.part("Equatorial antenna band","cylinder","Graphite",(width*1.01,width*1.01,width*.09),sides=48)
        for j in range(32):
            a = TAU*j/32
            n = (math.cos(a),math.sin(a),0)
            g.part("Antenna aperture","cylinder","Ivory radome",(width*.035,width*.035,width*.01),
                   (width*.505*n[0],width*.505*n[1],0),aim_z(n),sides=10)
    elif design in ("lageos","lares-2","etalon","lcs-1"):
        material = "Thermal blanket" if design == "etalon" else "Equipment panels"
        g.part("Spherical body","sphere",material,(width,width,width),sides=64)
        if profile.get("reflectors"):
            g.part("Laser retroreflectors","reflectors","Reflector glass",(width,width,width),
                   sides=profile["reflectors"])
    elif design == "outline":
        outline(g,profile,length,width,span)
    elif design in ("weather-spinner","comms-spinner","orbiter","telescope","capsule","iridium-classic",
                    "weather","sar","relay","large-reflector"):
        mission_model(g,profile,length,width,span)
    else:
        navigation_bus(g,profile,length,width,span)
    return g.bytes()


def number_ranges(numbers):
    ranges = []
    for number in sorted(numbers):
        if ranges and ranges[-1][1]+1==number:
            ranges[-1][1]=number
        else:
            ranges.append([number,number])
    return ",".join(str(a) if a==b else f"{a}-{b}" for a,b in ranges)


def write_if_changed(path, content):
    if not path.is_file() or path.read_bytes() != content:
        path.write_bytes(content)


def main():
    orbits = ("meo","geo","leo")
    requested = set(sys.argv[1:] or orbits)
    if not requested.issubset(orbits):
        raise SystemExit("Supported orbits are leo, meo and geo.")
    entries, index, mesh_files, unique = [], {}, {}, {}
    registries = {orbit: json.loads((DATA/(orbit+".json")).read_bytes()) for orbit in orbits}
    shared = {alias: p for p in registries["geo"].values() for alias in p.get("shared_with", [])}
    for orbit in orbits:
        profiles = registries[orbit]
        index[orbit.upper()] = {asset:number_ranges(p["norad"]) for asset,p in profiles.items()}
        for asset, profile in profiles.items():
            if "existingMetadata" in profile:
                if orbit == "geo" and profile.get("appearance") and orbit in requested:
                    # This ID predates orbit subdirectories. Its public URL is stable.
                    _, content = model(profile)
                    write_if_changed(ROOT/"obj"/orbit/asset,content)
                    detail = {"0":{"name":profile["name"],"meta":profile["meta"]}}
                    write_if_changed(DATA/(profile["existingMetadata"]+".json"),
                                     (json.dumps(detail,ensure_ascii=False,indent=2)+"\n").encode())
                continue
            fingerprint, content = model(shared.get(asset,profile))
            canonical = unique.setdefault(fingerprint,asset)
            if canonical != asset:
                mesh_files[asset] = canonical
            elif orbit in requested or ("geo" in requested and asset in shared) or not (ROOT/"obj"/asset).exists():
                path = ROOT / "obj" / asset
                path.parent.mkdir(parents=True,exist_ok=True)
                write_if_changed(path,content)
            entries.append({"id":asset,"displayName":profile["name"],"type":"glb","description":profile["description"],
                            "tags":[orbit.upper(),profile["family"]],"files":{"glb":canonical},"textures":[]})
    # Keep hand-authored model entries and formatting intact.
    text = MANIFEST.read_text("utf-8")
    published = json.loads(text)["models"]
    previous = {row["files"]["glb"] for row in published
                if row["id"].startswith(("leo/","meo/","geo/")) and "glb" in row["files"]}
    start = re.search(r',\n    \{"id": "(?:meo|geo|leo)/',text)
    end = text.rindex("\n  ]")
    block = "".join(",\n    "+json.dumps(entry,ensure_ascii=False) for entry in entries)
    updated_manifest = text[:start.start() if start else end]+block+text[end:]
    write_if_changed(MANIFEST,updated_manifest.encode())
    lookup = {"orbits":index,"meshFiles":mesh_files}
    write_if_changed(DATA/"orbit-model-index.json",(json.dumps(lookup,separators=(",",":"))+"\n").encode())
    # An updated registry can replace a former physical model with a shared file.
    # Retire only our previously published generated GLBs in the selected directories.
    in_use = set()
    for row in json.loads(updated_manifest)["models"]:
        files = row["files"]
        if files.get("glb"):
            in_use.add(files["glb"])
        in_use.update(files.get("glbs", []))
    for obsolete in previous - in_use:
        path = (ROOT/"obj"/obsolete).resolve()
        if path.parent not in {ROOT/"obj"/orbit for orbit in requested} or path.suffix != ".glb" or not path.is_file():
            continue
        content = path.read_bytes()
        if content[:4] == b"glTF":
            end_of_json = 20 + int.from_bytes(content[12:16],"little")
            header = json.loads(content[20:end_of_json])
            if header.get("asset",{}).get("generator") in ("OpenBEXI orbit model builder","OpenBEXI MEO model builder"):
                path.unlink()
    print(f"Cataloged {len(entries)} profiles using {len(unique)} unique generated meshes.")
    if "geo" in requested:
        if __package__:
            from .spacecraft_wavefront import build
        else:
            from spacecraft_wavefront import build
        build()


if __name__ == "__main__":
    main()
