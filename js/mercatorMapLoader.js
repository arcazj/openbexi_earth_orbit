// mercatorMapLoader.js – Mercator map, satellite icons, day‑night shading, and ground‑track (GMST‑fixed)
// ------------------------------------------------------------------------------------------------

import {
    earthConfig,
    getFullGitHubUrl,
    GITHUB_REPO_RAW_BASE_URL,
    satelliteConfig
} from './SatelliteConfigurationLoader.js';
import {satellites} from './satelliteTLELoader.js';
import {drawDayNightMercator} from './drawDayNight.js';

export let mercatorContainer, mercatorCanvasElement, mapBackgroundDiv;
export let mercatorCtx, mapWidth = 400, mapHeight = 200;
let mercatorSatIcon = new Image();
let mercatorSatIconLoaded = false;

/* ─────────── Ground‑track parameters & helpers ─────────── */
const R2D = 180 / Math.PI;
export const groundTrackOptions = {
    points: [],            // cached lat/lon pairs
    pathLenMin: 720,       // minutes ahead (default 12 h)
    timeStepMin: 1         // sampling interval (minutes)
};

function rebuildGroundTrack(selectedSat, simDate) {
    groundTrackOptions.points.length = 0;
    if (!selectedSat?.satrec) return;

    const start = new Date(simDate);
    const end = new Date(start.getTime() + groundTrackOptions.pathLenMin * 60_000);

    for (let t = start; t <= end; t = new Date(t.getTime() + groundTrackOptions.timeStepMin * 60_000)) {
        const pv = satellite.propagate(selectedSat.satrec, t);
        if (!pv.position) continue;

        // Accurate GMST
        const j = satellite.jday(
            t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(),
            t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()
        );
        const gmst = satellite.gstime(j);

        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const latDeg = geo.latitude * R2D;
        let lonDeg = geo.longitude * R2D;
        lonDeg = ((lonDeg + 540) % 360) - 180;              // −180…+180

        groundTrackOptions.points.push({latDeg, lonDeg});
    }

    // GEO: duplicate point for tiny marker
    if (groundTrackOptions.points.length > 1) {
        const lats = groundTrackOptions.points.map(p => p.latDeg);
        const lons = groundTrackOptions.points.map(p => p.lonDeg);
        if (Math.max(...lats) - Math.min(...lats) < 0.01 && Math.max(...lons) - Math.min(...lons) < 0.01) {
            const p = groundTrackOptions.points[0];
            groundTrackOptions.points = [
                {latDeg: p.latDeg, lonDeg: p.lonDeg - 0.05},
                {latDeg: p.latDeg, lonDeg: p.lonDeg + 0.05}
            ];
        }
    }
}

function drawGroundTrack(ctx) {
    if (!groundTrackOptions.points.length) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffcc00';
    ctx.beginPath();
    groundTrackOptions.points.forEach((p, i) => {
        const {x, y} = latLonToMercator(p.latDeg, p.lonDeg);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
}

/* ─────────── Initialisation ─────────── */
export function initMercatorView() {
    mercatorContainer = document.getElementById('mercatorContainer');
    mapBackgroundDiv = mercatorContainer.querySelector('.mapBackground');
    mercatorCanvasElement = document.getElementById('mercatorCanvas');

    mapWidth = mapBackgroundDiv.clientWidth;
    mapHeight = mapBackgroundDiv.clientHeight;
    mercatorCanvasElement.width = mapWidth;
    mercatorCanvasElement.height = mapHeight;
    mercatorCtx = mercatorCanvasElement.getContext('2d');

    /*── Background texture ──*/
    const remoteMapBgUrl = earthConfig.textureLight;
    if (remoteMapBgUrl) {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            mapBackgroundDiv.style.backgroundImage = `url(${remoteMapBgUrl})`;
            mapBackgroundDiv.classList.remove('fallback-css');
        };
        img.onerror = () => mapBackgroundDiv.classList.add('fallback-css');
        img.src = remoteMapBgUrl;
    } else {
        mapBackgroundDiv.classList.add('fallback-css');
    }

    /*── Satellite icon ──*/
    const mercatorIconFullUrl = getFullGitHubUrl(
        satelliteConfig.mercatorIcon || 'icons/ob_satellite.png',
        GITHUB_REPO_RAW_BASE_URL
    );
    mercatorSatIcon.crossOrigin = 'Anonymous';
    mercatorSatIcon.onload = () => {
        mercatorSatIconLoaded = true;
    };
    mercatorSatIcon.onerror = () => {
        mercatorSatIcon.src = 'https://placehold.co/16x16/ffffff/000000?text=S';
    };
    mercatorSatIcon.src = mercatorIconFullUrl || 'https://placehold.co/16x16/ffffff/000000?text=S';
}

/* ─────────── Per‑frame update ─────────── */
export function updateMercatorMap(simParams) {
    if (!mercatorCtx || mercatorContainer.style.display === 'none') return;

    // Resize canvas on fullscreen toggle
    const w = mapBackgroundDiv.clientWidth;
    const h = mapBackgroundDiv.clientHeight;
    if (mercatorCanvasElement.width !== w || mercatorCanvasElement.height !== h) {
        mercatorCanvasElement.width = w;
        mercatorCanvasElement.height = h;
    }

    mercatorCtx.clearRect(0, 0, mercatorCanvasElement.width, mercatorCanvasElement.height);

    /*── Day-night band ──*/
    if (simParams.showDayNight) {
        drawDayNightMercator(mercatorCtx, w, h, simParams.simDate);
    }

    /*── Selected satellite (used for ground-track and single-draw mode) ──*/
    const selectedSat = satellites.find(s => s.isSelected);

    /*── Ground-track for selected only ──*/
    if (simParams.showOrbit && selectedSat) {
        rebuildGroundTrack(selectedSat, simParams.simDate);
        drawGroundTrack(mercatorCtx);
    }

    /*── Time context ──*/
    const now = new Date(simParams.simDate);
    const jNow = satellite.jday(
        now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
        now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()
    );
    const gmstNow = satellite.gstime(jNow);

    /*── Decide which satellites to draw on the Mercator map ──
      - If "Show only selected" is ON and a satellite is selected: draw that one
        regardless of its 3-D sprite visibility.
      - Otherwise: draw all satellites whose 3-D sprite is currently visible (existing behavior).
    */
    let satsToRender;
    if (simParams.showOnlySelectedSatellite && selectedSat) {
        satsToRender = [selectedSat];
    } else {
        satsToRender = satellites.filter(s => s.mesh?.visible && s.satrec);
    }

    let labelRects = [];
    const satDrawData = satsToRender
        .map(s => {
            try {
                if (!s.satrec) return null;
                const pv = satellite.propagate(s.satrec, now);
                if (!pv?.position) return null;
                const geo = satellite.eciToGeodetic(pv.position, gmstNow);
                const pt = latLonToMercator(geo.latitude * R2D, geo.longitude * R2D);
                return { sat: s, pt };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        // Draw from south to north to help label placement overlap avoidance
        .sort((a, b) => a.pt.y - b.pt.y);

    satDrawData.forEach(({ sat, pt }) => {
        const iconSize = 12;
        const leaderLen = 15;
        const pad = { x: 5, y: 3 };
        const name = sat.satellite_name;

        // Icon
        if (mercatorSatIconLoaded && mercatorSatIcon.complete && mercatorSatIcon.naturalHeight) {
            mercatorCtx.drawImage(mercatorSatIcon, pt.x - iconSize / 2, pt.y - iconSize / 2, iconSize, iconSize);
        } else {
            mercatorCtx.beginPath();
            mercatorCtx.arc(pt.x, pt.y, iconSize / 2, 0, Math.PI * 2);
            mercatorCtx.fillStyle = sat.isSelected ? 'rgba(255,0,0,0.8)' : 'rgba(0,255,0,0.8)';
            mercatorCtx.fill();
        }

        // Label placement (8-direction)
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

            mercatorCtx.fillStyle = sat.isSelected ? '#ff8080' : '#00ddff';
            mercatorCtx.textAlign = 'left';
            mercatorCtx.textBaseline = 'middle';
            mercatorCtx.fillText(name, best.tx, best.ty + txtH / 2 - pad.y / 2 + 1);
        } else {
            mercatorCtx.fillStyle = sat.isSelected ? '#ff4444' : '#00aaff';
            mercatorCtx.textAlign = 'center';
            mercatorCtx.textBaseline = 'bottom';
            mercatorCtx.fillText(name, pt.x, pt.y - iconSize / 2 - 2);
        }
    });
}

/* ─────────── Utility ─────────── */
function latLonToMercator(latDeg, lonDeg) {
    const w = mercatorCanvasElement ? mercatorCanvasElement.width : mapWidth;
    const h = mercatorCanvasElement ? mercatorCanvasElement.height : mapHeight;
    const x = (lonDeg + 180) * (w / 360);
    const latRad = Math.max(-85.05112878, Math.min(85.05112878, latDeg)) * Math.PI / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = h / 2 - (w * mercN) / (2 * Math.PI);
    return {x, y};
}

// ------------------------------------------------------------------------------------------------
