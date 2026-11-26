"""Flight references and assignments for SES spacecraft with previously unreviewed exteriors."""
from copy import deepcopy

GCAT = "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv"
GALLERY = "https://www.ses.com/media-library/satellite-rendering"
OSC = "https://sky-brokers.com/wp-content/uploads/2020/12/Datasheet-SES-"
SES1 = OSC+"12-3-Satellite-built-by-OSC.pdf"
SES8 = OSC+"8-Satellite-built-by-OSC.pdf"
NSS9 = OSC+"NSS-9-Satellite-built-by-OSC.pdf"
GOLD = "https://gold.cs.ucf.edu/science-mission/gold-instrument/"
ASTRA1P = "https://www.thalesaleniaspace.com/en/press-releases/astra-1p-communications-satellite-successfully-launched"
SES10 = "https://www.airbus.com/en/newsroom/press-releases/2017-03-airbus-built-satellite-ses-10-successfully-launched"
SES11 = "https://www.airbus.com/en/newsroom/press-releases/2017-09-airbus-ships-echostar-105ses-11-telecom-satellite-to-launch-base"
GOVSAT = "https://govsat.lu/news-events/ses-orders-new-satellite-in-joint-venture"
PROTOSTAR = "https://www.ilslaunch.com/wp-content/uploads/2018/09/ProtoStar-II-MO-final.pdf"
# Mission model directory and observed orbital regime are independent for these two records.
OTHER_REGIMES = {21989: "OTHER", 43178: "UNKNOWN"}
REUSED = "geo/amc-21-geostar.glb"


def artwork(slug):
    return "https://space.skyrocket.de/doc_sdat/"+slug+".htm"


def pair(diameter, breadth=None, offset=1.05):
    minor = breadth or diameter
    return [(0,-offset,.30,diameter,minor,15),(0,offset,.30,diameter,minor,-15)]


def profile(name, bus, numbers, size, sources, description, note, design, appearance):
    length,width,span = size
    references = list(dict.fromkeys([*sources, GCAT]))
    return {"name":name, "description":description, "family":bus, "design":design,
            "shape":"Telescoping solar drum and despun antenna" if design == "ses-spinner"
                    else "Equipment bus, two deployed solar wings and communications antennas",
            "meta":{"bus":bus,"geometry":{"body_length_m":length,"body_width_m":width,
                                          "span_m":span,"glb_units":"m","center_model":False},
                    "references":references,"reference_status":"Illustrated design",
                    "dimension_note":note+" Reflector mounting positions, small fittings and finishes are reconstructed."},
            "appearance":appearance, "norad":numbers}


def wings(name, bus, numbers, size, sources, description, note, rows, bank,
          platform="Eurostar", blanket="Gold multilayer insulation", radiator="Dark radiator glass",
          face="White reflector coating", cells="Indigo photovoltaic cells", **details):
    appearance = {"platform":platform,"blanket":blanket,"radiator":radiator,"face":face,
                  "back":"Reflector thermal foil","cells":cells,"wingRows":rows,"bank":bank,
                  "previewDirection":[.28,-.67,.94],"previewUp":[0,.8,.6], **details}
    return profile(name,bus,numbers,size,sources,description,note,"ses-winged",appearance)


def spinner(name,numbers,height,dish,source,description,bus="Hughes 376HP",**details):
    return profile(name,bus,numbers,(height,2.16,height),[artwork(source)],description,
                   "The catalog height is the fully deployed envelope including the raised antenna. "
                   "The 2.16 m nominal drum diameter and relative skirt heights follow Hughes' design.",
                   "ses-spinner",{"diameter":dish,"face":"Satin reflector face","cells":"Solar cells",
                                  "previewDirection":[.62,.15,.92],"previewUp":[0,1,0],**details})


# Stations along each wing give the number of panels abreast. Reflector positions
# use body-relative coordinates followed by the estimated aperture axes in metres and tilt in degrees.
LONG = [1,1,1,1,1]
FOUR = [1,1,1,1]
THREE = [1,1,1]
SILVER = "Silver multilayer insulation"
GLASS = "Silver radiator mosaic"
EOR = [(-.49,-1.12,.23,2.24,2.15,20),(.45,-1.04,.40,1.81,1.71,13),
       (-.53,1.06,.35,2.03,1.95,-16),(.42,1.24,.28,2.75,2.59,-23),
       (-.36,-.72,-.35,1.52,1.46,37),(.36,-.74,-.37,1.40,1.30,40),
       (-.30,.76,-.28,1.65,1.55,-33)]
ASTRA2 = [(-.49,-1.13,.27,2.8,2.63,16),(.48,-1.09,.23,2.55,2.40,22),
          (-.49,1.10,.32,2.95,2.85,-18),(.48,1.14,.24,2.80,2.68,-13)]
ENVELOPE = "The model uses the GCAT flight envelope. Array stations and aperture sizes are visual estimates."
PROFILES = {
    "govsat-1": wings("SES-16 / GovSat-1","GEOStar-3",[43178],(3,2.1,22),
        [GALLERY,artwork("ses-16"),GOVSAT],
        "Orbital ATK's GovSat-1 with silver radiator walls, dark antenna faces and straight solar wings.",
        "The 22 m deployed span is a catalog estimate. Only externally visible fittings are represented.",
        FOUR,[(-.21,-1.04,.29,1.82,1.68,22),(.31,1.10,.28,2.03,1.75,-21),
              (-.22,-.61,-.23,1.24,1.14,38),(.24,.68,-.23,1.20,1.11,-36)],
        platform="GEOStar",blanket=SILVER,radiator=GLASS,face="Graphite",wingAngle=18),
    "nss-k": wings("NSS-K / Intelsat K","GE Astro Space AS-5000",[21989],(2.9,2.3,21.5),
        [artwork("intelsat-k")],"Intelsat's deployed NSS-K illustration shows a gold bus, open wing yokes and a prominent single inclined antenna.",
        "GCAT marks all three envelope dimensions as estimates. The visible Ku-band aperture follows the operator's artwork.",
        FOUR,[(0,.87,.43,1.93,1.41,-30)],platform="Spacebus",radiator="Blue thermal tiles",wingAngle=16),
    "ses-6": wings("SES-6","Eurostar E3000",[39172],(7.7,3.3,39.8),[artwork("ses-6")],
        "Astrium's SES-6 has a long insulated bus and a mixed-size reflector bank, including lower apertures.",
        ENVELOPE,LONG,[*ASTRA2,(-.36,-.75,-.27,1.85,1.60,35),(.24,.85,-.34,2.02,1.83,-29)],
        busFraction=.73),
    "ses-7": wings("SES-7 / ProtoStar II","Boeing 601HP",[34941],(4.1,3.6,26),
        [PROTOSTAR,artwork("indostar-2_protostar-2")],
        "The Boeing ProtoStar II illustration shows two large outboard reflectors, two smaller apertures and a silver two-section bus.",
        ENVELOPE,FOUR,[*pair(2.40,2.26),(-.30,-.42,.58,1.11,1.08,13),(.30,.42,.58,1.09,1.06,-14)],
        platform="601",blanket=SILVER,radiator=GLASS,wingAngle=13),
    "ses-8": wings("SES-8","Orbital STAR-2.4",[39460],(4.3,2.3,18),[SES8,artwork("ses-8")],
        "Two superelliptical deployable antennas flank the fixed deck antenna and four-panel solar wings.",
        "Orbital specifies 2.5 × 2.7 m deployable shells and a 1.45 m deck aperture. The 18 m span comes from GCAT.",
        FOUR,[*pair(2.7,2.5,1.10),(0,0,.62,1.45,1.45,10)],platform="GEOStar",blanket=SILVER,
        radiator=GLASS,face="Silver thermal panel",superelliptical=[0,1],wingAngle=23),
    "ses-10": wings("SES-10","Eurostar E3000",[42432],(7,3.3,35),[GALLERY,SES10,artwork("ses-10")],
        "An asymmetric bank of large and small antennas surrounds SES-10's insulated bus. One wing carries a trim flap.",
        ENVELOPE,FOUR,[(-.23,-1.18,.33,3.10,2.72,19),(.44,-.72,-.29,1.15,1.0,40),
                       (.08,1.15,.40,3.27,2.85,-15),(.60,.76,.24,1.57,1.42,-22),(-.32,.68,-.32,1.28,1.15,-37)],
        trimFlap=True),
    "ses-11": wings("SES-11 / EchoStar 105","Eurostar E3000",[42967],(7,3.3,35),[SES11,GALLERY,artwork("echostar-105-ses-11")],
        "Airbus's EchoStar 105 / SES-11 illustration shows two prominent side reflectors, a small lower aperture and a solar trim flap.",
        ENVELOPE,FOUR,[*pair(2.84,2.59),(.18,-.56,-.33,1.10,.92,29)],trimFlap=True,busFraction=.71),
    "ses-12": wings("SES-12","Eurostar E3000 electric",[43488],(5.4,3,39.3),[artwork("ses-12")],
        "SES-12's stacked multi-aperture payload sits between two long solar wings above the electric propulsion arms.",
        "Airbus's rendering and the mission description distinguish eight antennas. The scale is the estimated GCAT envelope.",
        LONG,[*EOR,(.36,.79,-.38,1.52,1.38,-31)],trimFlap=True,electricArms=True),
    "ses-14": wings("SES-14 / GOLD","Eurostar E3000 electric",[43175],(5.4,3,39.3),[GALLERY,GOLD,artwork("ses-14")],
        "The SES-14 model follows the Airbus antenna layout and includes the two optical channels of the hosted GOLD instrument.",
        "GCAT supplies the envelope. GOLD's two-channel instrument is documented by the science team. Housing position and dimensions are approximate.",
        LONG,EOR,trimFlap=True,electricArms=True,goldInstrument=True),
    "ses-22": wings("SES-22","Spacebus 4000B2",[52933],(5,3.5,30),[artwork("ses-22"),"https://www.ses.com/press-release/ses-22-launch-june-29"],
        "Thales' SES-22 artwork shows opposed dark C-band apertures, an exposed pale radiator and two straight blue wings.",
        "GCAT marks the body dimensions and 30 m span as estimates.",THREE,pair(2.51,2.36),
        platform="Spacebus",radiator=GLASS,face="Carbon reflector",cells="Blue photovoltaic cells",wingAngle=13),
    "astra-1p": wings("Astra 1P / SES-24","Spacebus NEO",[60086],(8,3,45),[ASTRA1P,artwork("astra-1p")],
        "Four dark broadcast reflectors flank a white and gold spacecraft with broad cruciform solar wings.",
        "The 45 m span and stowed body envelope are GCAT estimates. The widened outer panel station follows Thales' deployed artwork.",
        [1,1,3,1],[(-.48,-1.02,.28,2.46,2.24,14),(.48,-1.04,.35,2.35,2.14,18),
                   (-.47,1.08,.31,2.50,2.23,-19),(.45,1.06,.30,2.30,2.15,-16)],
        platform="Spacebus",radiator=GLASS,face="Graphite",cells="Copper-traced photovoltaic cells",busFraction=.68),
    "nss-9": wings("NSS-9","Orbital STAR-2.4",[33749],(4.1,2.3,17.5),[NSS9,artwork("nss-9")],
        "Two short two-panel wings flank a silver bus with two shaped antennas and a global-beam horn.",
        "Orbital gives two 2.3 m shaped-beam reflectors and two solar panels per wing. The 17.5 m span is from GCAT.",
        [1,1],pair(2.3,2.3),platform="GEOStar",blanket=SILVER,radiator=GLASS,face="Silver thermal panel",
        superelliptical=[0,1],globalHorn=True,chordRatio=1.18),
    "astra-2e-2f-2g": wings("Astra 2E / 2F / 2G","Eurostar E3000",[39285,38778,40364],(6.8,2.8,39.8),
        [artwork("astra-2e"),"https://cdn.ymaws.com/www.worldteleport.org/resource/resmgr/ASTRA2G_launch_announcement-.pdf"],
        "The Astra 2 broadcast family shares the Astrium four-aperture layout and long, narrow solar wings.",
        "The 39.8 m envelope represents 2E and 2G. SES quotes a rounded 40 m span for 2G. Small inter-flight differences are unresolved.",
        LONG,ASTRA2,busFraction=.75),
    "astra-3c": wings("Astra 3C / Astra 5B","Eurostar E3000",[39617],(5.2,2.8,40),
        [artwork("astra-5b"),"https://space-agency.public.lu/dam-assets/old-website/publications/2024/luxembourgregistryofspaceobjects-v8-may2024.pdf"],
        "Astrium's Astra 5B illustration shows differently sized upper reflectors, a large lower antenna and smaller aft fittings.",
        "The Luxembourg registry identifies Astra 3C as the renamed Astra 5B. GCAT provides the 40 m envelope.",
        LONG,[(-.30,-1.07,.29,2.64,2.36,23),(.08,1.13,.38,2.77,2.42,-15),(.62,.84,.24,1.94,1.75,-26),
              (-.32,-.66,-.31,1.03,.92,40),(.20,.61,-.34,1.02,.94,-36)]),
    "yahsat-1a": wings("Al Yah 1 / Yahsat 1A","Eurostar E3000",[37393],(5.5,2.1,30.4),
        [artwork("yahsat-1a"),"https://www.ses.com/company/about-us/our-affiliates"],
        "Yahsat 1A carries large white reflectors around a gold bus with smaller offset apertures. YahLive uses its Ku-band payload.",
        ENVELOPE,FOUR,[(-.57,-1.20,.31,2.35,2.17,19),(.61,-.82,.20,1.36,1.25,24),
                      (-.62,1.17,.34,2.18,2.02,-16),(.64,.94,.24,1.65,1.55,-21),
                      (-.56,-1.02,-.31,1.77,1.54,33),(.51,1.06,-.29,2.18,1.99,-29)],depthRatio=1.37),
    "astra-1c-1d": wings("Astra 1C / 1D","Hughes 601",[22653,23331],(4.3,2.7,21),[artwork("astra-1c")],
        "Hughes' early Astra pair has three panels per wing and two outboard broadcast reflectors.",
        "The Hughes design spans 21 m across the wings and 7.4 m across the antennas.",THREE,pair(2.28,2.20,1.0),
        platform="601",blanket=SILVER,radiator=GLASS,face="Silver thermal panel",wingAngle=22),
    "astra-1e-1f": wings("Astra 1E / 1F","Hughes 601",[23686,23842],(4.5,2.8,26),[artwork("astra-1e")],
        "A pair of large reflectors flanks the Hughes broadcast bus. The extended wings have four panels each.",
        "Hughes describes four panels per wing and a 26 m deployed span.",FOUR,pair(2.33,2.30,1.06),
        platform="601",blanket=SILVER,radiator=GLASS,face="Silver thermal panel",wingAngle=22),
    "astra-601hp": wings("Astra 1G / 1H / 2A / 2C","Hughes 601HP",[25071,25785,25462,26853],(4,3.2,26.2),[artwork("astra-1g")],
        "Two large contoured reflector systems and four-panel solar wings characterize the Astra high-power 601 family.",
        "The envelope represents Astra 2A. Relative panel proportions and offset feed assemblies follow the Hughes/Boeing family illustration.",
        FOUR,pair(2.68,2.52,1.0),platform="601",blanket=SILVER,radiator=GLASS,
        face="Satin reflector face",cells="Teal photovoltaic strings",wingAngle=14),
    "astra-2b": wings("Astra 2B","Eurostar E2000+",[26494],(2.8,2.5,32),[artwork("astra-2b")],
        "Astrium's Astra 2B has a dark wing flap and a gold bus with two conspicuous white side reflectors and a smaller deck aperture.",
        ENVELOPE,LONG,[*pair(2.05,1.83),(.08,-.05,.69,1.04,.88,17)],trimFlap=True),
    "astra-2d-3a": spinner("Astra 2D / 3A",[26638,27400],8,2.05,"astra-2d",
        "A tall blue telescoping solar drum supports a raised, despun broadcast reflector and a silver thermal belt."),
    "sirius-3": spinner("Sirius 3",[25492],7.8,2,"sirius-3",
        "An octagonal shaped broadcast reflector sits above a telescoping solar drum with a metallic belt.",
        sides=8,face="Graphite",cells="Teal photovoltaic strings"),
    "sirius-w": spinner("Sirius W / Marcopolo 1",[20193],7.2,2.23,"marco-polo",
        "The deployed BSB spacecraft has a raised silver reflector, a broad metallic belt and a long blue solar skirt.",
        bus="Hughes 376",face="Silver thermal panel"),
    "sirius-2": wings("Astra 5A / Sirius 2","Spacebus 3000B2",[25049],(3.5,2.3,29),[artwork("sirius-2")],
        "Three forward and side white reflectors frame the compact gold and silver Sirius 2 bus. Each wing has four panels.",
        ENVELOPE,FOUR,[*pair(1.84,1.79),(.32,.04,.73,1.43,1.38,13)],
        platform="Spacebus",radiator=GLASS,cells="Blue photovoltaic cells",wingAngle=13),
    "satcom-c": wings("Satcom C1 / C3 / C4","GE Astro Space AS-3000",[20945,22117,22096],(1.6,1.3,15.1),
        [artwork("satcom-5")],"One offset C-band aperture and a projecting feed sit beside the gold body between two narrow three-panel wings.",
        "The shared Advanced Satcom configuration uses a representative 15.1 m span. GCAT lists 15.7 m for C1 and 14.3 m for C4.",
        THREE,[(0,-.89,.33,1.58,1.27,25)],platform="Spacebus",radiator="Graphite",wingAngle=12),
    "spacenet-4": wings("Spacenet 4 / ASC 2","GE Astro Space AS-3000",[21227],(1.6,1.3,14.1),[artwork("asc-1")],
        "GE's ASC 2 artwork shows a broad offset antenna over a smaller aperture and rectangular blue solar wings.",
        "The ASC design has a 1 × 1.3 × 1.6 m body and 14.1 m deployed span.",THREE,
        [(.02,-.90,.30,1.51,1.04,34),(-.15,.06,.69,.68,.55,16)],depthRatio=1/1.3,
        platform="Spacebus",radiator="Graphite",wingAngle=26),
    "intelsat-va-nss": wings("NSS-513 / Columbia 515","Ford Aerospace Intelsat V-A",[19121,19772],(6.4,2,15.7),
        [artwork("intelsat-5a"),"https://docs.fcc.gov/public/attachments/DA-01-1426A1.pdf"],
        "The V-A communications tower carries multiple offset reflectors above a compact bus with narrow solar wings.",
        "The representative span is 15.7 m for NSS-513 and GCAT lists 15.9 m for Columbia 515. The tower geometry is an illustration estimate.",
        FOUR,[(-.30,-.90,.38,1.99,1.59,20),(.25,.90,.38,1.86,1.44,-22),
              (-.22,-.60,.73,1.10,1.02,30),(.20,.65,.74,1.04,.94,-28)],
        platform="Spacebus",radiator="Graphite",tower=True,busFraction=.49),
    "nahuel-1a": wings("Nahuel 1A","Spacebus 2000",[24714],(2.2,1.5,22.2),[artwork("nahuel-1")],
        "Nahuelsat's deployed illustration shows two similarly sized white antennas, open yokes and blue four-panel wings.",
        ENVELOPE,FOUR,pair(1.85,1.65,1.19),platform="Spacebus",radiator="Blue thermal tiles",
        cells="Blue photovoltaic cells",wingAngle=18,chordRatio=1.24),
}

EXPORTS = {"geo/"+slug+".glb":slug for slug in PROFILES}
EXPORTS[REUSED] = "amc-21-ses-1"

FLIGHT_FACTS = {
    "21989": {"reference_name":"NSS-K / Intelsat K","source_name":"Intelsat spacecraft record",
              "source_url":artwork("intelsat-k"),"payload":"Ku-band communications"},
    "36516": {"source_name":"Orbital spacecraft data sheet","source_url":SES1,
              "payload":"C-band and Ku-band communications, two 2.3 m deployable reflectors"},
    "33749": {"source_name":"Orbital spacecraft data sheet","source_url":NSS9,
              "manufacturer":"Orbital Sciences Corporation","launch_mass_kg":2230,
              "payload":"28 active C-band transponders, two shaped-beam reflectors and a global horn"},
    "39460": {"source_name":"SpaceX launch press kit","source_url":"https://spaceflightnow.com/falcon9/007/ses8_presskit.pdf",
              "manufacturer":"Orbital Sciences Corporation","launch_mass_kg":3138,"payload":"Hybrid Ku-band and Ka-band communications"},
    "42432": {"source_name":"Airbus Defence and Space","source_url":SES10,
              "manufacturer":"Airbus Defence and Space","launch_mass_kg":5300,"payload":"Ku-band communications"},
    "42967": {"source_name":"Airbus post-launch handover","manufacturer":"Airbus Defence and Space",
              "source_url":"https://www.airbus.com/en/newsroom/press-releases/2017-11-airbus-built-echostar-105ses-11-satellite-now-in-geostationary",
              "launch_mass_kg":5200,"reference_name":"EchoStar 105 / SES-11","payload":"Ku-band EchoStar 105 and C-band SES-11 payloads"},
    "43175": {"source_name":"GOLD science team","source_url":GOLD,"payload":"Communications and the hosted GOLD far-ultraviolet imaging spectrograph"},
    "43178": {"reference_name":"GovSat-1 / SES-16","source_name":"LuxGovSat","source_url":GOVSAT,"payload":"X-band and Ka-band communications"},
    "39617": {"reference_name":"Astra 3C / formerly Astra 5B","source_name":"Luxembourg Space Agency",
              "source_url":"https://space-agency.public.lu/dam-assets/old-website/publications/2024/luxembourgregistryofspaceobjects-v8-may2024.pdf"},
    "60086": {"reference_name":"Astra 1P / SES-24","source_name":"Thales Alenia Space","source_url":ASTRA1P,"payload":"80 Ku-band transponders"},
}


def assign(profiles, eligible):
    """Overlay by flight ID after bus grouping, preserving previously reviewed family geometry."""
    targets = {number:"geo/"+slug+".glb" for slug,p in PROFILES.items() for number in p["norad"]}
    targets[36516] = REUSED
    for asset,p in list(profiles.items()):
        original = p["norad"]
        p["norad"] = [n for n in original if n not in targets or targets[n] == asset]
        if original and not p["norad"]:
            del profiles[asset]
    if 36516 in eligible:
        shared = profiles[REUSED]
        shared["norad"] = sorted(set(shared["norad"]) | {36516})
        shared["name"] = "AMC-21 / SES-1"
        shared["appearance"]["reflectorInspection"] = True
        shared["meta"].setdefault("flight_references",{})[SES1] = [36516]
    for slug, template in PROFILES.items():
        members = sorted(set(template["norad"]).intersection(eligible))
        if members:
            p = deepcopy(template)
            p["norad"] = members
            profiles["geo/"+slug+".glb"] = p
