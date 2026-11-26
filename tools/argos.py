"""Environmental Argos flight assignments and illustrated exterior specifications."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOSTS = json.loads((ROOT/"data/argos-hosts.json").read_bytes())
CNES = "https://cnes.fr/en/projects/argos"
GCAT = "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv"
TIROS = "https://repository.library.noaa.gov/view/noaa/26767/noaa_26767_DS1.pdf"
POES = "https://www.ospo.noaa.gov/assets/pdf/NOAA_NP_Booklet.pdf"
ERBE = "https://pmc.ncbi.nlm.nih.gov/articles/PMC4597424/"
DCS = "https://space.oscar.wmo.int/instruments/view/argos"
DCS2 = "https://space.oscar.wmo.int/instruments/view/dcs_2"
METOP = "https://www.esa.int/Applications/Observing_the_Earth/Meteorological_missions/MetOp/Facts_figures"
METOP_LAYOUT = "https://cnes.fr/sites/default/files/migration/smsc/iasi/PDF/conf2/session1/Cohen.pdf"
MIDORI = "https://www.jaxa.jp/press/2003/11/20031107_midori2-01.pdf"
SARAL = "https://www.isro.gov.in/ISRO_EN/SARAL.html"
SARAL_LAYOUT = "https://cnes.fr/projets/saral-altika/satellite-instruments"
ANGELS = "https://cnes.fr/en/projects/angels"
ANGELS_LAYOUT = "https://cnes.fr/projets/argos/systeme"
GAZELLE = "https://www.nesdis.noaa.gov/news/argos-4-completes-latest-milestone-join-argos-fleet"
GAZELLE_PHOTOS = "https://www.nesdis.noaa.gov/imagery/media-stills-animation/argos-4-instrument-gallery"
OCEANSAT = "https://www.isro.gov.in/media_isro/pdf/Missions/PSLVC54/PSLVC54_EOS6_BrochureV4.pdf#page=5"
KINEIS = "https://kineis.com/wp-content/uploads/2024/03/2024_07mars_CP-Kineis_industrialisation_BD.pdf#page=3"
KINEIS_FLIGHTS = "https://publications.spaceops.org/2025/download.php?doc=484__tigy6qgl.pdf#page=3"
KINEIS_ANTENNAS = "https://www.hemeria-group.com/wp-content/uploads/2021/05/PR-210511-Three-impressive-antennas-for-the-Kin%C3%A9is-nanosatellites.pdf"

# Body length, width and representative deployed extent, in metres. A size
# qualified in the note remains qualified in the viewer and the OBJ archive.
SPECS = {
    "tiros-n":("TIROS-N / NOAA-A–D","TIROS-N","Argos data collection and AVHRR",(3.70,1.90,4.90),[TIROS,DCS,GCAT],
               "The early TIROS-N spacecraft use a single solar paddle and a scanning radiometer. GCAT provides the approximate body and deployed envelope."),
    "noaa-atn":("Advanced TIROS-N","Advanced TIROS-N","Argos data collection and weather instruments",(4.20,1.90,8.0),[TIROS,DCS,GCAT],
                "The enlarged equipment module and weather-instrument deck follow NOAA's Advanced TIROS-N family. The catalog's 8 m envelope is representative."),
    "noaa-erbe":("NOAA-9 / NOAA-10 with ERBE","Advanced TIROS-N","Argos and Earth Radiation Budget Experiment",(4.20,1.90,8.0),[TIROS,ERBE,DCS,GCAT],
                 "NOAA-9 and NOAA-10 carried both scanning and nonscanning ERBE instruments. Their compact external heads are illustrated on the instrument deck."),
    "noaa-klm":("NOAA-15 / 16 / 17","POES KLM","Argos-2, AVHRR/3 and microwave sounders",(4.19,1.88,8.0),[TIROS,DCS2,POES,GCAT],
                "The KLM weather platform has a single solar wing, AMSU-A and an AMSU-B humidity sounder. The total span follows the representative GCAT envelope."),
    "noaa-n":("NOAA-18","POES NOAA-N","Argos-2, AVHRR/3 and Microwave Humidity Sounder",(4.19,1.88,8.02),[POES,DCS2,CNES],
              "The late POES body is 4.19 m long and 1.88 m in diameter. The single 6.14 × 2.73 m wing sets the illustrated lateral extent. NOAA-18 carries Argos-2."),
    "noaa-n-prime":("NOAA-19","POES NOAA-N Prime","Argos-3, AVHRR/3 and Microwave Humidity Sounder",(4.19,1.88,8.02),[POES,CNES],
                    "NOAA's drawings identify a deployable advanced data collection antenna on NOAA-19. The bus measures 4.19 × 1.88 m and the single solar array measures 6.14 × 2.73 m."),
    "adeos-ii":("ADEOS-II / Midori II","ADEOS-II","Advanced Argos DCS, AMSR, SeaWinds, GLI, POLDER and ILAS-II",(6.0,4.0,28.0),[MIDORI,"https://www.eorc.jaxa.jp/AMSR/satellite/adeos-ii_ja.html",GCAT],
                "JAXA's flight layout gives an approximately 6 × 4 × 4 m envelope and a single 3 × 24 m solar paddle. The two microwave reflectors, separate inter-orbit terminal and DCS antenna are reconstructed from its deployment diagram."),
    "metop-ab":("Metop-A / Metop-B","Metop first generation","Argos-3, ASCAT, IASI and HIRS/4",(6.2,3.4,17.6),[METOP,METOP_LAYOUT,CNES],
                "ESA publishes the 6.2 × 3.4 × 3.4 m stowed envelope and 17.6 m deployed extent. The model shows the one-sided solar array, six ASCAT antenna faces and the HIRS/4 sounder on A and B."),
    "metop-c":("Metop-C","Metop first generation","Argos-3, ASCAT and IASI",(6.2,3.4,17.6),[METOP,METOP_LAYOUT,CNES],
               "Metop-C shares the 17.6 m first-generation exterior and its two ASCAT triplets. The HIRS/4 instrument flew on Metop-A and B only."),
    "saral":("SARAL / AltiKa","IMS-2","Argos-3 and AltiKa radar altimeter",(2.7,1.0,4.0),[SARAL,SARAL_LAYOUT,GCAT],
             "The AltiKa reflector, separate Argos UHF and L-band antennas, DORIS, ranging reflector and opposed wings follow CNES's labelled drawing. The approximate deployed span is from SARAL's GCAT record."),
    "angels":("ANGELS","Hemeria 12U","Argos-Neo demonstrator",(.30,.20,1.0),[ANGELS,ANGELS_LAYOUT,GCAT],
              "The two hinged leaves on each side and the central fixed solar face follow CNES's deployed drawing. The reconstructed wing span uses ANGELS's own GCAT record."),
    "gazelle":("GAzelle / OTB-3","General Atomics Orbital Test Bed","Argos-4 and RadMon",(.60,.60,2.0),[GAZELLE,GAZELLE_PHOTOS,"https://www.ga.com/ga-gazelle-satellite-with-argos4-payload",GCAT],
               "NOAA's flight photographs and deployed view show a compact silver body, a three-section solar face and parallel, unequal radomes. GCAT estimates a 0.6 m body and a 2 m envelope."),
    "oceansat-3":("Oceansat-3 / EOS-06","IRS Oceansat-3","Argos-4, SCAT-3, OCM-3 and SSTM",(3.9,2.0,11.7),[OCEANSAT,"https://mosdac.gov.in/oceansat-3-payloads",CNES,GCAT],
                  "ISRO's launch illustration shows the elevated scatterometer, instrument tower and two panels on each wing. The approximate 11.7 m span is from the individual spacecraft's GCAT entry."),
}
for variant, label, payload in [
        ("kineis-iot","Kinéis IoT","Argos-compatible IoT"),
        ("kineis-ais","Kinéis IoT and AIS","Argos-compatible IoT and maritime AIS")]:
    SPECS[variant]=(label,"Hemeria 16U",payload,(.40,.20,1.60),[KINEIS,KINEIS_FLIGHTS,KINEIS_ANTENNAS],
                    "Kinéis publishes a 1.60 m span, 1.40 m deployed height and six solar panels on two wings. The four-wire UHF helix and stacked S-band terminal are common to the fleet. Figure 2 of the operator's flight paper identifies the AIS vehicles and their nearest-neighbour backups.")

ASSETS = {key:"leo/"+key+".glb" for key in SPECS}
ASSETS.update({"gazelle":"leo/ref-gazelle-54023.glb","noaa-atn":"leo/ref-atn-13923.glb"})
EXPORTS = {path:key for key,path in ASSETS.items()}


def flight_facts():
    facts = {}
    for key,ids in HOSTS.items():
        name,bus,payload,dimensions,refs,_ = SPECS[key]
        for n in ids:
            f = {"payload":payload,"deployed_span_m":dimensions[2],"source_url":refs[0],
                 "source_name":"Argos host specifications"}
            if key in ("tiros-n","noaa-atn","noaa-erbe","noaa-klm","saral","angels","gazelle","oceansat-3"):
                f["span_estimated"] = True
            if key in ("noaa-n","noaa-n-prime"):
                f["span_note"] = "model estimate from NOAA bus and solar array"
            if key.startswith("kineis"):
                f.update(manufacturer="Hemeria",launch_mass_kg=28,source_name="Kinéis spacecraft specifications")
            if len(ids)==1:
                f["reference_name"] = name
            facts[str(n)]=f
    facts["39086"].update(manufacturer="Indian Space Research Organisation (ISRO)",launch_mass_kg=407,dry_mass_kg=None)
    facts["44876"].update(manufacturer="Hemeria",launch_mass_kg=20,launch_mass_estimated=True,dry_mass_kg=None,
                          mission_status="Argos-Neo mission ended on 2024-12-18")
    facts["11819"]["mission_status"]="Failed to reach its intended operational orbit"
    facts["33591"].update(manufacturer="Lockheed Martin Space Systems",launch_mass_kg=1419.8,launch_mass_estimated=True)
    facts["54361"].update(separation_mass_kg=1117)
    return facts


def assign(profiles):
    """Split only reviewed flights from shared outlines, including historical flights."""
    catalogued = {n for p in profiles.values() for n in p["norad"]}
    members = {n for ids in HOSTS.values() for n in ids}
    for asset,p in list(profiles.items()):
        if members.intersection(p["norad"]):
            p["norad"] = [n for n in p["norad"] if n not in members]
            if not p["norad"]:
                del profiles[asset]
    for key,(name,bus,payload,(length,width,span),refs,note) in SPECS.items():
        flights = sorted(catalogued.intersection(HOSTS[key]))
        if not flights:
            continue
        asset = ASSETS[key]
        if asset in profiles:
            raise ValueError(f"Existing unrelated flights use {asset}")
        note += " Small fittings, local dimensions, surface finishes and deployment angles are illustrative."
        direction,up = [.32,-.70,1],[0,.82,.57]
        if key.startswith("kineis") or key in ("gazelle","angels"):
            direction,up = [.26,-1,.36],[0,-.34,-.94]
        elif key=="adeos-ii":
            direction,up = [.34,-.68,-1],[0,.82,-.57]
        profiles[asset] = {"name":name,"description":payload+". "+note.split(". ")[0]+".",
            "family":"Argos","design":"argos-host","shape":"Deployed environmental spacecraft",
            "appearance":{"configuration":key,"previewDirection":direction,"previewUp":up,"previewFov":32},
            "meta":{"bus":bus,"geometry":{"body_length_m":length,"body_width_m":width,"span_m":span,"center_model":False,"glb_units":"m"},
                    "payload":payload,"references":refs,"reference_status":"Illustrated design","dimension_note":note},
            "norad":flights}
