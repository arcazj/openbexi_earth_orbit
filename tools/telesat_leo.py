"""Telesat's SSTL-built Phase 1 demonstrator. All mesh dimensions are in metres."""
import math

NORAD = 43113
ASSET = "leo/telesat-leo-1.glb"
MISSION = "https://www.sstl.co.uk/space-portfolio/launched-missions/2010-2019/telesat-leo-phase-1-satellite-launched-2018"
ARTWORK = "https://space.skyrocket.de/img_sat/telesat-leo-sstl__1.jpg"
SIZE_SOURCE = "https://ntrs.nasa.gov/citations/20205006661"
SOURCES = [
    {"url": ARTWORK, "basis": "SSTL orbit illustration"},
    {"url": MISSION, "basis": "SSTL flight photograph and mission data"},
    {"url": SIZE_SOURCE, "basis": "NASA contractor report, Appendix B-77"},
]
WIDTH, LENGTH = .65, .75
PROFILE = {
    "name": "Telesat LEO-1 (LEO Vantage 1)",
    "description": "SSTL's Telesat Phase 1 Ka-band demonstrator with fixed, split solar panels, a silver equipment face and compact end-deck fittings.",
    "family": "Telesat", "design": "telesat-leo-1", "shape": "Box with body-mounted solar panels",
    "appearance": {"previewDirection": [.80, -1, -.17], "previewUp": [.19, .15, 1], "previewFov": 10},
    "meta": {
        "bus": "SSTL-42",
        "geometry": {"body_length_m": LENGTH, "body_width_m": WIDTH, "body_height_m": WIDTH, "glb_units": "m"},
        "references": [source["url"] for source in SOURCES],
        "reference_status": "Illustrated design",
        "dimension_note": "The model uses 0.65 × 0.65 × 0.75 m as its approximate bus scale, based on the Phase 1 stowed dimensions in SAIC's NASA report (Appendix B, p. B-77). The two solar faces in the preview follow SSTL's orbit illustration. The opposite quarter draws on SSTL's flight photograph. Face placement, cell patterns and projecting fittings are reconstructed.",
    },
    "modelCredit": {"toScale": True, "source": MISSION,
                    "catalogCredit": "Original OpenBEXI geometry and textures. Visual references by Surrey Satellite Technology Ltd.",
                    "sources": SOURCES},
    "norad": [NORAD],
}

# Each layout is one mesh of raised, clipped cells. The two illustrated faces
# have horizontal cells. The flight photograph shows a different vertical string layout.
CELL_LAYOUTS = {
    "SSTL main strings": (8, 11), "SSTL short strings": (8, 4),
    "SSTL flight main strings": (13, 7), "SSTL flight short strings": (13, 2),
}


def cell_laminate(surface, layout):
    columns, rows = CELL_LAYOUTS[layout]
    margin_x, margin_y = .043, (.075 if rows <= 4 else .043)
    pitch_x, pitch_y = (1 - 2*margin_x)/columns, (1 - 2*margin_y)/rows
    cut_x, cut_y = (.10,.12) if "flight" in layout else (.047,.065)
    outline = [(cut_x,0),(1-cut_x,0),(1,cut_y),(1,1-cut_y),(1-cut_x,1),(cut_x,1),(0,1-cut_y),(0,cut_y)]
    for row in range(rows):
        for col in range(columns):
            if layout == "SSTL flight main strings" and (
                (row == 0 and (col < 2 or col >= columns-2)) or (row == 4 and col in (5, 6))
            ):
                continue
            if layout == "SSTL flight short strings" and row == 1 and (col < 2 or col >= columns-2):
                continue
            if layout == "SSTL main strings" and row == 0 and col in (0, columns-1):
                continue
            x = -.5 + margin_x + (col+.5)*pitch_x
            y = -.5 + margin_y + (row+.5)*pitch_y
            # A narrow bevel gives the contacts and panel substrate a visible edge at grazing angles.
            def ring(scale, height):
                return [(x+(u-.5)*pitch_x*.981*scale, y+(v-.5)*pitch_y*.972*scale, height) for u,v in outline]
            top, foot = ring(.993, .5), ring(1, -.5)
            # Choose a wafer from the atlas for subtle differences between neighbouring cells.
            tile = (col*5 + row*3 + col*row) % 4
            uv = [((tile%2 + u)/2,(tile//2 + v)/2) for u,v in outline]
            surface.face(top, uvs=uv)
            for i, low in enumerate(foot):
                j = (i+1) % len(foot)
                surface.face([low, foot[j], top[j], top[i]], uvs=[uv[i],uv[j],uv[j],uv[i]])


def side(g, index):
    angle = index*math.pi/2
    c, s = round(math.cos(angle)), round(math.sin(angle))
    q = math.sqrt(.5)
    rot = (q*math.cos(angle/2), q*math.sin(angle/2), q*math.sin(angle/2), q*math.cos(angle/2))
    def at(u, z, offset):
        d = WIDTH/2 + offset
        return (c*u+s*d, s*u-c*d, z)
    def part(name, kind, material, width, height, depth, u, z, offset, sides=24):
        g.part(name, kind, material, (width,height,depth), at(u,z,offset), rot, sides)

    if index == 3:
        part("Silver equipment face", "box", "Silver thermal panel", .614,.720,.008, 0,0,-.002)
        for u in (-.276, .276):
            part("Equipment face seam", "box", "Structural alloy", .003,.706,.001, u,0,.0025)
        for u in (-.24, .24):
            for z in (-.30, .12, .31):
                part("Equipment panel keeper", "box", "Equipment panels", .057,.013,.005, u,z,.003)
                for delta in (-.019,0,.019):
                    part("Equipment panel fastener", "cylinder", "Graphite", .006,.006,.003, u+delta,z,.006, 8)
    else:
        # The reference and flight faces have visibly different panel division and cell orientation.
        flight = index == 2
        bands = ((-.105,.510,"SSTL flight main strings"),(.257,.183,"SSTL flight short strings")) if flight else (
            (.108,.505,"SSTL main strings"),(-.255,.200,"SSTL short strings"))
        board = "Amber solar panel laminate" if index != 1 else "Pale solar panel laminate"
        coating = "SSTL blue photovoltaic cells" if index == 1 else "SSTL photovoltaic cells"
        for z, height, layout in bands:
            part("Fixed solar panel substrate", "foil-box", board, .619,height,.009, 0,z,-.001)
            part(layout, layout, coating, .611,height-.006,.0014, 0,z,.0043)
        seam = .158 if flight else -.150
        part("Recessed panel joint", "box", "Graphite", .615,.013,.005, 0,seam,-.006)
        for u in (-.225, 0, .225):
            part("Solar panel splice", "box", "Equipment panels", .066,.012,.004, u,seam,.003)
            for delta in (-.020, .020):
                part("Splice screw", "cylinder", "Graphite", .007,.007,.003, u+delta,seam,.006, 8)
        for u in (-.295,.295):
            for z in (-.338,-.171,.0,.183,.34):
                part("Panel edge fastener", "cylinder", "Structural alloy", .007,.007,.003, u,z,.004, 8)

    for u in (-.317,.317):
        part("Corner rail flange", "box", "Equipment panels", .010,.739,.009, u,0,-.003)
    for i in range(12):
        u = (i-5.5)*.047
        part("Upper deck edge rib", "box", "Structural alloy", .012,.024,.010, u,.377,-.014)


def spacecraft(g):
    g.part("SSTL-42 chassis", "box", "Graphite", (WIDTH-.017, WIDTH-.017, LENGTH-.012))
    for index in range(4):
        side(g, index)
    g.part("Upper equipment deck", "foil-box", "Black multilayer insulation", (.630,.630,.026), (0,0,.372))
    for x, y in ((-.224,-.158), (.200,.145)):
        g.part("Deck mounting foot", "box", "Structural alloy", (.122,.084,.012), (x,y,.390))
        for dx in (-.046,.046):
            g.part("Upper deck bracket cheek", "box", "Graphite", (.015,.063,.066), (x+dx,y,.427))
        g.part("Upper deck bracket bridge", "box", "Structural alloy", (.108,.064,.012), (x,y,.460))
    for y in (-.085,.045):
        g.part("Blanketed electronics housing", "foil-box", "Black multilayer insulation", (.197,.104,.036), (0,y,.399))
    for y in (-.245, .207):
        harness = [(-.221,y,.386),(-.188,y+.012,.413),(-.105,y+.046,.426),(.050,y+.056,.421),(.131,y+.030,.387)]
        for a, b in zip(harness, harness[1:]):
            g.rod("Upper deck cable loom", a, b, .012, "Graphite")
        g.part("Cable saddle", "box", "Equipment panels", (.013,.025,.013), harness[2])
    g.part("Lower deck edge plate", "box", "Equipment panels", (.645,.645,.012), (0,0,-.370))
    g.part("Lower deck thermal blanket", "foil-box", "Gold multilayer insulation", (.619,.619,.014), (0,0,-.382))
    for x in (-.151,.151):
        g.part("Lower blanket section", "foil-box", "Gold multilayer insulation", (.292,.596,.005), (x,0,-.391))
    for u in (-.277, .277):
        for v in (-.233,-.103,.103,.233):
            g.part("Lower deck fixing", "cylinder", "Structural alloy", (.012,.012,.005), (u,v,-.395), sides=8)
    for x,y,diameter,projection,finish in ((-.081,-.146,.105,.064,"Gold insulation"),
                                           (.133,-.074,.138,.048,"Equipment panels")):
        g.part("End fitting flange", "cylinder", "Structural alloy", (diameter*1.34,diameter*1.34,.012), (x,y,-.393), sides=36)
        g.part("End fitting barrel", "cylinder", finish, (diameter,diameter,projection), (x,y,-.398-projection/2), sides=36)
        lip = -.398-projection
        g.part("End fitting collar", "cylinder", finish, (diameter*1.08,diameter*1.08,.008), (x,y,lip+projection*.66), sides=36)
        g.part("End fitting lip", "thin annulus", finish, (diameter*1.10,diameter*1.10,.009), (x,y,lip), sides=36)
        g.part("Recessed end fitting face", "cylinder", "Graphite", (diameter*.84,diameter*.84,.003), (x,y,lip-.002), sides=36)
    for x in (-.22,.22):
        g.part("Flush circular cover", "cylinder", "Equipment panels", (.087,.087,.008), (x,.177,-.392), sides=24)
    g.inspection_camera("solar", "Body-mounted solar panels", (0,-.323,0), (0,-1,0), .42)
    g.inspection_camera("reverse", "Opposite quarter", (0,0,0), (-.76,1,.18), .56)
    g.inspection_camera("deck", "End fittings", (0,0,-.389), (.10,-.18,-1), .48)
