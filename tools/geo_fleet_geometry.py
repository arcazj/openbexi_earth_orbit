"""Reference-driven exteriors. X is the solar axle and +Z is the Earth deck."""
import math

if __package__:
    from .geo_geometry import deployed_radiators, equipment_bus, mesh_antenna, solar_wings, tilt_x
else:
    from geo_geometry import deployed_radiators, equipment_bus, mesh_antenna, solar_wings, tilt_x


def radio_shells(g, spec, width, depth, height):
    """Side hinges, deck-mounted apertures and an in-flight stowed shell."""
    slots = spec.get("reflectors", [])
    for i, slot in enumerate(slots):
        major, minor = spec.get("apertures", {}).get(str(i), (0, 0))
        size = spec.get("dishWidth", .99) * width
        large = slot.isupper()
        major = major or size * (1 if large else .61)
        minor = minor or major * spec.get("axisRatio", .83)
        slot = slot.upper()
        if slot == "D":
            deck = [j for j, v in enumerate(slots) if v.upper() == slot]
            x = (deck.index(i)-(len(deck)-1)/2)*major
            y, z, angle = -.13*depth, .58*height, -.07
            name = "Deck-mounted reflector"
        elif slot == "S":
            x, y, z, angle = 0, -.54*depth, .025*height, math.pi/2
            name = "Stowed west reflector"
        else:
            side = 1 if slot in ("R","B") else -1
            same = [j for j, v in enumerate(slots) if v.upper() == slot]
            x = (same.index(i)-(len(same)-1)/2)*major*1.05
            y = side*(.50*depth + minor*spec.get("standOff", .49))
            z = height*(.32 if slot in ("L","R") else -.06)
            angle = side*math.radians(6)
            name = "Communications reflector"
        offset = spec.get("reflectorOffsets", {}).get(str(i))
        if offset:
            x += width*offset[0]
            y += depth*offset[1]
            z += height*offset[2]
        center = (x,y,z)
        g.part(name, "shaped reflector" if spec.get("shaped") else "paraboloid",
               spec.get("dishMaterial","Antenna face"), (major,minor,major*.39), center, tilt_x(angle), sides=32)
        if spec.get("dualGrid"):
            separation = major*.015
            face = (x,y-separation*math.sin(angle),z+separation*math.cos(angle))
            g.part("Front polarization grid","net reflector","Relay mesh",(major*.98,minor*.98,major*.39),
                   face,tilt_x(angle),sides=32)
        support_y = math.copysign(depth*.40,y)
        for sign in (-1,1):
            g.rod("Shell hinge strut", (x*.48+sign*width*.20,support_y,.10*height), center, width*.027)
        if slot != "S":
            end = (x+major*.21, y-minor*.25*math.sin(angle), z+major*.31)
            g.rod("Offset feed boom",(x*.45,support_y,.47*height),end,width*.039)
            g.part("Feed horn","frustum","Thermal blanket",(major*.115,major*.115,major*.15),end,tilt_x(angle))


def radial_wings(g, count, width, span, chord, stations):
    reach = max((span-width)*.5,width*.20)
    shoulder = width*.5+reach*.16
    pitch = reach*.84/stations
    for j in range(count):
        angle = math.tau*j/count
        dx,dy = math.cos(angle),math.sin(angle)
        turn = (0,0,math.sin(angle/2),math.cos(angle/2))
        g.rod("Radial array axle",(dx*width*.45,dy*width*.45,0),(dx*shoulder,dy*shoulder,0),width*.045)
        for station in range(stations):
            dist = shoulder+(station+.5)*pitch
            pos = (dx*dist,dy*dist,0)
            g.part("Radial paddle frame","box","Structural alloy",(pitch*.99,chord,width*.018),pos,turn)
            g.part("Solar cell panel","panel","Solar cells",(pitch*.96,chord*.95,width*.004),
                   (pos[0],pos[1],width*.010),turn)


def drum(g, spec, width, height, features):
    steps = 2 if "telescoping" in features else 1
    for i in range(steps):
        dia = width*(1-.13*i)
        z = height*((i+.5)/steps-.5)
        g.part("Solar drum core","cylinder","Equipment panels",(dia,dia,height/steps),(0,0,z),sides=40)
        g.part("Body-mounted solar cells","drum-cells","Solar cells",
               (dia*1.004,dia*1.004,height/steps*.95),(0,0,z),sides=40)
    g.part("Despun equipment deck","cylinder","Thermal blanket",(width*.89,width*.89,height*.09),
           (0,0,height*.525),sides=32)
    if "window" in features:
        g.part("Radiometer window surround","box","Equipment panels",(width*.50,width*.10,height*.31),
               (0,-width*.47,height*.05))
        g.part("Radiometer viewing port","box","Graphite",(width*.42,width*.05,height*.26),
               (0,-width*.532,height*.05))


def instrument_deck(g, style, width, depth, height):
    top = height*.54
    if style in ("imager","dualImager","telescope"):
        sizes = [.68,.36] if style == "dualImager" else [.64]
        for i, factor in enumerate(sizes):
            dia = width*factor
            x = width*(i*.53-.20) if len(sizes)>1 else 0
            length = width*(1.13 if style == "telescope" else .38)
            g.part("Optical instrument housing","cylinder","Equipment panels",(dia,dia,length),
                   (x,0,top+length*.47),sides=32)
            g.part("Telescope aperture","cylinder","Graphite",(dia*.87,dia*.87,width*.027),
                   (x,0,top+length*.98),sides=32)
    elif style in ("phased","shelf"):
        y = depth*(.60 if style == "shelf" else 0)
        g.part("Antenna equipment shelf","box","Equipment panels",(width*.91,depth*.89,height*.10),
               (0,y,top))
        g.part("Planar antenna aperture","cylinder","Graphite",(width*.73,width*.73,height*.037),
               (0,y,top+height*.071),sides=40)
        for i in range(12):
            a = math.tau*i/12
            g.part("Array face element","cylinder","Ivory radome",(width*.082,width*.082,height*.013),
                   (width*.25*math.cos(a),y+width*.25*math.sin(a),top+height*.096),sides=8)
    elif style == "horn":
        g.part("Axial antenna horn","frustum","Thermal blanket",(width*.47,width*.47,width*.52),
               (0,0,top+width*.24),sides=24)
    elif style == "tower":
        crown = top+width*.46
        for x in (-.22,.22):
            for y in (-.22,.22):
                g.rod("Antenna tower leg",(x*width,y*width,top),(.65*x*width,.65*y*width,crown),width*.033)
        g.part("Antenna tower platform","cylinder","Equipment panels",(width*.43,width*.43,height*.04),
               (0,0,crown),sides=24)


def skynet_spinner(g, height, diameter, overall):
    axis = (0,math.sin(math.pi/4),0,math.cos(math.pi/4))
    g.part("Spin-stabilized bus","cylinder","Equipment panels",(diameter,diameter,height),rotation=axis,sides=48)
    for sign in (-1,1):
        g.part("Body solar-cell band","drum-cells","Solar cells",(diameter*1.004,diameter*1.004,height*.465),
               (sign*height*.25,0,0),axis,sides=48)
    reach = overall-height
    for label,dia,length,offset in (("Despin bearing",.43,.15,.075),("Antenna support",.22,.48,.36)):
        g.part(label,"frustum","Structural alloy",(dia*diameter,dia*diameter,length*reach),
               (height*.5+offset*reach,0,0),axis)
    mouth = (height*.5+.85*reach,0,diameter*.064)
    g.rod("Despun feed elbow",(height*.5+.58*reach,0,0),mouth,diameter*.071)
    g.part("Earth-facing feed","frustum","Equipment panels",(diameter*.18,diameter*.14,diameter*.14),mouth,tilt_x(math.pi))
    g.part("Horn aperture","cylinder","Graphite",(diameter*.15,diameter*.11,diameter*.012),
           (mouth[0],0,mouth[2]+diameter*.074))


def oko_telescope(g, spec, width, span):
    square = spec["body"] == "oko"
    height = width*(.64 if square else .85)
    axis = None if square else tilt_x(math.pi/2)
    g.part("Service module","cylinder","Equipment panels",(width,width,height),rotation=axis,sides=32)
    for sign in (-1,1):
        offset = (0,0,sign*height*.39) if square else (0,sign*height*.39,0)
        g.part("Module band","cylinder","Thermal blanket",(width*1.025,width*1.025,height*.12),offset,axis,sides=32)
    solar_wings(g,width,span,width*(.62 if square else .78),[2,2] if square else [1,1],
                row_offsets=[.5,-.5] if square else None)
    base = height*.5 if square else width*.5
    diameter = width*.74
    length = spec["hoodLength"]
    g.part("Telescope throat","cylinder","Graphite",(diameter,diameter,width*.25),(0,0,base))
    sections = 5
    for i in range(sections):
        z = base+(i+.5)*length/sections
        size = diameter*(1+.035*i)
        if square:
            for side in (-1,1):
                g.part("Square sunshade wall","box","Radiator tiles",(size,width*.023,length/sections),
                       (0,side*size*.5,z))
                g.part("Square sunshade wall","box","Equipment panels",(width*.023,size,length/sections),
                       (side*size*.5,0,z))
        else:
            g.part("Telescoping sunshade","annulus","Graphite",(size,size,length/sections),(0,0,z),sides=40)
    if not square:
        radio_shells(g,{"reflectors":["r"],"dishWidth":1.14},width,width,height)


def ses17_reflectors(g, side, width, depth, height):
    # Three outer shells fan out from the payload deck. The smaller aperture
    # sits between that fan and the bus in the launch illustration.
    for x_ratio, outreach, diameter_ratio, tilt in (
            (-.58, .60, .55, 10), (.02, .80, .44, 13), (.61, .57, .54, 9), (.24, .38, .29, 7)):
        x = width*x_ratio
        y = side*(depth/2 + width*outreach)
        z = height*(.26 + .15*outreach)
        diameter = diameter_ratio*width
        angle = -side*math.radians(tilt)
        rotation = tilt_x(angle)
        mount = (x,y,z-.085*diameter)
        for offset in (-.11, .11):
            g.rod("Reflector deployment strut", (x*.48+width*offset,side*depth*.48,height*.22),
                  mount, width*.017)
        g.part("Reflector rear hub", "cylinder", "Thermal blanket",
               (.14*diameter,.14*diameter,.055*diameter), mount, rotation)
        for spoke in range(3):
            azimuth = spoke*math.tau/3
            dx = diameter*.43*math.cos(azimuth)
            dy = diameter*.40*math.sin(azimuth)
            dz = diameter*.024
            rim = (x+dx,y+dy*math.cos(angle)-dz*math.sin(angle),z+dy*math.sin(angle)+dz*math.cos(angle))
            g.rod("Rear reflector brace", mount, rim, diameter*.023, "Thermal blanket")
        g.part("Ka-band reflector", "dish", "Radiator tiles",
               (diameter,diameter*.93,diameter*.35), (x,y,z), rotation, sides=40)


def ses17_spacecraft(g, rows, height, width, span):
    depth = width*.90
    g.part("Service and payload structure", "box", "Graphite", (width*.98,depth,height))
    # Four gold thermal blankets and a dark equipment strip on each broad face.
    for side in (-1, 1):
        g.part("Thermal blanket surround", "box", "Equipment panels", (width*.97,depth*.026,height*.78),
               (0,side*depth*.506,-height*.11))
        for x in (-.245, .245):
            for z in (-.31, .075):
                g.part("Thermal blanket panel", "quilted foil", "Gold thermal foil", (width*.46,height*.36,width*.29),
                       (x*width,side*depth*.521,z*height), tilt_x(-side*math.pi/2))
        for y in (-.245, .245):
            g.part("Payload radiator panel", "box", "Radiator tiles", (width*.025,depth*.48,height*.94),
                   (side*width*.50,y*depth,0))
            for z in (-.28, .14, .35):
                g.part("Radiator attachment", "box", "Graphite", (width*.012,depth*.10,height*.034),
                       (side*width*.518,y*depth,z*height))
        ses17_reflectors(g,side,width,depth,height)
        for x in (-.28, .05):
            g.part("Feed mounting block", "foil-box", "Gold insulation", (width*.26,depth*.22,height*.084),
                   (x*width,side*depth*.35,height*.559))
            for offset in (-.057, .057):
                g.part("Ka-band feed assembly", "frustum", "Graphite", (width*.10,width*.10,height*.12),
                       ((x+offset)*width,side*depth*.39,height*.62), tilt_x(-side*math.radians(48)), sides=16)
    g.part("Earth-facing equipment deck", "box", "Graphite", (width*.93,depth*.95,height*.036),
           (0,0,.509*height))
    g.part("Service module insulation", "foil-box", "Gold insulation", (width*.95,depth*.97,height*.022),
           (0,0,-.505*height))
    g.part("Launch adapter ring", "annulus", "Structural alloy", (width*.62,width*.62,height*.055),
           (0,0,-.531*height), sides=36)
    chord = width*.83
    solar_wings(g,width,span,chord,rows,drive_extension=width*.36)
    for side in (-1, 1):
        edge = width*.016
        g.part("Solar array tip rail", "box", "Structural alloy", (edge,chord*.99,edge),
               (side*(span-edge)/2,0,0))


def fleet_spacecraft(g, spec, length, width, span):
    body = spec["body"]
    if body == "ses-17":
        return ses17_spacecraft(g,spec["wingRows"],length,width,span)
    if body == "skynet-spinner":
        return skynet_spinner(g,length,width,span)
    if body in ("oko","oko-1"):
        return oko_telescope(g,spec,width,span)
    features = spec.get("features", [])
    height = width*spec["heightRatio"] if "heightRatio" in spec else length
    depth = spec.get("busDepth",width*.87)
    if body == "drum":
        # Historical catalog lengths can include the antenna mast and deployed skirt.
        height *= .73 if "telescoping" in features else .82
        drum(g,spec,width,height,features)
    elif body == "geodesic":
        g.part("Faceted solar shell","poly","Structural alloy",(width,width,height),sides=10)
        g.part("Body solar facets","telstar-cells","Solar cells",(width,width,height),sides=10)
    elif body in ("barrel","faceted","triangular","cryostat"):
        sides = {"barrel":32,"faceted":8,"triangular":3,"cryostat":32}[body]
        g.part("Service barrel","cylinder","Thermal blanket",(width,width,height*.86),(0,0,-height*.07),sides=sides)
        g.part("Equipment flange","cylinder","Equipment panels",(width*1.03,width*1.03,height*.16),
               (0,0,height*.43),sides=sides)
        if body == "cryostat":
            g.part("Sunshield","box","Equipment panels",(width*1.11,width*.07,height*1.15),
                   (0,width*.52,0))
            g.part("Sunshield solar cells","panel","Solar cells",(width,height,.02),(0,width*.56,0),tilt_x(-math.pi/2))
    elif body == "ring":
        g.part("Payload adapter","annulus","Graphite",(width,width,height),(0,0,0),sides=32)
        for i in range(6):
            a = math.tau*i/6
            g.part("Hosted payload enclosure","box","Equipment panels",(width*.32,width*.28,height*.55),
                   (width*.49*math.cos(a),width*.49*math.sin(a),0),(0,0,math.sin(a/2),math.cos(a/2)))
    elif body == "bridge":
        for sign in (-1,1):
            g.part("Payload module","foil-box","Gold insulation",(width*.82,depth,height*.74),(sign*width*.82,0,0))
        for y in (-.32,.32):
            for z in (-.28,.28):
                g.rod("Intermodule truss",(-width*.55,y*depth,z*height),(width*.55,-y*depth,z*height),width*.055)
        width *= 2.45
    else:
        equipment_bus(g,height,width,depth,"Spacebus" if body == "gold" else "702SP")
    if "sidewall" in spec:
        for side in (-1, 1):
            # Insulated equipment bays and louvres are visible between the solar yokes.
            g.part("Equipment bay sidewall","foil-box",spec["sidewall"],(width*.92,depth*.035,height*.70),
                   (0,side*depth*.516,-height*.04))
            for rail in (-.47,0,.47):
                g.part("Equipment bay longeron","box","Structural alloy",(width*.023,depth*.041,height*.79),
                       (rail*width,side*depth*.54,-height*.04))
            g.part("Louvre surround","box","Graphite",(width*.56,depth*.043,height*.25),
                   (0,side*depth*.54,height*.12))
            for blade in range(5):
                g.part("Radiator louvre","box","Equipment panels",(width*.52,depth*.028,height*.022),
                       (0,side*depth*.57,height*(.025+blade*.047)))
    if spec.get("feedCluster"):
        for i in range(spec["feedCluster"]):
            x = (i-(spec["feedCluster"]-1)/2)*width*.18
            g.part("Payload feed cluster","frustum","Equipment panels",(width*.18,width*.18,height*.17),
                   (x,depth*.25,height*.60),tilt_x(math.pi))
    rows = spec.get("wingRows", [])
    if rows:
        count = spec.get("wings",2)
        extent = spec.get("wingSpan",span)
        if extent <= width:
            extent = width*spec.get("illustratedSpanRatio",3.8)
        chord = width*spec.get("chordRatio",.85 if max(rows)==1 else .62)
        if count>2:
            radial_wings(g,count,width,extent,chord,len(rows))
        else:
            solar_wings(g,width,extent,chord,rows,count=count,white_tips=spec.get("whiteTips",False))
    if "radiators" in features:
        deployed_radiators(g,width,depth,height)
    if "sail" in features or "boom" in features:
        reach = spec.get("boomLength",max(span*.34,width*1.2))
        g.rod("Outboard boom",(-width*.44,0,0),(-width*.5-reach,0,0),width*.033)
        if "sail" in features:
            g.part("Solar pressure sail","box","Radiator tiles",(width*.66,width*.045,width*.83),
                   (-width*.5-reach,0,0),tilt_x(.66))
    if "whips" in features:
        for i in range(4):
            a = math.tau*i/4+math.pi/4
            g.rod("Whip antenna",(width*.27*math.cos(a),width*.27*math.sin(a),height*.45),
                  (width*1.1*math.cos(a),width*1.1*math.sin(a),height*.89),width*.014)
    if "radialBooms" in features:
        for j in range(4):
            a = math.tau*j/4
            g.rod("Radial instrument boom",(width*.49*math.cos(a),width*.49*math.sin(a),0),
                  (span*.5*math.cos(a),span*.5*math.sin(a),0),width*.017)
    for feature in features:
        instrument_deck(g,feature,width,depth,height)
    radio_shells(g,spec,width,depth,height)
    if "meshDiameter" in spec:
        dia = spec["meshDiameter"]
        mesh_antenna(g,dia,spec.get("meshOffset",depth*.55+dia*.53),width,depth,height)
    if "secondMesh" in spec:
        dia = spec["secondMesh"]
        mesh_antenna(g,dia,-(depth*.55+dia*.53),width,depth,height)
