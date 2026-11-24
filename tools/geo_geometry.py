"""Deployed GEO exteriors. All coordinates and lengths are in metres.

+Z is the Earth-facing deck and the solar wings extend along X. An array layout
records how many panels sit abreast at each hinge, from root to tip.
"""
import math


def tilt_x(angle):
    return (math.sin(angle/2), 0, 0, math.cos(angle/2))


def solar_wings(g, width, extent, chord, rows, count=2, concentrators=False, white_tips=False, row_offsets=None,
                drive_extension=0, cell_material="Solar cells"):
    reach = (extent - width) / count
    yoke = min(reach*.19, width*.63) + drive_extension
    pitch = (reach-yoke) / len(rows)
    thickness = min(pitch, chord)*.024
    for side in (1, -1)[:count]:
        root, shoulder = side*width/2, side*(width/2+yoke)
        g.rod("Array drive", (root-side*.08,0,0), (root+side*.14,0,0), width*.13)
        for sign in (-1, 1):
            fork = (root+side*drive_extension,sign*.06*chord,0)
            if drive_extension:
                g.rod("Array drive rail", (root,fork[1],0), fork, width*.027)
            g.rod("Array yoke", fork, (shoulder,sign*.40*chord,0), width*.032)
        for station, abreast in enumerate(rows):
            x = shoulder + side*(station+.5)*pitch
            for row in range(abreast):
                y = (row-(abreast-1)/2 + (row_offsets[station] if row_offsets else 0))*chord
                g.part("Solar panel frame", "box", "Graphite", (pitch*.99,chord*.99,thickness), (x,y,0))
                g.part("Solar cell panel", "panel", cell_material,
                       (pitch*.962,chord*.95,thickness*.25), (x,y,thickness*.50))
                g.part("Rear array substrate", "box", "Array backsheet", (pitch*.96,chord*.95,thickness*.15),
                       (x,y,-thickness*.53))
                for rail in (-.33,.33):
                    g.part("Rear stiffener", "box", "Structural alloy", (pitch*.94,chord*.012,thickness*.20),
                           (x,y+rail*chord,-thickness*.66))
                if white_tips and station == len(rows)-1:
                    g.part("White wing tip", "box", "Radiator tiles", (pitch*.22,chord*.97,thickness*.35),
                           (x+side*pitch*.38,y,thickness*.61))
            if concentrators:
                angle, film = math.radians(48), chord*.70
                for sign in (-1, 1):
                    y = sign*(chord/2 + film*math.cos(angle)/2)
                    g.part("Solar concentrator mirror", "box", "Concentrator film",
                           (pitch*.987,film,thickness*.35), (x,y,.5*film*math.sin(angle)), tilt_x(sign*angle))
    return pitch


def equipment_bus(g, height, width, depth, family, blanket_material=None):
    gold = family in ("601","Eurostar","Spacebus","DFH","weather","702MP+")
    bottom = "Gold insulation" if gold else "Graphite"
    top = "Gold insulation" if family in ("Eurostar","Spacebus","DFH","702MP+") else "Equipment panels"
    if blanket_material:
        bottom = top = blanket_material
    g.part("Service module", "foil-box", bottom, (width*.92,depth*.90,height*.41), (0,0,-height*.285))
    g.part("Payload module", "foil-box", top, (width,depth,height*.59), (0,0,height*.205))
    g.part("Module interface", "box", "Structural alloy", (width*1.015,depth*1.012,height*.024), (0,0,-height*.093))
    deck_material = "Radiator tiles" if family == "702SP" else "Graphite"
    g.part("Earth-facing deck", "box", deck_material, (width*.96,depth*.96,height*.028), (0,0,height*.512))
    if family == "702SP":
        for x in (-.32,-.24,.15,.22,.30):
            g.part("Deck heat pipe", "box", "Structural alloy", (width*.017,depth*.78,height*.015),
                   (x*width,0,height*.534))
    for side in (-1,1):
        g.part("Radiator face", "box", "Radiator tiles", (width*.022,depth*.80,height*.52),
               (side*width*.507,0,height*.17))
        for y in (-.23,0,.23):
            g.part("Radiator seam", "box", "Structural alloy", (width*.010,depth*.012,height*.50),
                   (side*width*.523,y*depth,height*.17))
    g.part("Launch adapter ring", "annulus", "Structural alloy", (width*.67,width*.67,height*.068),
           (0,0,-height*.508), sides=36)


def deployed_radiators(g, width, depth, height):
    angle, length = math.radians(32), depth*.68
    for sign in (-1,1):
        center_y = sign*(depth/2 + length*math.cos(angle)/2)
        center_z = -height*.31 + length*math.sin(angle)/2
        for x in (-.245,.245):
            g.part("Deployed radiator leaf", "box", "Radiator tiles", (width*.48,length,width*.015),
                   (x*width,center_y,center_z), tilt_x(sign*angle))


def rigid_antennas(g, count, major, minor, width, depth, height, inner_ratio=1):
    for i in range(count):
        side = -1 if i % 2 == 0 else 1
        on_side = (count+1)//2 if side == -1 else count//2
        x = (i//2-(on_side-1)/2)*major*1.04
        scale = inner_ratio if i >= 2 else 1
        aperture, breadth = major*scale, minor*scale
        y, z = side*(depth*.50 + breadth*.49), height*.39
        angle = side*math.radians(6)
        g.part("Communications reflector", "paraboloid", "Antenna face",
               (aperture,breadth,aperture*.34), (x,y,z), tilt_x(angle), sides=40)
        support = (x,y,z-.035*aperture)
        for end in (-1,1):
            g.rod("Reflector support", (x*.53+end*.16*width,side*depth*.43,height*.14),
                  support, max(major*.020,.035))
        feed = (x, y-side*.33*breadth, z+.35*aperture)
        g.rod("Offset feed support", (x*.58,side*depth*.41,height*.44), feed, major*.032)
        g.part("Feed horn", "frustum", "Thermal blanket", (major*.10,major*.10,major*.13), feed,
               tilt_x(angle), sides=12)


def mesh_antenna(g, diameter, offset, width, depth, height):
    # A shallow reflecting net with a visible perimeter truss. The boom meets the
    # near rim, leaving the aperture clear like the deployed mobile-service designs.
    side = math.copysign(1,offset)
    angle = side*math.radians(6)
    center = (0, offset, height*.47+abs(offset)*.48)
    ca, sa = math.cos(angle), math.sin(angle)

    def local(x, y, z):
        return (x, center[1]+y*ca-z*sa, center[2]+y*sa+z*ca)

    g.part("Deployable mesh reflector", "net reflector", "Gold mesh",
           (diameter,diameter,diameter*.50), center, tilt_x(angle), sides=48)
    radius, lip, ring_depth = diameter*.50, diameter*.10, diameter*.052
    count = 24
    front, rear = [], []
    for i in range(count):
        a = math.tau*i/count
        front.append(local(radius*math.cos(a),radius*math.sin(a),lip))
        rear.append(local(radius*math.cos(a),radius*math.sin(a),lip-ring_depth))
    for i in range(count):
        j = (i+1)%count
        g.rod("Reflector rim", front[i],front[j],diameter*.006)
        g.rod("Rear rim", rear[i],rear[j],diameter*.005)
        g.rod("Perimeter truss", front[i],rear[i],diameter*.004)
        g.rod("Perimeter diagonal", rear[i],front[j],diameter*.004)
        if i%2 == 0:
            a = math.tau*i/count
            middle = local(radius*.52*math.cos(a),radius*.52*math.sin(a),lip*.52**2)
            g.rod("Net tension cable", center,middle,diameter*.0024)
            g.rod("Net tension cable", middle,front[i],diameter*.0024)
    attach = rear[3*count//4 if side > 0 else count//4]
    hinge = (0, side*depth*.70, height*.33)
    for x in (-.21,.21):
        g.rod("Reflector boom yoke", (x*width,side*depth*.46,height*.07), hinge,width*.045)
    g.rod("Reflector deployment boom", hinge, attach, max(width*.070,diameter*.013), "Thermal blanket")


def communications_spacecraft(g, appearance, length, width, span):
    family = appearance["body"]
    height = min(length,width*1.36) if family == "702SP" else length
    depth = appearance.get("busDepth", width*(1.20 if family == "702SP" else .88))
    equipment_bus(g,height,width,depth,family)
    if family == "702MP+":
        for side in (-1,1):
            angle = side*math.radians(55)
            g.part("Feed enclosure petal", "delta", "Thermal blanket", (width*.98,depth*.93,height*.035),
                   (0,side*depth*.42,height*.70),tilt_x(angle))
            g.part("Offset feed housing", "frustum", "Graphite", (width*.30,width*.30,height*.26),
                   (side*width*.27,0,height*.63),sides=16)
    elif family != "702SP":
        for x in (-.22,.19):
            g.part("Communications feed assembly", "foil-box", "Gold insulation",
                   (width*.25,depth*.33,height*.11), (x*width,-depth*.20,height*.58))
            g.part("Feed aperture", "cylinder", "Graphite", (width*.15,width*.15,height*.035),
                   (x*width,-depth*.20,height*.64),sides=16)
    if appearance.get("radiators"):
        deployed_radiators(g,width,depth,height)
    rows = appearance["wingRows"]
    chord = min(width*1.01,span*.060) if max(rows)>1 else min(width*1.25,span*.093)
    solar_wings(g,width,span,chord,rows,concentrators=appearance.get("concentrators",False))
    major = appearance.get("dishMajor",width*.89)
    rigid_antennas(g,appearance["dishes"],major,appearance.get("dishMinor",major*.92),width,depth,height,
                   appearance.get("innerDishRatio",1))
    if "meshDiameter" in appearance:
        mesh_antenna(g,appearance["meshDiameter"],appearance["meshOffset"],width,depth,height)
    if appearance.get("kaDeck"):
        for x in (-.24,0,.24):
            for y in (-.18,.18):
                g.part("Ka-band feed cluster", "frustum", "Thermal blanket",
                       (width*.16,width*.16,height*.10), (width*x,depth*y,height*.575), sides=20)


def weather_spacecraft(g, appearance, length, width, span):
    mission = appearance["weather"]
    if mission in ("MTG-I","MTG-S"):
        meteosat_instruments(g,mission,length,width,span)
        return
    depth = appearance.get("busDepth", width*.95)
    height = length if mission == "Himawari" else min(length,width*1.52)
    equipment_bus(g,height,width,depth,"weather")
    deck = height*.535
    for x, scale in ((-.21,.58),(.29,.31)):
        g.part("Imager bench", "box", "Equipment panels",
               (width*scale,depth*.58,width*.34), (width*x,0,deck+width*.16))
        g.part("Optical baffle", "cylinder", "Graphite", (width*scale*.75,width*scale*.75,width*.12),
               (width*x,0,deck+width*.38), sides=32)
        g.part("Optical aperture", "cylinder", "Reflector glass", (width*scale*.60,width*scale*.60,width*.022),
               (width*x,0,deck+width*.444), sides=32)
    solar_wings(g,width,appearance.get("wingEnvelope",span),min(width*1.05,3.05),appearance["wingRows"],count=1)
    if "sail" in appearance:
        tip = (-width/2-appearance["sail"],0,0)
        g.rod("Solar sail boom", (-width*.47,0,0), tip, width*.034)
        g.part("Solar pressure sail", "frustum", "Thermal blanket", (2.7,2.7,.70),
               (tip[0]+.35,0,0), (0,math.sin(math.pi/4),0,math.cos(math.pi/4)), sides=32)
    if "boom" in appearance:
        reach = appearance["boom"]
        base = (-width*.38,-depth*.49,-height*.25)
        tip = (base[0]-.66*reach,base[1]-.50*reach,base[2]-math.sqrt(1-.66**2-.50**2)*reach)
        g.rod("Magnetometer boom",base,tip,.095)
        for fraction in (.74,1):
            point = [a+fraction*(b-a) for a,b in zip(base,tip)]
            g.part("Magnetometer head", "box", "Equipment panels", (.19,.18,.22), point)
    if mission == "GOES-R":
        g.part("Sun pointing platform", "box", "Thermal blanket", (width*.34,depth*.62,height*.14),
               (width*.69,0,height*.15))
        g.part("Solar telescope", "cylinder", "Graphite", (width*.21,width*.21,height*.17),
               (width*.69,0,height*.29), sides=32)
        g.part("Antenna wing", "box", "Radiator tiles", (width*.65,depth*.34,height*.045),
               (-width*.80,0,deck*.82))
        rigid_antennas(g,1,width*.37,width*.32,width,depth,height)
    elif mission == "Himawari":
        rigid_antennas(g,1,1.35,1.22,width,depth,height)


def meteosat_instruments(g, mission, length, width, span):
    height, depth = width*.87, length*.66
    equipment_bus(g,height,width,depth,"weather")
    solar_wings(g,width,span,depth*.63,[1])
    deck = height*.54
    g.part("Instrument module", "foil-box", "Gold insulation", (width*.82,depth*.83,height*.39), (0,0,deck+height*.19))
    instrument = "Flexible Combined Imager" if mission == "MTG-I" else "Infrared Sounder"
    diameter = width*(.49 if mission=="MTG-I" else .67)
    g.part(instrument+" baffle", "cylinder", "Equipment panels", (diameter,diameter,diameter*.74),
           (width*.10,depth*.16,deck+height*.39+diameter*.37),sides=36)
    g.part(instrument+" aperture", "cylinder", "Graphite", (diameter*.86,diameter*.86,.06),
           (width*.10,depth*.16,deck+height*.39+diameter*.75),sides=36)
    if mission == "MTG-I":
        for x in (-.20,.20):
            for y in (-.31,-.12):
                g.part("Lightning Imager optical head", "cylinder", "Graphite", (width*.22,width*.22,width*.15),
                       (x*width,y*depth,deck+height*.44),sides=20)
    else:
        g.part("Sentinel-4 spectrometer", "box", "Radiator tiles", (width*.54,depth*.37,height*.29),
               (-width*.14,-depth*.26,deck+height*.52))
        g.part("Spectrometer entrance", "box", "Graphite", (width*.36,depth*.11,.035),
               (-width*.14,-depth*.26,deck+height*.67))


def tdrs(g, appearance, length, width, span):
    generation, diameter = appearance["relay"], appearance["diameter"]
    depth = width*.89
    equipment_bus(g,length,width,depth,"601" if generation>1 else "Spacebus")
    solar_wings(g,width,span,width*(.81 if generation==1 else .97),appearance["wingRows"])
    for side in (-1,1):
        center = (0,side*(6.55-diameter/2),length*.56)
        for x in (-.20,.20):
            g.rod("Gimbaled antenna arm", (x*width,side*depth*.43,length*.12), center, width*.045)
        g.part("Single-access reflector", "net reflector", "Relay mesh", (diameter,diameter,diameter*.63),center,sides=48)
        tip = (0,center[1],center[2]+diameter*.35)
        for j in range(16):
            a = math.tau*j/16
            rim = (diameter*.50*math.cos(a),center[1]+diameter*.50*math.sin(a),center[2]+diameter*.126)
            middle = (rim[0]*.55,center[1]+(rim[1]-center[1])*.55,center[2]+diameter*.038)
            g.rod("Reflector rib", center,middle,.021)
            g.rod("Reflector rib", middle,rim,.021)
            if j%4 == 0: g.rod("Feed support",rim,tip,.034)
        g.part("Single-access feed", "frustum", "Equipment panels", (.30,.30,.25),tip)
    deck = length*.54
    g.part("Multiple-access antenna deck","box","Thermal blanket",(width*.58,depth*.89,.11),(-width*.16,0,deck))
    for i in range(4):
        for j in range(5):
            g.part("Multiple-access antenna element","cylinder","Ivory radome",(.13,.13,.045),
                   (width*(i*.13-.35),depth*(j*.145-.29),deck+.08),sides=12)
    g.part("Space-to-ground antenna", "paraboloid", "Antenna face", (1.8,1.8,.70),
           (width*.62,0,deck+.35), tilt_x(-.24),sides=32)
    g.rod("Space-to-ground antenna support", (width*.34,0,deck-.18),(width*.62,0,deck+.35),.12)


def ekran(g, length, width, span):
    height = length*.56
    g.part("Pressurized body","cylinder","Equipment panels",(width,width,height),(0,0,-height*.14),sides=36)
    g.part("Thermal control ring","annulus","Radiator tiles",(width*1.12,width*1.12,height*.19),
           (0,0,-height*.65),sides=36)
    g.part("Broadcast deck pedestal","cylinder","Graphite",(width*.77,width*.77,height*.34),
           (0,0,height*.48),sides=28)
    # Figure 40 shows a paddle on either side of each boom and a perpendicular RF panel.
    for side in (-1,1):
        x = side*(span/2-.70)
        g.rod("Paddle boom",(side*width*.46,0,0),(x,0,0),width*.055)
        for direction in (-1,1):
            angle = math.radians(62)
            center = (x,direction*.77*math.cos(angle),direction*.77*math.sin(angle))
            g.part("Solar paddle","box","Structural alloy",(1.4,1.50,.055),center,tilt_x(angle))
            g.part("Solar cell panel","panel","Solar cells",(1.34,1.44,.02),
                   (x,center[1]-.034*math.sin(angle),center[2]+.034*math.cos(angle)),tilt_x(angle))
    z = height*.69
    for panel in range(4):
        y = (panel-1.5)*5.7/4
        g.part("Broadcast antenna panel","box","Equipment panels",(2.1,5.7/4-.02,.08),(0,y,z))
        for i in range(6):
            for j in range(4):
                g.part("Helical antenna element","helix","Thermal blanket",(.25,.25,.24),
                       ((i-2.5)*2.1/6,y+(j-1.5)*5.7/16,z+.16))


def gorizont(g, length, width, span):
    g.part("Pressurized service module", "cylinder", "Equipment panels",
           (width*.83,width*.83,length*.57), (0,0,-length*.16), sides=36)
    g.part("Antenna mounting deck", "cylinder", "Graphite",
           (width,width,length*.16), (0,0,length*.17), sides=36)
    for z in (-.38,-.18,.15):
        g.part("Body flange","annulus","Structural alloy",(width*.92,width*.92,.09),(0,0,length*z),sides=36)
    solar_wings(g,width*.83,span,width*.70,[2,2])
    for side in (-1,1):
        for y in (-.27,.27):
            g.part("Antenna platform equipment", "foil-box", "Gold insulation", (width*.22,width*.24,length*.22),
                   (side*.32*width,y*width,length*.31))
    z, diameter = length*.30, width*.78
    g.part("Axial communications reflector", "paraboloid", "Antenna face", (diameter,diameter,diameter*.62),
           (0,0,z),sides=40)
    feed = (0,0,z+.40*diameter)
    for i in range(3):
        a = math.tau*i/3
        g.rod("Feed support",(.47*diameter*math.cos(a),.47*diameter*math.sin(a),z+.11*diameter),feed,.045)
    g.part("Axial feed", "frustum", "Thermal blanket", (.22,.22,.25), feed)


def ats6(g, diameter, height, width, span):
    # NASA figure 1-3 places the paddles behind the parasol and the focal module in front.
    hub_z, radius = -height*.26, diameter/2
    depth = diameter*.16
    g.part("Parabolic mesh parasol","net reflector","Gold mesh",(diameter,diameter,depth*5), (0,0,hub_z),sides=48)
    for rib in range(48):
        a = math.tau*rib/48
        middle = (radius*.52*math.cos(a),radius*.52*math.sin(a),hub_z+depth*.52**2)
        rim = (radius*math.cos(a),radius*math.sin(a),hub_z+depth)
        g.rod("Parasol rib",(0,0,hub_z),middle,.035)
        g.rod("Parasol rib",middle,rim,.035)
    g.part("Reflector hub","cylinder","Equipment panels",(width,width,.58),(0,0,hub_z-.15),sides=24)
    module_z = height*.50-width*.65
    g.part("Earth-viewing module","foil-box","Gold insulation",(width,width,width*1.30),(0,0,module_z))
    g.part("Prime-focus feed","frustum","Thermal blanket",(.53,.53,.52),(0,0,module_z-width*.78))
    for x in (-1,1):
        for y in (-1,1):
            g.rod("Reflector support truss",(x*.47*width,y*.47*width,module_z),
                  (x*.66*width,y*.66*width,hub_z+.10),.071)
        g.part("Earth coverage horn","frustum","Equipment panels",(.34,.34,.35),(x*.30*width,0,module_z+width*.55))
    paddle_radius = height*.24
    facet_angle = math.pi/10
    for side in (-1,1):
        root, shoulder = side*width*.42, side*(span/2-1.9)
        for y in (-.24,.24):
            g.rod("Solar paddle truss",(root,y,hub_z-.16),(shoulder,y*.25,hub_z-.16),.075)
        # Tile the half-cylinder with its photovoltaic surface facing outwards.
        for i in range(10):
            angle = -math.pi/2+(i+.5)*facet_angle
            x = side*(span/2-.95)
            y = paddle_radius*math.sin(angle)
            z = hub_z-paddle_radius*math.cos(angle)
            orientation = tilt_x(math.pi+angle)
            chord = 2*paddle_radius*math.sin(facet_angle/2)
            g.part("Curved paddle backing","box","Equipment panels",(1.9,chord,.035),(x,y,z),orientation)
            g.part("Solar paddle cells","panel","Solar cells",(1.86,chord*.96,.012),
                   (x,y+.023*math.sin(angle),z-.023*math.cos(angle)),orientation)
