"""Original exterior study of the deployed Space Logistics Mission Extension Pod."""
import math

if __package__:
    from .geo_geometry import tilt_x
else:
    from geo_geometry import tilt_x

FACT_SHEET = ("https://media.northropgrumman.com/fe9f1358-2f87-4096-bf6a-b4730015c2ba/"
              "DS-10f-MEP-Mission-Extension-Pod-Fact-Sheet_Original%20file.pdf")
REFERENCES = [FACT_SHEET, "https://www.northropgrumman.com/what-we-do/space/space-logistics-services",
              "https://media.northropgrumman.com/aabe8a44-11cb-4701-a8e4-b4810057e7a0/mrv-mep-render-high-01_Original%20file.jpg"]
DIMENSIONS = ("Proportions estimated from manufacturer illustrations. Absolute dimensions, blanket cuts, "
              "fasteners and propulsion-head details are illustrative.")
PROFILE = {"name": "Mission Extension Pod", "design": "geo-mep",
           "description": "Deployed propulsion pod with solar wings, client interface and articulated xenon propulsion boom.",
           "appearance": {"previewDirection": [.32,-.86,.68], "previewUp": [1,0,0]},
           "modelCredit": {"toScale": False, "source": FACT_SHEET, "geometryCredit": "OpenBEXI original exterior study"},
           "meta": {"references": REFERENCES, "dimension_note": DIMENSIONS}}


def spacecraft(g):
    g.part("Insulated pod equipment bay", "blanketed chassis", "Silver multilayer insulation", (.96,.80,1.10))
    for side in (-1, 1):
        for edge in (-1, 1):
            g.rod("Longitudinal corner rail", (side*.44,edge*.375,-.55), (side*.44,edge*.375,.55), .044)
            g.rod("End deck frame", (side*.44,-.375,edge*.54), (side*.44,.375,edge*.54), .036)
            g.rod("End deck crossmember", (-.44,side*.375,edge*.54), (.44,side*.375,edge*.54), .036)
        g.part("Array axle bearing", "cylinder", "Graphite", (.23,.23,.13), (side*.50,0,0),
               (0,side*math.sin(math.pi/4),0,math.cos(math.pi/4)))
        for edge in (-1, 1):
            g.rod("Array root yoke", (side*.55,0,0), (side*.77,edge*.26,0), .038)
        x = side*1.48
        g.part("Solar wing perimeter", "box", "Structural alloy", (1.43,.67,.033), (x,0,0))
        g.part("Array rear laminate", "box", "Array backsheet", (1.40,.64,.016), (x,0,-.024))
        g.part("Photovoltaic cell strings", "panel", "Pod photovoltaic cells", (1.40,.639,.008), (x,0,.019))
        for edge in (-1,1):
            g.rod("Root hinge barrel", (side*.77,edge*.23-.065,0), (side*.77,edge*.23+.065,0), .038)
            g.rod("Array rear stiffener", (side*.78,edge*.23,-.04), (side*2.18,edge*.23,-.04), .023)
        g.part("Side blanket panel", "foil-box", "Black multilayer insulation", (.68,.027,.80), (0,side*.405,0))
    # A circular gridded side panel and its enclosing rails are visible in the integration artwork.
    face = tilt_x(math.pi/2)
    g.part("Circular side panel frame", "annulus", "Structural alloy", (.63,.63,.034), (0,-.432,0), face, 40)
    g.part("Circular panel inset", "cylinder", "Graphite", (.595,.595,.018), (0,-.435,0), face, 40)
    for index in range(-3, 4):
        offset = index*.074
        half = math.sqrt(.28**2-offset**2)
        g.rod("Panel grille", (offset,-.451,-half), (offset,-.451,half), .009)
        g.rod("Panel grille", (-half,-.451,offset), (half,-.451,offset), .009)
    g.part("Client interface neck", "frustum", "Structural alloy", (.62,.62,.20), (0,0,.62), sides=40)
    g.part("Client interface flange", "annulus", "Equipment panels", (.68,.68,.067), (0,0,.735), sides=48)
    for i in range(8):
        a = math.tau*i/8
        g.part("Interface fastener", "cylinder", "Graphite", (.036,.036,.026), (.296*math.cos(a),.296*math.sin(a),.774), sides=8)
    # The integrated view shows the slim articulated boom alongside one wing,
    # offset toward the client adapter and clear of the solar panel plane.
    pivot, elbow, head = (-.36,-.24,.46), (-.58,-.27,.66), (-1.96,-.30,.69)
    for start, end in ((pivot,elbow), (elbow,head)):
        g.rod("Articulated propulsion boom", start, end, .082)
    for point in (pivot,elbow,head):
        g.part("Boom articulation joint", "sphere", "Equipment panels", (.155,.13,.15), point, sides=12)
    g.part("Thruster electronics", "blanketed chassis", "Silver multilayer insulation", (.22,.19,.20), (-1.99,-.30,.73))
    g.part("Electric propulsion head", "cylinder", "Graphite", (.15,.15,.16), (-2.03,-.30,.90), sides=32)
    g.part("Thruster exit annulus", "annulus", "Structural alloy", (.16,.16,.022), (-2.03,-.30,.99), sides=32)
