"""Galileo flight exteriors in metres. Model +X follows IGS +Y and +Z faces Earth."""
import math

if __package__:
    from .geo_geometry import tilt_x
else:
    from geo_geometry import tilt_x

IGS = "https://igs.org/mgex/constellations/#Galileo"
SINEX = "https://files.igs.org/pub/station/general/igs_satellite_metadata.snx"
GSC = "https://www.gsc-europa.eu/support-to-developers/galileo-satellite-metadata"
PROGRAMME = "https://www.gsc-europa.eu/galileo/programme"
SAR = "https://www.gsc-europa.eu/system-service-status/sar-information"
ILRS = "https://ilrs.gsfc.nasa.gov/missions/satellite_missions/current_missions/ga18_reflector.html"
GIOVE = "https://www.esa.int/esapub/br/br251/br251.pdf"
GIOVE_LRA = "https://ilrs.gsfc.nasa.gov/docs/ESA-EUING-TN-10206_Issue_3.2.pdf"
ANTENNAS = "https://doi.org/10.1007/s00190-016-0909-6"
SSTL = "https://www.esa.int/esapub/bulletin/bulletin127/bul127i_benedicto.pdf"
FOC_PHOTOS = "https://www.esa.int/articles/about-us/directorates/resilience-navigation-and-connectivity/navigation/galileo/galileo-satellites"
GIOVE_A_ANTENNA = "https://web.stanford.edu/group/scpnt/gpslab/pubs/theses/RamakrishnanThesis_2018.pdf"
CATALOG_ORBITS = {40128:"HEO", 40129:"HEO"}

# Keep the four published GLB paths. The 2012 IOV pair needs its own SAR hardware.
ASSETS = {
    "giove-a":"meo/ref-sstl-600-28922.glb",
    "giove-b":"meo/ref-proteus-32781.glb",
    "galileo-iov":"meo/galileo-iov.glb",
    "galileo-iov-sar":"meo/galileo-iov-sar.glb",
    "galileo-foc":"meo/galileo-foc.glb",
}
EXPORTS = {asset:variant for variant, asset in ASSETS.items()}
NAMES = {
    "giove-a":"Galileo GIOVE-A", "giove-b":"Galileo GIOVE-B",
    "galileo-iov":"Galileo IOV (2011 pair)", "galileo-iov-sar":"Galileo IOV (2012 SAR pair)",
    "galileo-foc":"Galileo FOC",
}
# X, Y, Z box dimensions in the spacecraft frame. GIOVE figures are stowed
# envelopes. GIOVE-B's span is reconstructed from ESA's wing length and bus width.
DIMENSIONS = {
    "giove-a":(1.80,1.30,1.65,9.6), "giove-b":(.95,.95,2.40,9.63),
    "iov":(2.611,1.149,1.149,14.5), "foc":(2.53,1.2,1.1,14.67),
}
BUILDERS = {
    "giove-a":"Surrey Satellite Technology Ltd (SSTL)",
    "giove-b":"Galileo Industries consortium, led by Astrium",
    "iov":"EADS Astrium (prime), with Thales Alenia Space",
    "foc":"OHB System AG (spacecraft), Surrey Satellite Technology Ltd (navigation payload)",
}
DESCRIPTIONS = {
    "giove-a":"SSTL pathfinder with a squat silver bus, a copper-patch navigation antenna and two-panel solar wings.",
    "giove-b":"Galileo Industries pathfinder with a tall gold bus, a circular navigation array and four-panel solar wings.",
    "galileo-iov":"The 2011 IOV pair carries a 45-element navigation array and an 84-cube laser ranging reflector.",
    "galileo-iov-sar":"The 2012 IOV pair adds the search-and-rescue antenna beside the round-element navigation array.",
    "galileo-foc":"OHB's FOC spacecraft has a 28-patch navigation antenna, a search-and-rescue assembly and a 60-cube laser ranging reflector.",
}


def profile(variant, flights, epoch):
    bus = variant if variant.startswith("giove") else ("foc" if variant == "galileo-foc" else "iov")
    length, width, height, span = DIMENSIONS[bus]
    has_sar = variant in ("galileo-foc","galileo-iov-sar")
    image = {"giove-a":"GIO-A","giove-b":"GIO-B","iov":"GAL-IOV","foc":"GAL-FOC"}[bus]
    sources = [IGS, SINEX, "https://igs.org/wp-content/uploads/2020/08/Fig_BodyFrame_"+image+".jpg"]
    geo = {"glb_units":"m","center_model":False,"body_length_m":length,"body_width_m":width,
           "body_height_m":height,"span_m":span}
    if bus.startswith("giove"):
        sources.extend([GIOVE, GIOVE_LRA, SSTL if bus == "giove-a" else ANTENNAS])
        geo["body_dimension_label"] = "Stowed envelope (X × Y × Z)"
        if bus == "giove-a":
            sources.extend([GIOVE_A_ANTENNA,"https://www.esa.int/esapub/br/br250/br250.pdf#page=154"])
            note = "ESA BR-250 gives a 9.6 m total deployed span. Each wing has two 1.74 × 0.98 m leaves."
        else:
            geo["span_estimated"] = True
            note = "Adding two 4.34 m wings to the 0.95 m stowed bus width gives an estimated 9.63 m span. IGS gives about 10 m."
        note += " The published body dimensions are the stowed envelope. The bare bus and panel gaps are reconstructed."
    else:
        sources.extend([GSC, PROGRAMME, SAR, ILRS, ANTENNAS])
        if bus == "foc":
            sources.extend([FOC_PHOTOS,GIOVE_A_ANTENNA])
        geo["solar_area_per_wing_m2"] = 5.41
        note = (f"GSC gives the bare bus dimensions, a {span:g} m deployed span and two 5.000 × 1.082 m wings. "
                "The Earth deck uses the published navigation-to-laser reference offsets. The visible antenna elements follow the uncovered flight hardware.")
    note += " Yoke details, individual fasteners, surface finishes and solar-drive angle are illustrative."
    return {"name":NAMES[variant],"description":DESCRIPTIONS[variant],"family":"Galileo",
            "design":"galileo-navigation","shape":"Equipment bus with two solar wings",
            "meta":{"bus":{"giove-a":"SSTL GIOVE-A","giove-b":"GIOVE-B (PROTEUS-derived)",
                           "iov":"Galileo IOV","foc":"Galileo FOC"}[bus],
                    "manufacturer":BUILDERS[bus],"geometry":geo,"igs_epoch":epoch,"references":sources,
                    "reference_status":"Illustrated design","dimension_note":note,
                    "payload":"Navigation technology demonstrator" if bus.startswith("giove") else
                              "Navigation and search-and-rescue repeater" if has_sar else "Navigation"},
            "appearance":{"bus":bus,"sar":has_sar,"previewDirection":[.38,-.68,1],
                          "previewUp":[0,.80,.60],"previewFov":33},
            "modelCredit":{"toScale":True,"source":IGS,"sources":[{"url":u} for u in sources]},
            "flights":flights,"norad":sorted(map(int,flights))}


def wings(g, bus, width, span):
    leaf, chord, count, cells = {
        "giove-a":(1.74,.98,2,"C-class violet cells"),
        "giove-b":(.8,1.5,4,"Indigo photovoltaic cells"),
        "iov":(2.5,1.082,2,"Copper-traced photovoltaic cells"),
        "foc":(2.5,1.082,2,"Indigo photovoltaic cells"),
    }[bus]
    angle = math.radians(20)
    rotation = tilt_x(angle)
    def position(x,y,z):
        return (x,y*math.cos(angle)-z*math.sin(angle),y*math.sin(angle)+z*math.cos(angle))
    for side in (-1,1):
        axis = side*width/2
        root = side*(span/2-count*leaf)
        g.rod("Solar array drive bearing",(axis-side*.04,0,0),(axis+side*.12,0,0),.18)
        g.rod("Solar array boom",(axis,0,0),(root,0,0),.065)
        for edge in (-1,1):
            g.rod("Wing yoke brace",(root-side*.22,0,0),position(root,edge*chord*.42,0),.036)
        for station in range(count):
            x = root + side*(station+.5)*leaf
            g.part("Solar array leaf","box","Array backsheet",(leaf-.008,chord,.026),position(x,0,0),rotation)
            for strip in (-1,1):
                g.part("Photovoltaic laminate","panel",cells,(leaf-.036,chord*.47,.001),
                       position(x,strip*chord*.247,.014),rotation)
                g.part("Rear stiffener","box","Structural alloy",(leaf-.02,.012,.018),
                       position(x,strip*chord*.34,-.022),rotation)
            rail = "Warm gold deck tile" if bus in ("giove-a","iov") else "Equipment panels"
            g.part("Solar blanket centre strip","box",rail,(leaf-.012,chord*.034,.006),
                   position(x,0,.016),rotation)
            for segment in (-1,1):
                g.part("Array hold-down fitting","cylinder","Graphite",(.048,.048,.010),
                       position(x+segment*leaf*.25,0,.023),rotation,12)
            if bus=="giove-b":
                for end in (-1,1):
                    for side_edge in (-1,1):
                        g.part("Rear wiring connector","box","Champagne deck tile",(.13,.18,.018),
                               position(x+end*leaf*.35,side_edge*chord*.28,-.027),rotation)
            if station:
                for edge in (-1,1):
                    g.part("Panel hinge","box","Gold thermal foil",(.08,.07,.04),
                           position(x-side*leaf/2,edge*chord*.43,0),rotation)


def bus_structure(g,bus,length,width,height):
    pathfinder = bus.startswith("giove")
    thermal = {"giove-a":"Silver multilayer insulation","giove-b":"Gold multilayer insulation"}.get(bus,"Black multilayer insulation")
    # GIOVE's published Z envelope includes the navigation assembly.
    h = height - ({"giove-a":.18,"giove-b":.32}.get(bus,0))
    g.part("Insulated spacecraft body","foil-box",thermal,(width,length,h))
    for side in (-1,1):
        x = side*(width/2+.009)
        for station in range(3):
            y = (station-1)*length*.30
            g.part("Optical radiator bay","foil-box","Silver radiator mosaic",
                   (.022,length*.28,h*(.52 if pathfinder else .71)),(x,y,.02*h))
            for z in (-1,1):
                g.part("Radiator corner bracket","box","Structural alloy",(.032,.045,.048),
                       (x+side*.012,y+length*.117,z*h*.24))
        for end in (-1,1):
            g.part("Body corner rail","box","Equipment panels",(.025,.025,h*.97),
                   (side*width*.495,end*length*.493,0))
    g.part("Launch interface ring","annulus","Structural alloy",(width*.78,width*.78,.065),(0,0,-h/2-.03),sides=48)
    for end in (-1,1):
        for side in (-1,1):
            g.part("Deck mounting lug","box","Equipment panels",(.066,.072,.052),
                   (side*width*.44,end*length*.46,h/2+.017))
    return h/2


def antenna(g,bus,center,diameter):
    x,y,z = center
    square = bus in ("foc","giove-a")
    assembly = "Graphite" if square else "Satin reflector face"
    g.part("L-band navigation antenna carrier","cylinder",assembly,(diameter,diameter,.075),(x,y,z),sides=72)
    g.part("Antenna retaining rim","thin annulus","Gold thermal foil" if bus=="foc" else "Structural alloy",
           (diameter,diameter,.015),(x,y,z+.039),sides=72)
    if square:
        if bus == "foc":
            quadrant = [(.14,.14),(.35,.16),(.16,.35),(.81,.16),(.16,.81),(.75,.49),(.49,.75)]
            points = [(x+sx*a*diameter/2,y+sy*b*diameter/2)
                      for sx in (-1,1) for sy in (-1,1) for a,b in quadrant]
        else:
            points = [(x+radius*diameter/2*math.cos((i+.5)*math.tau/n),
                       y+radius*diameter/2*math.sin((i+.5)*math.tau/n))
                      for n,radius in ((4,.16),(12,.48),(20,.84)) for i in range(n)]
        step=diameter*(.085 if bus=="foc" else .083)
        metal = "Gold thermal foil" if bus=="foc" else "Copper navigation patch"
        for px,py in points:
            g.part("L-band patch substrate","box","Equipment panels",(step*1.10,step*1.10,.011),(px,py,z+.047))
            g.part("L-band radiating element","box",metal,(step,step,.012),(px,py,z+.061))
    else:
        rows = (4,6,7,8,7,6,4) if bus=="giove-b" else (4,7,7,9,7,7,4)
        pitch = diameter/(max(rows)+.48)
        for r,number in enumerate(rows):
            for c in range(number):
                px = x+(c-(number-1)/2)*pitch
                py = y+(r-(len(rows)-1)/2)*pitch*(1.02 if bus=="giove-b" else 1.08)
                g.part("L-band radiating element","cylinder","Ivory radome",(pitch*.84,pitch*.84,.024),(px,py,z+.054),sides=20)
                cap = "Silver thermal panel" if bus=="giove-b" else "Champagne deck tile"
                g.part("Stacked patch centre","cylinder",cap,(pitch*.45,pitch*.45,.010),(px,py,z+.070),sides=16)


def ranging(g,bus,center):
    x,y,z = center
    # ILRS publishes optical diameters for the flight reflectors. Tray footprints
    # and the unmeasured spacing between cells are separate from optical diameter.
    rows,pitch,diameter = {
        "giove-a":((6,8,8,8,8,8,8,8,8,6),.031,.027),
        "giove-b":((5,7,8,9,9,9,8,7,5),.031,.027),
        "iov":((6,8,9,10,9,9,10,9,8,6),.038,.033),
        "foc":((6,8,8,8,8,8,8,6),.035,.0282),
    }[bus]
    w = .305 if bus=="giove-b" else (max(rows)+.9)*pitch
    h = .305 if bus=="giove-b" else (len(rows)+.8)*pitch
    g.part("Laser retroreflector tray","box","Structural alloy",(w,h,.037),(x,y,z-.019))
    for r,n in enumerate(rows):
        for c in range(n):
            p=(x+(c-(n-1)/2)*pitch,y+(r-(len(rows)-1)/2)*pitch,z+.003)
            g.part("Laser corner cube","corner-cube aperture","Reflector glass",(diameter,diameter,.012),p,sides=18)
    return max(w,h)


def rescue(g, bus, y, z):
    g.part("Search and rescue antenna base","foil-box","Silver multilayer insulation",(.77,.57,.06),(0,y,z))
    # The IOV assembly has an open braced frame around the centre element.
    if bus == "iov":
        for x in (-.34,.34):
            for off in (-.24,.24):
                foot = (x,y+off,z+.04)
                tip = (x*1.08,y+off*1.08,z+.37)
                g.rod("IOV SAR frame upright",foot,tip,.027)
                g.rod("IOV SAR diagonal brace",tip,(-x*.60,y+off*.60,z+.055),.023)
                g.rod("IOV SAR diagonal brace",tip,(x*.60,y-off*.60,z+.055),.023)
                g.part("SAR corner receiver","cylinder","Pale reflector coating",(.10,.10,.08),tip,sides=16)
        g.part("SAR central antenna","cylinder","Satin reflector face",(.22,.22,.22),(0,y,z+.15),sides=24)
        return
    # The FOC unit has four exposed helices around its central element.
    for x in (-.30,.30):
        for off in (-.20,.20):
            bottom = (x,y+off,z+.04)
            g.rod("SAR element support",bottom,(x,y+off,z+.30),.029)
            a = (x+.058,y+off,z+.05)
            for j in range(1,19):
                angle=j*math.tau/8
                b=(x+.058*math.cos(angle),y+off+.058*math.sin(angle),z+.05+.013*j)
                g.rod("SAR helical element",a,b,.013,"Gold thermal foil")
                a=b
    g.part("SAR central antenna","cylinder","Pale reflector coating",(.18,.18,.15),(0,y,z+.12),sides=24)


def spacecraft(g, p):
    bus = p["appearance"]["bus"]
    length,width,height,span = DIMENSIONS[bus]
    deck = bus_structure(g,bus,length,width,height)
    wings(g,bus,width,span)
    # Navigation-to-laser offsets projected onto the deck from GSC or IGS.
    # The mechanical and ANTEX frame signs differ on IOV and FOC.
    y,diameter,dx,dy,dz = {
        "giove-a":(0,1.50,.654,-.832,-.09),
        "giove-b":(0,1.30,-.2975,-.8075,-.02),
        "iov":(.07,1.40,.005,.9225,.0735),
        "foc":(-.12,1.30,.0275,-.843,-.09455),
    }[bus]
    z = deck + (.20 if bus=="giove-b" else .13)
    g.part("Navigation antenna pedestal","cylinder","Equipment panels",
           (diameter*.72,diameter*.72,z-deck),(0,y,(z+deck)/2),sides=40)
    antenna(g,bus,(0,y,z),diameter)
    target=(dx,y+dy,z+dz)
    # On the pathfinders the reflector overhangs a corner of the bus.
    for side in (-1,1):
        g.rod("Ranging tray bracket",(side*.12+dx*.55,y+dy*.55,deck),
              (dx+side*.105,y+dy,target[2]-.037),.023)
    tray_size = ranging(g,bus,target)
    if p["appearance"]["sar"]:
        rescue(g,bus,(-1 if bus=="iov" else 1)*length*.36,deck+.044)
    for side in (-1,1):
        g.part("Optical sensor housing","frustum","Graphite",(.115,.115,.125),
               (side*width*.425,.37*length,deck+.065),tilt_x(.24),16)
    g.inspection_camera("earth-deck","Earth-facing deck",(0,0,deck+.10),(.35,-.25,1),max(length,diameter)*.63)
    g.inspection_camera("navigation-antenna","Navigation antenna",(0,y,z),(.17,-.22,1),diameter*.65)
    g.inspection_camera("reflector-bank","Laser retroreflector",target,(.20,-.22,1),tray_size*.78)
    if p["appearance"]["sar"]:
        g.inspection_camera("search-rescue","Search and rescue antenna",(0,(-1 if bus=="iov" else 1)*length*.36,deck+.17),
                            (.30,-.42,1),.55)
