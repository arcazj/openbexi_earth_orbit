import { validateTlePair } from './domain/catalogValidation.js';
import { freshnessStatus } from './domain/orbitalPolicy.js';
import { createTlePropagationService } from './orbit/propagationService.js';
import * as satelliteLib from '../vendor/satellite.js/7.1.0/satellite.es.js';
import { attachmentAt, attachmentPeer, mevFlights, lifeExtensionFamily, missionActiveAt, PAIR_DISTANCE_KM, serviceAttachments } from './lifeExtensionCatalog.js';
import { createPublishedTleLoader } from './publishedTleCatalog.js';

const propagation = createTlePropagationService({ satelliteLib });
export { PAIR_DISTANCE_KM };
export const PAIR_SAMPLE_MINUTES = 10;

// Retain only servicing flights and documented clients from the published
// compatibility snapshot. The main map continues to use the primary GP catalog.
const clientIds = new Set(serviceAttachments.flatMap(record => [record.vehicle.key, record.host.key]));
export const loadExtensionElements = createPublishedTleLoader(row => clientIds.has(String(row.norad_id)) || lifeExtensionFamily(row));

function inspectElements(records, id, name, instant) {
    const row = records.get(id);
    const result = { id, name, status: 'unavailable' };
    if (!row) return result;
    const validation = validateTlePair(row.tle_line1, row.tle_line2, { expected_norad_id: id });
    if (!validation.valid) return { ...result, status: 'invalid' };
    const { epoch, line1, line2 } = validation.value;
    return { ...result, epoch, line1, line2, status: freshnessStatus(epoch, row.orbit_class || 'GEO', instant).status.toLowerCase() };
}

export async function readExtensionView(norad, name, instant, reload = false) {
    const catalog = await loadExtensionElements(reload).catch(() => null);
    return assessExtensionView(String(norad), name, catalog, instant);
}

export async function selectionExtensionView(key, name, instant, reload = false) {
    const attachment = attachmentAt(key, +instant);
    const vehicle = attachment?.vehicle || {key, name};
    const catalog = await loadExtensionElements(reload).catch(() => null);
    const view = assessExtensionView(vehicle.key, vehicle.name, catalog, instant);
    if (attachment?.kind === 'MEP') {
        view.elements = [attachment.host, vehicle].filter(member => /^\d+$/.test(member.key)).map(member =>
            inspectElements(catalog?.records || new Map(), member.key, member.name, view.at));
    }
    return {...view, selectedKey:key, selectedName:key === attachment?.host.key ? attachment.host.name : vehicle.name,
        attachment, companion:attachment && attachmentPeer(attachment,key)};
}

export function assessExtensionView(norad, name, catalog, instant = new Date()) {
    const at = instant.toISOString();
    const records = catalog?.records ?? new Map();
    const vehicle = inspectElements(records, norad, name, at);
    const missions = mevFlights[norad]?.missions || [];
    const client = missions.find(mission => missionActiveAt(mission,+instant));
    const result = { paired: false, at, elements: [vehicle], client, missions,
        source: catalog?.source || 'Published TLE catalog', updated: catalog?.updated };
    if (!client) return { ...result, reason: 'No documented client for this time.' };
    const partner = inspectElements(records, client.norad, client.name, at);
    result.elements.push(partner);
    if (result.elements.some(element => element.status !== 'fresh')) {
        return { ...result, reason: 'Comparing the two published positions requires valid, fresh TLEs for both spacecraft.' };
    }
    const objects = result.elements.map(({ id }) => propagation.prepareObject(records.get(id)));
    if (objects.some(object => !object.ok)) return { ...result, reason: 'Orbit propagation unavailable.' };
    const separations = [];
    for (const minutes of [0, -PAIR_SAMPLE_MINUTES, PAIR_SAMPLE_MINUTES]) {
        const time = new Date(instant.getTime() + minutes * 60_000).toISOString();
        const positions = objects.map(object => propagation.propagate(object.value, time));
        if (positions.some(position => !position.ok)) return { ...result, reason: 'Orbit propagation unavailable.' };
        const [a, b] = positions.map(position => position.value.position_km);
        separations.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
    const maxSeparationKm = Math.max(...separations);
    const paired = maxSeparationKm <= PAIR_DISTANCE_KM;
    return { ...result, separationKm: separations[0], maxSeparationKm, paired, tleDisagreement:!paired,
        reason: paired ? 'The published orbits meet the proximity criterion.'
            : 'The published orbits exceed the proximity criterion.' };
}
