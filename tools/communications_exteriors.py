"""Deployed W3A and Spacebus C-class exteriors in metres. +Z faces Earth."""
import math

if __package__:
    from .geo_geometry import equipment_bus, solar_wings, tilt_x
else:
    from geo_geometry import equipment_bus, solar_wings, tilt_x


def reflector(g, name, center, diameter, breadth, angle, face, back, mount, offset):
    """A separately finished back, rim, hinged yoke and offset feed for each aperture."""
    ca, sa = math.cos(angle), math.sin(angle)
    def at(x, y, z):
        return (center[0]+x, center[1]+y*ca-z*sa, center[2]+y*sa+z*ca)
    depth = diameter*.42
    scale = (diameter,breadth,depth)
    g.part(name+" face", "paraboloid", face, scale, center, tilt_x(angle), sides=48)
    backing = "quilted reflector back" if back == "Reflector thermal foil" else "insulated reflector back"
    g.part(name+" insulated back", backing, back, scale, center, tilt_x(angle), sides=48)
    g.part(name+" edge", "thin annulus", "Structural alloy", (diameter,breadth,.021),
           at(0,0,depth*.18), tilt_x(angle), sides=48)
    for side in (-1,1):
        g.rod(name+" deployment yoke", (mount[0]+side*.15,mount[1],mount[2]),
              at(side*diameter*.19,0,-.057), .055)
    feed = at(.13*diameter,offset*breadth*.31,.32*diameter)
    g.rod(name+" feed support", mount, feed, .049, "Structural alloy")
    g.part(name+" feed horn", "frustum", "Gold thermal foil", (.14,.14,.21), feed, tilt_x(angle), 16)


def equipment(g, height, width, depth, eurostar):
    equipment_bus(g,height,width,depth,"Eurostar" if eurostar else "Spacebus","Gold multilayer insulation")
    for side in (-1,1):
        x = side*width*.534
        # Optical solar reflector tiles cover the north and south equipment walls.
        for row in range(3):
            for col in range(2):
                g.part("Radiator tile bay","foil-box", "Dark radiator glass" if eurostar else "C-class radiator mirrors",
                       (.040,depth*.455,height*.277), (x,(col-.5)*.47*depth,(row-1)*height*.288))
        if eurostar:
            for diagonal in (-1,1):
                g.rod("Radiator diagonal brace",(x+side*.027,-.456*depth,diagonal*height*.416),
                      (x+side*.027,.456*depth,-diagonal*height*.416),.023,"Equipment panels")
        for col in (-1,1):
            for row in (-1,0,1):
                g.part("Radiator fastener","sphere","Structural alloy",(.056,.076,.076),
                       (x+side*.028,col*depth*.44,row*height*.404),sides=8)
        for col in (-1,0,1):
            g.rod("Blanket taped seam",(col*.44*width,side*depth*.508,-height*.425),
                  (col*.44*width,side*depth*.508,height*.46),.024,"Gold thermal foil")
        for row,z in enumerate((-.32,-.02,.29)):
            for col in (-1,1):
                g.part("Overlapping thermal blanket","quilted foil","Gold thermal foil",
                       (width*.43,height*.27,.32),(col*.24*width,side*depth*.512,z*height),
                       tilt_x(-side*math.pi/2))
            g.part("Blanket closure strip","box","Structural alloy",
                   (width*.88,.017,.022),(0,side*depth*.521,(z+.14)*height))
            g.part("Cable feedthrough","foil-box","Gold multilayer insulation",
                   (.18,.17,.24),((.37 if row%2 else -.37)*width,side*depth*.54,z*height))
        for x in (-.35,.35):
            g.part("Aft equipment bracket","foil-box","Gold multilayer insulation",
                   (.31,.29,.52),(x*width,.29*side*depth,-.49*height))
            g.rod("Deck harness",(x*width,.29*side*depth,-.53*height),
                  (x*.52*width,.24*side*depth,-.56*height),.043,"Graphite")
        for j in range(3):
            g.part("Payload electronics enclosure","foil-box","Gold multilayer insulation",
                   (.30,.23,.29), (side*width*.39,(-.28+.25*j)*depth,height*.545))
    g.part("Apogee engine jacket","bell jacket","Structural alloy",(.68,.68,.82),
           (0,0,-height*.52),sides=32)
    g.part("Apogee engine interior","bell interior","Nozzle liner",(.68,.68,.82),
           (0,0,-height*.52),sides=32)


def spacecraft(g, appearance, length, width, span):
    flight = appearance["deployedExterior"]
    eurostar = flight == "W3A"
    # The catalog length is the spacecraft envelope. Leave room for the deck and engine.
    height = length * (.83 if eurostar else .84)
    depth = width * (.92 if eurostar else .91)
    equipment(g,height,width,depth,eurostar)
    rows = appearance["wingRows"]
    chord = width * {"W3A":.92,"APSTAR-6":1.10,"AMC-12":1.03,"Ciel-2":1.03,"SGDC":1.06}[flight]
    coating = {"W3A":"Indigo photovoltaic cells","APSTAR-6":"C-class silicon cells",
               "AMC-12":"C-class blue cells","Ciel-2":"C-class violet cells","SGDC":"C-class blue cells"}[flight]
    start = len(g.g["nodes"])
    pitch = solar_wings(g,width,span,chord,rows,cell_material=coating)
    end_rail = pitch*.006
    if eurostar:
        # The Astrium deployed illustration shows a dark flap on the penultimate outer leaf.
        hinge_x = span/2 - 1.5*pitch
        hinge_angle = math.radians(52)
        flap = chord*.52
        g.part("W3A outboard array flap","box","Graphite",(pitch*.97,flap,.025),
               (hinge_x,chord/2+flap*.5*math.cos(hinge_angle),flap*.5*math.sin(hinge_angle)),tilt_x(hinge_angle))
    for sign in (-1,1):
        for row in range(rows[-1]):
            y = (row-(rows[-1]-1)/2)*chord
            g.part("Terminal array rail","box","Structural alloy",(end_rail,.98*chord,.037),
                   (sign*(span-end_rail)/2,y,0))
    # Both wings turn about their common solar-drive axis independently of the Earth deck.
    angle = math.radians(76 if eurostar else 24)
    sn,cs = math.sin(angle/2),math.cos(angle/2)
    for node in g.g["nodes"][start:]:
        x,y,z = node.get("translation",(0,0,0))
        node["translation"] = (x,y*math.cos(angle)-z*math.sin(angle),y*math.sin(angle)+z*math.cos(angle))
        qx,qy,qz,qw = node.get("rotation",(0,0,0,1))
        node["rotation"] = (cs*qx+sn*qw,cs*qy-sn*qz,cs*qz+sn*qy,cs*qw-sn*qx)
    # Coordinates are normalized by the bus width/depth/height. Diameters and tilts are
    # estimates from each manufacturer's illustration, including the smaller aft apertures.
    banks = {
        "W3A": [(-.46,-1.00,.28,.79,13),(.45,-1.00,.40,.74,24),
                (-.44,.99,.38,.77,-22),(.42,1.00,.22,.80,-11)],
        "APSTAR-6": [(-.10,-1.12,.34,1.03,15),(.14,1.08,.39,.95,-16),
                     (-.31,-.66,-.36,.46,37),(.28,.61,-.36,.42,-34)],
        "AMC-12": [(-.19,-1.18,.30,1.13,20),(-.29,1.15,.37,1.05,-18),(.80,.55,.49,.88,-9)],
        "SGDC": [(-.50,-1.28,.31,1.12,14),(.54,-1.19,.39,.98,16),
                 (-.51,1.23,.39,1.05,-16),(.55,1.20,.27,1.02,-19)],
        "Ciel-2": [(-.50,-1.00,.30,.96,19),(.43,-.98,.21,.82,28),
                   (-.48,1.03,.43,1.00,-19),(.46,1.00,.35,.89,-15),
                   (.33,-.76,-.37,.55,46),(-.26,.67,-.40,.46,-32)]}
    for i, (x,y,z,d,angle) in enumerate(banks[flight]):
        side = math.copysign(1,y)
        center = (x*width,y*depth,z*height)
        mount = (x*width*.63,side*.47*depth,(z-.22)*height)
        reflector(g,flight+" reflector "+str(i+1),center,width*d,width*d*.94,math.radians(angle),
                  "Satin reflector face" if eurostar else "Pale reflector coating",
                  "Reflector thermal foil" if eurostar else "Equipment panels",mount,-side)
    if eurostar:
        reflector(g,"W3A deck antenna",(.14*width,.03*depth,.65*height),1.28,1.18,
                  math.radians(-14),"White reflector coating","Gold multilayer insulation",
                  (.05,-.38,.50*height),-1)
    elif flight == "APSTAR-6":
        for side in (-1,1):
            g.part("Aft telemetry enclosure","foil-box","Gold multilayer insulation",(.38,.51,.64),
                   (side*.23*width,.22*depth,-height*.53))
    detail_direction = (.71,-.85,-.69) if eurostar else (.76,-.88,.80)
    g.inspection_camera("reflector-bank","Reflector bank",(0,0,.18*height),detail_direction,width*1.6)
