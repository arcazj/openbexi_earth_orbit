"""Tiangong's permanent three-module configuration, in metres, with +Z toward Earth."""
import math

REFERENCES = [
    "https://doi.org/10.34133/space.0035",
    "https://en.cmse.gov.cn/multimedia/images/202311/t20231130_54749.html",
    "https://english.www.gov.cn/news/topnews/202208/15/content_WS62fa3750c6d02e533532f2f2.html",
]
STATION_ASSET = "leo/ref-tianhe-48274.glb"
LAB_LENGTH = 17.9
CORE_LENGTH = 16.6
BODY_DIAMETER = 4.2
WING_SPAN = 55.5
MEMBERS = {
    48274: (STATION_ASSET, "Tiangong Space Station (TSS)", "tiangong", CORE_LENGTH,
            "Tianhe core and the permanently berthed Wentian and Mengtian laboratories in their deployed T configuration."),
    53239: ("leo/wentian.glb", "Wentian laboratory module", "wentian", LAB_LENGTH,
            "Tiangong's Wentian laboratory with its crew airlock, truss, small robotic arm and flexible solar wings."),
    54216: ("leo/mengtian.glb", "Mengtian laboratory module", "mengtian", LAB_LENGTH,
            "Tiangong's Mengtian laboratory with its cargo airlock, external payload platforms and flexible solar wings."),
}


def profile(number):
    asset, name, design, length, description = MEMBERS[number]
    note = ("The three-module exterior follows the October 2023 flyaround, with visiting vehicles omitted. "
            "The published module lengths are 16.6 m for Tianhe and 17.9 m for each laboratory. "
            "Maximum cabin diameter is 4.2 m. The model uses a 55.5 m laboratory wingspan. "
            "Array angles, arm poses, surface finishes and small fittings are illustrative.")
    return asset, {"name": name, "description": description, "family": "Tiangong", "design": design,
                   "appearance": {"previewDirection": [-.49,-.68,1.30], "previewUp": [-.32,.94,.12]},
                   "shape": "Modular space station" if design == "tiangong" else "Laboratory module",
                   "meta": {"bus": "Tiangong", "geometry": {"body_length_m": length, "body_width_m": BODY_DIAMETER,
                            "span_m": WING_SPAN, "glb_units": "m"}, "references": REFERENCES,
                            "reference_status": "Illustrated design", "dimension_note": note}, "norad": [number]}


X_AXIS = (0, math.sqrt(.5), 0, math.sqrt(.5))
Y_AXIS = (math.sqrt(.5), 0, 0, math.sqrt(.5))  # local +Z points aft, along -Y
ABOUT_Z = (0, 0, math.sqrt(.5), math.sqrt(.5))


def jointed_arm(g, name, points, diameter):
    for start, end in zip(points, points[1:]):
        g.rod(name + " insulated link", start, end, diameter, "Station ceramic white")
    for point in points:
        g.part(name + " rotary joint", "sphere", "Structural alloy", (diameter*1.55,)*3, point, sides=12)


def dock(g, name, origin, normal):
    # Three alignment petals surround a recessed, closed hatch.
    east = (1, 0, 0)
    north = (0, normal[2], -normal[1])
    rotation = None if normal[2] else (Y_AXIS if normal[1] < 0 else (-Y_AXIS[0], 0, 0, Y_AXIS[3]))
    def at(u, v, z):
        return tuple(origin[i] + u*east[i] + v*north[i] + z*normal[i] for i in range(3))
    g.part(name + " docking collar", "annulus", "Structural alloy", (1.57,1.57,.20), origin, rotation, 32)
    g.part(name + " pressure hatch", "cylinder", "Equipment panels", (1.10,1.10,.12), at(0,0,-.025), rotation, 32)
    g.part(name + " capture ring", "thin annulus", "Ivory radome", (1.38,1.38,.09), at(0,0,.095), rotation, 36)
    for i in range(3):
        a = i*math.tau/3
        p = at(.68*math.cos(a), .68*math.sin(a), .07)
        q = at(.62*math.cos(a), .62*math.sin(a), .23)
        g.rod(name + " guide petal", p, q, .135, "Structural alloy")


def flexible_wing(g, name, root, along_x, sign, tip, chord):
    """Each flexible wing has two separate blankets tensioned on a central mast."""
    def at(distance, across, z=0):
        dx, dy = (sign*distance,across) if along_x else (across,sign*distance)
        return (root[0]+dx, root[1]+dy, root[2]+z)
    rotation = ABOUT_Z if along_x else None
    shoulder = 2.1 if along_x else 4.45
    width = (chord-.68)/2
    for side in (-1,1):
        g.rod(name + " tension yoke", at(.05,side*.21), at(shoulder,side*chord*.42), .075)
    g.rod(name + " deployment mast", at(0,0), at(tip,0), .13)
    for side in (-1,1):
        center = side*(width/2+.34)
        segments = 4
        pitch = (tip-shoulder)/segments
        for i in range(segments):
            pos = shoulder+(i+.5)*pitch
            # A wider cross-batten is visible near the outboard quarter in the crew photograph.
            length = pitch - (.12 if i >= segments-2 else .035)
            g.part(name+" blanket backing", "box", "Solar blanket backing", (width,length,.032),
                   at(pos,center), rotation)
            g.part(name+" flexible cell blanket", "panel", "Station photovoltaic cells",
                   (width*.989,length*.995,.018), at(pos,center,.022), rotation)
        for distance in (shoulder, tip-.045):
            g.rod(name+" end batten", at(distance,center-width/2), at(distance,center+width/2), .075)
        if not along_x:
            g.part(name+" folding blanket crossband","box","Equipment panels",(width,.64,.027),
                   at(shoulder+3*pitch,center,.046),rotation)
        g.rod(name+" edge cable", at(shoulder,side*chord/2), at(tip,side*chord/2), .032)


def laboratory(g, name, side, base):
    """Outward axial distance is measured from the side berthing interface."""
    def at(d, y=0, z=0):
        return (base+side*d, y, z)
    outward = (0,side*X_AXIS[1],0,X_AXIS[3])
    inward = (0,-side*X_AXIS[1],0,X_AXIS[3])
    def barrel(label, kind, material, start, end, diameter, rotation=outward):
        g.part(name+" "+label, kind, material, (diameter,diameter,end-start), at((start+end)/2), rotation, 36)
    barrel("berthing ring", "cylinder", "Structural alloy", 0,.55,2.62)
    barrel("shoulder", "frustum", "Station ceramic white", .48,1.58,4.13,inward)
    barrel("working cabin", "station hull", "Station insulation", 1.52,8.60,BODY_DIAMETER)
    for d in (1.72,4.20,6.74,8.49):
        barrel("cabin band","cylinder","Equipment panels",d-.045,d+.045,4.23)
    for y in (-.72,.72):
        for d in (2.62,5.12,7.58):
            g.part(name+" access panel","box","Radiator tiles",(1.65,.62,.09),at(d,y,1.96))
        g.rod(name+" EVA rail",at(2.14,y,2.14),at(8.06,y,2.14),.052,"Gold thermal foil")
        for d in (2.2,4.9,8.0):
            g.rod(name+" rail stand",at(d,y,1.95),at(d,y,2.14),.055)
    if name == "Wentian":
        barrel("crew airlock shoulder","frustum","Station ceramic white",8.55,9.65,4.14)
        barrel("crew airlock","station hull","Station insulation",9.55,13.10,2.65)
        g.part("Wentian EVA hatch rim","annulus","Equipment panels",(1.23,1.23,.14),at(11.0,0,1.36),sides=32)
        g.part("Wentian EVA hatch","cylinder","Ivory radome",(.99,.99,.16),at(11.0,0,1.39),sides=32)
        for y in (-1.36,1.36):
            for z in (-1.0,1.0):
                g.rod("Wentian external truss chord",at(8.6,y,z),at(14.1,y,z),.096)
            for j in range(4):
                z = (-1)**j
                g.rod("Wentian external truss brace",at(8.6+j*1.37,y,z),at(8.6+(j+1)*1.37,y,-z),.065)
        jointed_arm(g,"Wentian small arm",[at(2.5,-1.9,.8),at(3.4,-2.2,1.0),at(5.1,-2.38,1.4),
                                          at(6.85,-2.28,.88),at(7.35,-2.06,.72)],.16)
    else:
        barrel("payload and cargo airlock cabin","station hull","Station insulation",8.52,13.18,3.88)
        for y in (-1,1):
            g.part("Mengtian exposed payload platform","box","Equipment panels",(4.04,1.34,.19),at(10.85,y*2.02,.75))
            for j in range(3):
                g.part("Mengtian payload bay","box","Station ceramic white",(.99,.91,.26),at(9.55+j*1.22,y*2.08,.96))
        g.part("Mengtian cargo airlock door","box","Radiator tiles",(2.12,1.64,.22),at(10.76,0,1.95))
    barrel("resource cabin transition","frustum","Equipment panels",13.02,14.15,3.50)
    barrel("resource cabin","cylinder","Silver thermal panel",14.04,16.46,2.13)
    barrel("outboard solar drive","cylinder","Station ceramic white",16.40,LAB_LENGTH,1.63)
    for y in (-1,1):
        g.part(name+" array bearing","sphere","Structural alloy",(.91,.88,.91),at(17.23,y*.63),sides=16)
        flexible_wing(g,name,at(17.23,0),False,y,WING_SPAN/2,6.0)


def spacecraft(g, design):
    if design in ("wentian","mengtian"):
        laboratory(g,design.title(),1,-LAB_LENGTH/2)
        return
    g.part("Tianhe multiport node","sphere","Station ceramic white",(3.43,3.46,3.38),sides=32)
    dock(g,"Tianhe forward",(0,1.66,0),(0,1,0))
    dock(g,"Tianhe nadir",(0,0,1.62),(0,0,1))
    sections = [
        ("node throat","cylinder","Structural alloy",1.25,2.10,2.57),
        ("living compartment","station hull","Station insulation",2.0,6.5,3.24),
        ("cabin transition","frustum","Station ceramic white",6.44,7.45,BODY_DIAMETER),
        ("main cabin","station hull","Station insulation",7.36,11.73,BODY_DIAMETER),
        ("resource compartment","cylinder","Station ceramic white",11.65,13.75,3.78),
        ("aft passage","frustum","Equipment panels",13.66,14.61,3.23)]
    for label,kind,material,start,end,diameter in sections:
        rotation = (-Y_AXIS[0],0,0,Y_AXIS[3]) if label == "cabin transition" else Y_AXIS
        g.part("Tianhe "+label,kind,material,(diameter,diameter,end-start),(0,-(start+end)/2,0),rotation,40)
    dock(g,"Tianhe aft",(0,-14.50,0),(0,-1,0))
    for d,diameter in ((2.2,3.26),(4.72,3.28),(6.36,3.28),(7.62,4.23),(9.58,4.23),(11.59,4.23)):
        g.part("Tianhe pressure shell band","cylinder","Equipment panels",(diameter,diameter,.085),(0,-d,0),Y_AXIS,36)
    for side in (-1,1):
        flexible_wing(g,"Tianhe",(side*1.60,-5.50,0),True,side,12.15,5.30)
        for y in (-2.95,-4.45,-8.18,-10.22):
            r = 1.49 if y > -6 else 1.99
            g.part("Tianhe radiator bay","box","Radiator tiles",(.92,1.06,.12),(side*.68,y,r))
    jointed_arm(g,"Tianhe main arm",[(-1.58,-2.86,.68),(-2.02,-3.36,1.22),(-2.34,-6.82,1.52),
                                    (-2.58,-9.82,1.07),(-2.38,-10.83,.32),(-2.14,-11.19,.22)],.25)
    laboratory(g,"Wentian",1,1.60)
    laboratory(g,"Mengtian",-1,-1.60)
    g.inspection_camera("tianhe","Tianhe docking node",(0,-1.4,0),(.4,1,.78),3.4)
