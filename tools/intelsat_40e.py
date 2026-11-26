"""Deployed exterior of NORAD 56174. X is the solar axle and +Z faces Earth."""
import math

if __package__:
    from .geo_geometry import tilt_x
else:
    from geo_geometry import tilt_x


def solar_wings(g, bus_width, span):
    # Three hinged leaves per wing. Each leaf has two cell banks across four strings.
    angle = math.radians(54)
    rotation = tilt_x(angle)
    cosine, sine = math.cos(angle), math.sin(angle)
    chord = 2.58
    shoulder = bus_width / 2 + 1.36
    pitch = (span / 2 - shoulder) / 3

    def at(x, y, z=0):
        return (x, y*cosine - z*sine, y*sine + z*cosine)

    for side in (-1, 1):
        axle = side * (bus_width / 2 + .12)
        g.rod("Wing drive", at(axle-side*.20, 0), at(axle+side*.16, 0), .29, "Thermal blanket")
        for edge in (-1, 1):
            g.rod("Open array yoke", at(axle+side*.11, 0), at(side*shoulder, edge*chord*.49),
                  .046, "Structural alloy")
        g.rod("Yoke crossbar", at(side*shoulder, -chord*.49), at(side*shoulder, chord*.49), .052)
        for leaf in range(3):
            x = side * (shoulder + (leaf + .5)*pitch)
            g.part("Solar wing leaf", "box", "Structural alloy", (pitch-.022, chord, .052), at(x, 0), rotation)
            g.part("Four-string solar laminate", "panel", "Teal photovoltaic strings",
                   (pitch-.067, chord-.050, .002), at(x, 0, .027), rotation)
            g.part("Rear wing substrate", "box", "Array backsheet",
                   (pitch-.05, chord-.05, .012), at(x, 0, -.030), rotation)
            for edge in (-1, 1):
                g.part("Rear wing stiffener", "box", "Graphite",
                       (pitch-.05, .033, .040), at(x, edge*chord*.33, -.055), rotation)
                if leaf:
                    hinge = side*(shoulder+leaf*pitch)
                    g.rod("Wing hinge", at(hinge, edge*.71), at(hinge, edge*.90), .068)
        g.part("Solar wing tip rail", "box", "Equipment panels",
               (.040, chord, .052), at(side*(span/2-.020), 0), rotation)


def reflector(g, label, center, diameter, angle):
    """Shallow metallic face with a foil-edged back. All ribs sit behind the aperture."""
    cosine, sine = math.cos(angle), math.sin(angle)
    rotation = tilt_x(angle)

    def at(x, y, z):
        return (center[0]+x, center[1]+y*cosine-z*sine, center[2]+y*sine+z*cosine)

    depth = .31*diameter
    g.part(label, "reflector shell", "Satin reflector face",
           (diameter, diameter, depth), center, rotation, sides=48)
    g.part("Reflector edge binding", "thin annulus", "Thermal blanket",
           (diameter*1.012, diameter*1.012, .036), at(0, 0, depth*.20-.021), rotation, sides=48)
    g.part("Rear pivot", "cylinder", "Structural alloy", (.23, .23, .17), at(0, 0, -.10), rotation)
    for ray in range(6):
        phi = math.tau * ray / 6
        g.rod("Rear reflector rib", at(0, 0, -.08),
              at(.465*diameter*math.cos(phi), .465*diameter*math.sin(phi), depth*.17-.038),
              .028, "Graphite")


def antenna_assemblies(g, width, depth, aft):
    # Two linked pairs turn the corner of the aft deck. Their centres follow
    # the shallow arc in the deployed view, with an open space below the faces.
    pairs = (
        ((1.32, -1.48, aft-.42), (-.02, -2.34, aft-.57)),
        ((-1.59, -2.36, aft-.53), (-3.02, -1.56, aft-.47)),
    )
    for index, (first, second) in enumerate(pairs):
        root_x = (.48 if index == 0 else -.46)*width
        pivots = [(x, y, z-.17) for x, y, z in (first, second)]
        hinge = (root_x, -depth*.51, aft-.97)
        g.rod("Aft support pedestal", (root_x, -depth*.43, aft+.03), hinge, .105)
        g.rod("Twin-reflector cross member", *pivots, .14, "Thermal blanket")
        dx, dy = second[0]-first[0], second[1]-first[1]
        reach = .62/math.hypot(dx, dy)
        angle = math.radians(8+index*7)
        cosine, sine = math.cos(angle), math.sin(angle)
        # Offset in the tilted dish plane so the rail clears both RF faces.
        rim = [(x-dy*reach, y+dx*reach*cosine+.105*sine, z+dx*reach*sine-.105*cosine)
               for x, y, z in (first, second)]
        g.rod("Paired reflector back rail", *rim, .086, "Thermal blanket")
        for pivot, end in zip(pivots, rim):
            g.rod("Rear mounting fork", pivot, end, .061)
        for dish, pivot in zip((first, second), pivots):
            g.rod("Reflector deployment arm", hinge, pivot, .083, "Thermal blanket")
            reflector(g, "Aft bank reflector", dish, 1.54, angle)

    # The larger lateral dish is visible behind the near solar yoke in the illustration.
    lateral = (.46, depth/2+1.19, .48)
    for x in (-.48, .53):
        g.rod("Lateral reflector boom", (x, depth*.47, .69), (lateral[0], lateral[1], lateral[2]-.10), .078)
    reflector(g, "Lateral reflector", lateral, 2.48, math.radians(21))


def spectrometer_enclosure(surface):
    """Offset, bevelled optical housing within the reported instrument envelope."""
    base = [(-.36,-.50),(.33,-.50),(.50,-.32),(.50,.34),
            (.34,.50),(-.41,.50),(-.50,.38),(-.50,-.31)]
    shoulder = [(-.32,-.48),(.34,-.46),(.50,-.29),(.48,.31),
                (.31,.48),(-.40,.50),(-.48,.36),(-.50,-.30)]
    lid = [(-.20,-.42),(.27,-.42),(.42,-.29),(.40,.18),
           (.23,.32),(-.29,.32),(-.36,.20),(-.34,-.26)]
    rings = [[(x,y,z) for x,y in outline] for outline,z in ((base,-.5),(shoulder,.19),(lid,.5))]
    for cap in (rings[0][::-1], rings[-1]):
        surface.face(cap, uvs=[(x+.5, y+.5) for x,y,_ in cap])
    for lower, upper in zip(rings, rings[1:]):
        for i in range(len(lower)):
            j = (i+1) % len(lower)
            surface.face([lower[i], lower[j], upper[j], upper[i]], uvs=[(0,0),(1,0),(1,1),(0,1)])


def spacecraft(g, length, envelope_width, span):
    # The catalog envelope includes appendages. Bare-bus proportions come from
    # the deployed artwork and the clean-room photograph of the long sidewall.
    width, depth = envelope_width*.39, envelope_width*.44
    height = length*.67
    aft, deck = -height/2, height/2
    g.part("Blanketed bus", "blanketed chassis", "Charcoal thermal blanket", (width, depth, height))
    for sign in (-1, 1):
        face = sign*(width/2+.04)
        g.part("Side panel carrier", "box", "Graphite", (.080, depth*.95, height*1.08), (face, 0, .05))
        for bay in (-1, 1):
            for tier in (-1, 1):
                g.part("Blue side panel", "foil-box", "Blue thermal tiles",
                       (.028, depth*.463, height*.517),
                       (face+sign*.055, bay*depth*.238, .05+tier*height*.267))
            g.part("Side panel edge rail", "box", "Thermal blanket", (.042, .032, height*1.08),
                   (face+sign*.069, bay*depth*.48, .05))
            for z in (-.36*height, .27*height):
                g.part("Radiator panel clip", "box", "Structural alloy", (.04, .10, .055),
                       (face+sign*.079, bay*depth*.36, z))
        g.part("Drive mounting plate", "box", "Equipment panels", (.079, .40, .44),
               (face+sign*.071, 0, 0))
        # Three independently wrinkled insulation sheets cover each broad face.
        rotation = tilt_x(-sign*math.pi/2)
        for tier in (-1, 0, 1):
            g.part("Sidewall insulation", "foil-box", "Pewter thermal foil",
                   (width*.90, height*.320, .044), (0, sign*(depth/2+.018), tier*height*.329), rotation)
            for x in (-.38, .38):
                g.part("Blanket fastener", "box", "Equipment panels", (.056, .016, .062),
                       (x*width, sign*(depth/2+.046), tier*height*.329+.13*height))
        for x in (-width*.46, width*.46):
            g.rod("Blanket edge piping", (x, sign*depth*.498, aft+.08),
                  (x, sign*depth*.498, deck-.05), .034, "Thermal blanket")
    for i in range(5):
        x = (i-2)*.245
        angle = math.radians((i-2)*10)
        rotation = (0, math.sin(angle/2), 0, math.cos(angle/2))
        z = .23+.12*math.cos(i)
        g.part("Wrapped equipment bay", "blanketed chassis", "Silver multilayer insulation",
               (.22, .32, .62+(i%2)*.10), (x, -depth/2-.14, z), rotation)
        g.part("Equipment shroud cinch", "foil-box", "Pewter thermal foil",
               (.23, .33, .045), (x, -depth/2-.14, z), rotation)

    g.part("Aft launch adapter", "annulus", "Structural alloy", (1.10, 1.10, .17), (0, 0, aft-.07))
    antenna_assemblies(g, width, depth, aft)
    solar_wings(g, width+.20, span)

    # The mission's 1.4 x 1.1 x 1.2 m spectrometer envelope is on the Earth deck.
    # The metallic housing, dark surrounding panels and aperture are visible in the integration photos.
    x, y = .18, -.14
    g.part("Instrument support deck", "box", "Graphite", (1.57, 1.29, .09), (x, y, deck+.03))
    g.part("Spectrometer housing", "spectrometer enclosure", "Silver multilayer insulation",
           (1.40, 1.10, 1.20), (x, y, deck+.68))
    g.part("Aperture surround", "blanketed chassis", "Black multilayer insulation",
           (.77, .60, .095), (x, y-.10, deck+1.31))
    g.part("Aperture rim", "annulus", "Structural alloy",
           (.49, .40, .047), (x, y-.10, deck+1.373), sides=40)
    g.part("Spectrometer aperture", "cylinder", "Graphite",
           (.39, .32, .014), (x, y-.10, deck+1.353), sides=40)
    for side in (-1, 1):
        g.rod("Instrument hold-down", (x+side*.55, y-.49, deck+.12),
              (x+side*.65, y-.51, deck+.38), .081, "Thermal blanket")
        g.part("Instrument side shield", "foil-box", "Charcoal thermal blanket",
               (.055, depth*.85, 1.18), (side*(width*.48), .04, deck+.47))
        for end in (-1, 1):
            g.rod("Shield brace", (side*width*.32, end*.70, deck+.07),
                  (side*width*.47, end*.94, deck+.86), .034, "Thermal blanket")
    g.inspection_camera("instrument", "Earth-facing instrument", (x, y, deck+.55), (.76, -.77, 1.20), 2.16)
    g.inspection_camera("reflectors", "Reflector bank", (-.47, -1.65, aft-.20), (.58, -1.08, .78), 3.25)
