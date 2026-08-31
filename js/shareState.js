const SHARE_FLAG = 'share';
const UNSAFE_SHARE_PATTERN = /(file:|[A-Za-z]:\\|\\\\|token=|password=|secret=|apiBase=|server=)/i;

function boolValue(value) {
    return value ? '1' : '0';
}

function parseBool(value) {
    return value === '1' || value === 'true';
}

function safeList(values) {
    if (!Array.isArray(values)) return [];
    return values
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .filter(value => !UNSAFE_SHARE_PATTERN.test(value));
}

function safeFacetList(values, limit = 64) {
    return safeList(values)
        .filter(value => value.length <= 120)
        .slice(0, limit);
}

function safeFacetText(value, limit = 120) {
    const text = String(value || '').trim();
    if (!text || text.length > limit || UNSAFE_SHARE_PATTERN.test(text)) return '';
    return text;
}

function safeLaunchYear(value) {
    if (value === null || value === undefined || value === '') return null;
    const year = Number(value);
    return Number.isInteger(year) && year >= 1957 && year <= 2100 ? year : null;
}

function trackedFacetState(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const launchYearFrom = safeLaunchYear(source.launchYearFrom);
    const launchYearTo = safeLaunchYear(source.launchYearTo);
    return {
        position: safeFacetList(source.position, 3),
        rcs: safeFacetList(source.rcs, 6),
        owner: safeFacetList(source.owner),
        launchSite: safeFacetList(source.launchSite),
        status: safeFacetList(source.status),
        launchYearFrom,
        launchYearTo,
        designator: safeFacetText(source.designator)
    };
}

function trackedFacetsAreActive(orbitTypeFilter, objectTypeFilter) {
    return orbitTypeFilter?.length === 1 && orbitTypeFilter[0] === 'ALL' &&
        objectTypeFilter?.length === 1 && objectTypeFilter[0] === 'DEBRIS';
}

function setListParam(params, name, values) {
    if (values?.length) params.set(name, values.join(','));
    else params.delete(name);
}

function safeIdentifier(value) {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > 200 || UNSAFE_SHARE_PATTERN.test(normalized)) return '';
    return /^[A-Za-z0-9:._-]+$/.test(normalized) ? normalized : '';
}

export function buildShareState(simParams = {}, selectedSatellite = null, selectedConjunctionEvent = null) {
    const orbitTypeFilter = safeList(simParams.orbitTypeFilter);
    const objectTypeFilter = safeList(simParams.objectTypeFilter);
    return {
        selectedSatelliteNoradId: selectedSatellite?.norad_id?.toString() ||
            simParams.selectedSatelliteNoradId?.toString() ||
            '',
        selectedSatelliteName: selectedSatellite?.satellite_name || simParams.selectedSatelliteName || '',
        conjunctionEventId: safeIdentifier(
            selectedConjunctionEvent?.event_id ?? selectedConjunctionEvent?.eventId ?? simParams.conjunctionEventId
        ),
        conjunctionRequestId: safeIdentifier(
            selectedConjunctionEvent?.request_id ?? selectedConjunctionEvent?.requestId ?? simParams.conjunctionRequestId
        ),
        view3D: !!simParams.view3D,
        viewMercator: !!simParams.viewMercator,
        orbitTypeFilter,
        objectTypeFilter,
        includeHistoricalTrackedObjects: !!simParams.includeHistoricalTrackedObjects,
        companyFilter: safeList(simParams.companyFilter),
        trackedFacets: trackedFacetState(
            trackedFacetsAreActive(orbitTypeFilter, objectTypeFilter) ? simParams.trackedFacets : {}
        ),
        simDate: simParams.simDate instanceof Date
            ? simParams.simDate.toISOString()
            : (simParams.simDate ? new Date(simParams.simDate).toISOString() : ''),
        showOrbit: !!simParams.showOrbit,
        showFootprint: !!simParams.showFootprint,
        showOnlySelectedSatellite: !!simParams.showOnlySelectedSatellite,
        useHighDefTexture: !!simParams.useHighDefTexture,
        showDayNight: !!simParams.showDayNight,
        showECEFAxes: !!simParams.showECEFAxes,
        showOrbitFrame: !!simParams.showOrbitFrame,
        yawDeg: Number.isFinite(Number(simParams.yawDeg)) ? Number(simParams.yawDeg) : 0,
        pitchDeg: Number.isFinite(Number(simParams.pitchDeg)) ? Number(simParams.pitchDeg) : 0,
        rollDeg: Number.isFinite(Number(simParams.rollDeg)) ? Number(simParams.rollDeg) : 0
    };
}

export function encodeShareState(params, state) {
    params.set(SHARE_FLAG, '1');
    if (state.selectedSatelliteNoradId) params.set('sat', state.selectedSatelliteNoradId);
    if (state.selectedSatelliteName && !UNSAFE_SHARE_PATTERN.test(state.selectedSatelliteName)) {
        params.set('satName', state.selectedSatelliteName);
    }
    const conjunctionEventId = safeIdentifier(state.conjunctionEventId);
    const conjunctionRequestId = safeIdentifier(state.conjunctionRequestId);
    if (conjunctionEventId) params.set('conjEvent', conjunctionEventId);
    else params.delete('conjEvent');
    if (conjunctionRequestId) params.set('conjRequest', conjunctionRequestId);
    else params.delete('conjRequest');
    params.set('view3D', boolValue(state.view3D));
    params.set('mercator', boolValue(state.viewMercator));
    if (state.orbitTypeFilter?.length) params.set('orbit', state.orbitTypeFilter.join(','));
    setListParam(params, 'objects', state.objectTypeFilter);
    params.set('history', boolValue(state.includeHistoricalTrackedObjects));
    setListParam(params, 'tags', state.companyFilter);
    const trackedFacets = trackedFacetState(
        trackedFacetsAreActive(state.orbitTypeFilter, state.objectTypeFilter) ? state.trackedFacets : {}
    );
    setListParam(params, 'position', trackedFacets.position);
    setListParam(params, 'rcs', trackedFacets.rcs);
    setListParam(params, 'owner', trackedFacets.owner);
    setListParam(params, 'launchSite', trackedFacets.launchSite);
    setListParam(params, 'status', trackedFacets.status);
    if (trackedFacets.launchYearFrom !== null) params.set('yearFrom', String(trackedFacets.launchYearFrom));
    else params.delete('yearFrom');
    if (trackedFacets.launchYearTo !== null) params.set('yearTo', String(trackedFacets.launchYearTo));
    else params.delete('yearTo');
    if (trackedFacets.designator) params.set('designator', trackedFacets.designator);
    else params.delete('designator');
    params.delete('debris');
    if (state.simDate) params.set('time', state.simDate);
    params.set('showOrbit', boolValue(state.showOrbit));
    params.set('footprint', boolValue(state.showFootprint));
    params.set('onlySelected', boolValue(state.showOnlySelectedSatellite));
    params.set('highDef', boolValue(state.useHighDefTexture));
    params.set('dayNight', boolValue(state.showDayNight));
    params.set('ecef', boolValue(state.showECEFAxes));
    params.set('orbitFrame', boolValue(state.showOrbitFrame));
    params.set('yaw', String(state.yawDeg));
    params.set('pitch', String(state.pitchDeg));
    params.set('roll', String(state.rollDeg));
    params.delete('apiBase');
    params.delete('server');
    return params;
}

export function buildShareUrl(currentHref, simParams = {}, selectedSatellite = null, selectedConjunctionEvent = null) {
    const url = new URL(currentHref || 'http://127.0.0.1:8000/index.html');
    encodeShareState(url.searchParams, buildShareState(simParams, selectedSatellite, selectedConjunctionEvent));
    url.hash = '';
    return url.toString();
}

export function parseShareStateFromSearch(search = '') {
    const params = search instanceof URLSearchParams
        ? search
        : new URLSearchParams(String(search || '').replace(/^\?/, ''));
    if (!params.has(SHARE_FLAG)) return null;

    const timeValue = params.get('time') || '';
    const time = timeValue ? new Date(timeValue) : null;
    const explicitOrbitTypeFilter = safeList((params.get('orbit') || '').split(','));
    const legacyDebrisCategory = explicitOrbitTypeFilter.includes('DEBRIS') || params.get('debris') === 'only';
    const migratedOrbitTypeFilter = explicitOrbitTypeFilter.filter(value => value !== 'DEBRIS');
    const explicitObjectTypeFilter = safeList((params.get('objects') || '').split(','));
    const orbitTypeFilter = migratedOrbitTypeFilter.length
        ? migratedOrbitTypeFilter
        : (legacyDebrisCategory ? ['ALL'] : []);
    const objectTypeFilter = explicitObjectTypeFilter.length
        ? explicitObjectTypeFilter
        : (legacyDebrisCategory ? ['DEBRIS'] : []);
    const parsedTrackedFacets = trackedFacetState({
        position: (params.get('position') || '').split(','),
        rcs: (params.get('rcs') || '').split(','),
        owner: (params.get('owner') || '').split(','),
        launchSite: (params.get('launchSite') || '').split(','),
        status: (params.get('status') || '').split(','),
        launchYearFrom: params.get('yearFrom'),
        launchYearTo: params.get('yearTo'),
        designator: params.get('designator')
    });
    return {
        selectedSatelliteNoradId: params.get('sat') || '',
        selectedSatelliteName: params.get('satName') || '',
        conjunctionEventId: safeIdentifier(params.get('conjEvent')),
        conjunctionRequestId: safeIdentifier(params.get('conjRequest')),
        view3D: parseBool(params.get('view3D')),
        viewMercator: parseBool(params.get('mercator')),
        orbitTypeFilter,
        objectTypeFilter,
        includeHistoricalTrackedObjects: parseBool(params.get('history')),
        companyFilter: safeList((params.get('tags') || '').split(',')),
        trackedFacets: trackedFacetState(
            trackedFacetsAreActive(orbitTypeFilter, objectTypeFilter) ? parsedTrackedFacets : {}
        ),
        simDate: time && !Number.isNaN(time.getTime()) ? time : null,
        showOrbit: parseBool(params.get('showOrbit')),
        showFootprint: parseBool(params.get('footprint')),
        showOnlySelectedSatellite: parseBool(params.get('onlySelected')),
        useHighDefTexture: parseBool(params.get('highDef')),
        showDayNight: parseBool(params.get('dayNight')),
        showECEFAxes: parseBool(params.get('ecef')),
        showOrbitFrame: parseBool(params.get('orbitFrame')),
        yawDeg: Number(params.get('yaw') || 0),
        pitchDeg: Number(params.get('pitch') || 0),
        rollDeg: Number(params.get('roll') || 0)
    };
}

export function shareUrlContainsUnsafeLocalData(urlText = '') {
    return UNSAFE_SHARE_PATTERN.test(String(urlText));
}

export function shareStateSummary(state = {}) {
    const parts = [];
    if (state.selectedSatelliteNoradId) parts.push(`NORAD ${state.selectedSatelliteNoradId}`);
    if (state.conjunctionEventId) parts.push(`Event ${state.conjunctionEventId}`);
    if (state.view3D && state.viewMercator) parts.push('Globe + Mercator');
    else if (state.viewMercator) parts.push('Mercator');
    else parts.push('Globe');
    if (state.orbitTypeFilter?.length) parts.push(`Orbit ${state.orbitTypeFilter.join('+')}`);
    if (state.objectTypeFilter?.length) parts.push(`Objects ${state.objectTypeFilter.join('+')}`);
    if (state.includeHistoricalTrackedObjects) parts.push('History included');
    if (state.companyFilter?.length) parts.push(`Tags ${state.companyFilter.join('+')}`);
    const facets = trackedFacetState(
        trackedFacetsAreActive(state.orbitTypeFilter, state.objectTypeFilter) ? state.trackedFacets : {}
    );
    if (facets.position.length) parts.push(`Position ${facets.position.join('+')}`);
    if (facets.rcs.length) parts.push(`RCS ${facets.rcs.join('+')}`);
    if (facets.owner.length) parts.push(`Owner ${facets.owner.join('+')}`);
    if (facets.launchSite.length) parts.push(`Launch site ${facets.launchSite.join('+')}`);
    if (facets.status.length) parts.push(`Status ${facets.status.join('+')}`);
    if (facets.launchYearFrom !== null || facets.launchYearTo !== null) {
        parts.push(`Launch year ${facets.launchYearFrom ?? 'any'}-${facets.launchYearTo ?? 'any'}`);
    }
    if (facets.designator) parts.push(`Designator ${facets.designator}`);
    return parts.join(' | ');
}
