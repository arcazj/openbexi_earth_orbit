import {
    earthConfig,
    getFullGitHubUrl,
    GITHUB_REPO_RAW_BASE_URL,
    satelliteConfig
} from './SatelliteConfigurationLoader.js';
import {isUsableOrbitPosition, satellites} from './satelliteTLELoader.js';
import {drawDayNightMercator} from './drawDayNight.js';
import {mercatorPixelFromLonLat} from './orbit/orbitLinkGeometry.js';
import {MARS_TEXTURE_URL} from './MarsFrameLoader.js';
import {sceneToEciVector} from './sceneFrame.js';
import {
    isTrackedRecordPropagatable,
    TRACKED_OBJECT_VISUALS,
    trackedObjectVisual
} from './trackedObjectCatalog.js';

export let mercatorContainer, mercatorCanvasElement, mapBackgroundDiv;
export let mercatorCtx, mapWidth = 400, mapHeight = 200;
const ImageCtor = globalThis.Image || class {
    constructor() {
        this.complete = false;
        this.naturalHeight = 0;
    }
};
let mercatorSatIcon = new ImageCtor();
let mercatorSatIconLoaded = false;
let activeMercatorBackgroundUrl = null;
let activeMercatorBackgroundBody = null;
const MAX_MERCATOR_LABELS = 250;
const GROUND_TRACK_SIM_REFRESH_MS = 5 * 60_000;
const GROUND_TRACK_REAL_REFRESH_MS = 1_000;
const mercatorEciScratch = {x: 0, y: 0, z: 0};
const groundTrackCache = {
    satelliteKey: '',
    startTimeMs: Number.NaN,
    lastBuiltRealMs: Number.NEGATIVE_INFINITY
};
const mercatorVisualCache = new WeakMap();

function mercatorVisualSource(record) {
    return record?.object_type ?? record?.objectType ?? record?.catalogObject?.object_type ??
        record?.element_set?.omm?.OBJECT_TYPE ?? record?.meta?.object_type ??
        record?.satellite_name ?? record?.name ?? '';
}

function mercatorVisual(record) {
    const source = mercatorVisualSource(record);
    const cached = mercatorVisualCache.get(record);
    if (cached?.source === source) return cached.visual;
    const visual = trackedObjectVisual(record);
    mercatorVisualCache.set(record, { source, visual });
    return visual;
}

function traceTrackedMarker(ctx, marker, x, y, radius) {
    if (marker === 'diamond') {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius, y);
        ctx.closePath();
        return;
    }
    if (marker === 'square') {
        ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
        return;
    }
    if (marker === 'triangle') {
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y + radius);
        ctx.lineTo(x - radius, y + radius);
        ctx.closePath();
        return;
    }
    if (marker === 'cross') {
        ctx.moveTo(x - radius, y - radius);
        ctx.lineTo(x + radius, y + radius);
        ctx.moveTo(x + radius, y - radius);
        ctx.lineTo(x - radius, y + radius);
        return;
    }
    ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function drawTrackedMarkerCue(ctx, visual, x, y, radius, filled) {
    ctx.save();
    ctx.beginPath();
    traceTrackedMarker(ctx, visual.marker, x, y, radius);
    ctx.strokeStyle = visual.color;
    ctx.fillStyle = visual.color;
    ctx.lineWidth = 2;
    if (filled && visual.marker !== 'cross') ctx.fill();
    ctx.stroke();
    ctx.restore();
}

export function isMarsMercatorContext(simParams) {
    return simParams?.otherSelection === 'Mars';
}

export function mercatorBackgroundUrlForContext(simParams) {
    return isMarsMercatorContext(simParams) ? MARS_TEXTURE_URL : earthConfig.textureLight;
}

function notifyMarsMapLoading(state, detail = {}) {
    if (detail.bodyLabel !== 'Mars') return;
    if (!globalThis.dispatchEvent || !globalThis.CustomEvent) return;
    globalThis.dispatchEvent(new CustomEvent('openbexi:mars-map-loading', {
        detail: {
            state,
            progressPct: state === 'start' ? 15 : 100,
            ...detail
        }
    }));
}

function setMercatorBackground(url, bodyLabel = 'Earth') {
    if (!mapBackgroundDiv) return;
    if (activeMercatorBackgroundUrl === url && activeMercatorBackgroundBody === bodyLabel) return;

    activeMercatorBackgroundUrl = url;
    activeMercatorBackgroundBody = bodyLabel;
    mapBackgroundDiv.dataset.mapBody = bodyLabel;

    if (!url) {
        mapBackgroundDiv.style.backgroundImage = '';
        mapBackgroundDiv.classList.add('fallback-css');
        return;
    }

    notifyMarsMapLoading('start', { bodyLabel, url });
    const img = new ImageCtor();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
        mapBackgroundDiv.style.backgroundImage = `url("${url}")`;
        mapBackgroundDiv.classList.remove('fallback-css');
        notifyMarsMapLoading('complete', { bodyLabel, url });
    };
    img.onerror = () => {
        mapBackgroundDiv.style.backgroundImage = '';
        mapBackgroundDiv.classList.add('fallback-css');
        notifyMarsMapLoading('error', { bodyLabel, url });
    };
    img.src = url;
}

export function updateMercatorBackgroundForContext(simParams) {
    const bodyLabel = isMarsMercatorContext(simParams) ? 'Mars' : 'Earth';
    setMercatorBackground(mercatorBackgroundUrlForContext(simParams), bodyLabel);
}

const R2D = 180 / Math.PI;
export const groundTrackOptions = {
    points: [],            // cached lat/lon pairs; null marks a path gap
    pathLenMin: 720,       // minutes ahead (default 12 h)
    timeStepMin: 1,        // sampling interval (minutes)
    geoFallbackHalfSpanDeg: 4
};

function finiteLatLon(latDeg, lonDeg) {
    return Number.isFinite(latDeg) && Number.isFinite(lonDeg);
}

export function findSelectedSatellite(simParams, sourceSatellites = satellites) {
    const selectedNoradId = simParams?.selectedSatelliteNoradId?.toString();
    if (selectedNoradId) {
        const byNorad = sourceSatellites.find(s => s.norad_id?.toString() === selectedNoradId);
        if (byNorad) return byNorad;
    }

    const selectedName = simParams?.selectedSatelliteName;
    if (selectedName && selectedName !== 'None') {
        const byName = sourceSatellites.find(s => s.satellite_name === selectedName);
        if (byName) return byName;
    }

    return sourceSatellites.find(s => s.isSelected) || null;
}

export function rebuildGroundTrack(selectedSat, simDate, satelliteLib = globalThis.satellite) {
    if (!selectedSat?.satrec || !satelliteLib?.propagate) return false;

    const start = new Date(simDate);
    const end = new Date(start.getTime() + groundTrackOptions.pathLenMin * 60_000);
    const nextPoints = [];

    for (let t = start; t <= end; t = new Date(t.getTime() + groundTrackOptions.timeStepMin * 60_000)) {
        const pv = satelliteLib.propagate(selectedSat.satrec, t);
        if (!isUsableOrbitPosition(pv?.position)) {
            nextPoints.push(null);
            continue;
        }

        const j = satelliteLib.jday(
            t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(),
            t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()
        );
        const gmst = satelliteLib.gstime(j);

        const geo = satelliteLib.eciToGeodetic(pv.position, gmst);
        const latDeg = geo.latitude * R2D;
        let lonDeg = geo.longitude * R2D;
        if (!finiteLatLon(latDeg, lonDeg)) {
            nextPoints.push(null);
            continue;
        }
        lonDeg = ((lonDeg + 540) % 360) - 180;

        nextPoints.push({latDeg, lonDeg});
    }

    const validPoints = nextPoints.filter(Boolean);
    if (validPoints.length === 0) return false;
    if (validPoints.length > 1) {
        const lats = validPoints.map(p => p.latDeg);
        const lons = validPoints.map(p => p.lonDeg);
        if (Math.max(...lats) - Math.min(...lats) < 0.01 && Math.max(...lons) - Math.min(...lons) < 0.01) {
            const p = validPoints[0];
            const halfSpan = groundTrackOptions.geoFallbackHalfSpanDeg;
            groundTrackOptions.points = [
                {latDeg: p.latDeg, lonDeg: ((p.lonDeg - halfSpan + 540) % 360) - 180},
                {latDeg: p.latDeg, lonDeg: ((p.lonDeg + halfSpan + 540) % 360) - 180}
            ];
            return true;
        }
    }
    groundTrackOptions.points = nextPoints;
    return true;
}

export function drawGroundTrack(ctx) {
    if (!groundTrackOptions.points.length) return;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffcc00';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 3;
    ctx.beginPath();

    let lastLon = null;
    let hasOpenSegment = false;
    groundTrackOptions.points.forEach((p, i) => {
        if (!p) {
            if (hasOpenSegment) ctx.stroke();
            ctx.beginPath();
            lastLon = null;
            hasOpenSegment = false;
            return;
        }
        const {x, y} = latLonToMercator(p.latDeg, p.lonDeg);

        if (lastLon !== null && Math.abs(p.lonDeg - lastLon) > 180) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
            hasOpenSegment = true;
        } else if (!hasOpenSegment || i === 0) {
            ctx.moveTo(x, y);
            hasOpenSegment = true;
        } else {
            ctx.lineTo(x, y);
        }

        lastLon = p.lonDeg;
    });

    ctx.stroke();
    ctx.restore();
}

export function drawSelectedGroundTrack(
    simParams,
    ctx = mercatorCtx,
    satelliteLib = globalThis.satellite,
    sourceSatellites = satellites,
    options = {}
) {
    const selectedSat = findSelectedSatellite(simParams, sourceSatellites);
    if (!simParams?.showOrbit || !selectedSat || !isTrackedRecordPropagatable(selectedSat) || !ctx) {
        groundTrackOptions.points.length = 0;
        groundTrackCache.satelliteKey = '';
        groundTrackCache.startTimeMs = Number.NaN;
        groundTrackCache.lastBuiltRealMs = Number.NEGATIVE_INFINITY;
        return null;
    }

    const simTimeMs = new Date(simParams.simDate).getTime();
    const realTimeMs = Number.isFinite(options.realTimeMs)
        ? options.realTimeMs
        : (globalThis.performance?.now?.() ?? Date.now());
    const satelliteKey = [
        selectedSat.norad_id ?? '',
        selectedSat.element_set?.epoch ?? selectedSat.catalogObject?.element_set?.epoch ?? '',
        selectedSat.tle_line1 ?? ''
    ].join('|');
    const selectionChanged = groundTrackCache.satelliteKey !== satelliteKey;
    const simChanged = !Number.isFinite(groundTrackCache.startTimeMs) ||
        Math.abs(simTimeMs - groundTrackCache.startTimeMs) >= GROUND_TRACK_SIM_REFRESH_MS;
    const realCadenceReady = realTimeMs - groundTrackCache.lastBuiltRealMs >= GROUND_TRACK_REAL_REFRESH_MS;
    const pausedDirectChange = !Number(simParams.timeWarp) && simTimeMs !== groundTrackCache.startTimeMs;
    if (selectionChanged || !Number.isFinite(groundTrackCache.startTimeMs) || pausedDirectChange || (simChanged && realCadenceReady)) {
        const rebuilt = rebuildGroundTrack(selectedSat, simParams.simDate, satelliteLib);
        groundTrackCache.satelliteKey = satelliteKey;
        groundTrackCache.startTimeMs = simTimeMs;
        groundTrackCache.lastBuiltRealMs = realTimeMs;
        if (!rebuilt) groundTrackOptions.points.length = 0;
    }
    drawGroundTrack(ctx);
    return selectedSat;
}

export function initMercatorView() {
    mercatorContainer = document.getElementById('mercatorContainer');
    mapBackgroundDiv = mercatorContainer.querySelector('.mapBackground');
    mercatorCanvasElement = document.getElementById('mercatorCanvas');

    mapWidth = mapBackgroundDiv.clientWidth;
    mapHeight = mapBackgroundDiv.clientHeight;
    mercatorCanvasElement.width = mapWidth;
    mercatorCanvasElement.height = mapHeight;
    mercatorCtx = mercatorCanvasElement.getContext('2d');

    updateMercatorBackgroundForContext({ otherSelection: 'Earth' });

    const mercatorIconFullUrl = getFullGitHubUrl(
        satelliteConfig.mercatorIcon || 'icons/ob_satellite.png',
        GITHUB_REPO_RAW_BASE_URL
    );
    mercatorSatIcon.crossOrigin = 'Anonymous';
    mercatorSatIcon.onload = () => {
        mercatorSatIconLoaded = true;
    };
    mercatorSatIcon.onerror = () => {
        mercatorSatIconLoaded = false;
    };
    if (mercatorIconFullUrl) mercatorSatIcon.src = mercatorIconFullUrl;
}

export function updateMercatorMap(simParams, frameContext = {}) {
    if (!mercatorCtx || mercatorContainer.style.display === 'none') return;
    updateMercatorBackgroundForContext(simParams);

    const w = mapBackgroundDiv.clientWidth;
    const h = mapBackgroundDiv.clientHeight;
    if (mercatorCanvasElement.width !== w || mercatorCanvasElement.height !== h) {
        mercatorCanvasElement.width = w;
        mercatorCanvasElement.height = h;
    }

    mercatorCtx.clearRect(0, 0, mercatorCanvasElement.width, mercatorCanvasElement.height);
    mercatorCanvasElement.dataset.renderedMarkerCount = '0';
    mercatorCanvasElement.dataset.selectedMarkerNoradId = '';
    mercatorCanvasElement.dataset.selectedMarkerRendered = 'false';
    mercatorCanvasElement.dataset.objectTypeMarkerCounts = '{}';
    mercatorCanvasElement.dataset.debrisMarkerCount = '0';

    if (isMarsMercatorContext(simParams)) {
        mercatorCtx.save();
        mercatorCtx.font = 'bold 12px sans-serif';
        mercatorCtx.textAlign = 'left';
        mercatorCtx.textBaseline = 'top';
        mercatorCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        mercatorCtx.fillRect(8, 8, 144, 24);
        mercatorCtx.fillStyle = '#ffd0b5';
        mercatorCtx.fillText('Mars Mercator map', 14, 13);
        mercatorCtx.restore();
        return;
    }

    if (simParams.showDayNight) {
        drawDayNightMercator(mercatorCtx, w, h, simParams.simDate);
    }

    const selectedSat = findSelectedSatellite(simParams);
    const selectedRenderableSat = isTrackedRecordPropagatable(selectedSat) ? selectedSat : null;

    drawSelectedGroundTrack(simParams, mercatorCtx, globalThis.satellite, satellites, {
        realTimeMs: frameContext.realTimeMs
    });

    const now = new Date(simParams.simDate);
    const jNow = satellite.jday(
        now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
        now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()
    );
    const gmstNow = Number.isFinite(frameContext.gmstRad)
        ? frameContext.gmstRad
        : satellite.gstime(jNow);

    let satsToRender;
    if (simParams.showOnlySelectedSatellite && selectedRenderableSat) {
        satsToRender = selectedRenderableSat.propagationInvalid && !isUsableOrbitPosition(frameContext.selectedPropagation?.position)
            ? []
            : [selectedRenderableSat];
    } else {
        satsToRender = satellites.filter(
            s => s.mesh?.visible && s.satrec && isTrackedRecordPropagatable(s)
        );
        if (selectedRenderableSat && !satsToRender.includes(selectedRenderableSat)) {
            satsToRender = [selectedRenderableSat, ...satsToRender];
        }
    }

    let labelRects = [];
    let satDrawData = satsToRender
        .map(s => {
            try {
                if (!s.satrec || !isTrackedRecordPropagatable(s)) return null;
                const exactSelectedPosition = s === selectedRenderableSat &&
                    isUsableOrbitPosition(frameContext.selectedPropagation?.position)
                    ? frameContext.selectedPropagation.position
                    : null;
                if (s === selectedRenderableSat && s.propagationInvalid && !exactSelectedPosition) return null;
                const eciPosition = exactSelectedPosition || sceneToEciVector(mercatorEciScratch, s.mesh?.position);
                if (!isUsableOrbitPosition(eciPosition)) return null;
                const geo = satellite.eciToGeodetic(eciPosition, gmstNow);
                if (!finiteLatLon(geo.latitude, geo.longitude)) return null;
                const pt = latLonToMercator(geo.latitude * R2D, geo.longitude * R2D);
                return { sat: s, pt, visual: mercatorVisual(s) };
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    mercatorCanvasElement.dataset.renderedMarkerCount = String(satDrawData.length);
    mercatorCanvasElement.dataset.selectedMarkerNoradId = selectedSat?.norad_id?.toString() || '';
    mercatorCanvasElement.dataset.selectedMarkerRendered = String(
        !!selectedSat && satDrawData.some(({ sat }) => sat === selectedSat)
    );
    const objectTypeMarkerCounts = {};
    satDrawData.forEach(({ visual }) => {
        const label = visual.label;
        objectTypeMarkerCounts[label] = (objectTypeMarkerCounts[label] || 0) + 1;
    });
    mercatorCanvasElement.dataset.objectTypeMarkerCounts = JSON.stringify(objectTypeMarkerCounts);
    mercatorCanvasElement.dataset.debrisMarkerCount = String(objectTypeMarkerCounts.Debris || 0);

    const densityMode = satDrawData.length > 1000;
    mercatorCanvasElement.dataset.markerMode = densityMode ? 'density' : 'detailed';
    if (densityMode) {
        const pointSize = w >= 800 ? 2 : 1;
        const markerColors = new Set();
        satDrawData.forEach(({ sat, visual }) => {
            if (!sat.isSelected) markerColors.add(visual.color);
        });
        mercatorCtx.save();
        mercatorCtx.globalAlpha = 0.78;
        markerColors.forEach(color => {
            mercatorCtx.fillStyle = color;
            mercatorCtx.beginPath();
            satDrawData.forEach(({ sat, pt, visual }) => {
                if (sat.isSelected || visual.color !== color) return;
                mercatorCtx.rect(Math.round(pt.x), Math.round(pt.y), pointSize, pointSize);
            });
            mercatorCtx.fill();
        });
        mercatorCtx.restore();
        satDrawData = satDrawData.filter(({ sat }) => sat.isSelected);
    } else {
        satDrawData.sort((a, b) => a.pt.y - b.pt.y);
    }

    satDrawData.forEach(({ sat, pt, visual: baseVisual }) => {
        const iconSize = 12;
        const leaderLen = 15;
        const pad = { x: 5, y: 3 };
        const name = sat.satellite_name;
        const visual = sat.isSelected ? TRACKED_OBJECT_VISUALS.SELECTED : baseVisual;

        if (mercatorSatIconLoaded && mercatorSatIcon.complete && mercatorSatIcon.naturalHeight) {
            mercatorCtx.drawImage(mercatorSatIcon, pt.x - iconSize / 2, pt.y - iconSize / 2, iconSize, iconSize);
            drawTrackedMarkerCue(mercatorCtx, visual, pt.x, pt.y, iconSize / 2 + 2, false);
        } else {
            drawTrackedMarkerCue(mercatorCtx, visual, pt.x, pt.y, iconSize / 2, true);
        }
        if (sat.isSelected) {
            mercatorCtx.beginPath();
            mercatorCtx.arc(pt.x, pt.y, iconSize + 4, 0, Math.PI * 2);
            mercatorCtx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
            mercatorCtx.lineWidth = 3;
            mercatorCtx.stroke();

            mercatorCtx.beginPath();
            mercatorCtx.arc(pt.x, pt.y, iconSize + 9, 0, Math.PI * 2);
            mercatorCtx.strokeStyle = 'rgba(255, 220, 80, 0.75)';
            mercatorCtx.lineWidth = 1.5;
            mercatorCtx.stroke();
        }

        if (!sat.isSelected && labelRects.length >= MAX_MERCATOR_LABELS) return;
        mercatorCtx.font = sat.isSelected ? 'bold 11px Arial' : '10px Arial';
        const txtW = mercatorCtx.measureText(name).width + 2 * pad.x;
        const txtH = 12 + 2 * pad.y;
        const angles = [
            -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4,
            Math.PI,      3 * Math.PI / 4,  Math.PI / 2,
            Math.PI / 4,  0
        ];

        let best = null;
        for (const a of angles) {
            const endX = pt.x + (iconSize / 2 + leaderLen) * Math.cos(a);
            const endY = pt.y + (iconSize / 2 + leaderLen) * Math.sin(a);
            const tx = endX + (Math.cos(a) >= 0 || Math.abs(Math.cos(a)) < 0.1 ? pad.x : -txtW + pad.x);
            const ty = endY - txtH / 2;
            const rect = { x: tx - pad.x, y: ty - pad.y, w: txtW, h: txtH };
            const overlap = labelRects.some(r =>
                rect.x < r.x + r.w && rect.x + rect.w > r.x &&
                rect.y < r.y + r.h && rect.y + rect.h > r.y
            );
            if (!overlap) {
                best = { endX, endY, tx, ty, rect };
                break;
            }
        }

        if (best) {
            labelRects.push(best.rect);
            mercatorCtx.beginPath();
            mercatorCtx.moveTo(pt.x, pt.y);
            mercatorCtx.lineTo(best.endX, best.endY);
            mercatorCtx.strokeStyle = 'rgba(200,200,200,0.7)';
            mercatorCtx.lineWidth = 1;
            mercatorCtx.stroke();

            mercatorCtx.fillStyle = 'rgba(0,0,0,0.6)';
            mercatorCtx.fillRect(best.rect.x, best.rect.y, best.rect.w, best.rect.h);

            mercatorCtx.fillStyle = visual.color;
            mercatorCtx.textAlign = 'left';
            mercatorCtx.textBaseline = 'middle';
            mercatorCtx.fillText(name, best.tx, best.ty + txtH / 2 - pad.y / 2 + 1);
        } else {
            mercatorCtx.fillStyle = visual.color;
            mercatorCtx.textAlign = 'center';
            mercatorCtx.textBaseline = 'bottom';
            mercatorCtx.fillText(name, pt.x, pt.y - iconSize / 2 - 2);
        }
    });
}

function latLonToMercator(latDeg, lonDeg) {
    const w = mercatorCanvasElement ? mercatorCanvasElement.width : mapWidth;
    const h = mercatorCanvasElement ? mercatorCanvasElement.height : mapHeight;
    return mercatorPixelFromLonLat(lonDeg, latDeg, w, h);
}
