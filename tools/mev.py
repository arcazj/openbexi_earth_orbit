"""Space Logistics MEV flight exterior. +Z is the client-facing docking deck."""
import math

if __package__:
    from .geo_geometry import solar_wings
else:
    from geo_geometry import solar_wings


def docking_deck(g, deck):
    silver, dark = "Structural alloy", "Black multilayer insulation"
    g.part("Docking face blanket", "blanketed chassis", dark, (2.34, 2.34, .12), (0, 0, deck-.025))
    g.part("Capture mechanism recess", "cylinder", "Graphite", (1.31, 1.31, .05), (0, 0, deck+.022), sides=56)
    g.part("Capture mechanism collar", "annulus", silver, (1.03, 1.03, .15), (0, 0, deck+.10), sides=48)
    for k in range(12):
        angle = k*math.tau/12
        g.part("Collar fastener", "cylinder", "Graphite", (.034,.034,.018),
               (.45*math.cos(angle),.45*math.sin(angle),deck+.18), sides=6)
    g.part("Probe actuator bellows", "frustum", "Thermal blanket", (.52, .52, .32), (0, 0, deck+.24))
    for i in range(6):
        g.part("Actuator rib", "annulus", silver, (.46-i*.023, .46-i*.023, .020), (0, 0, deck+.12+i*.045))
    g.part("Capture probe shaft", "cylinder", silver, (.128, .128, .59), (0, 0, deck+.64))
    g.part("Capture probe head", "nose", "Gold thermal foil", (.20, .20, .19), (0, 0, deck+.99), sides=32)

    # A tripod bears on the client's launch ring. Only the probe enters the
    # nozzle. The empty node is the bearing plane for a composed pair in metres.
    contact = deck+.66
    for i in range(3):
        angle = i*math.tau/3 + math.pi/2
        x, y = math.cos(angle), math.sin(angle)
        foot = (.76*x, .76*y, contact-.038)
        for side in (-1, 1):
            g.rod("Docking leg brace", (.95*x-side*.13*y, .95*y+side*.13*x, deck+.03), foot, .065, silver)
        g.part("Docking contact pad", "cylinder", "Thermal blanket", (.23,.23,.076), foot, sides=32)
    g.g["nodes"].append({"name": "MEV docking plane", "translation": [0,0,contact]})

    # The manufacturer's imager paper specifies six visible cameras and four
    # infrared cameras. Their housings are illustrative, as is the lidar window.
    for side in (-1, 1):
        g.part("Sensor bench", "box", silver, (.38, .92, .15), (side*.94, 0, deck+.09))
        for i, y in enumerate((-.31, -.10, .19, .34)):
            x, bore = side*(.91 + (i%2)*.075), (.16,.125,.15,.12)[i]
            g.part("Visible camera baffle" if i < 2 else "IR camera baffle", "cylinder", "Graphite",
                   (bore,bore,.12), (x,y,deck+.21), sides=24)
            g.part("Camera objective", "cylinder", "Reflector glass", (bore*.70,bore*.70,.012), (x,y,deck+.275))
        g.part("Docking camera", "box", "Equipment panels", (.17,.14,.16), (side*.53,-.65,deck+.10))
        g.part("Docking camera objective", "cylinder", "Reflector glass", (.086,.086,.026), (side*.53,-.65,deck+.19))
    g.part("Scanning lidar housing", "box", "Equipment panels", (.42,.28,.24), (.04,-.92,deck+.12))
    g.part("Lidar window", "box", "Reflector glass", (.30,.17,.014), (.04,-.92,deck+.247))


def spacecraft(g, spec, length, width, span):
    silver, dark = "Silver multilayer insulation", "Black multilayer insulation"
    depth, height = spec["busDepth"], length*.64
    deck = height/2
    g.part("Service bus", "blanketed chassis", silver, (width, depth, height), (0,0,0))
    for side in (-1, 1):
        for z, fraction in ((-.25,.455), (.245,.485)):
            g.part("Side blanket bay", "foil-box", dark, (width*.83,.055,height*fraction),
                   (0,side*depth*.502,z*height))
            g.part("Radiator panel", "box", "Radiator tiles", (.045,depth*.79,height*fraction),
                   (side*(width/2+.022),0,z*height))
            for y in (-.27,-.09,.09,.27):
                g.part("Radiator tile seam", "box", "Structural alloy", (.006,.012,height*fraction),
                       (side*(width/2+.048),depth*y,z*height))
        for x in (-.43,.43):
            g.rod("Blanket edge rail", (x*width,side*depth*.515,-deck+.035),
                  (x*width,side*depth*.515,deck-.035), .039)
        for z in (-.37, .37):
            g.part("Equipment access panel", "foil-box", silver, (.64,.075,.49),
                   (side*.45,side*depth*.507,z*height))

        # The deployed launch rendering shows small propulsion heads clear of
        # the two yokes. Model the articulating elbow, paired struts and nozzle.
        pivot = (side*.60, side*depth*.49, -deck*.52)
        elbow = (side*.81, side*1.74, -.92)
        head = (side*1.17, side*2.15, -1.16)
        g.part("Propulsion boom pivot", "box", "Structural alloy", (.28,.25,.32), pivot)
        for dx in (-.061,.061):
            g.rod("Propulsion boom", (pivot[0]+dx,*pivot[1:]), (elbow[0]+dx,*elbow[1:]), .047)
        g.rod("Thruster arm", elbow, head, .105)
        g.part("Thruster assembly", "foil-box", silver, (.40,.32,.24), head)
        g.part("Thruster exit", "annulus", "Graphite", (.245,.245,.043), (*head[:2],head[2]-.135))
        for x in (-.92,.92):
            g.part("Corner thruster block", "box", "Graphite", (.20,.19,.20), (x,side*.93,-deck+.08))
            g.part("Corner thruster nozzle", "frustum", "Structural alloy", (.13,.13,.18), (x,side*.93,-deck-.08))
    g.part("Aft deck blanket", "blanketed chassis", dark, (width*.94,depth*.94,.09), (0,0,-deck))
    g.part("Launch adapter ring", "annulus", "Structural alloy", (1.87,1.87,.17), (0,0,-deck-.12), sides=56)
    g.part("Aft engine bell", "frustum", "Thermal blanket", (.47,.47,.43), (0,0,-deck-.24))
    g.part("Engine exit", "cylinder", "Graphite", (.424,.424,.015), (0,0,-deck-.46))
    docking_deck(g, deck)

    chord = 1.95
    rows = spec["wingRows"]
    pitch = solar_wings(g, width, span, chord, rows, cell_material="Indigo photovoltaic cells")
    for side in (-1,1):
        for station in range(len(rows)):
            x = side*(span/2-(station+.5)*pitch)
            for dx in (-.24*pitch,.24*pitch):
                for y in (-.48,.48):
                    g.part("Panel hold-down insert", "cylinder", "Graphite", (.082,.082,.012), (x+dx,y,.034), sides=16)
        for station in range(1,len(rows)):
            x = side*(span/2-station*pitch)
            for y in (-.70,.70):
                g.rod("Array hinge barrel", (x,y-.085,0), (x,y+.085,0), .061)
