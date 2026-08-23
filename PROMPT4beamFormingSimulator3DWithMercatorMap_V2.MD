# Prompt For `beamFormingSimulator3DWithMercatorMap_V2.html`

You are an expert in beam forming, RF engineering, satellite communications, orbital mechanics, WebGL/Three.js visualization, and production-grade geospatial application design.

Analyze `beamFormingSimulator3DWithMercatorMap_V2.html` and identify what must be improved to turn it into a highly realistic, professional satellite beamforming simulator.

## Context

The application should feel like a pro-grade operational tool, not a demo. It should combine realistic RF behavior, accurate satellite/orbit geometry, credible visual rendering, useful operator controls, and maintainable production code.

Also analyze how the simulator can integrate with `src/com/openbexi/satellites/SatelliteDataExporter.java`, especially for TLE data, satellite metadata, launch dates, orbit classification, company/group tags, and any generated JSON assets.

## Analysis Goals

Return a rigorous technical assessment covering:

1. Current strengths and weaknesses.
2. Incorrect or oversimplified RF, beamforming, orbital, geometric, projection, or rendering assumptions.
3. Concrete changes needed to make the app realistic and production-quality.
4. Code-level recommendations that can be implemented directly.
5. A practical roadmap from quick wins to deeper refactors.

## RF And Beamforming Realism

Evaluate and recommend improvements for:

- Orbit-class-specific beam models for LEO, MEO, and GEO satellites, because altitude, range, velocity, Doppler, latency, footprint size, handover cadence, and required RF power are fundamentally different for each class.
- Antenna array geometry, element spacing, phase steering, tapering/window functions, and grating lobe avoidance.
- Realistic beam shapes instead of simple cones or circles.
- Main lobe, side lobes, nulls, beam width, scan loss, polarization, and frequency-dependent effects.
- Link budget modeling, including EIRP, G/T, free-space path loss, atmospheric loss, rain fade, noise temperature, Eb/N0, C/N0, SNR, throughput, and margin.
- Power-to-surface calculations that estimate the transmit power, antenna gain, EIRP, receiver sensitivity, path loss, and link margin required to close the link at the selected point on Earth's surface.
- Interactive RF controls for transmit power, antenna diameter/aperture, antenna efficiency, array element count, element spacing, frequency band, bandwidth, modulation/coding, minimum elevation angle, atmospheric/rain margin, target SNR, receiver noise figure, and required link margin.
- Warnings when the selected RF configuration is physically impossible or unrealistic, such as too much scan angle, grating lobes, insufficient EIRP, negative link margin, or violation of a maximum power/EIRP constraint.
- Frequency bands such as L, S, C, X, Ku, Ka, and V-band, with band-specific assumptions.
- Uplink/downlink separation and realistic gateway/user-terminal behavior.
- Multi-beam operation, beam hopping, handover, co-channel interference, adjacent beam interference, and frequency reuse.
- Ground footprint deformation from Earth curvature, satellite altitude, antenna pointing, and off-nadir angles.
- Latency, Doppler shift, propagation delay, and time-varying link conditions.
- Visualization of beam gain heatmaps, side lobes, nulls, interference zones, and coverage confidence.

## Orbital And Geospatial Accuracy

Evaluate and recommend improvements for:

- TLE propagation accuracy using satellite.js or a more precise propagation pipeline.
- Correct ECI, ECEF, ENU, geodetic, and Three.js scene-frame transforms.
- Correct GMST/time handling, UTC display, time warp, and deterministic simulation time.
- Satellite altitude, velocity, sub-satellite point, look angle, azimuth, elevation, range, and Doppler calculations.
- Mercator projection alignment with the 3D globe.
- Dateline wrapping, polar behavior, and footprint rendering edge cases.
- Earth ellipsoid vs spherical Earth assumptions.
- Ground station modeling, gateway selection, user terminal placement, and line-of-sight constraints.
- Orbit classes including LEO, MEO, GEO, HEO, decayed objects, debris, and rocket bodies.
- Computation changes required when the user selects LEO, MEO, or GEO in the menu:
- LEO should emphasize fast motion, frequent handover, high Doppler, smaller instantaneous footprint, lower path loss than MEO/GEO, dynamic beam steering, and short propagation delay.
- MEO should emphasize larger regional footprints, moderate Doppler, moderate latency, navigation/communications style orbit behavior, and different handover timing.
- GEO should emphasize near-stationary pointing, very large coverage areas, high path loss, high latency, minimal handover, and fixed gateway/spot-beam planning.

## Realistic 3D Visualization

Evaluate and recommend improvements for:

- Earth rendering with realistic textures, normal maps, specular maps, city lights, atmosphere, clouds, and day/night shading.
- Physically plausible Sun/Moon positioning, lighting, shadows, eclipse behavior, and terminator rendering.
- Satellite scale handling so the object is visible without misleading physical scale.
- Beam visualization in 3D using transparent volumetric meshes, shader-based gain gradients, or GPU-generated footprints.
- Clear distinction between physical geometry and visual exaggeration.
- Realistic ground coverage overlays on the globe and Mercator map.
- Camera controls, target tracking, cinematic transitions, clipping planes, and depth precision.
- Performance at large satellite counts and multiple active beams.

## Professional UI/UX

Evaluate and recommend improvements for:

- Operator-grade controls for frequency, bandwidth, EIRP, antenna size, phased-array parameters, steering angle, target selection, and modulation/coding.
- A menu option to select satellite orbit class: LEO, MEO, GEO, or automatic selection from loaded TLE metadata. This selection must update all beam, footprint, latency, Doppler, range, path-loss, and power calculations.
- A satellite selector filtered by orbit class, company/operator, NORAD ID, altitude, inclination, service type, and active/decayed status.
- RF power controls that let the user interactively tune transmit power, EIRP, antenna gain, bandwidth, target SNR, receiver sensitivity, rain fade margin, atmospheric losses, and minimum acceptable link margin.
- A "compute required power" mode where the user clicks a surface point on the 2D Mercator map or 3D Earth, selects a satellite/beam, and the app calculates the minimum transmit power or EIRP required to reach that surface point with the configured link margin.
- A "coverage by power" mode where the user sets available transmit power and the app renders which Earth-surface areas can be served with acceptable link margin.
- A "professional constraints" panel for regulatory EIRP limits, amplifier saturation, antenna thermal limits, scan-angle limits, elevation masks, unavailable regions, and rain-zone margins.
- A link budget panel with live computed values and pass/fail margins.
- Ground station and user terminal selection workflows.
- Multi-satellite and multi-beam dashboards.
- Time controls for live mode, replay mode, and scenario mode.
- Alerts for no line of sight, insufficient elevation, beam out of bounds, interference, or link margin failure.
- Tooltips and measurement readouts for range, elevation, azimuth, latency, Doppler, SNR, and coverage.
- Exportable scenario reports, screenshots, CSV/JSON telemetry, and analysis summaries.
- Accessibility, responsive layout, and clear professional visual hierarchy.

## Production Readiness

Evaluate and recommend improvements for:

- Modularizing the single HTML file into maintainable JS modules.
- Creating explicit modules for orbit-class selection, beam geometry, RF/link budget computation, 2D footprint rendering, 3D beam rendering, and menu/control state.
- Separating simulation state, RF models, rendering, UI controls, and data loading.
- Type safety with TypeScript or strong JSDoc.
- Unit tests for coordinate transforms, RF/link budget formulas, beam footprint calculations, and TLE propagation behavior.
- Golden test scenarios with known satellites and expected coverage/link outputs.
- Performance profiling, memory management, GPU resource disposal, and animation loop throttling.
- Data validation for TLE JSON and exported metadata from `SatelliteDataExporter.java`.
- Error handling for missing assets, failed JSON loads, invalid satellite records, and browser compatibility issues.
- Documentation for assumptions, formulas, units, coordinate frames, and known limitations.

## Orbit-Class And RF Power Control Menu

Design a professional menu model for `beamFormingSimulator3DWithMercatorMap_V2.html` that lets the user select LEO, MEO, or GEO satellites and immediately changes every dependent computation.

The menu should include at minimum:

- Orbit class: Auto from TLE, LEO, MEO, GEO, HEO, or custom altitude.
- Satellite selection: filtered list based on orbit class, operator/company, NORAD ID, altitude, inclination, and availability.
- Beam mode: nadir beam, steerable spot beam, multi-beam grid, beam hopping, gateway-to-user beam, user-to-satellite uplink, satellite-to-user downlink.
- Target mode: click a point on 3D Earth, click a point on the Mercator map, select a city/ground station, select a user terminal, or select a service region.
- RF band: L, S, C, X, Ku, Ka, V, or custom frequency.
- Bandwidth, modulation/coding, target throughput, target SNR, target Eb/N0, and required availability.
- Transmit chain: transmit power in W/dBW/dBm, amplifier backoff, antenna gain, antenna diameter/aperture, antenna efficiency, phased-array element count, element spacing, taper/window function, polarization, and pointing loss.
- Receive chain: user terminal antenna gain, receiver noise figure, system noise temperature, G/T, receiver sensitivity, implementation loss, and required link margin.
- Channel/environment: free-space path loss, atmospheric absorption, rain fade, cloud/fog loss, scintillation, polarization mismatch, terrain/elevation mask, and local regulatory margin.
- Computation mode: compute required power for selected target, compute achievable coverage for selected power, compute link margin over time, compute best satellite, compute best gateway, or compare LEO/MEO/GEO options.
- Visualization mode: 2D Mercator footprint, 3D globe footprint, 3D volumetric beam, gain heatmap, side-lobe map, link-margin map, no-coverage mask, handover timeline, and Doppler/latency plot.

The analysis must explain how each menu option affects calculations. For example:

- Changing from LEO to GEO must increase slant range and free-space path loss, reduce Doppler and handover frequency, increase latency, and reshape the coverage footprint.
- Increasing frequency must change wavelength, array spacing constraints, antenna gain, free-space path loss, atmospheric loss, and rain fade sensitivity.
- Increasing bandwidth must increase receiver noise power and can reduce link margin unless power, coding gain, or antenna gain also changes.
- Increasing antenna aperture or array size must improve gain but narrow beamwidth and change pointing/scan constraints.
- Increasing off-nadir steering must deform the footprint, increase slant range, reduce gain through scan loss, and increase pointing error sensitivity.
- Raising required availability must increase fade margin, especially for Ku/Ka/V-band links.

The prompt response should require implementation-level recommendations for:

- Which HTML controls to add.
- Which JavaScript functions/modules to create.
- Which existing functions should be replaced or refactored.
- Which formulas are required.
- Which values should be displayed live in the UI.
- Which validation tests prove that LEO, MEO, and GEO computations are correct.

## Mandatory RF, Geometry, And Timing Formulas

The assessment must identify the formulas required for a professional implementation and explain the units for every input and output.

Include at minimum:

- Free-space path loss: frequency, wavelength, range, and dB units.
- EIRP: transmit power, feeder loss, amplifier backoff, antenna gain, and dBW/dBm conversion.
- Antenna gain from aperture or dish diameter: efficiency, wavelength, aperture area, and dBi.
- Approximate beamwidth: dish diameter or phased-array aperture versus wavelength.
- Phased-array steering: phase shift per element, element spacing, wavelength, steering angle, and grating-lobe condition.
- Scan loss: off-nadir or off-boresight steering angle and its impact on gain.
- Receiver noise power: `kTB`, bandwidth, system noise temperature, noise figure, and dBW/dBm.
- G/T: receive antenna gain and system noise temperature.
- C/N0, C/N, Eb/N0, SNR, required Eb/N0, implementation loss, and link margin.
- Atmospheric absorption, rain fade, cloud/fog loss, polarization mismatch, pointing loss, and regulatory margin.
- Propagation delay: slant range divided by speed of light.
- Doppler shift: relative radial velocity, carrier frequency, and speed of light.
- Look geometry: azimuth, elevation, range, sub-satellite point, off-nadir angle, and line-of-sight checks.
- Footprint geometry: nadir footprint, steerable beam footprint, Earth central angle, dateline wrapping, and Mercator projection conversion.

The response must distinguish between simplified first-pass formulas and production-grade models such as ITU-R rain attenuation, atmospheric absorption, or higher-fidelity antenna radiation patterns.

## Professional Defaults

Recommend realistic default values and presets so the app starts in a credible engineering state instead of arbitrary demo settings.

Include defaults for:

- LEO, MEO, and GEO altitude or range assumptions.
- LEO, MEO, and GEO latency expectations.
- LEO, MEO, and GEO Doppler expectations.
- Minimum elevation mask, for example 10 deg, 20 deg, or 30 deg depending on scenario.
- RF bands and carrier frequencies for L, S, C, X, Ku, Ka, V, and custom frequency.
- Bandwidth presets for narrowband telemetry, broadband user links, and gateway links.
- Transmit power ranges and maximum realistic limits for user terminals, gateways, and satellites.
- Antenna gain or aperture presets for handheld, user terminal, gateway, and satellite phased-array or dish antennas.
- Antenna efficiency, feeder loss, implementation loss, pointing loss, polarization loss, and amplifier backoff.
- Target SNR, target Eb/N0, required link margin, and availability target.
- Rain fade and atmospheric margin by frequency band, especially Ku, Ka, and V-band.
- Color scales for gain, link margin, no coverage, warning, and failed link states.

## Acceptance Criteria

Define measurable acceptance criteria for a professional-grade version.

The assessment must propose targets for:

- Correct LEO/MEO/GEO orbit-class filtering and automatic classification from TLE or exported metadata.
- Required-power calculation accuracy against hand-calculated reference cases.
- Link margin calculation consistency with all values displayed in the UI.
- 2D Mercator footprint alignment with the 3D globe footprint.
- Dateline and polar footprint behavior.
- Elevation-mask and line-of-sight correctness.
- Doppler and latency values matching slant range and radial velocity.
- Clear failure states for insufficient power, no line of sight, invalid beam steering, and regulatory/EIRP violations.
- Interactive performance, including a target FPS and maximum acceptable update latency when multiple beams are active.
- Maintainability, including maximum complexity for the main HTML file and expected module boundaries.

Use concrete thresholds where possible. For example:

- 2D and 3D footprint center alignment within a small angular tolerance.
- Link budget reference cases within an acceptable dB tolerance.
- Required power increases correctly as slant range, bandwidth, rain fade, or target margin increases.
- GEO propagation delay is visibly and numerically much larger than LEO propagation delay.
- LEO Doppler is visibly and numerically larger than GEO Doppler for similar carrier frequency.

## Data Model Requirements

Recommend the data objects or JSON schemas required to support a professional simulator.

Include schemas or object models for:

- Satellite profile: NORAD ID, name, operator, orbit class, TLE lines, altitude, inclination, period, active/decayed status, service role, and available payload bands.
- RF terminal profile: terminal type, antenna gain, aperture, efficiency, G/T, power range, receiver noise figure, and supported bands.
- Beam profile: beam ID, satellite ID, target, beam mode, frequency, bandwidth, polarization, transmit power, antenna gain, steering angle, taper, and visualization style.
- Link budget result: range, elevation, azimuth, Doppler, delay, FSPL, EIRP, received power, noise power, C/N0, Eb/N0, SNR, margin, status, and failure reason.
- Scenario preset: selected satellites, terminals, RF profiles, time settings, visualization modes, and map/globe camera state.
- Coverage result: grid cell or polygon, link margin, required power, best satellite, best gateway, and reason for no coverage.

Explain how these models should be loaded, validated, persisted, and integrated with data exported by `SatelliteDataExporter.java`.

## Validation Scenarios

Require concrete validation scenarios that prove the implementation is not just visually plausible but technically coherent.

Include at minimum:

- One representative LEO satellite, one MEO satellite, and one GEO satellite.
- One ground gateway and one user terminal at known latitude/longitude.
- A fixed carrier frequency and bandwidth used to compare LEO, MEO, and GEO link budgets.
- A required-power comparison showing that larger slant range and higher loss require higher EIRP under the same receiver and margin assumptions.
- A Doppler comparison showing that LEO has much larger Doppler shift than GEO for the same carrier.
- A latency comparison showing that GEO delay is much higher than LEO delay.
- A 2D/3D footprint comparison using the same target and beam settings.
- A no-line-of-sight case where the app correctly refuses to draw a valid link.
- A low-power case where the app shows negative link margin and failed coverage.
- A high-frequency rain-fade case where Ka/V-band requires additional margin.

The assessment must recommend test files and test functions for these scenarios.

## Implementation Output Contract

The final expert response must be specific enough that a developer can start implementation without guessing.

Require the response to include:

- Exact menu sections and controls to add to `beamFormingSimulator3DWithMercatorMap_V2.html`.
- New JavaScript modules to create and their responsibilities.
- Existing code areas or functions that should be refactored or replaced.
- State objects for orbit selection, RF settings, beam settings, terminal settings, and computed link results.
- Live UI readouts that must update every simulation tick or after every user input change.
- Formula functions to implement, including names, inputs, outputs, and units.
- Rendering changes required for 2D footprints, 3D footprints, beam volumes, heatmaps, warning overlays, and legends.
- Tests to add for formulas, orbit-class behavior, footprint alignment, link-budget calculations, and UI state transitions.
- A first sprint plan with the smallest useful professional feature set.
- A longer production refactor plan that separates simulation, RF models, rendering, data loading, and UI.

## Pro-Version Feature Checklist

Identify which of these features should be added or prioritized:

- Scenario builder with saved presets.
- Ground station database and editable user terminals.
- Live TLE refresh and versioned data snapshots.
- Real-time link budget and coverage confidence.
- Orbit-class selector with automatic LEO/MEO/GEO computation changes.
- Required-power calculator for any selected point on Earth's surface in 2D or 3D.
- Coverage-by-power map that shows where the selected satellite can close the link.
- Link-margin heatmap that updates from RF power, bandwidth, frequency, antenna, rain fade, and orbit-class settings.
- LEO/MEO/GEO comparison mode for range, latency, Doppler, path loss, footprint size, handover rate, and required transmit power.
- Beam steering timeline and handover planner.
- Interference and frequency reuse simulation.
- Weather/rain fade overlays for Ka/V-band realism.
- Regulatory masks, exclusion zones, and country/region overlays.
- Measurement cursor for map/globe readouts.
- Playback recording and mission-analysis report generation.
- Professional theme, legends, units, status indicators, and diagnostics panel.

## Required Output Format

Return the assessment in this structure:

1. Executive summary.
2. Top 10 issues blocking a professional-grade simulator.
3. RF and beamforming realism improvements.
4. Orbital/geospatial accuracy improvements.
5. 3D rendering and Mercator visualization improvements.
6. UI/UX improvements for a pro operational tool.
7. Detailed menu design for LEO/MEO/GEO selection, RF power controls, and required-power/coverage-by-power workflows.
8. Mandatory formulas with units, assumptions, and simplified versus production-grade model notes.
9. Professional default values for LEO, MEO, GEO, RF bands, terminals, antennas, margins, and visualization scales.
10. Acceptance criteria with measurable thresholds.
11. Data model and JSON schema recommendations.
12. Validation scenarios and test plan.
13. Integration recommendations for `SatelliteDataExporter.java`.
14. Code architecture and maintainability recommendations.
15. Prioritized implementation roadmap:
    - Quick wins.
    - Medium-depth improvements.
    - Deep refactors.
    - Advanced pro-version features.

For every recommendation, include:

- Why it matters.
- What is currently likely wrong or incomplete.
- The specific file/function/area to change.
- The expected realism or usability impact.
- Any formula, algorithm, library, shader, or data source that should be used.
