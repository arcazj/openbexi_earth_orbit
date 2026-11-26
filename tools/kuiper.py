"""Sources and shared flight specifications for Amazon's two flown spacecraft designs."""

import re

PROTOTYPE = "leo/ref-kuiper-58013.glb"
PRODUCTION = "leo/kuiper-production.glb"
EXPORTS = {PROTOTYPE: "kuiper-protoflight", PRODUCTION: "kuiper-production"}
NAMES = {58013: "KuiperSat-2", 58014: "KuiperSat-1"}
PRODUCTION_NAME = re.compile(r"(?:KUIPER|AMAZON LEO)[- ]\d+", re.I)
AMAZON = "https://www.aboutamazon.com/"
NEWS = AMAZON + "news/innovation-at-amazon/"
FACTORY = AMAZON + "stories/how-amazon-leo-builds-satellites"
PROTOTYPE_PHOTO = NEWS + "amazon-project-kuiper-deorbit-satellites"
LASERS = NEWS + "amazon-project-kuiper-oisl-space-laser-december-2023-update"
THRUSTER = NEWS + "amazon-project-kuiper-satellite-propulsion-system-november-2023-update"
LAUNCH_KIT = "https://www.ariane.group/app/uploads/2026/02/LAUNCH-KIT-VA267-EN_FINAL.pdf#page=3"
REFERENCES = {
    PROTOTYPE: [PROTOTYPE_PHOTO, LASERS, THRUSTER, NEWS+"amazon-project-kuiper-protoflight-mission-november-2023-update",
                "https://indico.esa.int/event/516/contributions/10014/attachments/6284/10794/CSD2024_Chandramouli_OverviewOfSpaceSustainability.pdf"],
    PRODUCTION: [NEWS+"project-kuiper-photos-internet-satellite-first-launch", "https://arxiv.org/pdf/2601.07708#page=4",
                 NEWS+"project-kuiper-satellite-internet-first-launch", FACTORY, LAUNCH_KIT],
}

FAMILY_FACTS = {
    PROTOTYPE: {"source_name": "Amazon Protoflight", "source_url": LASERS,
                "manufacturer": "Amazon (Project Kuiper)", "payload": "Broadband test payload with phased-array and parabolic antennas",
                "optical_links": "100 Gbit/s demonstrated between KuiperSat-1 and KuiperSat-2",
                "propulsion": "Krypton Hall-effect thruster", "deployed_span_m": 10, "span_estimated": True},
    PRODUCTION: {"source_name": "Amazon Leo", "source_url": FACTORY, "manufacturer": "Amazon, Kirkland, Washington",
                 "payload": "Ka-band user phased arrays and parabolic gateway antennas",
                 "optical_links": "Optical inter-satellite mesh links", "propulsion": "Krypton Hall-effect thruster",
                 "manufacturer_mass": "More than 1,000 lb (about 454 kg)", "design_orbits": "590, 610 and 630 km",
                 "deployed_span_m": 5, "span_estimated": True},
}


def describe(asset, profile):
    production = asset == PRODUCTION
    profile["appearance"] = {"previewDirection": [.30, -.78, 1.05], "previewUp": [0, 1, 0]}
    meta = profile["meta"]
    meta["references"] = REFERENCES[asset]
    meta["reference_status"] = "Illustrated design"
    meta["geometry"].update(center_model=False, body_estimated=True, span_estimated=True)
    meta["dimension_note"] = (
        ("The three-leaf antenna layout follows the authors' reconstruction in Figure 4. Amazon confirms dielectric mirror film on production spacecraft. "
         if production else "Amazon's Protoflight on-orbit photograph shows one solar array and part of the chassis. The two flight vehicles share a representative exterior. ")
        + "GCAT estimates the body envelope and solar span. Panel divisions, local finishes, equipment counts and positions, drive fittings and solar-array angle are illustrative."
    )
