export const LIFE_EXTENSION_TAG = 'Satellite life extension';
export const PAIR_DISTANCE_KM = 1;
export const MEV_ASSET = 'geo/mev.glb';
export const MEP_ASSET = 'mep.glb';
export const SPACE_LOGISTICS = 'https://www.northropgrumman.com/what-we-do/space/space-logistics-services';
const serviceUpdate = 'https://news.northropgrumman.com/satellites/northrop-grumman-achieves-first-ever-undocking-between-two-commercial-spacecraft-in-geosynchronous-orbit';
const launchReport = 'https://news.northropgrumman.com/launch/northrop-grummans-mission-robotic-vehicle-launches-ushering-in-a-new-era-of-in-space-servicing';

export const extensionFamilies = {
    MEV: { name: 'Mission Extension Vehicle', role: 'Docking servicer', source: SPACE_LOGISTICS },
    MEP: { name: 'Mission Extension Pod', role: 'Attachable propulsion pod', model: MEP_ASSET, source: launchReport,
        description: 'Space Logistics launched three propulsion pods in July 2026. Each provides supplemental propulsion to a client spacecraft.' },
    MRV: { name: 'Mission Robotic Vehicle', role: 'Robotic servicer', source: launchReport,
        description: 'Space Logistics launched its two-arm robotic servicer in July 2026. Its missions include installing Mission Extension Pods.' }
};

// GCAT supplies the docking date. Northrop Grumman identifies the client and
// confirms undocking, without publishing the physical separation time.
const eventCatalog = 'https://planet4589.org/space/gcat/tsv/cat/ecat.tsv';
export const mevFlights = {
    '44625': { name: 'MEV-1', missions: [
        { norad: '26824', name: 'Intelsat 901', docked: '2020-02-25T07:15:00Z',
            released: '2025-04-04T20:00:00Z', source: serviceUpdate },
        { norad: '35756', name: 'Optus D3', docked: '2025-05-20', source: eventCatalog,
            releaseReport: {publishedAt:'2026-08-13T18:55:00Z',
                source:'https://news.northropgrumman.com/civil-space/northrop-grumman-continues-in-space-industry-leadership-second-mission-extension-vehicle-undocking'} }
    ] },
    '46113': { name: 'MEV-2', missions: [
        { norad: '28358', name: 'Intelsat 10-02', docked: '2021-04-12T17:34:00Z', source: serviceUpdate }
    ] }
};

// Each entry describes a dated installation on a named host. A pod without a
// NORAD ID can use its own model:flight key and the host's published orbit.
export const serviceAttachments = Object.entries(mevFlights).flatMap(([key, flight]) =>
    flight.missions.map(mission => ({
        kind: 'MEV', docked: mission.docked, released: mission.released, releaseReport:mission.releaseReport, source: mission.source,
        host: {key: mission.norad, name: mission.name},
        vehicle: {key, name: flight.name, model: MEV_ASSET},
        hostInterface: 'Launch_adapter_ring', vehicleInterface: 'MEV_docking_plane', roll: -Math.PI/2
    })));

export function missionEnd(mission) {
    return mission.released || mission.releaseReport?.publishedAt;
}

export function missionActiveAt(mission, time) {
    const end = missionEnd(mission);
    return Date.parse(mission.docked) <= time && (!end || time < Date.parse(end));
}

export function attachmentAt(key, time, records = serviceAttachments) {
    return records.find(record => (record.host.key === key || record.vehicle.key === key) && missionActiveAt(record,time));
}

export function attachmentPeer(record, key) {
    return record.host.key === key ? record.vehicle : record.host;
}

export function lifeExtensionFamily(record) {
    const id = String(record?.norad_id ?? record?.NORAD_CAT_ID ?? '');
    if (Object.hasOwn(mevFlights, id)) return 'MEV';
    const name = String(record?.satellite_name ?? record?.name ?? record?.OBJECT_NAME ?? '').trim().toUpperCase();
    if (!/^(?:SPACELOGISTICS |SPACE LOGISTICS )?(?:MISSION (?:EXTENSION (?:POD|VEHICLE)|ROBOTIC VEHICLE)|MEP|MRV|MEV)(?:[- ]\d+)?$/.test(name)) return null;
    if (name.includes('POD') || name.includes('MEP')) return 'MEP';
    return name.includes('ROBOTIC') || name.includes('MRV') ? 'MRV' : 'MEV';
}

export function lifeExtensionSearchText(record) {
    const key = lifeExtensionFamily(record);
    if (!key) return '';
    const name = mevFlights[record.norad_id ?? record.NORAD_CAT_ID]?.name || '';
    return [LIFE_EXTENSION_TAG, key, extensionFamilies[key].name, extensionFamilies[key].role, 'Space Logistics',
        name.replace('-', ' '), name.replace('-', '')].join(' ');
}
