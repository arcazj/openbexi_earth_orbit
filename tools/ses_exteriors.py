"""Publicly illustrated SES flight configurations. +Z is nadir, +X is the solar axle."""
import math

if __package__:
    from .communications_exteriors import reflector
    from .geo_geometry import equipment_bus, solar_wings, tilt_x
else:
    from communications_exteriors import reflector
    from geo_geometry import equipment_bus, solar_wings, tilt_x


def spinner(g, spec, height, diameter):
    # The spin axis is perpendicular to the Earth line. The deployed reflector
    # points over the end of the telescoping drum, independently of the spinning skirt.
    dish = spec["diameter"]
    can = height - dish
    along_y = tilt_x(-math.pi/2)
    for stage, factor in enumerate((1, .95)):
        d = diameter*factor
        y = -height/2 + (stage+.5)*can/2
        g.part("Telescoping solar drum", "cylinder", "Graphite", (d,d,can*.5), (0,y,0), along_y, 48)
        g.part("Cylindrical solar cells", "drum-cells", spec["cells"],
               (d*1.004,d*1.004,can*.487), (0,y,0), along_y, 48)
        g.part("Drum end ring", "annulus", "Structural alloy",
               (d*1.012,d*1.012,diameter*.021), (0,y+can*.245,0), along_y, 48)
    y = -height/2+can*.76
    g.part("Thermal control belt", "cylinder", "Silver thermal panel",
           (diameter*.958,diameter*.958,can*.115), (0,y,0), along_y, 48)
    top = -height/2+can
    g.part("Despun antenna platform","cylinder","Graphite",
           (diameter*.91,diameter*.91,diameter*.075),(0,top,0),along_y,40)
    center = (0,top+dish*.5,0)
    sides = spec.get("sides",40)
    g.part("Broadcast reflector","reflector shell",spec["face"],(dish*.92,dish,dish*.38),center,sides=sides)
    for end in (-1,1):
        g.rod("Reflector support",(end*diameter*.33,top,-diameter*.15),
              (end*dish*.25,center[1],-.04*dish),.033*diameter)
    feed = (0,top+.17*dish,dish*.46)
    g.rod("Offset feed support",(0,top,diameter*.3),feed,.037*diameter)
    g.part("Offset feed","frustum","Equipment panels",(.10*diameter,.10*diameter,.16*diameter),feed)
    g.inspection_camera("reflector-bank","Reflector bank",center,(.34,.18,1),dish*.72)


def winged(g, spec, length, width, span):
    height = length*spec.get("busFraction",.82)
    depth = width*spec.get("depthRatio",.95)
    equipment_bus(g,height,width,depth,spec["platform"],spec["blanket"])
    for side in (-1,1):
        for row in range(3):
            for col in (-1,1):
                g.part("Radiator bay","foil-box",spec["radiator"],(.021*width,depth*.455,height*.286),
                       (side*width*.526,col*depth*.237,(row-1)*height*.30))
        for column in (-1,0,1):
            g.part("Blanket closeout seam","box","Structural alloy",(width*.010,depth*.013,height*.78),
                   (column*width*.43,side*depth*.508,height*.025))
    chord = width*spec.get("chordRatio",.93)
    first = len(g.g["nodes"])
    pitch = solar_wings(g,width,span,chord,spec["wingRows"],cell_material=spec["cells"])
    if spec.get("trimFlap"):
        # The Airbus views show an unpopulated flap on one outer solar wing.
        g.part("Solar wing trim flap","box","Graphite",(.91*pitch,.82*chord,.018),
               (span/2-1.5*pitch,chord*.91,0))
    angle = math.radians(spec.get("wingAngle",28))
    half_sin,half_cos = math.sin(angle/2),math.cos(angle/2)
    for node in g.g["nodes"][first:]:
        x,y,z = node["translation"]
        node["translation"] = (x,y*math.cos(angle)-z*math.sin(angle),y*math.sin(angle)+z*math.cos(angle))
        qx,qy,qz,qw = node.get("rotation",(0,0,0,1))
        node["rotation"] = (half_cos*qx+half_sin*qw,half_cos*qy-half_sin*qz,
                            half_cos*qz+half_sin*qy,half_cos*qw-half_sin*qx)
    # x, y and z are body-relative centres. The two aperture axes are metres.
    for i,(x,y,z,major,minor,tilt) in enumerate(spec["bank"]):
        center = (x*width,y*depth,z*height)
        mount = (x*width*.55,max(-.46,min(.46,y))*depth,min(.52,z-.18)*height)
        name = "Reflector "+str(i+1)
        if i in spec.get("superelliptical",[]):
            g.part(name+" face","rounded reflector shell",spec["face"],(major,minor,major*.40),
                   center,tilt_x(math.radians(tilt)),40)
            for sign in (-1,1):
                g.rod(name+" hinge strut",(mount[0]+sign*.20*width,mount[1],mount[2]),
                      (center[0]+sign*major*.23,center[1],center[2]),width*.021)
        else:
            reflector(g,name,center,major,minor,math.radians(tilt),spec["face"],spec["back"],mount,
                      -math.copysign(1,y))
    if spec.get("globalHorn"):
        g.part("Global beam horn","frustum","Equipment panels",(.38,.38,.50),
               (-.24*width,.22*depth,height*.58),tilt_x(.12))
    if spec.get("electricArms"):
        for sign in (-1,1):
            pivot = (sign*.37*width,-.35*depth,-.43*height)
            elbow = (sign*.59*width,-.55*depth,-.58*height)
            tip = (sign*.65*width,-.69*depth,-.65*height)
            g.rod("Electric propulsion arm",pivot,elbow,width*.068)
            g.rod("Thruster positioning link",elbow,tip,width*.061)
            g.part("Electric thruster head","cylinder","Graphite",(.34,.34,.21),tip,tilt_x(2.68))
    if spec.get("tower"):
        g.part("Communications tower","box","Graphite",(.52*width,.45*depth,height*.89),
               (0,0,height*.95))
        for side in (-1,1):
            g.rod("Tower diagonal brace",(side*.31*width,-.29*depth,.52*height),
                  (-side*.22*width,-.22*depth,height*1.35),width*.024)
        g.part("Tower feed horn","frustum","Equipment panels",(.38,.38,.53),(0,0,height*1.46))
    if spec.get("goldInstrument"):
        # The LASP instrument uses two independent optical channels in a common assembly.
        base = (-.24*width,.21*depth,.588*height)
        g.part("GOLD ultraviolet spectrograph","foil-box","Gold multilayer insulation",
               (.68,.52,.34),base)
        for offset in (-.135,.135):
            g.part("GOLD entrance aperture","box","Graphite",(.13,.21,.018),
                   (base[0]+offset,base[1],base[2]+.176))
    # Include the near and far rims even for asymmetric payloads or a narrow viewer.
    radius = max(math.hypot(x*width,y*depth,(z-.25)*height) + max(major,minor)*.54
                 for x,y,z,major,minor,_ in spec["bank"])
    g.inspection_camera("reflector-bank","Reflector bank",(0,0,height*.25),(.38,-.76,.89),radius)
