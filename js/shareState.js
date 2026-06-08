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

function safeDebrisFilter(value, orbitTypeFilter = []) {
    const orbitSelection = safeList(orbitTypeFilter).map(item => item.toUpperCase());
    if (orbitSelection.includes('DEBRIS')) return 'only';
    return value === 'only' ? 'only' : 'show';
}

export function buildShareState(simParams = {}, selectedSatellite = null) {
    const orbitTypeFilter = safeList(simParams.orbitTypeFilter);
    return {
        selectedSatelliteNoradId: selectedSatellite?.norad_id?.toString() ||
            simParams.selectedSatelliteNoradId?.toString() ||
            '',
        selectedSatelliteName: selectedSatellite?.satellite_name || simParams.selectedSatelliteName || '',
        view3D: !!simParams.view3D,
        viewMercator: !!simParams.viewMercator,
        orbitTypeFilter,
        companyFilter: safeList(simParams.companyFilter),
        debrisFilter: safeDebrisFilter(simParams.debrisFilter, orbitTypeFilter),
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
    params.set('view3D', boolValue(state.view3D));
    params.set('mercator', boolValue(state.viewMercator));
    if (state.orbitTypeFilter?.length) params.set('orbit', state.orbitTypeFilter.join(','));
    if (state.companyFilter?.length) params.set('tags', state.companyFilter.join(','));
    params.set('debris', safeDebrisFilter(state.debrisFilter, state.orbitTypeFilter));
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

export function buildShareUrl(currentHref, simParams = {}, selectedSatellite = null) {
    const url = new URL(currentHref || 'http://127.0.0.1:8000/index.html');
    encodeShareState(url.searchParams, buildShareState(simParams, selectedSatellite));
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
    const orbitTypeFilter = safeList((params.get('orbit') || '').split(','));
    return {
        selectedSatelliteNoradId: params.get('sat') || '',
        selectedSatelliteName: params.get('satName') || '',
        view3D: parseBool(params.get('view3D')),
        viewMercator: parseBool(params.get('mercator')),
        orbitTypeFilter,
        companyFilter: safeList((params.get('tags') || '').split(',')),
        debrisFilter: safeDebrisFilter(params.get('debris'), orbitTypeFilter),
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
    if (state.view3D && state.viewMercator) parts.push('Globe + Mercator');
    else if (state.viewMercator) parts.push('Mercator');
    else parts.push('Globe');
    if (state.orbitTypeFilter?.length) parts.push(`Orbit ${state.orbitTypeFilter.join('+')}`);
    if (state.companyFilter?.length) parts.push(`Tags ${state.companyFilter.join('+')}`);
    return parts.join(' | ');
}
