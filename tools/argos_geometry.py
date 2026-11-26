"""Deployed Argos spacecraft exteriors. Dimensions are in metres and +Z faces Earth."""
import math
if __package__:
    from .geo_geometry import tilt_x
else:
    from geo_geometry import tilt_x

ALLOY = "Structural alloy"
GOLD = "Gold multilayer insulation"
SILVER = "Silver multilayer insulation"
BLACK = "Black multilayer insulation"
CELLS = "Indigo photovoltaic cells"
HALF_PI = math.pi/2


def array(g, root, tip, chord, count, y=0, z=0, tilt=0, material=CELLS):
    """Panel edges are specified explicitly, including on asymmetric host spacecraft."""
    pitch = (tip-root)/count
    t = min(abs(pitch),chord)*.027
    rotation = tilt_x(tilt)
    def local(x,across,up):
        return (x,y+across*math.cos(tilt)-up*math.sin(tilt),z+across*math.sin(tilt)+up*math.cos(tilt))
    for i in range(count):
        x = root+(i+.5)*pitch
        g.part("Solar panel substrate","box","Array backsheet",(abs(pitch)*.992,chord,t),local(x,0,0),rotation)
        for bank in (-1,1):
            g.part("Solar cell strings","panel",material,(abs(pitch)*.962,chord*.469,t*.12),
                   local(x,bank*chord*.249,t*.54),rotation)
            g.part("Array rear rib","box",ALLOY,(abs(pitch)*.97,chord*.017,t*.78),
                   local(x,bank*chord*.33,-t*.74),rotation)
        if i:
            for bank in (-1,1):
                g.part("Panel hinge","box","Gold thermal foil",(abs(pitch)*.065,chord*.085,t*1.12),
                       local(x-pitch/2,bank*chord*.40,0),rotation)


def bus(g, width, depth, height, material, center=(0,0,0)):
    x,y,z=center
    g.part("Spacecraft body","foil-box",material,(width,depth,height),center)
    for sx in (-1,1):
        for sy in (-1,1):
            g.part("Equipment rail","box",ALLOY,(width*.031,depth*.03,height*.98),
                   (x+sx*width*.484,y+sy*depth*.484,z))
        g.part("Thermal radiator tiles","foil-box","Silver radiator mosaic",
               (width*.012,depth*.71,height*.54),(x+sx*width*.503,y+depth*.035,z-height*.04))
    g.part("Launch interface","annulus",ALLOY,(width*.78,width*.78,height*.04),(x,y,z-height*.52),sides=40)


def optic(g, name, x, y, z, w, h):
    g.part(name+" housing","foil-box","Silver thermal panel",(w,h,w*.48),(x,y,z+w*.18))
    g.part(name+" aperture","cylinder","Anodized baffle",(w*.64,w*.64,w*.15),(x,y,z+w*.46),sides=24)
    g.part(name+" window","cylinder","Dark radiator glass",(w*.48,w*.48,w*.02),(x,y,z+w*.54),sides=24)


def reflector(g, name, x, y, z, diameter, angle=0):
    def point(a,b,h):
        return (x+a,y+b*math.cos(angle)-h*math.sin(angle),z+b*math.sin(angle)+h*math.cos(angle))
    g.part(name,"dish","Satin reflector face",(diameter,diameter,diameter), (x,y,z),tilt_x(angle),48)
    focus=point(0,0,diameter*.37)
    for a in (0,math.tau/3,2*math.tau/3):
        g.rod(name+" feed strut",point(diameter*.466*math.cos(a),diameter*.466*math.sin(a),diameter*.19),
              focus,diameter*.014)
    g.part(name+" feed","cylinder","Warm gold deck tile",(diameter*.08,diameter*.08,diameter*.10),
           focus,tilt_x(angle),16)


def symmetric_wings(g, width, span, chord, panels, y=0, z=0, tilt=.19, material=CELLS):
    for side in (-1,1):
        origin=side*width*.49
        root=side*(width*.5+(span-width)*.045)
        g.rod("Solar array drive",(origin,y,z),(root,y,z),min(width,chord)*.083)
        array(g,root,side*span/2,chord,panels,y,z,tilt,material)


def antenna_view(g,target,radius,name="Argos antenna"):
    g.inspection_camera("argos-antenna",name,target,(.45,-.48,1),radius)


def kineis(g, ais):
    # The long UHF antenna points towards Earth and the solar face is orthogonal to it.
    bus(g,.215,.22,.42,GOLD)
    symmetric_wings(g,.215,1.60,.405,3,z=-.006,tilt=HALF_PI,material="SSTL photovoltaic cells")
    g.part("Separation interface","annulus",ALLOY,(.173,.173,.018),(0,-.12,-.016),tilt_x(HALF_PI),40)
    g.part("Separation plate","cylinder","Silver thermal panel",(.126,.126,.016),(0,-.124,-.016),tilt_x(HALF_PI))
    g.part("Star tracker","frustum","Anodized baffle",(.058,.058,.080),(.074,.083,-.22),tilt_x(2.65))
    g.part("Electric thruster","cylinder",ALLOY,(.069,.069,.022),(0,0,-.225),sides=32)
    g.part("UHF deployment canister","cylinder","Champagne deck tile",(.170,.170,.047),(0,0,.222),sides=36)
    # Four independent wires run around a common axis. The terminal at the tip is S-band.
    for wire in range(4):
        start=wire*HALF_PI
        a=(.073*math.cos(start),.073*math.sin(start),.244)
        for j in range(1,25):
            angle=start+j*math.tau*1.28/24
            b=(.073*math.cos(angle),.073*math.sin(angle),.244+.825*j/24)
            g.rod("UHF helix conductor",a,b,.010,ALLOY)
            a=b
    for z in (.25,1.058):
        g.part("UHF spreader ring","thin annulus",ALLOY,(.154,.154,.016),(0,0,z),sides=32)
    g.part("Stacked S-band antenna","cylinder","Pale reflector coating",(.036,.036,.103),(0,0,1.121),sides=20)
    if ais:
        for i in range(4):
            a=math.pi/4+i*HALF_PI
            g.rod("AIS VHF antenna blade",(.06*math.cos(a),.06*math.sin(a),.224),
                  (.49*math.cos(a),.49*math.sin(a),.265),.013,"Warm gold deck tile")
    antenna_view(g,(0,0,.63),.55,"Argos UHF and S-band antennas")
    if ais: g.inspection_camera("ais-antenna","Maritime AIS antenna",(0,0,.23),(.35,-.56,1),.55)


def angels(g):
    bus(g,.20,.20,.30,GOLD)
    symmetric_wings(g,.20,1.0,.29,2,tilt=HALF_PI,material="SSTL blue photovoltaic cells")
    g.part("Fixed body solar face","panel","SSTL blue photovoltaic cells",(.174,.17,.002),
           (0,-.103,-.055),tilt_x(HALF_PI))
    g.part("Argos-Neo antenna face","cylinder","Pale reflector coating",(.085,.085,.011),
           (0,-.109,.090),tilt_x(HALF_PI),28)
    g.part("Nadir patch","cylinder","Champagne deck tile",(.125,.125,.009),(0,0,.155),sides=24)
    g.inspection_camera("argos-antenna","Argos-Neo payload face",(0,-.11,.085),(.16,-1,.2),.13)


def gazelle(g):
    bus(g,.60,.58,.62,SILVER)
    # One fixed solar face with two hinged leaves in the flight rendering.
    array(g,-.32,.32,.68,1,y=-.306,tilt=HALF_PI,material="SSTL blue photovoltaic cells")
    for side in (-1,1):
        array(g,side*.322,side*1.0,.68,1,y=-.306,tilt=HALF_PI,material="SSTL blue photovoltaic cells")
    for x,y,d,h in [(.025,-.015,.15,.74),(-.17,.13,.054,.43)]:
        g.part("Antenna flange","annulus","Champagne deck tile",(d*1.43,d*1.43,.025),(x,y,.33),sides=32)
        g.part("Argos payload radome","cylinder","Pale reflector coating",(d,d,h),(x,y,.34+h/2),sides=32)
        g.part("Antenna shoulder","frustum","Pale reflector coating",(d*1.35,d*1.35,.10),(x,y,.40),sides=28)
    antenna_view(g,(0,0,.65),.58,"Argos-4 antenna deck")


def saral(g):
    bus(g,1.0,1.10,1.32,GOLD)
    g.part("Integrated payload module","foil-box",SILVER,(.92,1.02,.39),(0,0,.82))
    symmetric_wings(g,1.0,4.0,.87,1,z=-.27,material="SSTL photovoltaic cells")
    reflector(g,"AltiKa radar altimeter",0,.12,1.10,1.0,-.38)
    g.part("DORIS antenna","frustum","Gold thermal foil",(.18,.18,.23),(.39,-.30,.73),sides=24)
    g.part("Laser retroreflector array","cylinder","Reflector glass",(.17,.17,.075),(-.37,-.35,1.043),sides=12)
    g.part("Argos L-band antenna","cylinder","Pale reflector coating",(.15,.15,.095),(-.18,-.573,.37),tilt_x(HALF_PI))
    g.rod("Argos UHF antenna",(.32,-.54,-.48),(.32,-1.35,-.48),.076,"Silver thermal panel")
    g.part("X-band antenna","cylinder","Pale reflector coating",(.22,.22,.095),(-.18,-.573,-.44),tilt_x(HALF_PI))
    g.inspection_camera("argos-antenna","Argos-3 antennas",(0,-.63,-.12),(.48,-1,.27),.84)
    g.inspection_camera("altika","AltiKa reflector",(0,.12,1.19),(.5,-.56,1),.69)


def oceansat(g):
    bus(g,2.0,1.85,1.76,GOLD)
    symmetric_wings(g,2.0,11.7,1.72,2,z=-.18,material="C-class violet cells")
    g.part("Ocean sensor tower","foil-box",SILVER,(1.42,.92,1.72),(0,.30,1.70))
    g.part("Instrument radiator","foil-box","Silver radiator mosaic",(1.47,.10,1.35),(0,.76,1.72))
    g.part("SCAT-3 rotating mount","cylinder","Equipment panels",(.65,.65,.38),(0,.12,2.65),sides=36)
    reflector(g,"SCAT-3 scatterometer",0,.06,2.82,1.18,-.55)
    optic(g,"Ocean colour monitor",-.46,-.47,.89,.58,.48)
    optic(g,"Sea surface temperature monitor",.43,-.46,.89,.48,.43)
    g.rod("Argos-4 antenna",(.80,-.75,.81),(.82,-1.40,1.15),.09,"Pale reflector coating")
    antenna_view(g,(.70,-.84,.93),.82,"Argos-4 payload area")
    g.inspection_camera("scatterometer","SCAT-3 scatterometer",(0,0,2.91),(.48,-.69,1),.88)


def adeos(g):
    bus(g,4,5.35,3.0,GOLD)
    for s in (-1,1):
        g.part("Service equipment bay","foil-box",SILVER,(1.45,2.10,1.06),(s*1.04,-1.46,1.70))
    # JAXA shows a single unfurlable 24 m paddle, with narrow blanket divisions.
    g.rod("Solar paddle hinge",(1.91,0,-.31),(2.0,0,-.31),.30)
    array(g,2.0,26.0,3.0,24,z=-.31,tilt=.20,material="C-class violet cells")
    # The AMSR scanning reflector is on the oblique drum, opposite the Earth deck.
    g.part("AMSR scanner drum","cylinder","Silver thermal panel",(1.36,1.36,.75),(-.62,.90,-1.78),sides=40)
    reflector(g,"AMSR scanning reflector",-.62,.90,-2.08,2.0,2.58)
    reflector(g,"SeaWinds reflector",.55,.47,1.48,1.05,.45)
    g.rod("Inter-orbit antenna mast",(-1.25,-.95,-1.46),(-1.25,-.95,-2.85),.16)
    reflector(g,"Inter-orbit communications antenna",-1.25,-.95,-2.83,.97,2.18)
    optic(g,"Global Imager",-.64,-1.55,2.24,.83,.82)
    optic(g,"POLDER",.88,-1.25,2.24,.51,.50)
    g.rod("Argos DCS antenna",(-1.81,-2.33,.46),(-1.81,-2.83,1.30),.09,"Pale reflector coating")
    antenna_view(g,(-1.66,-2.26,.94),1.12,"Argos data collection antenna")
    g.inspection_camera("amsr","AMSR reflector",(-.62,.90,-2.1),(.40,-.65,-1),1.42)


def metop(g, hirs):
    # Long service and payload modules extend from the solar wing toward -X.
    bus(g,2.05,2.66,2.60,GOLD,(1.98,0,0))
    bus(g,3.96,2.72,2.55,SILVER,(-1.02,0,0))
    g.rod("Solar array yoke",(3.0,0,0),(3.3,0,0),.19)
    array(g,3.3,14.6,3.04,5,tilt=.21,material="C-class blue cells")
    # Two groups of three fan-beam antennas point fore, mid and aft.
    for side in (-1,1):
        for j,ang in enumerate((-.57,0,.57)):
            x=1.30+j*.50
            end=(x+1.13*math.sin(ang),side*(1.30+1.82*math.cos(ang)),.25)
            g.rod("ASCAT support",(x,side*1.24,.18),end,.075)
            rotation=(0,0,math.sin(-side*ang/2),math.cos(ang/2))
            g.part("ASCAT fan-beam antenna","foil-box","Silver radiator mosaic",(.29,1.82,.105),
                   ((x+end[0])/2,side*(1.30+.91*math.cos(ang)),.33),rotation)
    optic(g,"IASI sounder",-1.73,.54,1.30,.98,.80)
    optic(g,"GOME-2",-.35,-.55,1.30,.70,.66)
    optic(g,"AVHRR",.12,.49,1.30,.51,.57)
    if hirs: optic(g,"HIRS-4",-.99,-.72,1.30,.46,.43)
    g.rod("Argos-3 antenna",(-2.35,-.96,1.22),(-2.35,-.96,1.90),.092,"Pale reflector coating")
    antenna_view(g,(-2.07,-.72,1.54),1.02,"Argos-3 payload deck")
    g.inspection_camera("ascat","ASCAT antennas",(1.77,0,.26),(.20,-.61,1),3.30)


def poes(g, key):
    early=key=="tiros-n"
    advanced=key in ("noaa-atn","noaa-erbe")
    length=3.70 if early else 4.19
    width=1.90 if early or advanced else 1.88
    radius=width/2
    for name,frac,offset,mat in [("Equipment support module",.39,-.305,GOLD),
                                ("Instrument mounting platform",.34,.06,SILVER),("Reaction control module",.27,.365,GOLD)]:
        g.part(name,"station hull",mat,(width,width,length*frac),(0,length*offset,0),tilt_x(HALF_PI),12)
    for station in (-.43,-.11,.23,.46):
        g.part("Bus flange","thin annulus",ALLOY,(width*1.006,width*1.006,.045),
               (0,station*length,0),tilt_x(HALF_PI),32)
    # The aft ring carries repeated equipment packs. Forward instruments mount
    # on a separate flat platform above the faceted pressure-free bus.
    for i in range(6):
        a=i*math.tau/6
        g.part("Aft equipment pack","foil-box",SILVER,(.45,.37,.13),
               (radius*.98*math.sin(a),length*.38,radius*.98*math.cos(a)),
               (0,math.sin(a/2),0,math.cos(a/2)))
    g.part("Instrument mounting tray","foil-box",SILVER,(width*.83,length*.61,.16),(0,-length*.14,.79))
    span=4.90 if early else (8.0 if advanced or key=="noaa-klm" else 8.02)
    panel_length = span-width-(.17 if early or advanced or key=="noaa-klm" else 0)
    root=span-radius-panel_length
    g.rod("Solar array drive",(radius*.88,length*.32,0),(root,length*.32,0),.13)
    array(g,root,span-radius,1.70 if early else 2.73,3 if early else 4,y=length*.32,tilt=.30,material="C-class blue cells")
    g.part("Instrument sun shield","foil-box","Silver thermal panel",(width*.92,.065,width*.81),(0,-length*.49,.46))
    optic(g,"AVHRR scanning radiometer",-.14,-.30*length,.80,.64,.63)
    optic(g,"Infrared sounder",.25,.07*length,.84,.43,.50)
    for j in range(3):
        g.part("Thermal louver panel","foil-box","Silver radiator mosaic",(.03,.44,.47),
               (-radius,(j-1)*length*.25,-.02))
    if key=="noaa-erbe":
        optic(g,"ERBE scanner",-.46,.43,.81,.39,.39)
        optic(g,"ERBE nonscanner",.30,.78,.80,.31,.34)
    if not (early or advanced):
        for j in range(3):
            x=-.56+.51*j
            g.part("Thermal control pinwheel","cylinder","Silver thermal panel",(.39,.39,.04),(x,-.10,-.77),sides=28)
        g.rod("Telemetry antenna boom",(-.61,-length*.14,.67),(-.78,-length*.18,1.26),.038)
        g.part("Telemetry antenna head","cylinder","Equipment panels",(.16,.16,.18),(-.78,-length*.18,1.33),sides=16)
        optic(g,"AMSU-A",-.44,-.07,.84,.42,.57)
        optic(g,"AMSU-B" if key=="noaa-klm" else "Microwave Humidity Sounder",.38,-.64,.83,.32,.42)
    x,y=.58,.29*length
    g.rod("Data collection antenna",(x,y,.63),(x,y,1.27),.050,"Pale reflector coating")
    if key=="noaa-n-prime":
        g.rod("Deployable advanced DCS antenna",(-.55,.37*length,.65),(-.63,.41*length,1.58),.065,"Pale reflector coating")
    antenna_view(g,(0,y,1.0),1.04,"Data collection antenna deck")
    g.inspection_camera("avhrr","AVHRR radiometer",(-.14,-.30*length,1.02),(.36,-.46,1),.54)


def spacecraft(g,profile):
    key=profile["appearance"]["configuration"]
    if key.startswith("kineis-"):
        kineis(g,key=="kineis-ais")
    elif key.startswith("metop-"):
        metop(g,key=="metop-ab")
    elif key.startswith("noaa-") or key=="tiros-n":
        poes(g,key)
    else:
        {"adeos-ii":adeos,"oceansat-3":oceansat,"saral":saral,"angels":angels,"gazelle":gazelle}[key](g)
