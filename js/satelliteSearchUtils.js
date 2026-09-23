export function satelliteSearchText(satData) {
    return [
        satData?.satellite_name,
        satData?.name,
        satData?.norad_id,
        satData?.provider_catalog_id,
        satData?.alpha5_id,
        satData?.orbitType,
        satData?.orbit_class,
        satData?.object_type,
        satData?.lifecycle_status,
        satData?.international_designator,
        satData?.company,
        satData?.operator,
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
