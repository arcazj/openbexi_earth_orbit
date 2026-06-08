export function satelliteSearchText(satData) {
    return [
        satData?.satellite_name,
        satData?.norad_id,
        satData?.orbitType,
        satData?.company
    ].filter(Boolean).join(' ').toLowerCase();
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
