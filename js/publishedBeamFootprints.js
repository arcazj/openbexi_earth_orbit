import { BufferGeometry, LineBasicMaterial, LineSegments, Vector3 } from 'three';
import { mercatorPixelFromLonLat } from './orbit/orbitLinkGeometry.js';

// These links identify the requested beams. Only add locally held contour data
// after recording permission to redistribute it and its required attribution.
const beams = new Map([
    ['28358', { satellite: 'Intelsat 10-02', beam: '5491', coverage: null,
        source: 'https://satbeams.com/footprints?orbit=geo&view=2d&beam=5491&norad=28358&zoom=1.31&center=16.5533%2C8.0393' }],
    ['36581', { satellite: 'Astra 3B', beam: '6252', coverage: null,
        source: 'https://satbeams.com/footprints?orbit=geo&view=2d&beam=6252&norad=36581&zoom=3.22&center=18.9381%2C50.3383' }]
]);

export function publishedBeam(norad, servicing) {
    const id = String(norad || '');
    const paired = servicing?.shownPair && (servicing.selectedKey || servicing.elements?.[0]?.id) === id;
    return beams.get(paired ? String(servicing.attachment?.host.key || servicing.client?.norad) : id) || null;
}

function usable(coverage) {
    return coverage?.rights === 'redistribution-cleared' && coverage.attribution?.trim() &&
        coverage.provenance?.trim() && coverage.geojson?.type === 'FeatureCollection';
}

// Geographic coordinates in GeoJSON order, always Earth-fixed. Reject a malformed
// path as a whole to avoid connecting the valid points on either side of a gap.
function contourPaths(coverage) {
    if (!usable(coverage)) return [];
    const paths = [];
    for (const feature of coverage.geojson.features || []) {
        const geometry = feature?.geometry;
        if (!geometry) continue;
        const { type, coordinates } = geometry;
        const lines = type === 'LineString' ? [coordinates] : type === 'MultiPolygon' ? coordinates.flat()
            : ['Polygon','MultiLineString'].includes(type) ? coordinates : [];
        for (const line of lines) {
            if (Array.isArray(line) && line.length >= 2 && line.every(p => Array.isArray(p) &&
                Number.isFinite(p[0]) && Math.abs(p[0]) <= 180 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90)) paths.push(line);
        }
    }
    return paths;
}

const radians = Math.PI/180;
function point(lon, lat, radius) {
    const horizontal = radius*Math.cos(lat*radians);
    // Place the contour at the matching texel of the bundled equirectangular map.
    return new Vector3(horizontal*Math.cos(lon*radians), radius*Math.sin(lat*radians), -horizontal*Math.sin(lon*radians));
}

export class PublishedBeamLayer {
    constructor(earth, surfacePoint = (lon,lat) => point(lon,lat,earth.geometry.parameters.radius*1.001)) {
        this.earth = earth;
        this.surfacePoint = surfacePoint;
        this.paths = [];
    }
    set(beam) {
        if (this.beam === beam) return;
        this.clear();
        this.beam = beam;
        this.paths = contourPaths(beam?.coverage);
        if (!this.paths.length) return;
        const positions = [];
        for (const path of this.paths) {
            for (let i = 1; i < path.length; i++) {
                const [lon, lat] = path[i-1], [endLon, endLat] = path[i];
                const east = (endLon-lon+540)%360-180, north = endLat-lat;
                const steps = Math.max(1, Math.ceil(Math.max(Math.abs(east), Math.abs(north))));
                for (let j = 0; j < steps; j++) {
                    positions.push(this.surfacePoint(lon+east*j/steps,lat+north*j/steps),
                        this.surfacePoint(lon+east*(j+1)/steps,lat+north*(j+1)/steps));
                }
            }
        }
        this.line = new LineSegments(new BufferGeometry().setFromPoints(positions),
            new LineBasicMaterial({color: 0xffca66, toneMapped: false}));
        this.line.name = 'Published beam '+beam.beam;
        this.earth.add(this.line);
    }
    drawMap(ctx) {
        if (!this.paths.length || !ctx) return;
        const {width, height} = ctx.canvas;
        ctx.save();
        ctx.strokeStyle = '#ffca66';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const path of this.paths) {
            let prev;
            for (const [lon, lat] of path) {
                const next = mercatorPixelFromLonLat(lon, lat, width, height);
                if (prev) {
                    let end = next.x;
                    if (Math.abs(end-prev.x) > width/2) end += end < prev.x ? width : -width;
                    ctx.moveTo(prev.x, prev.y);
                    ctx.lineTo(end, next.y);
                    if (end !== next.x) {
                        ctx.moveTo(prev.x+next.x-end, prev.y);
                        ctx.lineTo(next.x, next.y);
                    }
                }
                prev = next;
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    clear() {
        if (this.line) {
            this.line.removeFromParent();
            this.line.geometry.dispose();
            this.line.material.dispose();
            this.line = null;
        }
        this.paths = [];
        this.beam = null;
    }
}

export function showBeamNotice(host, beam, fallback = '') {
    if (!host) return;
    const key = beam ? beam.satellite+' '+beam.beam : fallback;
    if (host.dataset.selection === key) return;
    host.dataset.selection = key;
    host.hidden = !key;
    host.replaceChildren();
    if (!beam) {
        host.textContent = fallback;
        return;
    }
    const available = contourPaths(beam.coverage).length > 0;
    host.append(beam.satellite+' · Beam '+beam.beam+'. '+(available ? beam.coverage.attribution : 'Published footprint unavailable.'));
    const link = document.createElement('a');
    link.textContent = 'View beam on Satbeams';
    link.href = beam.source;
    link.target = '_blank';
    link.rel = 'external noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    host.append(' ', link);
}
