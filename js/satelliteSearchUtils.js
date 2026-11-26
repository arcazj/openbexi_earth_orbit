import { lifeExtensionSearchText } from './lifeExtensionCatalog.js';
import { spaceStation } from './spaceStations.js';
import referenceMissionNames from '../data/spacecraft-search-names.json' with { type: 'json' };
import argosHosts from '../data/argos-hosts.json' with { type: 'json' };

const argosIds = new Set(Object.values(argosHosts).flat());
export function argosTag(record) {
    return argosIds.has(Number(record?.norad_id ?? record?.NORAD_CAT_ID)) ? 'ARGOS' : '';
}

export function isKuiperProduction(name) {
    return /^(?:KUIPER|AMAZON LEO)[- ]\d+$/i.test(name);
}

export function kuiperTag(record) {
    const name = record?.satellite_name || record?.name;
    return isKuiperProduction(name) || /^KUIPER-P[12]$/i.test(name) ? 'KUIPER' : '';
}

export function satelliteSearchText(satData) {
    const station = spaceStation(satData);
    const gsat = /^GSAT0([12])(\d\d)\b/i.exec(satData?.satellite_name || satData?.name || '');
    return [
        station?.name, station?.aliases,
        argosTag(satData), satData?.satellite_name?.startsWith('KINEIS-') ? 'Kinéis' : '',
        kuiperTag(satData) && 'Amazon Leo Project Kuiper',
        gsat && `Galileo ${gsat[1] === '1' ? 'IOV' : 'FOC'} E${gsat[1]}${gsat[2]}`,
        referenceMissionNames[satData?.norad_id ?? satData?.NORAD_CAT_ID],
        satData?.satellite_name,
        satData?.name,
        satData?.norad_id ?? satData?.NORAD_CAT_ID,
        satData?.provider_catalog_id,
        satData?.alpha5_id,
        satData?.orbitType,
        satData?.orbit_class,
        satData?.object_type,
        satData?.lifecycle_status,
        satData?.international_designator,
        satData?.object_id,
        satData?.owner,
        satData?.owner_code,
        satData?.company,
        satData?.operator,
        lifeExtensionSearchText(satData),
        ...(Array.isArray(satData?.tags) ? satData.tags : [])
    ].filter(value => value !== undefined && value !== null && value !== '').join(' ').toLowerCase();
}

export function satelliteSearchBadges(satData) {
    const badges = [];
    const lifecycle = String(satData?.lifecycle_status ?? '').trim().toUpperCase();
    if (['DECAYED', 'ABSENT', 'RETIRED'].includes(lifecycle) || satData?.decay_date) badges.push('Historical');
    if (satData?.metadata_only === true || satData?.has_current_elements === false) badges.push('Metadata only');
    const objectType = String(satData?.object_type ?? '').trim().toUpperCase().replaceAll('_', ' ');
    if (objectType) {
        badges.push(objectType.toLowerCase().replace(/\b\w/g, character => character.toUpperCase()));
    }
    return badges;
}

export function buildSatelliteSearchMatches(filteredSatellites = [], query = '', options = {}) {
    const list = Array.isArray(filteredSatellites) ? filteredSatellites : [];
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const resultLimit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : 40;
    const emptyQueryPreviewLimit = Number.isFinite(options.emptyQueryPreviewLimit) && options.emptyQueryPreviewLimit > 0
        ? Math.floor(options.emptyQueryPreviewLimit)
        : Math.min(12, resultLimit);

    const totalMatches = normalizedQuery
        ? list.filter(sat => satelliteSearchText(sat).includes(normalizedQuery))
        : list.slice();
    const visibleLimit = normalizedQuery
        ? resultLimit
        : Math.min(emptyQueryPreviewLimit, resultLimit);
    const visibleMatches = totalMatches.slice(0, visibleLimit);
    const totalCount = totalMatches.length;
    const visibleCount = visibleMatches.length;
    const isCapped = visibleCount < totalCount;

    return {
        query: normalizedQuery,
        totalMatches,
        visibleMatches,
        totalCount,
        visibleCount,
        isCapped,
        countLabel: normalizedQuery && isCapped ? `${visibleCount} / ${totalCount}` : `${totalCount}`
    };
}
