"""BeiDou MEO deployed exteriors. IGS (+X, +Y, +Z) maps to model (-Y, +X, +Z)."""
import math

IGS = "https://www.igs.org/mgex/constellations/#BeiDou"
SINEX = "https://files.igs.org/pub/station/general/igs_satellite_metadata.snx"
ARTWORK = "https://doi.org/10.1186/s43020-024-00131-y"
CAST_SURFACES = "https://doi.org/10.3390/rs17061068"
SAR_GEOMETRY = "https://doi.org/10.3390/rs16203900"
RANGING = "https://doi.org/10.1007/s10291-024-01638-2"
SAR_FLEET = "https://demo-pro.406.org/wp-content/uploads/2026/02/T016-OCT-27-2023.pdf"
SECM_SPARES = "https://doi.org/10.1007/s00190-026-02126-w"
REFERENCE_TITLES = {
    IGS: "IGS spacecraft dimensions", SINEX: "IGS flight identifiers and masses",
    ARTWORK: "CSNO and SECM spacecraft illustrations", CAST_SURFACES: "CAST body and radiator surfaces",
    SAR_GEOMETRY: "CAST search-and-rescue panel geometry", RANGING: "Laser retroreflector configurations",
    SAR_FLEET: "Cospas-Sarsat payload assignments (Table 6-1)", SECM_SPARES: "IGS SECM-B identification",
    "https://igs.org/wp-content/uploads/2020/08/Fig_BodyFrame_BDS_MEOIGSO.jpg": "BeiDou-2 equipment layout",
    "https://igs.org/wp-content/uploads/2020/08/Fig_BDS3S_MEO_SECM.png": "SECM M3S illustration",
}

# NORAD and PRN can appear under different mission names. SAR membership uses stable SVNs
# cross-matched to Cospas-Sarsat T.016, Table 6-1, by launch and orbital slot.
SAR_SVNS = {"C213", "C214", "C222", "C223", "C225", "C226"}
# Preserve the published SECM URL for SECM-A. Package names distinguish both buses.
CONFIGURATIONS = {
    ("BDS-2M", False): ("beidou-2-meo", "BeiDou-2 MEO"),
    ("BDS-3SM-CAST", False): ("beidou-3s-cast", "BeiDou-3S MEO CAST (M1S / M2S)"),
    ("BDS-3SM-SECM", False): ("beidou-3s-secm", "BeiDou-3S MEO SECM (M3S)"),
    ("BDS-3M-CAST", False): ("beidou-3-cast", "BeiDou-3 MEO CAST"),
    ("BDS-3M-CAST", True): ("beidou-3-cast-sar", "BeiDou-3 MEO CAST (search and rescue)"),
    ("BDS-3M-SECM-A", False): ("beidou-3-secm", "BeiDou-3 MEO SECM-A"),
    ("BDS-3M-SECM-B", True): ("beidou-3-secm-b", "BeiDou-3 MEO SECM-B (search and rescue)"),
    ("BDS-3M-SECM-B", False): ("beidou-3-secm-b-2024", "BeiDou-3 MEO SECM-B (2024 pair)"),
}
EXPORTS = {"meo/"+stem+".glb": ("beidou-3-secm-a" if stem == "beidou-3-secm" else stem)
           for stem, _ in CONFIGURATIONS.values()}

# Body X, Y, Z in the IGS frame, area of one wing, and tip-to-tip span in metres.
# BDS-2 gives approximate dimensions and span. BDS-3 spans are reconstructed. The
# experimental envelopes are visual estimates and have no published wing area here.
DIMENSIONS = {
    "BDS-2M": (1.80, 2.20, 2.50, 3*2.20*1.70, 17.7),
    "BDS-3SM-CAST": (1.65, 1.35, 1.85, None, 11.5),
    "BDS-3SM-SECM": (2.35, 1.05, 1.20, None, 9.7),
    "BDS-3M-CAST": (1.68, 1.30, 2.16, 10.22, 14.0),
    "BDS-3M-SECM-A": (2.55, 1.02, 1.23, 5.40, 10.4),
    "BDS-3M-SECM-B": (2.80, .92, 1.35, 5.40, 10.3),
}
DESCRIPTIONS = {
    "BDS-2M": "Regional BeiDou navigation bus with an offset Earth-facing antenna, ranging array and two three-leaf wings.",
    "BDS-3SM-CAST": "Experimental M1S/M2S bus with an additional deployed phased-array antenna.",
    "BDS-3SM-SECM": "Experimental M3S bus with an elongated navigation deck and two three-leaf solar wings.",
    "BDS-3M-CAST": "T-shaped CAST navigation spacecraft with optical radiator tiles and paired dark-blue solar wings.",
    "BDS-3M-SECM-A": "Original SECM navigation bus with an elongated Earth-facing antenna deck and two blue solar wings.",
    "BDS-3M-SECM-B": "Revised SECM navigation bus with a longer, narrower body and two blue solar wings.",
}


def profile(block, sar, flights, epoch):
    stem, name = CONFIGURATIONS[block, sar]
    length, width, height, area, span = DIMENSIONS[block]
    description = DESCRIPTIONS[block]
    sources = [IGS, SINEX]
    geometry = {"body_length_m": length, "body_width_m": width, "body_height_m": height,
                "estimated_span_m": span, "glb_units": "m"}
    if area:
        geometry["solar_area_per_wing_m2"] = round(area, 2)
    if block == "BDS-2M":
        geometry["body_estimated"] = True
        note = "IGS gives an approximate family body of 1.8 × 2.2 × 2.5 m and a span of about 17.7 m. Each wing has three 2.2 × 1.7 m leaves."
        sources.append("https://igs.org/wp-content/uploads/2020/08/Fig_BodyFrame_BDS_MEOIGSO.jpg")
    elif block.startswith("BDS-3SM"):
        geometry["body_estimated"] = True
        note = (f"Experimental spacecraft. The modeled body of {length:g} × {width:g} × {height:g} m "
                f"and deployed span of {span:g} m are illustrative estimates. The cited IGS table lists no body dimensions or wing area for this block.")
        if "SECM" in block:
            sources.append("https://igs.org/wp-content/uploads/2020/08/Fig_BDS3S_MEO_SECM.png")
    else:
        sources.extend([ARTWORK, RANGING])
        note = (f"IGS reference body (X × Y × Z) {length:g} × {width:g} × {height:g} m. "
                f"Each solar wing is {area:g} m². The {span:g} m deployed span is estimated from the artwork and wing area.")
        if "CAST" in block:
            sources.append(CAST_SURFACES)
        if stem.endswith("2024"):
            sources.append(SECM_SPARES)
            note += " Bus dimensions use the published SECM-B reference configuration."
    if sar:
        description += " This flight configuration carries a search-and-rescue payload."
        sources.append(SAR_FLEET)
        if "CAST" in block:
            sources.append(SAR_GEOMETRY)
        else:
            note += " The SECM search-and-rescue antenna location and housing are illustrative."
    note += " The fixed wing attitude, small fittings and surface finishes approximate the deployed exterior."
    manufacturer = ("Shanghai Engineering Center for Microsatellites (SECM)" if "SECM" in block
                    else "China Academy of Space Technology (CAST)")
    return "meo/"+stem+".glb", {
        "name": name, "description": description, "family": "BeiDou", "design": "beidou-meo",
        "shape": "Navigation bus with two solar wings",
        "appearance": {"block": block, "searchRescue": sar, "previewDirection": [.22, -.51, 1.05]},
        "meta": {"bus": name, "manufacturer": manufacturer, "geometry": geometry, "references": sources,
                 "reference_status": "Illustrated design", "dimension_note": note, "igs_epoch": epoch},
        "modelCredit": {"toScale": not block.startswith("BDS-3SM"), "source": IGS,
                        "sources": [{"url":url, "basis":REFERENCE_TITLES[url]} for url in sources],
                        "credit": "Original OpenBEXI reconstruction using IGS data and published spacecraft illustrations."},
        "norad": sorted(map(int, flights)), "flights": flights,
    }


def solar_wings(g, width, span, area, block):
    # Three separate leaves each side. Set their aggregate planar area before adding
    # the open yoke and hinge gaps. The fixed drive angle preserves area and span.
    yoke = (span-width)/2 - 3*2.20 - .05 if block == "BDS-2M" else .68
    leaf = ((span-width)/2-yoke-.05)/3
    chord = area/(3*leaf) if area else leaf*.94
    angle = math.radians(17)
    c, s = math.cos(angle), math.sin(angle)
    rotation = (math.sin(angle/2), 0, 0, math.cos(angle/2))
    material = "BeiDou SECM solar cells" if "SECM" in block else "BeiDou CAST solar cells"
    for sign in (-1, 1):
        root, hinge = sign*width/2, sign*(width/2+yoke)
        def at(x, across=0, normal=0):
            return (x, across*c-normal*s, across*s+normal*c)
        g.rod("Solar array rotary drive", at(root-sign*width*.16), at(root+sign*.12), .17)
        for side in (-1, 1):
            g.rod("Solar wing yoke", at(root+sign*.09), at(hinge, side*chord*.45), .034)
        for i in range(3):
            x = hinge+sign*(leaf/2+i*(leaf+.025))
            g.part("Solar leaf backsheet", "box", "Array backsheet", (leaf, chord, .028), at(x), rotation)
            g.part("Solar cell strings", "panel", material, (leaf*.987, chord*.983, .01), at(x,0,.016), rotation)
            for edge in (-1,1):
                g.rod("Solar leaf edge rail", at(x-leaf/2, edge*(chord/2-.012),-.017),
                      at(x+leaf/2, edge*(chord/2-.012),-.017), .019)
            if i < 2:
                for side in (-1, 1):
                    g.rod("Inter-panel hinge", at(x+sign*leaf/2,side*chord*.36),
                          at(x+sign*(leaf/2+.025),side*chord*.36), .045)


def body(g, block, length, width, height):
    cast = block == "BDS-3M-CAST"
    secm = "SECM" in block
    blanket = "Silver multilayer insulation" if secm else "Gold multilayer insulation"
    if cast:
        # The broad Earth-facing deck overhangs the narrower service module.
        g.part("CAST service module", "blanketed chassis", blanket,
               (width*.80, length*.72, height*.66), (0,0,-height*.17))
        g.part("CAST T-shaped payload deck", "blanketed chassis", blanket,
               (width,length,height*.34), (0,0,height*.33))
    else:
        g.part("Equipment bus", "blanketed chassis", blanket, (width,length,height))
    walls = ([(width*.80,length*.72,height*.66,-height*.17), (width,length,height*.34,height*.33)]
             if cast else [(width,length,height,0)])
    for wall_width, wall_length, wall_height, z in walls:
        for side in (-1, 1):
            g.part("Optical solar reflector tiles", "foil-box", "Silver radiator mosaic",
                   (.012,wall_length*.82,wall_height*.78), (side*(wall_width/2+.005),0,z))
            for end in (-1,1):
                y = end*wall_length*.41
                g.rod("Radiator edge retainer", (side*(wall_width/2+.012),y,z-wall_height*.39),
                      (side*(wall_width/2+.012),y,z+wall_height*.39), .010)
            for x in (-wall_width*.24, wall_width*.18):
                g.rod("Blanket taped seam", (x,side*wall_length*.501,z-wall_height*.46),
                      (x,side*wall_length*.501,z+wall_height*.46), .014, "Gold thermal foil" if cast else "Structural alloy")
    # Clamped, recessed panels and attachment points at the margins of the payload deck.
    for side in (-1, 1):
        for row in (-.39,0,.39):
            g.part("Deck attachment boss", "cylinder", "Structural alloy", (.037,.037,.025),
                   (side*width*.446,row*length,height/2+.033), sides=8)
    g.part("Earth-facing equipment deck", "foil-box", "Equipment panels" if secm else "Ivory radome",
           (width*.97,length*.96,.024), (0,0,height/2+.012))
    return height/2+.024


def navigation_array(g, block, length, width, z):
    secm = "SECM" in block
    # The CSNO artwork shows the CAST elements on a round backing. SECM has
    # rows running along its long deck with instruments at the two ends.
    cy = -length*.15 if block == "BDS-2M" else length*.055
    size = min(width*.83, length*.58)
    if secm:
        g.part("Navigation antenna mounting plate", "foil-box", "Equipment panels",
               (width*.92,length*.57,.038), (0,cy,z+.019))
        pitch_x, pitch_y = width*.26, length*.113
        rows = (2,3,3,3,2)
    else:
        g.part("Navigation antenna ground plane", "cylinder", "Equipment panels", (size,size,.045),
               (0,cy,z+.0225), sides=40)
        pitch_x = pitch_y = size*.205
        rows = (2,4,4,2)
    for row, count in enumerate(rows):
        for col in range(count):
            x, y = (col-(count-1)/2)*pitch_x, cy+(row-(len(rows)-1)/2)*pitch_y
            g.part("L-band antenna pedestal", "cylinder", "Gold thermal foil",
                   (.105,.105,.045), (x,y,z+.062), sides=12)
            g.part("L-band radiating element", "frustum", "Graphite" if secm else "Structural alloy",
                   (.074,.074,.18), (x,y,z+.17), sides=12)
            g.part("L-band element collar", "cylinder", "Gold thermal foil" if secm else "Equipment panels",
                   (.078,.078,.018), (x,y,z+.145), sides=12)
    return cy


def ranging_array(g, center, rows):
    # A planar array of individual corner-cube apertures on the nadir face.
    x, y, z = center
    pitch = .039
    w, h = (max(rows)+.65)*pitch, (len(rows)+.65)*pitch
    g.part("Laser retroreflector mounting plate", "box", "Graphite", (w,h,.035), (x,y,z+.018))
    for j, count in enumerate(rows):
        for i in range(count):
            g.part("Corner cube aperture", "cylinder", "Reflector glass", (.033,.033,.009),
                   (x+(i-(count-1)/2)*pitch,y+(j-(len(rows)-1)/2)*pitch,z+.040), sides=12)


def spacecraft(g, p):
    appearance, geometry = p["appearance"], p["meta"]["geometry"]
    block = appearance["block"]
    length, width, height = (geometry["body_"+k+"_m"] for k in ("length","width","height"))
    z = body(g, block, length, width, height)
    center_y = navigation_array(g, block, length, width, z)
    secm = "SECM" in block
    # SINEX LRA eccentricities are relative to mass centres. Use the corresponding
    # deck quadrant for each bus, without treating a mass centre as the mesh origin.
    if block == "BDS-2M":
        ranging_array(g, (-width*.30, length*.32, z), (5,7,9,9,7,5))
        g.part("Apogee motor skirt", "cylinder", "Graphite", (.78,.78,.22),
               (0,length/2+.09,0), (-math.sqrt(.5),0,0,math.sqrt(.5)))
    else:
        lra_x, lra_y = (width*.30,-length*.30) if secm else (-width*.065,-length*.36)
        if block == "BDS-3M-SECM-B":
            lra_x, lra_y = -width*.27, length*.38
        ranging_array(g, (lra_x,lra_y,z),
                      (5,7,9,9,7,5) if secm else (4,5,6,8,6,5,4))
    if secm:
        end_y = -length*.40 if block == "BDS-3M-SECM-B" else length*.40
        for side, finish in ((-1,"Green aperture cover"), (1,"Russet aperture cover")):
            pos = side*width*.22
            g.part("Deck aperture bezel", "cylinder", "Structural alloy", (.265,.265,.028),
                   (pos,end_y,z+.014), sides=24)
            g.part("Deck aperture cover", "cylinder", finish, (.232,.232,.023),
                   (pos,end_y,z+.039), sides=24)
    if appearance["searchRescue"]:
        cast = block == "BDS-3M-CAST"
        # CAST dimensions follow the published 1.30 × 0.85 m deployed SAR panel.
        reach, breadth = (.85, 1.30) if cast else (.39, width*.68)
        y = length/2+reach/2
        g.part("Search and rescue antenna", "foil-box", "Reflector thermal foil",
               (breadth,reach,.046), (0,y,z-.025))
        for side in (-1,1):
            g.rod("SAR deployment hinge", (side*breadth*.36,length/2-.08,z-.04),
                  (side*breadth*.36,length/2+.07,z-.04), .065)
    if block == "BDS-3SM-CAST":
        y = length/2+.46
        g.part("Fold-out phased-array antenna", "foil-box", "Silver radiator mosaic",
               (width*.87,.92,.05), (0,y,z-.04))
        for side in (-1,1):
            g.rod("Phased-array hinge", (side*width*.30,length/2-.07,z-.06),
                  (side*width*.30,length/2+.12,z-.06), .06)
    solar_wings(g, width, geometry["estimated_span_m"], geometry.get("solar_area_per_wing_m2"), block)
    # Equal inspection radii across variants allow direct visual size comparison.
    g.inspection_camera("nadir", "Earth-facing instrument", (0,center_y,z), (0,0,1), 1.80)
    g.inspection_camera("body-side", "Body side", (0,0,0), (1,0,0), 1.80)
