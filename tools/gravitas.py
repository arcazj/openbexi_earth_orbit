"""K2 Space Gravitas in its deployed configuration. Dimensions are in metres."""
import math

NORAD = 68495
ASSET = "leo/ref-gravitas-68495.glb"
ARTWORK = "https://payloadspace.com/wp-content/uploads/2025/02/Screenshot-2025-02-14-at-8.34.45-AM.png"
MISSION = "https://www.linkedin.com/pulse/gravitas-mission-update-engineering-lessons-from-k2-spaces-kunjur-vzqyc"
PLATFORM = "https://www.k2space.com/satellites"
SOURCES = [
    {"url": ARTWORK, "basis": "K2 Space Mega-class illustration, February 2025 (via Payload)"},
    {"url": MISSION, "basis": "K2 Space flight report and deployment photographs"},
    {"url": PLATFORM, "basis": "K2 Space Mega-class payload deck specifications"},
    {"url": "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv", "basis": "GCAT approximate deployed span"},
]
SPAN, WING_LENGTH = 40.0, 18.0
DECK_X, DECK_Y = 3.0, 2.7
BUS_X, BUS_Y = 3.34, 3.00
WING_CHORD, BAYS = 3.55, 8
PROFILE = {
    "name": "Gravitas (K2 Space)", "family": "K2 Space", "design": "gravitas",
    "description": "K2 Space's 20 kW Mega-class demonstrator with two long, segmented solar wings, a raised dark central cover and a gold-tiled deck perimeter.",
    "shape": "Flat bus with two deployed solar wings",
    "appearance": {"previewDirection": [-12.5,-11.25,17.75], "previewUp": [.075,1,0],
                   "previewFov": 8.5, "previewLightYawDeg": 55},
    "meta": {
        "bus": "K2 Space Mega-class", "dimension_source_norad": NORAD,
        "geometry": {"payload_deck_m": [DECK_X,DECK_Y], "solar_wing_length_m": WING_LENGTH,
                     "span_m": SPAN, "glb_units": "m"},
        "references": [s["url"] for s in SOURCES], "reference_status": "Illustrated design",
        "dimension_note": "K2 Space reports that Gravitas deployed two 18 m solar arrays. Its Mega-class payload deck is 3.0 × 2.7 m. The model uses GCAT's approximate 40 m tip-to-tip span. Wing width and subdivisions, the raised cover, corner fittings and rear structure are reconstructed from the February 2025 illustration.",
    },
    "modelCredit": {"toScale": True, "source": PLATFORM, "sources": SOURCES,
                    "catalogCredit": "Original OpenBEXI geometry and textures based on K2 Space artwork and documentation. Deployed span adapted from Jonathan McDowell's GCAT (CC BY 4.0)."},
    "norad": [NORAD],
}


def bevelled_cover(surface):
    """An inset top, sloping shoulders and clipped corners on the central dark cover."""
    outline = [(-.42,-.50),(.42,-.50),(.50,-.42),(.50,.42),(.42,.50),(-.42,.50),(-.50,.42),(-.50,-.42)]
    rings = [[(x*scale,y*scale,z) for x,y in outline] for scale,z in ((1,-.5),(1,-.28),(.82,.40),(.78,.5))]
    def cap_uv(points):
        return [(x+.5,y+.5) for x,y,z in points]
    base = rings[0][::-1]
    surface.face(base, uvs=cap_uv(base))
    for bottom, top in zip(rings,rings[1:]):
        for i in range(len(outline)):
            j = (i+1) % len(outline)
            surface.face([bottom[i],bottom[j],top[j],top[i]], uvs=[(0,0),(1,0),(1,1),(0,1)])
    surface.face(rings[-1], uvs=cap_uv(rings[-1]))


def wings(g):
    root = SPAN/2 - WING_LENGTH
    pitch = WING_LENGTH/BAYS
    for sign in (-1,1):
        def at(x,y=0,z=0):
            return (sign*x,y,z)
        g.rod("Solar array drive", at(BUS_X/2-.05), at(root+.025), .24, "Structural alloy")
        g.part("Wing root spar", "box", "Graphite", (.078,3.06,.126), at(root-.045))
        for y in (-1,1):
            g.rod("Wing root fork", at(BUS_X/2,.16*y), at(root+.045,WING_CHORD*.39*y), .064)
        for bay in range(BAYS):
            x = root + (bay+.5)*pitch
            g.part("Wing module backing", "box", "Array backsheet", (pitch-.018,WING_CHORD,.044), at(x))
            g.part("Photovoltaic module", "panel", "Gravitas photovoltaic laminate",
                   (pitch-.047,WING_CHORD-.038,.006), at(x,0,.024))
            for y in (-1,1):
                g.part("Wing edge rail", "box", "Structural alloy", (pitch-.018,.024,.059),
                       at(x,y*(WING_CHORD/2-.012)))
                g.part("Rear laminate stiffener", "box", "Graphite", (pitch-.054,.040,.048),
                       at(x,y*.99,-.043))
            if bay:
                edge = x-pitch/2
                for y in (-1,1):
                    g.rod("Module hinge", at(edge,y*1.35-.070), at(edge,y*1.35+.070), .070)
        g.part("Wing tip cap", "box", "Equipment panels", (.024,WING_CHORD,.056), at(SPAN/2-.012))


def perimeter_tiles(g):
    # Each interrupted strip leaves space for a round housing at either corner.
    for vertical in (False, True):
        count = 5 if vertical else 6
        run = 1.77 if vertical else 2.12
        pitch = run/count
        for side in (-1,1):
            x, y = (side*1.43,0) if vertical else (0,side*1.33)
            base = (.49,run+.045,.115) if vertical else (run+.045,.47,.115)
            g.part("Deck tile carrier", "box", "Graphite", base, (x,y,.432))
            for i in range(count):
                along = (i+.5)*pitch-run/2
                for row in (-1,1):
                    dx,dy = (row*.115,along) if vertical else (along,row*.110)
                    size = (.219,pitch-.014,.060) if vertical else (pitch-.014,.209,.060)
                    material = "Champagne deck tile" if (i+row+side)%4 else "Warm gold deck tile"
                    g.part("Deck perimeter tile", "box", material, size, (x+dx,y+dy,.519))


def corner_housing(g, sx, sy):
    x, y = sx*1.34, sy*1.20
    angle = math.radians(23)
    bend = math.sin(angle/2)/math.sqrt(2)
    rot = (-sy*bend,sx*bend,0,math.cos(angle/2))
    dx = sx*math.sin(angle)/math.sqrt(2)
    dy = sy*math.sin(angle)/math.sqrt(2)
    def axis(d):
        return (x+dx*d,y+dy*d,.463+math.cos(angle)*d)
    yaw = math.radians(45*sx*sy)/2
    g.part("Corner mounting plate", "box", "Graphite", (.61,.61,.078), (x,y,.413),
           (0,0,math.sin(yaw),math.cos(yaw)))
    g.part("Corner housing base", "cylinder", "Anodized baffle", (.52,.52,.11), axis(.03), rot, 40)
    g.part("Corner housing rim", "thin annulus", "Anodized baffle", (.53,.53,.155), axis(.127), rot, 40)
    g.part("Recessed corner face", "cylinder", "Anodized baffle", (.492,.492,.023), axis(.084), rot, 40)
    g.part("Corner face fastener", "cylinder", "Structural alloy", (.045,.045,.012), axis(.103), rot, 20)
    g.part("Corner lip", "thin annulus", "Structural alloy", (.532,.532,.011), axis(.204), rot, 40)
    a = (sx*1.61,sy*1.42,.005)
    b = (sx*1.78,sy*1.57,.052)
    g.rod("Outboard corner fitting", a,b,.19,"Equipment panels")


def spacecraft(g):
    g.part("Flat bus chassis", "blanketed chassis", "Structural alloy", (BUS_X,BUS_Y,.70), (0,0,-.025))
    g.part("Payload deck", "box", "Graphite", (DECK_X,DECK_Y,.105), (0,0,.353))
    for sign in (-1,1):
        # The illuminated side in the illustration has two silver panels separated by a dark joint.
        for panel in (-1,1):
            g.part("Silver side panel", "foil-box", "Silver multilayer insulation", (.136,1.22,.49),
                   (sign*(BUS_X/2+.045),panel*.62,-.03))
        g.part("Deck edge rail", "box", "Graphite", (2.85,.062,.093), (0,sign*1.48,.326))
    g.part("Central cover mounting flange", "Gravitas bevelled cover", "Graphite",
           (2.34,2.05,.125), (0,0,.453))
    g.part("Raised central cover", "Gravitas bevelled cover", "Dark deck composite",
           (2.09,1.89,.335), (0,0,.648))
    perimeter_tiles(g)
    for sx in (-1,1):
        for sy in (-1,1):
            corner_housing(g,sx,sy)
    g.part("Rear equipment face", "foil-box", "Black multilayer insulation", (2.77,2.51,.084), (0,0,-.410))
    for x in (-.71,.71):
        g.part("Rear equipment panel", "foil-box", "Pewter thermal foil", (1.22,2.04,.045), (x,0,-.470))
        g.rod("Lower edge projection", (x,-1.43,-.19), (x,-1.75,-.35), .106, "Graphite")
    wings(g)
    g.inspection_camera("payload-deck", "Payload deck", (0,0,.38), (-.26,-.23,1), 2.45)
    g.inspection_camera("solar-wing", "Solar wing", (11,0,0), (.03,-.36,1), 9.5)
    g.inspection_camera("rear", "Rear structure", (0,0,-.29), (.24,-.26,-1), 2.48)
