// js/solarSystemOverviewLoader.js
// Standalone and integrated helpers for the OpenBEXI heliocentric visual overview.

import * as THREE from 'three';

export const SOLAR_SYSTEM_TEXTURE_PATHS = {
    sun: 'textures/planets/sun.jpg',
    mercury: 'textures/planets/mercury.jpg',
    venus: 'textures/planets/venus.jpg',
    earth: 'textures/earthmap1k.jpg',
    moon: 'textures/moon_map2.jpg',
    mars: 'textures/March_8k.jpg',
    jupiter: 'textures/planets/jupiter.jpg',
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
    'textures/planets/*.jpg and saturn_ring.png are project-generated procedural visual maps for OpenBEXI.',
    'textures/earthmap1k.jpg is the existing OpenBEXI Earth runtime texture.',
    'textures/moon_map2.jpg is the existing OpenBEXI Moon runtime texture.',
    'textures/March_8k.jpg is the optimized OpenBEXI Mars runtime texture generated from textures/March.jpg.'
];

const AU_VISUAL_SCALE = 16;
const ORBIT_SEGMENTS = 512;
const SKY_RADIUS = 430;
const LABEL_SCALE = 7.5;
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY_MS = 86400000;

let raycaster = null;
let pointerNdc = null;

export function createSolarSystemOverview(scene, {
    renderer = null,
    camera = null,
    controls = null
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
    updateSolarSystemOverview(overview, new Date());
    setSolarSystemOverviewOptions(overview, overview.options);
    return overview;
}

export function updateSolarSystemOverview(overview, simDate = new Date()) {
    if (!overview) return;
    overview.planets.forEach((entry) => {
        const position = planetPositionAtDate(entry.planet, simDate);
        entry.group.position.copy(position);
        if (entry.orbit?.userData?.parentName) {
            const parent = SOLAR_SYSTEM_PLANETS.find(item => item.name === entry.orbit.userData.parentName);
            if (parent) entry.orbit.position.copy(planetPositionAtDate(parent, simDate));
        }
        entry.marker.rotation.y += 0.0025;
        entry.label.position.set(entry.planet.visualRadius + 4.4, entry.planet.visualRadius + 2.5, 0);
    });
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

export function solarSystemPlanetSummary(planet) {
    if (!planet) return '';
    if (planet.parentName) {
        return `${planet.name}: ${Math.round(planet.periodDays)} day visual orbit around ${planet.parentName}, approximate visual ephemeris`;
    }
    return `${planet.name}: ${planet.semiMajorAu.toFixed(3)} AU, orbital period ${Math.round(planet.periodDays)} days, approximate visual ephemeris`;
}

export function planetPositionAtDate(planet, simDate) {
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
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(3, 7, 14, 0.64)';
    roundRect(ctx, 0, 20, canvas.width, 78, 22);
    ctx.fill();
    ctx.font = 'bold 46px Trebuchet MS, Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.strokeText(text, 22, 61);
    ctx.fillStyle = '#eef8ff';
    ctx.fillText(text, 22, 61);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.arc(canvas.width - 38, 60, 13, 0, Math.PI * 2);
    ctx.fill();

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
        depthTest: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(LABEL_SCALE * 4, LABEL_SCALE, 1);
    return sprite;
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
