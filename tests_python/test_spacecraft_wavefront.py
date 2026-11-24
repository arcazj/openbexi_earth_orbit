import json
import math
import struct
import unittest
import zipfile
from pathlib import Path
import server

ROOT = Path(__file__).resolve().parents[1]


class WavefrontPackageTests(unittest.TestCase):
    def test_only_published_packages_are_served(self):
        for name in ("intelsat-10-02", "mep", "horizons-3e"):
            self.assertTrue(server.static_request_is_exposed("/obj/exports/"+name+".zip"))
        self.assertFalse(server.static_request_is_exposed("/obj/exports/private.zip"))

    def test_deployed_geometry_materials_and_texture_references(self):
        for name, span in (("mep", 4.4), ("intelsat-10-02", 35), ("horizons-3e", 35)):
            with self.subTest(model=name), zipfile.ZipFile(ROOT/"obj"/"exports"/(name+".zip")) as package:
                glb = (ROOT/"obj"/"geo"/(name+".glb")).read_bytes()
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
                x = [v[0] for v in vertices]
                self.assertAlmostEqual(max(x)-min(x), span, delta=.2)
