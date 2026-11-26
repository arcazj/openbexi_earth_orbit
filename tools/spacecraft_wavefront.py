"""Generate the standalone spacecraft OBJ/MTL packages with their textures."""
import hashlib
import io
import json
import math
import struct
import zipfile

if __package__:
    from . import mep
    from .spacecraft_textures import blanket_maps
    from .build_orbit_models import DATA, ROOT, WAVEFRONT_EXPORTS, Glb, cross, model, write_if_changed
else:
    import mep
    from spacecraft_textures import blanket_maps
    from build_orbit_models import DATA, ROOT, WAVEFRONT_EXPORTS, Glb, cross, model, write_if_changed


def rotate(vector, quat):
    axis = quat[:3]
    v = cross(axis, vector)
    w = cross(axis, v)
    return [component + 2*(quat[3]*a+b) for component, a, b in zip(vector, v, w)]


def numbers(row):
    return " ".join(format(x, ".8g") for x in row)


def wavefront(name, glb):
    """Flatten the generated scene's metre-scale TRS nodes, including inverse-transpose normals."""
    length = struct.unpack_from("<I", glb, 12)[0]
    doc = json.loads(glb[20:20+length])
    binary = memoryview(glb)[28+length:]

    def view(index):
        item = doc["bufferViews"][index]
        start = item.get("byteOffset", 0)
        return binary[start:start+item["byteLength"]]

    def rows(index):
        acc = doc["accessors"][index]
        fmt = {"SCALAR": "H", "VEC3": "3f", "VEC2": "2f"}[acc["type"]]
        return struct.iter_unpack("<"+fmt, view(acc["bufferView"]))

    out = io.StringIO()
    out.write("# OpenBEXI original spacecraft exterior. Coordinates in metres.\nmtllib "+name+".mtl\n")
    materials, files, texture_paths = [], {}, {}
    for mat in doc["materials"]:
        pbr = mat["pbrMetallicRoughness"]
        rough, metal = pbr["roughnessFactor"], pbr["metallicFactor"]
        materials.extend(["newmtl "+mat["name"].replace(" ", "_"), "Kd "+numbers(pbr["baseColorFactor"][:3]),
                          "Ks "+numbers([.04+.36*metal]*3), "Ns "+format(2/rough**2-2, ".4g"),
                          "Pr "+str(rough), "Pm "+str(metal), "illum 2"])
        for field, reference in (("map_Kd", pbr.get("baseColorTexture")), ("norm", mat.get("normalTexture")),
                                 ("map_Pr", pbr.get("metallicRoughnessTexture"))):
            if reference is None:
                continue
            image = doc["textures"][reference["index"]]["source"]
            data = bytes(view(doc["images"][image]["bufferView"]))
            # The author's blanket normals change bitangent sign with the OBJ V flip.
            # Wavefront roughness is a scalar image, glTF packs it in the green channel.
            if field in ("norm", "map_Pr"):
                data = blanket_maps(wavefront=True)[0 if field == "norm" else 1]
            digest = hashlib.sha256(data).digest()
            if digest not in texture_paths:
                suffix = {"norm": "-normal", "map_Pr": "-roughness"}.get(field, "")
                path = "textures/"+mat["name"].lower().replace(" ", "-")+suffix+".png"
                texture_paths[digest] = path
                files[path] = data
            materials.append(field+" "+texture_paths[digest])
        materials.append("")
    vertex_base = uv_base = 1
    for node_id in doc["scenes"][doc["scene"]]["nodes"]:
        node = doc["nodes"][node_id]
        if "mesh" not in node:
            continue
        scale, position, quat = node["scale"], node["translation"], node.get("rotation", (0,0,0,1))
        out.write(f"o {node['name'].replace(' ', '_')}_{node_id}\n")
        for part in doc["meshes"][node["mesh"]]["primitives"]:
            attr = part["attributes"]
            count = doc["accessors"][attr["POSITION"]]["count"]
            for v in rows(attr["POSITION"]):
                r = rotate([a*b for a,b in zip(v,scale)], quat)
                out.write("v "+numbers([a+b for a,b in zip(r,position)])+"\n")
            for v in rows(attr["NORMAL"]):
                r = rotate([a/b for a,b in zip(v,scale)], quat)
                magnitude = math.hypot(*r)
                out.write("vn "+numbers([a/magnitude for a in r])+"\n")
            uv = "TEXCOORD_0" in attr
            if uv:
                for u,v in rows(attr["TEXCOORD_0"]):
                    out.write("vt "+numbers((u,1-v))+"\n")
            out.write("usemtl "+doc["materials"][part["material"]]["name"].replace(" ", "_")+"\n")
            indices = rows(part["indices"])
            for tri in zip(indices,indices,indices):
                out.write("f "+" ".join(f"{vertex_base+i}/{uv_base+i if uv else ''}/{vertex_base+i}" for i, in tri)+"\n")
            vertex_base += count
            if uv:
                uv_base += count
    files[name+".obj"] = out.getvalue().encode()
    files[name+".mtl"] = "\n".join(materials).encode()
    extras = doc["extras"]
    files["model-notes.txt"] = ("OpenBEXI original model and textures. Coordinates in metres.\n"
        +extras["dimensionNote"]+"\nVisual references\n"+"\n".join(extras["visualReferences"])+"\n").encode()
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        for path, content in sorted(files.items()):
            item = zipfile.ZipInfo(path, (1980,1,1,0,0,0))
            item.create_system, item.external_attr = 3, 0o100644 << 16
            archive.writestr(item, content, compress_type=zipfile.ZIP_DEFLATED)
    return result.getvalue()


def build(orbits=("geo","leo","meo")):
    directory = ROOT/"obj"/"exports"
    directory.mkdir(exist_ok=True)
    if "geo" in orbits:
        pod = Glb(mep.PROFILE)
        mep.spacecraft(pod)
        geo = json.loads((DATA/"geo.json").read_bytes())
        assets = {"mep": pod.bytes()[1]}
        for name in ("intelsat-10-02","horizons-3e"):
            assets[name] = model(geo["geo/"+name+".glb"])[1]
        for name, glb in assets.items():
            write_if_changed(ROOT/"obj"/"geo"/(name+".glb"), glb)
            write_if_changed(directory/(name+".zip"), wavefront(name, glb))
    for asset, name in WAVEFRONT_EXPORTS.items():
        if asset.split("/")[0] in orbits:
            write_if_changed(directory/(name+".zip"), wavefront(name, (ROOT/"obj"/asset).read_bytes()))


if __name__ == "__main__":
    build()
