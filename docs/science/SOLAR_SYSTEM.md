# Solar System ephemeris (2.5.1)

2.5 preserves the playback/guide bytes and adds [544 untuned holdout comparisons](../validation/V2_5_ACCEPTANCE.md). The worst sampled playback position error is 69.54 m; the worst guide position error is 70.993 km. Position and velocity max/p95 results are recorded per body in the delivery evidence. These same-provider samples do not constitute independent physical-model or human validation. Playback now loads on first Solar System activation, with a cached pending request and retry control; standalone activation remains immediate.

Precise mode uses bundled [NASA/JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) geometric position and velocity vectors for Mercury through Neptune and the Moon. Its default coverage is **2020-01-01 through 2035-12-31 UTC**, with six-hour samples, Sun-centered origin (`500@10`), ICRF/J2000 ecliptic axes, and km / km/s units. `TIME_TYPE=UT`, `CAL_TYPE=GREGORIAN`, and `VEC_CORR=NONE` are explicit. There is no light-time or apparent-observer correction.

Cubic Hermite interpolation uses both positions and velocities. Independent off-grid Horizons queries at three dates per body test interpolation with a 100 m position and 0.1 m/s velocity regression ceiling. The current 27 positional samples have a worst difference of 35.20 m. These samples do not establish an error bound across all dates, an independent scientific qualification, or suitability for navigation.

Precise mode never falls back silently: missing playback data leaves positions unavailable; dates outside the loaded table clamp to its boundary and pause. Positions, the Sun, planets and Moon use a common physical scale. Bodies are spheres with volumetric mean radii from the [JPL planetary table](https://ssd.jpl.nasa.gov/planets/phys_par.html) and [NASA Sun](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)/[Moon](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) fact sheets, checked 2026-11-08; oblateness is not modeled. Precise mode disables enlargement and decorative Sun glow. Bodies are tiny in overview; follow a planet for close inspection. Labels are screen-sized guides. Nominal sidereal spin periods come from the [JPL physical-parameter table](https://ssd.jpl.nasa.gov/planets/phys_par.html) and [NASA Moon fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html), checked 2026-11-08; negative periods preserve retrograde Venus/Uranus spin. Texture phase is arbitrarily zero at J2000 UTC. Pole orientation, tilt, prime meridians and lunar libration are not modeled accurately; orbital validation does not qualify axial orientation.

## Full planetary orbit guides

The separate `orbits/manifest.json` and eight content-addressed files provide wider JPL coverage solely for drawing guides. They load on first entering Solar System and remain cached in the viewer. Each planetary path spans 360 degrees of heliocentric longitude, half before and half after the selected epoch, includes the playback position, and preserves the actual endpoints without an invented closing chord. The Moon retains its Earth-relative path. **Guide coverage never widens the validated playback range.** Missing guide files leave the available playback-data arcs visible with an explicit status; re-entering the view retries the missing files.

Guide cadences are refined separately for each planet against 17 independent off-grid Horizons positions. The current 136 samples have a worst interpolation difference of **74.618 km**, below the guide-only 100 km regression ceiling. This display tolerance is separate from the 100 m playback regression ceiling above, and neither sampled check establishes a global error bound. Adaptive line tessellation controls visual smoothness. The eight guide files total about 5.2 MB and use the same geometric frame, center, units and UTC convention as playback.

**Educational mode is the default**, preserving the existing illustrative Sun/planet sizes and optional enlargement control. It uses [JPL approximate Keplerian elements, Tables 2a/2b](https://ssd.jpl.nasa.gov/planets/approx_pos.html), restricted in this UI to **1000-3000 CE**. It uses UTC as a sufficient approximate time argument, represents Earth by the Earth-Moon barycenter, and shows a schematic, enlarged lunar orbit. It is always labeled approximate. It must not be interpreted as precise ephemeris data.

Both views start **Live at 1 sec/s**, following system UTC and resynchronizing after background/sleep delays. Manual 1 sec/s advances one simulated second per elapsed real second. The unit selector beside Play/Pause and Live offers sec/s, min/s, hour/s and day/s; year/s is grouped under Advanced. Changing units preserves the selected UTC instant, signed multiplier and paused/running state, while leaving Live. Readouts show explicit rates such as `5 min/s` or `-2 hour/s`. Planetary motion at 1× is slow at full-system scale. Pause freezes the date; Play resumes from that date, while Live returns to current UTC and seconds/second. Manual dates, scrubbing and steps pause. The window controls scrubbing; dataset coverage controls playback boundaries, including Live. Switching precise/educational modes pauses. On exit the main app restores its prior Live or historical clock and view. Live updates the simulation instant, not provider data freshness.

## Regeneration / extended precise coverage

```powershell
.venv\Scripts\python.exe tools/generate_jpl_ephemeris.py --help
.venv\Scripts\python.exe tools/generate_jpl_ephemeris.py --start 2000-01-01 --stop 2050-01-01
```

The generator permits at most 100 years per file and keeps existing files until every provider query succeeds. Defaults overwrite `solar_system_jpl_horizons_2020_2035_6h.json` and `solar_system_jpl_horizons_reference_samples.json`; the legacy filename is stable even when coverage changes. `--output` and `--reference-output` allow staging elsewhere. Runtime controls derive coverage from the actual timestamps. Validate regenerated data before distributing it; no runtime requests go to Horizons. Existing exact-byte historical approvals do not cover these regenerated bytes.

To regenerate guides without changing playback:

```powershell
.venv\Scripts\python.exe tools/generate_jpl_orbit_guides.py
```

This tool reads playback bounds, pads each body's range to cover a revolution at both edges, and splits long requests into aligned spans of at most 100 years. Successful serial queries are cached under `runtime/jpl-orbit-guides`; `--refresh` re-queries Horizons. `--playback`, `--output-dir` and `--cache-dir` support staging. The manifest is replaced only after all eight bodies pass the sampled check; previous content-addressed files remain available. After deliberately replacing playback coverage, regenerate and validate the guides too. Run `node tests/solarSystemOrbitGuides.test.js` to check hashes, reference positions, full sweeps and playback boundaries.
