"""Horizons 3e deployed exterior. +Z is Earth-facing, X is the solar array axle."""
import math


def petal_frame(surface, sides):
    """A pierced, tapered reflector surround with a projecting hinge end."""
    def outer_edge(angle):
        x, y = math.cos(angle), math.sin(angle)
        radius = .443 + .018*max(0,-y)**5 + .045*max(0,y)**7
        return (radius*x,radius*y)

    edges = []
    for i in range(sides):
        angle = math.tau*i/sides
        edges.append((outer_edge(angle),(.339*math.cos(angle),.339*math.sin(angle))))
    for i, (outer,inner) in enumerate(edges):
        next_outer,next_inner = edges[(i+1)%sides]
        outside, inside = [(*p,-.5) for p in (outer,inner)]
        out_next, in_next = [(*p,-.5) for p in (next_outer,next_inner)]
        top, hole, top_next, hole_next = [(*p,.5) for p in (outer,inner,next_outer,next_inner)]
        surface.face([top,top_next,hole_next,hole])
        surface.face([inside,in_next,out_next,outside])
        surface.face([outside,out_next,top_next,top])
        surface.face([in_next,inside,hole,hole_next])

    def skin(points):
        area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))
        loop = points if area>0 else list(reversed(points))
        surface.face([(*p,.5) for p in loop])
        surface.face([(*p,-.5) for p in reversed(loop)])

    def wall(a,b):
        surface.face([(*a,-.5),(*b,-.5),(*b,.5),(*a,.5)])

    # Continue the round flange into a tapered plate. Each half has a real
    # triangular lightening hole. The plate meets the flange along its arc.
    for sign in (-1,1):
        arc = [outer_edge(-math.pi/2+sign*math.tau*i/sides) for i in range(sides//8+1)]
        a,b,c = (sign*.037,-.492),(sign*.206,-.440),(sign*.097,-.606)
        tip,midline = (sign*.104,-.692),(0,-.705)
        split = len(arc)//2
        for i in range(len(arc)-1):
            skin([arc[i],arc[i+1],a if i<split else b])
        skin([arc[split],a,b])
        skin([arc[-1],tip,c,b])
        skin([tip,midline,a,c])
        skin([midline,arc[0],a])
        # Walk the outside counterclockwise and the cutout clockwise.
        loops = ((arc[-1],tip,midline),(a,c,b,a))
        for loop in loops:
            for p,q in zip(loop,loop[1:]):
                wall(q,p) if sign==1 else wall(p,q)

def gantry_plate(surface):
    """Cast aft side plate with two bays and four open triangular webs."""
    for left in (-.5,0):
        right = left+.5
        lo,hi = (left,-.5),(right,.5)
        for tri in ((lo,(right,-.5),hi),(lo,hi,(left,.5))):
            center = tuple(sum(p[i] for p in tri)/3 for i in (0,1))
            hole = [tuple(.67*v+.33*c for v,c in zip(p,center)) for p in tri]
            for i in range(3):
                j=(i+1)%3
                quad=[tri[i],tri[j],hole[j],hole[i]]
                surface.face([(*p,.5) for p in quad])
                surface.face([(*p,-.5) for p in reversed(quad)])
                a,b=hole[j],hole[i]
                surface.face([(*a,-.5),(*b,-.5),(*b,.5),(*a,.5)])
    rim=[(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]
    for a,b in zip(rim,rim[1:]+rim[:1]):
        surface.face([(*a,-.5),(*b,-.5),(*b,.5),(*a,.5)])


def engine_bell(surface,sides,interior):
    # The exit remains open so the liner and recessed throat can be inspected.
    section=((-0.5,.50),(-.35,.468),(-.15,.392),(.11,.264),(.33,.171),(.50,.153))
    rings=[]
    for z,radius in section:
        r=radius-(.022 if interior else 0)
        rings.append([(r*math.cos(math.tau*i/sides),r*math.sin(math.tau*i/sides),z) for i in range(sides)])
    for lower,upper in zip(rings,rings[1:]):
        for i in range(sides):
            j=(i+1)%sides
            face=[lower[i],lower[j],upper[j],upper[i]]
            surface.face(face[::-1] if interior else face)


def reflector(g, number, azimuth, diameter, z, tilt):
    # Local Y runs outward from the root. All four apertures look toward the
    # Earth deck; their dark rear shells are visible in the supplied aft view.
    theta = math.radians(azimuth-90)
    a = math.radians(tilt)
    cs,sn = math.cos(theta),math.sin(theta)
    ct,st = math.cos(a),math.sin(a)
    rot = (math.cos(theta/2)*math.sin(a/2),math.sin(theta/2)*math.sin(a/2),
           math.sin(theta/2)*math.cos(a/2),math.cos(theta/2)*math.cos(a/2))
    radius = 3.38
    prefix = f"Reflector {number} "

    def at(x,y,h):
        v = radius+y*ct-h*st
        return (x*cs-v*sn, x*sn+v*cs, z+y*st+h*ct)

    def piece(name, kind, material, size, pos, sides=24):
        g.part(prefix+name,kind,material,size,at(*pos),rot,sides=sides)

    d=diameter
    piece("pale perimeter frame","petal reflector frame","White reflector coating",(d,d,.078),(0,0,0),72)
    piece("carbon aperture","composite reflector shell","Woven reflector composite",(.932*d,.932*d,.43*d),(0,0,.019*d),64)
    piece("rear shell bead","thin annulus","Graphite",(.935*d,.935*d,.037),(0,0,.097*d),64)
    for i in range(12):
        phi=math.tau*i/12
        piece("frame fastener","cylinder","Structural alloy",(.022,.022,.010),
              (.405*d*math.cos(phi),.405*d*math.sin(phi),-.040),8)
    # A fork, an open triangular truss and a transverse pin transfer the load to the bus.
    for sign in (-1,1):
        hinge=at(sign*.076*d,-.657*d,-.018)
        g.rod(prefix+"deployment link",at(sign*.21,-2.05,.38),hinge,.084,"Graphite")
        g.rod(prefix+"rib below flange",at(sign*.29*d,-.315*d,.051),hinge,.075)
        for frac in (-.18,.18):
            piece("edge latch","box","Graphite",(.092,.16,.104),(sign*.404*d,frac*d,-.010))
        piece("hinge lug","box","Graphite",(.070,.235,.150),(sign*.12,-.635*d,-.048))
    g.rod(prefix+"hinge axle",at(-.22,-.65*d,-.07),at(.22,-.65*d,-.07),.195)
    piece("drive housing","sphere","Graphite",(.37,.38,.25),(0,-.65*d,-.13))
    feed=at(0,-.31*d,.79)
    for sign in (-1,1):
        g.rod(prefix+"feed support",at(sign*.19*d,-.46*d,.055),feed,.032,"Graphite")
    piece("offset feed","frustum","Structural alloy",(.17,.17,.19),(0,-.31*d,.73))


def arrays(g, width, span, rows):
    chord=2.04
    shoulder=width/2+1.08
    pitch=(span/2-shoulder)/len(rows)
    # Sun-tracking wings are shown at one representative angle. Local +Z is
    # the cell face and remains visible from the reference's aft viewing angle.
    angle=math.radians(179)
    c,s=math.cos(angle),math.sin(angle)
    rotation=(math.sin(angle/2),0,0,math.cos(angle/2))

    def at(x,y,z):
        return (x,y*c-z*s,-.74+y*s+z*c)

    for side in (-1,1):
        g.rod("Solar drive bearing",at(side*(width/2-.09),0,0),at(side*(width/2+.21),0,0),.43)
        for sign in (-1,1):
            g.rod("Solar yoke",at(side*(width/2+.14),0,0),at(side*shoulder,sign*.43*chord,0),.072)
        for station in range(len(rows)):
            x=side*(shoulder+(station+.5)*pitch)
            g.part("Solar wing perimeter","box","Structural alloy",(pitch-.045,chord,.053),at(x,0,0),rotation)
            g.part("Photovoltaic cell strings","panel","Copper-traced photovoltaic cells",
                   (pitch-.091,chord-.063,.006),at(x,0,.032),rotation)
            g.part("Rear array laminate","box","Array backsheet",(pitch-.084,chord-.07,.013),at(x,0,-.031),rotation)
            for sign in (-1,1):
                g.part("Rear wing stiffener","box","Graphite",(pitch*.96,.027,.047),at(x,sign*.32*chord,-.055),rotation)
                if station:
                    hinge_x=side*(shoulder+station*pitch)
                    g.rod("Inter-panel hinge",at(hinge_x,sign*.72,0),at(hinge_x,sign*.88,0),.081)


def aft_hardware(g,width,depth,aft):
    g.part("Aft deck","blanketed chassis","Charcoal thermal blanket",(width*.95,depth*.96,.12),(0,0,aft))
    g.part("Launch adapter ring","thin annulus","Structural alloy",(1.58,1.58,.050),(0,0,aft-.23),sides=72)
    g.part("Adapter retaining band","thin annulus","Structural alloy",(1.55,1.55,.025),(0,0,aft-.17),sides=72)
    bell=(0,0,aft-.33)
    for kind,material in (("bell jacket","Structural alloy"),("bell interior","Nozzle liner")):
        g.part("Apogee engine "+kind,kind,material,(.56,.56,.53),bell,sides=56)
    g.part("Nozzle exit rolled lip","thin annulus","Structural alloy",(.56,.56,.017),(0,0,aft-.596),sides=56)
    g.part("Recessed nozzle throat","cylinder","Graphite",(.15,.15,.018),(0,0,aft-.07),sides=32)
    for i in range(8):
        a=math.tau*i/8
        inner=(.74*math.cos(a),.74*math.sin(a),aft-.20)
        outer=(.98*math.cos(a),.98*math.sin(a),aft-.057)
        g.rod("Adapter ring standoff",outer,inner,.048)
    for side in (-1,1):
        # Top and bottom chords with diagonal webs leave real openings in the
        # silver gantries next to the central bell, as seen from behind.
        x=side*width*.395
        near,far=aft-.08,aft-.46
        for z in (near,far):
            g.part("Aft gantry chord","box","Structural alloy",(.074,1.18,.067),(x,.03,z))
        g.part("Aft pierced gantry plate","pierced gantry plate","Structural alloy",(1.17,near-far,.054),
               (x,.03,(near+far)/2),(.5,side*.5,side*.5,.5))
        for y in (-.53,.04,.58):
            g.rod("Gantry fastening stud",(x,y,far),(x,y,far-.035),.045)
        line=[(x,-.86,aft-.07),(x*.83,-.79,aft-.14),(x*.64,-.76,aft-.16),(x*.50,-.60,aft-.19)]
        for a,b in zip(line,line[1:]):
            g.rod("Aft deck harness",a,b,.032,"Graphite")


def spacecraft(g,spec,height,width,span):
    depth=spec["busDepth"]
    aft, earth=-height*.445,height*.438
    for label,z,h in (("Service module",-.239,.41),("Payload module",.201,.47)):
        g.part(label+" blanket","blanketed chassis","Charcoal thermal blanket",(width*.97,depth,h*height),(0,0,z*height))
    for side in (-1,1):
        # The broad silver faces are covered with optical solar reflector tiles.
        # Bay joints, dark access ports and the drive boss interrupt the grid.
        face=(.5,side*.5,side*.5,.5)
        for z,h in ((-.208,.464),(.232,.398)):
            g.part("Radiator backing","box","Structural alloy",(.058,depth*.937,h*height),(side*width*.49,0,z*height))
            g.part("Radiator tile mosaic","panel","Silver radiator mosaic",(depth*.932,h*height-.035,.005),
                   (side*(width*.49+.034),0,z*height),face)
        g.part("Radiator access recess","box","Graphite",(.035,.59,.20),(side*(width*.49+.06),-.37,earth-.43))
        g.part("Radiator access eyelet","thin annulus","Structural alloy",(.098,.098,.022),
               (side*(width*.49+.087),-.56,earth-.43),face,sides=24)
        for y in (-.395,.395):
            g.part("Longeron","box","Structural alloy",(.048,.047,.86*height),(side*width*.462,y*depth,-.01*height))
        for x,z,w,h in ((-.22,-.28,.39,.27),(.22,-.31,.41,.20),(-.16,-.005,.54,.25),(.29,.02,.28,.22),(.02,.278,.73,.18)):
            g.part("Overlapping insulation leaf","foil-box","Charcoal thermal blanket",
                   (w*width,.036,h*height),(x*width,side*depth*.501,z*height))
        for x,z in ((-.70,1.89),(-.32,1.80),(.46,1.20),(.79,1.10)):
            a=(x,side*depth*.49,z)
            b=(x+.068,side*(depth*.50+.20),z+.085)
            g.rod("Equipment mounting boss",a,b,.174)
            normal=tuple((v-u)/math.dist(a,b) for u,v in zip(a,b))
            tip=tuple(v+.008*n for v,n in zip(b,normal))
            g.rod("Mounting boss socket",b,tip,.122,"Graphite")
        for x in (-.28,.27):
            g.part("Payload equipment housing","blanketed chassis","Charcoal thermal blanket",
                   (.65,.64,.49),(x*width,side*depth*.35,earth+.20))
    aft_hardware(g,width,depth,aft)
    g.part("Earth-facing equipment deck","blanketed chassis","Charcoal thermal blanket",
           (width*.93,depth*.94,.10),(0,0,earth))
    for side in (-1,1):
        for x in (-.56,.56):
            g.rod("Earth-deck equipment brace",(x,side*depth*.30,earth+.07),(0,side*depth*.39,earth+.49),.045)
    for x in (-1,1):
        for y in (-1,1):
            p=(x*width*.37,y*depth*.37,aft-.13)
            g.part("Aft equipment pedestal","blanketed chassis","Charcoal thermal blanket",(.48,.43,.30),p)
            g.rod("Deck diagonal stay",(x*.62,y*.18,aft-.09),p,.042)
            g.part("Earth-deck thruster bell","frustum","Graphite",(.19,.19,.23),
                   (x*width*.43,y*depth*.37,earth+.32),(1,0,0,0),sides=20)
    for i,(az,d,z,tilt) in enumerate(((48,2.52,-3.05,7),(134,2.31,-3.20,-6),
                                       (228,2.48,-3.02,10),(315,2.40,-3.18,-8)),1):
        reflector(g,i,az,d,z,tilt)
    arrays(g,width,span,spec["wingRows"])
    g.inspection_camera("aft","Aft detail",(0,0,-.77),(.86,.66,-.71),4.75)
    g.inspection_camera("earth-facing","Earth-facing detail",(0,0,.12),(.76,.67,1.18),4.60)
