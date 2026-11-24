"""Deployed Astra 3B exterior. X is the solar axle and +Z faces Earth."""
import math

if __package__:
    from .geo_geometry import solar_wings, tilt_x
else:
    from geo_geometry import solar_wings, tilt_x


def reflector(g, side, x, outreach, hinge_z, diameter, aspect, tilt, depth):
    # The artwork shows two staggered apertures on each side. The four hinge
    # stations are on the aft half of the bus, while the dishes look Earthward.
    hinge_x, hinge_y = x * .68, side * depth / 2
    center = (x, hinge_y + side * outreach, hinge_z + .46)
    angle = math.radians(tilt)
    rotation = tilt_x(angle)
    cosine, sine = math.cos(angle), math.sin(angle)

    def on_dish(dx, dy, dz):
        return center[0]+dx, center[1]+dy*cosine-dz*sine, center[2]+dy*sine+dz*cosine

    g.part("Aft reflector hinge", "box", "Thermal blanket", (.43,.18,.22), (hinge_x,hinge_y,hinge_z))
    hub = on_dish(0, 0, -.048*diameter)
    g.part("Reflector hub", "cylinder", "Structural alloy", (.22,.22,.062*diameter), hub, rotation)
    for dx in (-.18, .18):
        g.rod("Reflector deployment arm", (hinge_x+dx,hinge_y,hinge_z), hub, .058)
    breadth = diameter * aspect
    g.part("Main reflector", "reflector shell", "White reflector coating",
           (diameter,breadth,.50*diameter), center, rotation, sides=56)
    for spoke in range(3):
        azimuth = spoke * math.tau / 3
        previous = hub
        for radius in (.22, .43):
            back = on_dish(radius*diameter*math.cos(azimuth), radius*breadth*math.sin(azimuth),
                           (.8*radius**2-.045)*.50*diameter-.008)
            g.rod("Reflector back rib", previous, back, .022, "Structural alloy")
            previous = back
    feed = on_dish(0, -side*breadth*.40, diameter*.37)
    g.rod("Offset feed arm", (hinge_x,hinge_y,hinge_z+.12), feed, .045, "Thermal blanket")
    g.part("Offset feed horn", "frustum", "Gold thermal foil", (.15,.15,.19), feed,
           tilt_x(angle + side*math.atan2(breadth*.40, diameter*.37)))


def wings(g, width, span, rows):
    chord = 3.05
    pitch = solar_wings(g, width, span, chord, rows, cell_material="Blue photovoltaic cells")
    # A rectangular flap projects from the penultimate station in the launch
    # kit. The other tip is cropped, so its flap is modeled by symmetry.
    angle, flap_depth = math.radians(-43), chord * .82
    for side in (-1, 1):
        flap_x = side * (span/2 - 1.5*pitch)
        g.part("Outboard array flap", "box", "Reference blue", (.91*pitch,flap_depth,.035),
               (flap_x, chord/2 + flap_depth*math.cos(angle)/2, flap_depth*math.sin(angle)/2), tilt_x(angle))
        for offset in (-.31, .31):
            x = flap_x + pitch*offset
            g.rod("Flap hinge", (x-.12,chord/2,0), (x+.12,chord/2,0), .065)
        for station in range(1, len(rows)):
            x = side * (span/2 - station*pitch)
            for offset in (-.33, .33):
                y = chord * offset
                g.rod("Solar panel hinge", (x,y-.095,0), (x,y+.095,0), .085)
        g.part("Solar array tip rail", "box", "Structural alloy", (.026,chord*.99,.052),
               (side*(span-.026)/2,0,0))


def spacecraft(g, spec, height, width, span):
    depth = spec["busDepth"]
    gold = "Gold multilayer insulation"
    for name, fraction, z in (("Service module blanket",.35,-.325), ("Payload module blanket",.65,.175)):
        g.part(name, "blanketed chassis", gold, (width*.84,depth*.93,fraction*height), (0,0,z*height))
    g.part("Module joint", "blanketed chassis", "Structural alloy", (width*.85,depth*.956,.065), (0,0,-.15*height))
    for side in (-1, 1):
        # Breaks in the blankets expose mounting rails and recessed equipment
        # between the service bay and the taller payload bay in the artwork.
        for x, z, w, h in ((-.20,-.31,.33,.31), (.17,-.34,.36,.25), (-.16,.025,.42,.27),
                           (.21,.05,.26,.21), (-.22,.345,.29,.26), (.13,.322,.39,.30)):
            turn = (0, 1, 0, 0) if x < 0 else None
            g.part("Blanket panel", "foil-box", gold, (width*w,depth*.047,height*h),
                   (x*width,side*depth*.472,z*height), turn)
        for z in (-.15, .187):
            g.part("Equipment bay recess", "box", "Graphite", (width*.69,depth*.020,.12),
                   (0,side*depth*.469,z*height))
            for x in (-.24, .05, .25):
                g.part("Blanket retaining clip", "box", "Gold thermal foil", (.075,.084,.135),
                       (x*width,side*depth*.482,z*height))
        # The bowed silver side panels meet at the solar drive. The outer
        # crowns, foil jackets and deck edges fit inside the published body box.
        side_rotation = (.5, side*.5, side*.5, .5)
        for z in (-.249, .249):
            g.part("Curved silver side panel", "bowed panel", "Silver thermal panel",
                   (depth*.988,height*.482,width*.165), (side*width*.4175,0,z*height), side_rotation, sides=20)
            for y in (-.36, .36):
                g.part("Silver panel edge clip", "box", "Structural alloy", (.060,.085,.11),
                       (side*width*.458,y*depth,(z + math.copysign(.208,z))*height))
        g.rod("Solar drive bearing", (side*(width/2-.085),0,0), (side*(width/2+.08),0,0), .39)
    g.part("Earth-facing deck", "blanketed chassis", gold, (width*.85,depth,.052), (0,0,height/2-.026))
    g.part("Aft deck", "box", "Graphite", (width*.92,depth*.965,.056), (0,0,-height/2+.028))
    g.part("Launch adapter ring", "annulus", "Structural alloy", (1.60,1.60,.16), (0,0,-height/2-.075), sides=48)
    g.part("Engine nozzle", "frustum", "Thermal blanket", (.45,.45,.33), (0,0,-height/2-.14))
    g.part("Nozzle exit", "cylinder", "Graphite", (.402,.402,.015), (0,0,-height/2-.306))

    # A smaller white aperture and wrapped equipment are visible at the end of
    # the bus in both illustrations, separately from the four side reflectors.
    deck = height / 2
    g.part("Deck equipment housing", "blanketed chassis", gold, (.91,.75,.36), (.38,-.28,deck+.17))
    angle = math.radians(-17)
    mount = (.47, .85+.16*math.sin(angle), deck+.23-.16*math.cos(angle))
    g.part("Deck aperture mount", "cylinder", "Thermal blanket", (.20,.20,.29), mount, tilt_x(angle))
    g.part("Deck aperture", "reflector shell", "White reflector coating", (.92,.78,.29),
           (.47,.85,deck+.23), tilt_x(angle), sides=40)
    for x in (.09, .60):
        g.rod("Deck equipment brace", (x,-.49,deck+.30), (.35,-.58,deck+.76), .047, "Gold thermal foil")
    g.part("Deck equipment head", "cylinder", "Thermal blanket", (.23,.23,.18), (.35,-.58,deck+.76))

    # side, X station, side-wall stand-off, hinge Z, aperture metres, aspect, tilt degrees
    for fixture in ((1,-1.03,1.03,-1.70,1.82,.95,  6),
                    (1, 1.05,1.27,-1.46,2.09,.94,-10),
                    (-1,-1.27,1.30,-1.48,1.80,.95,  9),
                    (-1, .22,1.97,-.96,1.48,.93, -9)):
        reflector(g, *fixture, depth)
    wings(g, width, span, spec["wingRows"])
