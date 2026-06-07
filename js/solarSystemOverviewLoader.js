// js/solarSystemOverviewLoader.js
// Standalone and integrated helpers for the OpenBEXI heliocentric visual overview.

import * as THREE from 'three';
import {
    createSolarSystemEphemerisState,
    loadSolarSystemEphemeris,
    solarSystemEphemerisStatusText,
    solarSystemScenePositionForBody
} from './solarSystemEphemeris.js';

export const SOLAR_SYSTEM_TEXTURE_PATHS = {
    sun: 'textures/planets/sun.jpg',
    mercury: 'textures/mercury.png',
    venus: 'textures/venus.png',
    earth: 'textures/earthmap1k.jpg',
    moon: 'textures/moon_map2.jpg',
    mars: 'textures/March_8k.jpg',
    jupiter: 'textures/jupiter.jpg',
    saturn: 'textures/planets/saturn.jpg',
    saturnRing: 'textures/planets/saturn_ring.png',
    uranus: 'textures/planets/uranus.jpg',
    milkyWay: 'obj/Textures/starmap-4k.jpg'
};

export const SOLAR_SYSTEM_PLANETS = [
    {
        name: 'Mercury',
        key: 'mercury',
        semiMajorAu: 0.387,
        eccentricity: 0.2056,
        inclinationDeg: 7.0,
        periodDays: 87.969,
        phaseDeg: 75,
        visualRadius: 0.68,
        color: 0xd8c5a5,
        orbitColor: 0xd0c098,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.mercury
    },
    {
        name: 'Venus',
        key: 'venus',
        semiMajorAu: 0.723,
        eccentricity: 0.0068,
        inclinationDeg: 3.39,
        periodDays: 224.701,
        phaseDeg: 112,
        visualRadius: 0.95,
        color: 0xe2d1aa,
        orbitColor: 0xc9b779,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.venus
    },
    {
        name: 'Earth',
        key: 'earth',
        semiMajorAu: 1.0,
        eccentricity: 0.0167,
        inclinationDeg: 0.0,
        periodDays: 365.256,
        phaseDeg: 0,
        visualRadius: 1.05,
        color: 0x4fa7ff,
        orbitColor: 0x4aa5ff,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.earth
    },
    {
        name: 'Moon',
        key: 'moon',
        parentName: 'Earth',
        orbitRadiusVisual: 3.25,
        eccentricity: 0.0549,
        inclinationDeg: 5.14,
        periodDays: 27.3217,
        phaseDeg: 186,
        visualRadius: 0.34,
        color: 0xd8d8ce,
        orbitColor: 0xbfc7d5,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.moon
    },
    {
        name: 'Mars',
        key: 'mars',
        semiMajorAu: 1.524,
        eccentricity: 0.0934,
        inclinationDeg: 1.85,
        periodDays: 686.98,
        phaseDeg: 42,
        visualRadius: 0.86,
        color: 0xff4b3d,
        orbitColor: 0xff7259,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.mars
    },
    {
        name: 'Jupiter',
        key: 'jupiter',
        semiMajorAu: 5.203,
        eccentricity: 0.0489,
        inclinationDeg: 1.3,
        periodDays: 4332.59,
        phaseDeg: 212,
        visualRadius: 2.1,
        color: 0xff8a2d,
        orbitColor: 0xd8c38e,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.jupiter
    },
    {
        name: 'Saturn',
        key: 'saturn',
        semiMajorAu: 9.537,
        eccentricity: 0.0565,
        inclinationDeg: 2.49,
        periodDays: 10759.22,
        phaseDeg: 318,
        visualRadius: 1.85,
        color: 0xffd829,
        orbitColor: 0xdbc155,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.saturn,
        ringTextureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.saturnRing,
        hasRing: true
    },
    {
        name: 'Uranus',
        key: 'uranus',
        semiMajorAu: 19.191,
        eccentricity: 0.0472,
        inclinationDeg: 0.77,
        periodDays: 30685.4,
        phaseDeg: 154,
        visualRadius: 1.45,
        color: 0x2fd7c4,
        orbitColor: 0x55d6d6,
        textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.uranus
    }
];

export const SOLAR_SYSTEM_TEXTURE_ATTRIBUTIONS = [
    'textures/mercury.png, textures/venus.png, and textures/jupiter.jpg are local project-provided planet texture assets.',
    'textures/planets/*.jpg and saturn_ring.png are project-generated procedural visual maps for OpenBEXI unless replaced by verified source assets.',
    'textures/earthmap1k.jpg is the existing OpenBEXI Earth runtime texture.',
    'textures/moon_map2.jpg is the existing OpenBEXI Moon runtime texture.',
    'textures/March_8k.jpg is the optimized OpenBEXI Mars runtime texture generated from textures/March.jpg.'
];

const AU_VISUAL_SCALE = 16;
const ORBIT_SEGMENTS = 512;
const EPHEMERIS_ORBIT_MIN_FRACTION = 0.95;
const SKY_RADIUS = 430;
export const SOLAR_SYSTEM_LABEL_MIN_SCREEN_PX = 18;
export const SOLAR_SYSTEM_LABEL_PREFERRED_SCREEN_PX = 28;
export const SOLAR_SYSTEM_LABEL_MAX_SCREEN_PX = 42;
const LABEL_BASE_SCALE = new THREE.Vector3(12.8, 4.0, 1);
const LABEL_MIN_WORLD_SCALE = 0.01;
const LABEL_MAX_DISTANCE_SCALE = 5.2;
const LABEL_PIN_CENTER_X = 42 / 512;
const LABEL_PIN_CENTER_Y = (160 - 122) / 160;
const DEFAULT_LABEL_VIEWPORT_HEIGHT = 800;
const DEFAULT_LABEL_CAMERA_FOV_DEG = 52;
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY_MS = 86400000;

let raycaster = null;
let pointerNdc = null;
const labelWorldPosition = new THREE.Vector3();

export function createSolarSystemOverview(scene, {
    renderer = null,
    camera = null,
    controls = null,
    initialDate = null,
    autoLoadEphemeris = true
} = {}) {
    const root = new THREE.Group();
    root.name = 'Solar System Overview Root';
    root.visible = false;
    scene.add(root);

    const textureLoader = new THREE.TextureLoader();
    const overview = {
        root,
        renderer,
        camera,
        controls,
        planets: new Map(),
        pickTargets: [],
        orbitGroup: new THREE.Group(),
        labelGroup: new THREE.Group(),
        sunGlowGroup: new THREE.Group(),
        starGroup: new THREE.Group(),
        selectedPlanet: null,
        selectedHighlight: null,
        ephemerisState: createSolarSystemEphemerisState(),
        ephemerisRuntimeMode: 'approximate visual fallback',
        ephemerisWarning: 'JPL-derived ephemeris has not loaded yet.',
        ephemerisOrbitPathsBuilt: false,
        options: {
            planetLabels: true,
            orbitPaths: true,
            planetTextures: true,
            sunGlow: true
        }
    };

    overview.orbitGroup.name = 'Solar System Orbit Paths';
    overview.labelGroup.name = 'Solar System Planet Labels';
    overview.sunGlowGroup.name = 'Solar System Sun Glow';
    overview.starGroup.name = 'Solar System Star Background';
    root.add(overview.starGroup, overview.orbitGroup, overview.labelGroup, overview.sunGlowGroup);

    createStarBackground(overview, textureLoader);
    createSun(overview, textureLoader);
    createPlanets(overview, textureLoader);
    createSelectedHighlight(overview);
    if (initialDate) updateSolarSystemOverview(overview, initialDate);
    if (autoLoadEphemeris) {
        loadSolarSystemEphemeris(overview.ephemerisState)
            .then(() => rebuildOrbitPathsFromEphemeris(overview))
            .catch(() => {});
    }
    setSolarSystemOverviewOptions(overview, overview.options);
    return overview;
}

export function advanceSolarSystemSimulationMillis(currentMillis, dtSeconds, timeWarp) {
    const baseMillis = Number.isFinite(currentMillis) ? currentMillis : 0;
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    const warp = Number.isFinite(timeWarp) && timeWarp > 0 ? timeWarp : 0;
    if (!dt || !warp) return baseMillis;
    return baseMillis + dt * 1000 * 60 * warp;
}

export function updateSolarSystemOverview(overview, simDate) {
    if (!overview) return;
    let usedFallback = false;
    let warning = '';
    overview.planets.forEach((entry) => {
        const position = planetPositionAtDate(entry.planet, simDate, overview.ephemerisState);
        if (overview.ephemerisState?.status !== 'ready') {
            usedFallback = true;
            warning = overview.ephemerisState?.lastWarning || 'JPL-derived ephemeris is unavailable';
        }
        entry.group.position.copy(position);
        if (entry.orbit?.userData?.parentName) {
            const parent = SOLAR_SYSTEM_PLANETS.find(item => item.name === entry.orbit.userData.parentName);
            if (parent) entry.orbit.position.copy(planetPositionAtDate(parent, simDate, overview.ephemerisState));
        }
        entry.marker.rotation.y += 0.0025;
        updatePlanetLabelCallout(entry, overview);
    });
    if (overview.ephemerisState?.status === 'ready') {
        if (!overview.ephemerisOrbitPathsBuilt) rebuildOrbitPathsFromEphemeris(overview);
        overview.ephemerisRuntimeMode = usedFallback ? 'approximate visual fallback' : 'JPL-derived ephemeris';
        overview.ephemerisWarning = warning;
    } else {
        overview.ephemerisRuntimeMode = 'approximate visual fallback';
        overview.ephemerisWarning = warning || overview.ephemerisState?.lastWarning || 'JPL-derived ephemeris is unavailable';
    }
    updateSelectedHighlight(overview);
}

export function setSolarSystemOverviewVisible(overview, visible) {
    if (!overview?.root) return;
    overview.root.visible = !!visible;
}

export function setSolarSystemOverviewOptions(overview, options = {}) {
    if (!overview) return;
    overview.options = { ...overview.options, ...options };
    overview.labelGroup.visible = !!overview.options.planetLabels;
    overview.orbitGroup.visible = !!overview.options.orbitPaths;
    overview.sunGlowGroup.visible = !!overview.options.sunGlow;
    overview.planets.forEach((entry) => {
        entry.label.visible = !!overview.options.planetLabels;
        if (entry.texturedMaterial) {
            entry.marker.material = overview.options.planetTextures
                ? entry.texturedMaterial
                : entry.fallbackMaterial;
        }
    });
}

export function pickSolarSystemPlanet(overview, event, camera = overview?.camera) {
    if (!overview?.root?.visible || !camera || !event?.target) return null;
    if (!raycaster) raycaster = new THREE.Raycaster();
    if (!pointerNdc) pointerNdc = new THREE.Vector2();
    const rect = event.target.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(overview.pickTargets, true);
    const hit = hits.find(item => item.object?.userData?.solarSystemPlanetName);
    return hit?.object?.userData?.solarSystemPlanetName || null;
}

export function setSolarSystemSelectedPlanet(overview, planetName) {
    if (!overview) return null;
    const entry = planetName ? overview.planets.get(planetName) : null;
    overview.selectedPlanet = entry ? planetName : null;
    updateSelectedHighlight(overview);
    overview.planets.forEach((planetEntry) => {
        planetEntry.label.material.opacity = !entry || planetEntry.planet.name === planetName ? 1 : 0.62;
    });
    return entry || null;
}

export function focusSolarSystemPlanet(overview, planetName, camera = overview?.camera, controls = overview?.controls) {
    const entry = setSolarSystemSelectedPlanet(overview, planetName);
    if (!entry || !camera || !controls) return null;
    entry.group.updateMatrixWorld(true);
    const target = new THREE.Vector3().setFromMatrixPosition(entry.group.matrixWorld);
    const direction = target.clone().normalize();
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.35, 1).normalize();
    const distance = Math.max(entry.planet.visualRadius * 16, 16);
    const cameraPosition = target.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, entry.planet.visualRadius * 4, 0));
    camera.position.copy(cameraPosition);
    controls.target.copy(target);
    controls.minDistance = Math.max(entry.planet.visualRadius * 2.4, 2);
    controls.maxDistance = 520;
    controls.update();
    return { entry, target, cameraPosition };
}

export function resetSolarSystemOverviewCamera(overview, camera = overview?.camera, controls = overview?.controls) {
    if (!overview || !camera || !controls) return;
    setSolarSystemSelectedPlanet(overview, null);
    camera.position.set(0, 115, 238);
    controls.target.set(0, 0, 0);
    controls.minDistance = 14;
    controls.maxDistance = 520;
    controls.update();
}

export function solarSystemPlanetSummary(planet, overview = null) {
    if (!planet) return '';
    const ephemerisText = overview ? ` | ${solarSystemEphemerisStatusText(overview.ephemerisState)}` : '';
    if (planet.parentName) {
        return `${planet.name}: Earth-relative JPL-derived Moon vector when ephemeris is available${ephemerisText}`;
    }
    return `${planet.name}: ${planet.semiMajorAu.toFixed(3)} AU, orbital period ${Math.round(planet.periodDays)} days${ephemerisText}`;
}

export function solarSystemEphemerisSummary(overview) {
    return solarSystemEphemerisStatusText(overview?.ephemerisState);
}

export function planetPositionAtDate(planet, simDate, ephemerisStateOrData = null) {
    const ephemerisData = ephemerisStateOrData?.data || ephemerisStateOrData;
    if (ephemerisData?.bodies?.[planet.key]) {
        const result = solarSystemScenePositionForBody(ephemerisData, planet.key, simDate);
        updateEphemerisRuntimeStatus(ephemerisStateOrData, result, planet.key);
        if (result.status === 'ok' && result.position) return result.position;
    }
    if (planet.parentName) {
        const parent = SOLAR_SYSTEM_PLANETS.find(item => item.name === planet.parentName);
        const parentPosition = parent ? planetPositionAtDate(parent, simDate) : new THREE.Vector3();
        return parentPosition.add(moonPositionRelativeToParent(planet, simDate));
    }
    const daysSinceJ2000 = (simDate.getTime() - J2000_UTC_MS) / DAY_MS;
    const meanAnomaly = normalizeRadians(
        THREE.MathUtils.degToRad(planet.phaseDeg) + daysSinceJ2000 * Math.PI * 2 / planet.periodDays
    );
    const eccentricAnomaly = solveKepler(meanAnomaly, planet.eccentricity);
    const trueAnomaly = 2 * Math.atan2(
        Math.sqrt(1 + planet.eccentricity) * Math.sin(eccentricAnomaly / 2),
        Math.sqrt(1 - planet.eccentricity) * Math.cos(eccentricAnomaly / 2)
    );
    return planetPositionFromTrueAnomaly(planet, trueAnomaly);
}

function updateEphemerisRuntimeStatus(ephemerisStateOrData, result, bodyKey) {
    const state = ephemerisStateOrData?.data ? ephemerisStateOrData : null;
    if (!state || state.status !== 'ready') return;
    if (result.status === 'ok') {
        state.lastMode = 'JPL-derived ephemeris';
        state.lastWarning = '';
        return;
    }
    state.lastMode = 'approximate visual fallback';
    state.lastWarning = result.warning || `No JPL-derived ephemeris position for ${bodyKey}`;
}

function createSun(overview, textureLoader) {
    const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3.2, 64, 32), fallbackMaterial);
    sun.name = 'Solar System Sun';
    overview.root.add(sun);

    textureLoader.load(
        SOLAR_SYSTEM_TEXTURE_PATHS.sun,
        (texture) => {
            prepareColorTexture(texture, overview.renderer);
            sun.material = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff });
        },
        undefined,
        () => {}
    );

    const glowTexture = createGlowTexture();
    [
        { scale: 19, opacity: 0.72, color: 0xffd37a },
        { scale: 34, opacity: 0.32, color: 0xff9e46 },
        { scale: 62, opacity: 0.14, color: 0xff6f22 }
    ].forEach((layer) => {
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color: layer.color,
            transparent: true,
            opacity: layer.opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.name = 'Solar System Sun Glow';
        sprite.scale.set(layer.scale, layer.scale, 1);
        overview.sunGlowGroup.add(sprite);
    });

    const light = new THREE.PointLight(0xfff1c0, 5.5, 850, 0.35);
    light.name = 'Solar System Sun Light';
    overview.root.add(light);
}

function createPlanets(overview, textureLoader) {
    SOLAR_SYSTEM_PLANETS.forEach((planet) => {
        const orbit = createOrbitPath(planet);
        overview.orbitGroup.add(orbit);

        const fallbackMaterial = new THREE.MeshStandardMaterial({
            color: planet.color,
            emissive: planet.color,
            emissiveIntensity: 0.1,
            roughness: 0.72,
            metalness: 0.02
        });
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(planet.visualRadius, 32, 16),
            fallbackMaterial
        );
        marker.name = `Solar System Planet ${planet.name}`;
        marker.userData.solarSystemPlanetName = planet.name;

        const label = createPlanetLabel(planet.name, planet.color);
        label.name = `Solar System Planet Label ${planet.name}`;
        label.userData.solarSystemPlanetName = planet.name;

        const group = new THREE.Group();
        group.name = `Solar System Planet Group ${planet.name}`;
        group.add(marker);
        group.add(label);

        const entry = {
            planet,
            group,
            marker,
            label,
            fallbackMaterial,
            texturedMaterial: null,
            orbit
        };
        overview.planets.set(planet.name, entry);
        overview.pickTargets.push(marker, label);

        textureLoader.load(
            planet.textureUrl,
            (texture) => {
                prepareColorTexture(texture, overview.renderer);
                entry.texturedMaterial = new THREE.MeshStandardMaterial({
                    map: texture,
                    color: 0xffffff,
                    roughness: 0.78,
                    metalness: 0.02
                });
                if (overview.options.planetTextures) marker.material = entry.texturedMaterial;
            },
            undefined,
            () => {
                marker.material = fallbackMaterial;
            }
        );

        if (planet.hasRing) {
            const ring = createSaturnRing(planet, textureLoader, overview.renderer);
            marker.add(ring);
        }

        overview.root.add(group);
    });
}

function createOrbitPath(planet) {
    const points = [];
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
        const trueAnomaly = i / ORBIT_SEGMENTS * Math.PI * 2;
        points.push(planet.parentName
            ? moonPositionRelativeToParentFromTrueAnomaly(planet, trueAnomaly)
            : planetPositionFromTrueAnomaly(planet, trueAnomaly));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: planet.orbitColor,
        transparent: true,
        opacity: planet.name === 'Uranus' ? 0.55 : 0.66
    });
    const orbit = new THREE.LineLoop(geometry, material);
    orbit.name = `${planet.name} Orbit Path`;
    if (planet.parentName) orbit.userData.parentName = planet.parentName;
    return orbit;
}

function rebuildOrbitPathsFromEphemeris(overview) {
    const data = overview?.ephemerisState?.data;
    if (!data?.times?.length) return;
    overview.planets.forEach((entry) => {
        if (!shouldUseEphemerisOrbitPath(entry.planet, data)) return;
        const startMs = data.timeMs[0];
        const oneOrbitTimeMs = entry.planet.periodDays * DAY_MS;
        const points = [];
        for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
            const orbitFraction = i / ORBIT_SEGMENTS;
            const position = planetPositionAtDate(entry.planet, new Date(startMs + oneOrbitTimeMs * orbitFraction), data);
            if (position) points.push(position);
        }
        if (points.length < 3) return;
        entry.orbit.geometry.dispose();
        entry.orbit.geometry = new THREE.BufferGeometry().setFromPoints(points);
        entry.orbit.name = `${entry.planet.name} JPL-derived Orbit Path`;
    });
    overview.ephemerisOrbitPathsBuilt = true;
}

export function shouldUseEphemerisOrbitPath(planet, ephemerisData) {
    if (!planet || planet.parentName || !Number.isFinite(planet.periodDays)) return false;
    if (!ephemerisData?.timeMs || ephemerisData.timeMs.length < 2) return false;
    const coverageDays = (ephemerisData.timeMs[ephemerisData.timeMs.length - 1] - ephemerisData.timeMs[0]) / DAY_MS;
    return coverageDays >= planet.periodDays * EPHEMERIS_ORBIT_MIN_FRACTION;
}

function createSaturnRing(planet, textureLoader, renderer) {
    const geometry = new THREE.RingGeometry(planet.visualRadius * 1.45, planet.visualRadius * 2.2, 96);
    const material = new THREE.MeshBasicMaterial({
        color: 0xd9c57a,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.name = 'Saturn Ring';
    ring.rotation.x = Math.PI / 2.7;
    textureLoader.load(
        SOLAR_SYSTEM_TEXTURE_PATHS.saturnRing,
        (texture) => {
            prepareColorTexture(texture, renderer);
            material.map = texture;
            material.color.set(0xffffff);
            material.needsUpdate = true;
        },
        undefined,
        () => {}
    );
    return ring;
}

function createPlanetLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colorHex = `#${color.toString(16).padStart(6, '0')}`;
    ctx.font = '700 38px Trebuchet MS, Segoe UI, sans-serif';
    const labelWidth = Math.min(330, Math.ceil(ctx.measureText(text).width) + 64);
    const labelX = 122;
    const labelY = 46;
    const labelHeight = 58;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(235, 246, 255, 0.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(42, 122);
    ctx.lineTo(88, 96);
    ctx.lineTo(labelX, labelY + labelHeight / 2);
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(42, 122, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(245, 250, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = 'rgba(4, 10, 18, 0.56)';
    roundRect(ctx, labelX, labelY, labelWidth, labelHeight, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(225, 239, 255, 0.42)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.strokeText(text, labelX + 22, labelY + labelHeight / 2 + 1);
    ctx.fillStyle = '#eef8ff';
    ctx.fillText(text, labelX + 22, labelY + labelHeight / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    prepareColorTexture(texture);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(LABEL_PIN_CENTER_X, LABEL_PIN_CENTER_Y);
    sprite.userData.baseScale = LABEL_BASE_SCALE.clone();
    sprite.scale.copy(LABEL_BASE_SCALE);
    return sprite;
}

function updatePlanetLabelCallout(entry, overviewOrCamera) {
    const label = entry?.label;
    const planet = entry?.planet;
    if (!label || !planet) return;
    const pinOffset = Math.max(planet.visualRadius * 1.05, 0.38);
    label.position.set(planet.visualRadius * 0.15, pinOffset, 0);
    const baseScale = label.userData.baseScale || LABEL_BASE_SCALE;
    const camera = overviewOrCamera?.camera || overviewOrCamera;
    if (!camera || !entry.group) {
        label.scale.copy(baseScale);
        return;
    }
    entry.group.updateMatrixWorld(true);
    labelWorldPosition.setFromMatrixPosition(entry.group.matrixWorld);
    const distance = camera.position.distanceTo(labelWorldPosition);
    const scaleFactor = solarSystemLabelScaleFactorForDistance(distance, {
        fovDeg: camera.fov,
        viewportHeight: solarSystemLabelViewportHeight(overviewOrCamera?.renderer)
    });
    label.scale.set(baseScale.x * scaleFactor, baseScale.y * scaleFactor, 1);
}

export function solarSystemLabelScaleFactorForDistance(distance, {
    fovDeg = DEFAULT_LABEL_CAMERA_FOV_DEG,
    viewportHeight = DEFAULT_LABEL_VIEWPORT_HEIGHT,
    baseWorldHeight = LABEL_BASE_SCALE.y
} = {}) {
    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const safeFov = Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : DEFAULT_LABEL_CAMERA_FOV_DEG;
    const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : DEFAULT_LABEL_VIEWPORT_HEIGHT;
    const safeBaseWorldHeight = Number.isFinite(baseWorldHeight) && baseWorldHeight > 0 ? baseWorldHeight : LABEL_BASE_SCALE.y;
    const perspectiveHeightAtDistance = 2 * safeDistance * Math.tan(THREE.MathUtils.degToRad(safeFov) / 2);
    const preferredScale = SOLAR_SYSTEM_LABEL_PREFERRED_SCREEN_PX * perspectiveHeightAtDistance /
        (safeViewportHeight * safeBaseWorldHeight);
    const maxScreenScale = SOLAR_SYSTEM_LABEL_MAX_SCREEN_PX * perspectiveHeightAtDistance /
        (safeViewportHeight * safeBaseWorldHeight);
    return clampNumber(
        preferredScale,
        LABEL_MIN_WORLD_SCALE,
        Math.min(LABEL_MAX_DISTANCE_SCALE, Math.max(LABEL_MIN_WORLD_SCALE, maxScreenScale))
    );
}

export function solarSystemLabelScreenHeightPxForScale(scaleFactor, distance, {
    fovDeg = DEFAULT_LABEL_CAMERA_FOV_DEG,
    viewportHeight = DEFAULT_LABEL_VIEWPORT_HEIGHT,
    baseWorldHeight = LABEL_BASE_SCALE.y
} = {}) {
    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const safeFov = Number.isFinite(fovDeg) && fovDeg > 0 ? fovDeg : DEFAULT_LABEL_CAMERA_FOV_DEG;
    const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : DEFAULT_LABEL_VIEWPORT_HEIGHT;
    const safeBaseWorldHeight = Number.isFinite(baseWorldHeight) && baseWorldHeight > 0 ? baseWorldHeight : LABEL_BASE_SCALE.y;
    const perspectiveHeightAtDistance = 2 * safeDistance * Math.tan(THREE.MathUtils.degToRad(safeFov) / 2);
    return scaleFactor * safeBaseWorldHeight * safeViewportHeight / perspectiveHeightAtDistance;
}

function solarSystemLabelViewportHeight(renderer) {
    return renderer?.domElement?.clientHeight ||
        renderer?.domElement?.height ||
        DEFAULT_LABEL_VIEWPORT_HEIGHT;
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function createSelectedHighlight(overview) {
    const geometry = new THREE.RingGeometry(3.2, 3.8, 96);
    const material = new THREE.MeshBasicMaterial({
        color: 0x8fd0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.name = 'Solar System Selected Planet Highlight';
    ring.visible = false;
    ring.rotation.x = Math.PI / 2;
    overview.root.add(ring);
    overview.selectedHighlight = ring;
}

function updateSelectedHighlight(overview) {
    const highlight = overview?.selectedHighlight;
    if (!highlight) return;
    const entry = overview.selectedPlanet ? overview.planets.get(overview.selectedPlanet) : null;
    if (!entry) {
        highlight.visible = false;
        return;
    }
    entry.group.updateMatrixWorld(true);
    highlight.visible = true;
    highlight.position.setFromMatrixPosition(entry.group.matrixWorld);
    const scale = Math.max(entry.planet.visualRadius * 1.35, 1.4);
    highlight.scale.setScalar(scale);
}

function createStarBackground(overview, textureLoader) {
    textureLoader.load(
        SOLAR_SYSTEM_TEXTURE_PATHS.milkyWay,
        (texture) => {
            prepareColorTexture(texture, overview.renderer);
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(SKY_RADIUS, 96, 64),
                new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.BackSide,
                    color: 0x8fa7c8
                })
            );
            sphere.name = 'Solar System Milky Way Star Sphere';
            overview.starGroup.add(sphere);
        },
        undefined,
        () => {
            overview.starGroup.add(createProceduralStarField());
        }
    );
}

function createProceduralStarField() {
    const starCount = 2600;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
        const z = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - z * z) * SKY_RADIUS * 0.98;
        const i3 = i * 3;
        positions[i3] = r * Math.cos(theta);
        positions[i3 + 1] = z * SKY_RADIUS * 0.98;
        positions[i3 + 2] = r * Math.sin(theta);
        const tint = 0.68 + Math.random() * 0.32;
        colors[i3] = tint;
        colors[i3 + 1] = tint * (0.9 + Math.random() * 0.1);
        colors[i3 + 2] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            size: 1.45,
            vertexColors: true,
            transparent: true,
            opacity: 0.82,
            depthWrite: false
        })
    );
}

function planetPositionFromTrueAnomaly(planet, trueAnomaly) {
    const a = planet.semiMajorAu * AU_VISUAL_SCALE;
    const e = planet.eccentricity;
    const radius = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
    const inclination = THREE.MathUtils.degToRad(planet.inclinationDeg);
    const x = radius * Math.cos(trueAnomaly);
    const orbitalY = radius * Math.sin(trueAnomaly);
    const y = orbitalY * Math.sin(inclination);
    const z = orbitalY * Math.cos(inclination);
    return new THREE.Vector3(x, y, z);
}

function moonPositionRelativeToParent(planet, simDate) {
    const daysSinceJ2000 = (simDate.getTime() - J2000_UTC_MS) / DAY_MS;
    const meanAnomaly = normalizeRadians(
        THREE.MathUtils.degToRad(planet.phaseDeg) + daysSinceJ2000 * Math.PI * 2 / planet.periodDays
    );
    const eccentricAnomaly = solveKepler(meanAnomaly, planet.eccentricity);
    const trueAnomaly = 2 * Math.atan2(
        Math.sqrt(1 + planet.eccentricity) * Math.sin(eccentricAnomaly / 2),
        Math.sqrt(1 - planet.eccentricity) * Math.cos(eccentricAnomaly / 2)
    );
    return moonPositionRelativeToParentFromTrueAnomaly(planet, trueAnomaly);
}

function moonPositionRelativeToParentFromTrueAnomaly(planet, trueAnomaly) {
    const a = planet.orbitRadiusVisual;
    const e = planet.eccentricity;
    const radius = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));
    const inclination = THREE.MathUtils.degToRad(planet.inclinationDeg);
    const x = radius * Math.cos(trueAnomaly);
    const orbitalY = radius * Math.sin(trueAnomaly);
    const y = orbitalY * Math.sin(inclination);
    const z = orbitalY * Math.cos(inclination);
    return new THREE.Vector3(x, y, z);
}

function solveKepler(meanAnomaly, eccentricity) {
    let eccentricAnomaly = meanAnomaly;
    for (let i = 0; i < 8; i += 1) {
        eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
            (1 - eccentricity * Math.cos(eccentricAnomaly));
    }
    return eccentricAnomaly;
}

function normalizeRadians(value) {
    const twoPi = Math.PI * 2;
    const normalized = value % twoPi;
    return normalized < 0 ? normalized + twoPi : normalized;
}

function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,240,1)');
    gradient.addColorStop(0.18, 'rgba(255,211,112,0.95)');
    gradient.addColorStop(0.44, 'rgba(255,127,38,0.38)');
    gradient.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    prepareColorTexture(texture);
    return texture;
}

function prepareColorTexture(texture, renderer = null) {
    texture.colorSpace = THREE.SRGBColorSpace;
    const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.();
    if (anisotropy) texture.anisotropy = anisotropy;
}

function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}
