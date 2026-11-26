import json
import math
import struct
import unittest
import zipfile
from pathlib import Path
import server
from tools import argos, ses_models

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {
    "kuiper-production": ("leo/kuiper-production.glb",0,5.0),
    "kuiper-protoflight": ("leo/ref-kuiper-58013.glb",0,10.0),
    "giove-a": ("meo/ref-sstl-600-28922.glb",0,9.60),
    "giove-b": ("meo/ref-proteus-32781.glb",0,9.63),
    "galileo-iov": ("meo/galileo-iov.glb",0,14.50),
    "galileo-iov-sar": ("meo/galileo-iov-sar.glb",0,14.50),
    "galileo-foc": ("meo/galileo-foc.glb",0,14.67),
    "beidou-2-meo": ("meo/beidou-2-meo.glb",0,17.7),
    "beidou-3s-cast": ("meo/beidou-3s-cast.glb",0,11.5),
    "beidou-3s-secm": ("meo/beidou-3s-secm.glb",0,9.7),
    "beidou-3-cast": ("meo/beidou-3-cast.glb",0,14.0),
    "beidou-3-cast-sar": ("meo/beidou-3-cast-sar.glb",0,14.0),
    "beidou-3-secm-a": ("meo/beidou-3-secm.glb",0,10.4),
    "beidou-3-secm-b": ("meo/beidou-3-secm-b.glb",0,10.3),
    "beidou-3-secm-b-2024": ("meo/beidou-3-secm-b-2024.glb",0,10.3),
    "intelsat-10-02": ("geo/intelsat-10-02.glb",0,35),
    "mep": ("geo/mep.glb",0,4.4),
    "horizons-3e": ("geo/horizons-3e.glb",0,35),
    "eurostar-3000": ("geo/ref-eurostar-3000-28187.glb",0,35),
    "spacebus-4000c2": ("geo/spacebus-4000c2-twin.glb",0,38),
    "spacebus-4000c3": ("geo/ref-spacebus-4000c3-28526.glb",0,38),
    "spacebus-4000c4": ("geo/ciel-2.glb",0,35),
    "tiangong": ("leo/ref-tianhe-48274.glb",1,55.5),
    "telesat-leo-1": ("leo/telesat-leo-1.glb",2,.93),
    "gravitas": ("leo/ref-gravitas-68495.glb",0,40.0),
    "amc-21-ses-1": ("geo/amc-21-geostar.glb",0,22.0),
}
for slug, profile in ses_models.PROFILES.items():
    axis = 1 if profile["design"] == "ses-spinner" else 0
    PACKAGES[slug] = ("geo/"+slug+".glb",axis,profile["meta"]["geometry"]["span_m"])
for slug, spec in argos.SPECS.items():
    PACKAGES[slug] = (argos.ASSETS[slug],0,spec[3][2])


class WavefrontPackageTests(unittest.TestCase):
    def test_only_published_packages_are_served(self):
        for name in PACKAGES:
            self.assertTrue(server.static_request_is_exposed("/obj/exports/"+name+".zip"))
        self.assertFalse(server.static_request_is_exposed("/obj/exports/private.zip"))

    def test_deployed_geometry_materials_and_texture_references(self):
        for name, (asset, axis, span) in PACKAGES.items():
            with self.subTest(model=name), zipfile.ZipFile(ROOT/"obj"/"exports"/(name+".zip")) as package:
                glb = (ROOT/"obj"/asset).read_bytes()
                doc = json.loads(glb[20:20+struct.unpack_from("<I", glb, 12)[0]])
                expected_parts = sum("mesh" in node for node in doc["nodes"])
                expected_triangles = sum(doc["accessors"][p["indices"]]["count"]//3
                    for n in doc["nodes"] if "mesh" in n for p in doc["meshes"][n["mesh"]]["primitives"])
                mtl = package.read(name+".mtl").decode().splitlines()
                materials = {line[7:] for line in mtl if line.startswith("newmtl ")}
                maps = [line.split()[-1] for line in mtl if line.startswith(("map_", "norm "))]
                self.assertTrue(maps)
                for path in maps:
                    self.assertTrue(package.read(path).startswith(b"\x89PNG\r\n\x1a\n"))
                self.assertIn(doc["extras"]["dimensionNote"], package.read("model-notes.txt").decode())
                vertices, normals, uvs, faces, parts = [], 0, 0, 0, 0
                used = set()
                for line in package.read(name+".obj").decode().splitlines():
                    fields = line.split()
                    if fields[0] == "v":
                        point = [float(v) for v in fields[1:]]
                        self.assertTrue(all(math.isfinite(v) for v in point))
                        vertices.append(point)
                    elif fields[0] == "vn":
                        self.assertAlmostEqual(math.hypot(*(float(v) for v in fields[1:])), 1, places=6)
                        normals += 1
                    elif fields[0] == "vt":
                        uvs += 1
                    elif fields[0] == "o":
                        parts += 1
                    elif fields[0] == "usemtl":
                        used.add(fields[1])
                    elif fields[0] == "mtllib":
                        self.assertEqual(fields[1], name+".mtl")
                    elif fields[0] == "f":
                        self.assertEqual(len(fields), 4)
                        for field in fields[1:]:
                            v, uv, n = field.split("/")
                            self.assertTrue(0 < int(v) <= len(vertices) and 0 < int(n) <= normals)
                            if uv:
                                self.assertTrue(0 < int(uv) <= uvs)
                        faces += 1
                self.assertEqual((parts, faces), (expected_parts, expected_triangles))
                self.assertEqual(used, materials)
                self.assertTrue(uvs > 0)
                positions = [v[axis] for v in vertices]
                self.assertAlmostEqual(max(positions)-min(positions), span, delta=.2)
