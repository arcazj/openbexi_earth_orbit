# Third-party notices

The [commercial notice](../LICENSE.md) covers new owner-controlled 2.5 material. Existing MIT grants and the following upstream terms remain in force.

| Material | Origin and terms | Scope |
| --- | --- | --- |
| Application through 2.4.0 (`f7724f5`) | [Historical MIT notice](../licenses/LEGACY_MIT.txt) | Retained legacy material; original copyright line preserved |
| Three.js 0.184.0 | MIT, [notice](../vendor/three/0.184.0/LICENSE) | Browser runtime |
| satellite.js 6.0.2 | MIT, [notice](../vendor/satellite.js/6.0.2/LICENSE.md) | Browser propagation |
| Python | PSF license and interpreter component notices | Interpreter is not bundled; local server uses the standard library |
| python-sgp4 2.25 | MIT, [retained notice](../validation/v2.5.0/PYTHON_SGP4_LICENSE.txt) | Optional development generator; original synthetic OMM inputs and frozen numerical output |
| Playwright / axe-core tooling | Apache-2.0 / MPL-2.0 and locked transitive terms | Development only; see [inventory](../release/evidence/v2.5.0-rights-inventory.json) |
| CelesTrak GP/TLE/SATCAT and derived catalogs | [Provider usage policy](https://celestrak.org/usage-policy.php), [data governance](governance/DATA_SOURCES.md) | Existing public snapshot bytes retained; no new blanket redistribution license inferred |
| JPL Horizons playback, guides and holdouts | [NASA/JPL SSD publication guidance](https://ssd.jpl.nasa.gov/faq.html#gen2) treats its data as public domain and requests attribution | Source responses, retrieval metadata and modifications recorded; no endorsement |
| Historical SGP4 references | [Frozen source record](../validation/v2.0.0/manifest.json) identifies AGPL-3.0-only upstream | TLE inputs/numerical expected vectors in tests; no upstream implementation imported into runtime; outside commercial claim and static artifact |
| Textures, models, star data and satellite metadata | Legacy assets unchanged from public 2.4; [file inventory](../release/evidence/v2.5.0-rights-inventory.json) | Asset-specific provenance is incomplete; no new commercial reuse rights or comprehensive clearance claimed |

The numerical reference boundary is an engineering inventory, not a legal opinion about the copyrightability of particular fixtures. [AGPL section 2](https://www.gnu.org/licenses/agpl-3.0.html#section2) distinguishes program output from covered source; the historical upstream record remains unchanged. Customer redistribution of assets or datasets needs its own rights review. Private agreements, runtime state, internal prompts and test fixtures are excluded from the deployable app.
