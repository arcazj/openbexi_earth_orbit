import { evaluateLinkBudget, propagationDelayMs } from '../rf/rfLinkBudget.js';
import { computeLookGeometry, mercatorPixelFromLonLat } from '../orbit/orbitLinkGeometry.js';
import { computeBeamFootprintLoss } from './beamFootprint.js';

export function linkMarginColor(marginDb, visible = true) {
    if (!visible) return 'rgba(90, 90, 90, 0.18)';
    if (!Number.isFinite(marginDb)) return 'rgba(90, 90, 90, 0.18)';
    if (marginDb < 0) return 'rgba(255, 48, 64, 0.24)';
    if (marginDb < 3) return 'rgba(255, 190, 48, 0.30)';
    if (marginDb < 10) return 'rgba(82, 220, 120, 0.30)';
    return 'rgba(0, 180, 255, 0.28)';
}

export function pointColorHex(marginDb, visible = true) {
    if (!visible || !Number.isFinite(marginDb)) return 0x5a5a5a;
    if (marginDb < 0) return 0xff3040;
    if (marginDb < 3) return 0xffbe30;
    if (marginDb < 10) return 0x52dc78;
    return 0x00b4ff;
}

export function computeCoverageGrid({
    satEcfKm,
    latStepDeg = 10,
    lonStepDeg = 10,
    minElevationDeg = 20,
    linkBudgetInput,
    beamFootprint = null
}) {
    if (!satEcfKm || !linkBudgetInput) return [];
    const latStep = Math.max(1, Math.abs(latStepDeg));
    const lonStep = Math.max(1, Math.abs(lonStepDeg));
    const cells = [];
    const useBeamFootprint = isBeamFootprintEnabled(beamFootprint);

    for (let lat = -80; lat <= 80; lat += latStep) {
        for (let lon = -180; lon < 180; lon += lonStep) {
            const centerLat = lat + latStep / 2;
            const centerLon = lon + lonStep / 2;
            const look = computeLookGeometry(satEcfKm, centerLat, centerLon);
            const visible = look.isLineOfSight && look.elevationDeg >= minElevationDeg;
            const beamLoss = useBeamFootprint
                ? computeBeamFootprintLoss({
                    centerLatDeg: beamFootprint.centerLatDeg,
                    centerLonDeg: beamFootprint.centerLonDeg,
                    pointLatDeg: centerLat,
                    pointLonDeg: centerLon,
                    halfPowerBeamwidthDeg: beamFootprint.halfPowerBeamwidthDeg,
                    maxLossDb: beamFootprint.maxLossDb
                })
                : { separationDeg: 0, lossDb: 0 };
            const linkBudgetWithBeam = {
                ...linkBudgetInput,
                additionalLossesDb: (Number(linkBudgetInput.additionalLossesDb) || 0) + beamLoss.lossDb
            };
            const budget = visible
                ? evaluateLinkBudget({ ...linkBudgetWithBeam, rangeKm: look.rangeKm })
                : null;

            cells.push({
                latMin: lat,
                latMax: Math.min(85, lat + latStep),
                lonMin: lon,
                lonMax: Math.min(180, lon + lonStep),
                latDeg: centerLat,
                lonDeg: centerLon,
                rangeKm: look.rangeKm,
                elevationDeg: look.elevationDeg,
                delayMs: propagationDelayMs(Math.max(1e-6, look.rangeKm)),
                beamSeparationDeg: beamLoss.separationDeg,
                beamLossDb: beamLoss.lossDb,
                visible,
                marginDb: budget ? budget.marginDb : -Infinity,
                requiredTxPowerDbw: budget ? budget.requiredTxPowerDbw : Infinity,
                status: budget ? budget.status : 'blocked'
            });
        }
    }

    return cells;
}

function isBeamFootprintEnabled(beamFootprint) {
    return !!beamFootprint &&
        Number.isFinite(beamFootprint.centerLatDeg) &&
        Number.isFinite(beamFootprint.centerLonDeg) &&
        Number.isFinite(beamFootprint.halfPowerBeamwidthDeg) &&
        beamFootprint.halfPowerBeamwidthDeg > 0;
}

export function drawCoverageGrid2D(ctx, cells, width, height) {
    if (!ctx || !Array.isArray(cells)) return;
    ctx.save();
    cells.forEach(cell => {
        const p1 = mercatorPixelFromLonLat(cell.lonMin, cell.latMin, width, height);
        const p2 = mercatorPixelFromLonLat(cell.lonMax, cell.latMax, width, height);
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        ctx.fillStyle = linkMarginColor(cell.marginDb, cell.visible);
        ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
    });
    ctx.restore();
}

export function summarizeCoverage(cells) {
    if (!Array.isArray(cells) || cells.length === 0) {
        return {
            total: 0,
            visible: 0,
            passing: 0,
            bestMarginDb: -Infinity,
            worstPassingMarginDb: Infinity
        };
    }

    let visible = 0;
    let passing = 0;
    let bestMarginDb = -Infinity;
    let worstPassingMarginDb = Infinity;
    cells.forEach(cell => {
        if (cell.visible) visible += 1;
        if (Number.isFinite(cell.marginDb)) bestMarginDb = Math.max(bestMarginDb, cell.marginDb);
        if (cell.marginDb >= 0) {
            passing += 1;
            worstPassingMarginDb = Math.min(worstPassingMarginDb, cell.marginDb);
        }
    });

    return {
        total: cells.length,
        visible,
        passing,
        bestMarginDb,
        worstPassingMarginDb
    };
}
