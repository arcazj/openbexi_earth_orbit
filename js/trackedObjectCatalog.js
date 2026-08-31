import { normalizeNoradId } from './domain/objectIdentity.js';

export const TRACKED_CATALOG_MANIFEST_URL = 'json/tracked/TRACKED.manifest.json';

export const TRACKED_OBJECT_TYPE = Object.freeze({
    ALL: 'ALL',
    PAYLOAD: 'PAYLOAD',
    DEBRIS: 'DEBRIS',
    ROCKET_BODY: 'ROCKET_BODY',
    MISSION_RELATED: 'MISSION_RELATED',
    UNKNOWN: 'UNKNOWN'
});

export const TRACKED_OBJECT_TYPE_OPTIONS = Object.freeze([
    TRACKED_OBJECT_TYPE.PAYLOAD,
    TRACKED_OBJECT_TYPE.DEBRIS,
    TRACKED_OBJECT_TYPE.ROCKET_BODY,
    TRACKED_OBJECT_TYPE.MISSION_RELATED,
    TRACKED_OBJECT_TYPE.UNKNOWN
]);

export const TRACKED_OBJECT_VISUALS = Object.freeze({
    [TRACKED_OBJECT_TYPE.PAYLOAD]: Object.freeze({ label: 'Payload', color: '#00d5ff', marker: 'circle' }),
    [TRACKED_OBJECT_TYPE.DEBRIS]: Object.freeze({ label: 'Debris', color: '#ff3b30', marker: 'diamond' }),
    [TRACKED_OBJECT_TYPE.ROCKET_BODY]: Object.freeze({ label: 'Rocket body', color: '#ffb020', marker: 'square' }),
    [TRACKED_OBJECT_TYPE.MISSION_RELATED]: Object.freeze({ label: 'Mission related', color: '#22c55e', marker: 'triangle' }),
    [TRACKED_OBJECT_TYPE.UNKNOWN]: Object.freeze({ label: 'Unknown', color: '#a8b0ba', marker: 'cross' }),
    SELECTED: Object.freeze({ label: 'Selected', color: '#ffffff', marker: 'ring' })
});

export const TRACKED_POSITION_FILTER = Object.freeze({
    ALL: 'ALL',
    POSITIONED: 'POSITIONED',
    METADATA_ONLY: 'METADATA_ONLY'
});

export const TRACKED_POSITION_FILTER_OPTIONS = Object.freeze([
    TRACKED_POSITION_FILTER.POSITIONED,
    TRACKED_POSITION_FILTER.METADATA_ONLY
]);

export const TRACKED_RCS_FILTER = Object.freeze({
    ALL: 'ALL',
    LT_0_01: 'LT_0_01',
    FROM_0_01_TO_0_1: 'FROM_0_01_TO_0_1',
    FROM_0_1_TO_1: 'FROM_0_1_TO_1',
    GTE_1: 'GTE_1',
    UNKNOWN: 'UNKNOWN'
});

export const TRACKED_RCS_FILTER_OPTIONS = Object.freeze([
    TRACKED_RCS_FILTER.LT_0_01,
    TRACKED_RCS_FILTER.FROM_0_01_TO_0_1,
    TRACKED_RCS_FILTER.FROM_0_1_TO_1,
    TRACKED_RCS_FILTER.GTE_1,
    TRACKED_RCS_FILTER.UNKNOWN
]);

export const TRACKED_RCS_FILTER_LABELS = Object.freeze({
    [TRACKED_RCS_FILTER.ALL]: 'All radar cross-section records',
    [TRACKED_RCS_FILTER.LT_0_01]: 'Below 0.01 m2',
    [TRACKED_RCS_FILTER.FROM_0_01_TO_0_1]: '0.01 to below 0.1 m2',
    [TRACKED_RCS_FILTER.FROM_0_1_TO_1]: '0.1 to below 1 m2',
    [TRACKED_RCS_FILTER.GTE_1]: '1 m2 and above',
    [TRACKED_RCS_FILTER.UNKNOWN]: 'Not reported or invalid RCS'
});

const TRACKED_FACET_ARRAY_KEYS = Object.freeze(['owner', 'launchSite', 'status']);

export const DEFAULT_TRACKED_FACETS = Object.freeze({
    position: Object.freeze([TRACKED_POSITION_FILTER.ALL]),
    rcs: Object.freeze([TRACKED_RCS_FILTER.ALL]),
    owner: Object.freeze([]),
    launchSite: Object.freeze([]),
    status: Object.freeze([]),
    launchYearFrom: null,
    launchYearTo: null,
    designator: ''
});

export const TRACKED_ORBIT_CLASS = Object.freeze({
    ALL: 'ALL',
    GEO: 'GEO',
    MEO: 'MEO',
    LEO: 'LEO',
    HEO: 'HEO',
    OTHER: 'OTHER',
    DECAYING: 'DECAYING',
    UNKNOWN: 'UNKNOWN'
});

export const TRACKED_ORBIT_CLASS_OPTIONS = Object.freeze([
    TRACKED_ORBIT_CLASS.GEO,
    TRACKED_ORBIT_CLASS.MEO,
    TRACKED_ORBIT_CLASS.LEO,
    TRACKED_ORBIT_CLASS.HEO,
    TRACKED_ORBIT_CLASS.OTHER
]);

function normalizedToken(value) {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');
}

function normalizeSelection(selection, options, allValue = 'ALL') {
    const values = Array.isArray(selection) ? selection : [selection];
    const unique = Array.from(new Set(values.map(normalizedToken).filter(Boolean)));
    if (unique.includes(allValue)) return [allValue];
    const accepted = unique.filter(value => options.includes(value));
    return accepted.length === 0 || accepted.length === options.length ? [allValue] : accepted;
}

function toggleSelection(selection, changedValue, options, allValue = 'ALL') {
    const changed = normalizedToken(changedValue);
    if (changed === allValue) return [allValue];
    if (!options.includes(changed)) return normalizeSelection(selection, options, allValue);
    const normalized = normalizeSelection(selection, options, allValue);
    const active = normalized.includes(allValue) ? [] : [...normalized];
    const next = active.includes(changed)
        ? active.filter(value => value !== changed)
        : [...active, changed];
    return normalizeSelection(next, options, allValue);
}

function normalizedFacetValues(values) {
    const source = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
    return Array.from(new Set(source
        .map(value => String(value ?? '').trim().toUpperCase())
        .filter(Boolean)))
        .slice(0, 256);
}

function normalizedLaunchYear(value) {
    if (value === undefined || value === null || value === '') return null;
    const year = Number(value);
    return Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : null;
}

export function normalizeTrackedFacets(facets = {}) {
    const source = facets && typeof facets === 'object' && !Array.isArray(facets) ? facets : {};
    let launchYearFrom = normalizedLaunchYear(source.launchYearFrom);
    let launchYearTo = normalizedLaunchYear(source.launchYearTo);
    if (launchYearFrom !== null && launchYearTo !== null && launchYearFrom > launchYearTo) {
        [launchYearFrom, launchYearTo] = [launchYearTo, launchYearFrom];
    }
    return {
        position: normalizeSelection(
            source.position ?? DEFAULT_TRACKED_FACETS.position,
            TRACKED_POSITION_FILTER_OPTIONS,
            TRACKED_POSITION_FILTER.ALL
        ),
        rcs: normalizeSelection(
            source.rcs ?? DEFAULT_TRACKED_FACETS.rcs,
            TRACKED_RCS_FILTER_OPTIONS,
            TRACKED_RCS_FILTER.ALL
        ),
        owner: normalizedFacetValues(source.owner),
        launchSite: normalizedFacetValues(source.launchSite),
        status: normalizedFacetValues(source.status),
        launchYearFrom,
        launchYearTo,
        designator: String(source.designator ?? '').trim().toUpperCase().slice(0, 64)
    };
}

export function toggleTrackedFacetSelection(selection, changedValue, options, allValue = 'ALL') {
    return toggleSelection(selection, changedValue, options, allValue);
}

export function normalizeTrackedObjectType(value) {
    const normalized = normalizedToken(value);
    if (['PAY', 'PAYLOAD', 'SAT', 'SATELLITE'].includes(normalized)) return TRACKED_OBJECT_TYPE.PAYLOAD;
    if (['DEB', 'DEBRIS', 'FRAGMENT', 'FRAGMENTATION_DEBRIS'].includes(normalized)) {
        return TRACKED_OBJECT_TYPE.DEBRIS;
    }
    if (['R/B', 'RB', 'ROCKET_BODY', 'ROCKETBODY', 'STAGE'].includes(normalized)) {
        return TRACKED_OBJECT_TYPE.ROCKET_BODY;
    }
    if (['MISSION', 'MISSION_RELATED', 'MISSION_RELATED_OBJECT'].includes(normalized)) {
        return TRACKED_OBJECT_TYPE.MISSION_RELATED;
    }
    return TRACKED_OBJECT_TYPE.UNKNOWN;
}

export function trackedObjectType(record) {
    if (!record || typeof record !== 'object') return TRACKED_OBJECT_TYPE.UNKNOWN;
    const candidates = [
        record.object_type,
        record.objectType,
        record.catalogObject?.object_type,
        record.element_set?.omm?.OBJECT_TYPE,
        record.meta?.object_type
    ];
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null || String(candidate).trim() === '') continue;
        return normalizeTrackedObjectType(candidate);
    }
    return TRACKED_OBJECT_TYPE.UNKNOWN;
}

export function trackedObjectVisual(recordOrType, options = {}) {
    if (options.selected === true) return TRACKED_OBJECT_VISUALS.SELECTED;
    const objectType = typeof recordOrType === 'string'
        ? normalizeTrackedObjectType(recordOrType)
        : trackedObjectType(recordOrType);
    return TRACKED_OBJECT_VISUALS[objectType] ?? TRACKED_OBJECT_VISUALS[TRACKED_OBJECT_TYPE.UNKNOWN];
}

export function normalizeTrackedObjectTypeSelection(selection) {
    return normalizeSelection(selection, TRACKED_OBJECT_TYPE_OPTIONS, TRACKED_OBJECT_TYPE.ALL);
}

export function toggleTrackedObjectTypeSelection(selection, changedValue) {
    return toggleSelection(selection, changedValue, TRACKED_OBJECT_TYPE_OPTIONS, TRACKED_OBJECT_TYPE.ALL);
}

export function trackedObjectMatchesTypeSelection(record, selection) {
    const normalized = normalizeTrackedObjectTypeSelection(selection);
    return normalized.includes(TRACKED_OBJECT_TYPE.ALL) || normalized.includes(trackedObjectType(record));
}

export function normalizeTrackedOrbitClass(value) {
    const normalized = normalizedToken(value);
    if (normalized === 'HRO') return TRACKED_ORBIT_CLASS.HEO;
    if (Object.values(TRACKED_ORBIT_CLASS).includes(normalized) && normalized !== TRACKED_ORBIT_CLASS.ALL) {
        return normalized;
    }
    return TRACKED_ORBIT_CLASS.UNKNOWN;
}

export function trackedOrbitClass(recordOrValue) {
    if (!recordOrValue || typeof recordOrValue !== 'object') return normalizeTrackedOrbitClass(recordOrValue);
    return normalizeTrackedOrbitClass(
        recordOrValue.orbitType ??
        recordOrValue.orbit_class ??
        recordOrValue.orbitClass ??
        recordOrValue.catalogObject?.orbit_class ??
        recordOrValue.type
    );
}

export function normalizeTrackedOrbitSelection(selection) {
    return normalizeSelection(selection, TRACKED_ORBIT_CLASS_OPTIONS, TRACKED_ORBIT_CLASS.ALL);
}

export function toggleTrackedOrbitSelection(selection, changedValue) {
    return toggleSelection(selection, changedValue, TRACKED_ORBIT_CLASS_OPTIONS, TRACKED_ORBIT_CLASS.ALL);
}

export function trackedObjectMatchesOrbitSelection(record, selection) {
    const normalized = normalizeTrackedOrbitSelection(selection);
    if (normalized.includes(TRACKED_ORBIT_CLASS.ALL)) return true;
    const orbitClass = trackedOrbitClass(record);
    const filterClass = [TRACKED_ORBIT_CLASS.UNKNOWN, TRACKED_ORBIT_CLASS.DECAYING].includes(orbitClass)
        ? TRACKED_ORBIT_CLASS.OTHER
        : orbitClass;
    return normalized.includes(filterClass);
}

export function trackedObjectRcsBand(record) {
    const status = normalizedToken(record?.rcs_status ?? record?.rcs_size);
    if (['MISSING', 'INVALID', 'NOT_REPORTED', 'UNAVAILABLE'].includes(status)) {
        return TRACKED_RCS_FILTER.UNKNOWN;
    }
    const candidate = record?.rcs_m2 ?? record?.rcs ?? null;
    if (candidate === null || (typeof candidate === 'string' && candidate.trim() === '') ||
        !Number.isFinite(Number(candidate)) || Number(candidate) < 0) {
        return TRACKED_RCS_FILTER.UNKNOWN;
    }
    const rcs = Number(candidate);
    if (rcs < 0.01) return TRACKED_RCS_FILTER.LT_0_01;
    if (rcs < 0.1) return TRACKED_RCS_FILTER.FROM_0_01_TO_0_1;
    if (rcs < 1) return TRACKED_RCS_FILTER.FROM_0_1_TO_1;
    return TRACKED_RCS_FILTER.GTE_1;
}

const trackedObjectFacetValueCache = new WeakMap();
const trackedOverlayBaselineCache = new WeakMap();

const TRACKED_OVERLAY_FIELDS = Object.freeze([
    'satellite_name', 'name', 'international_designator', 'object_type', 'lifecycle_status',
    'operational_status', 'rcs_m2', 'rcs', 'rcs_status', 'launch_date', 'launch_site',
    'owner', 'owner_code', 'ops_status_code', 'data_status_code', 'decay_date', 'company',
    'operator', 'tags', 'observation_status', 'tracked_observation_status',
    'catalog_membership_status', 'presence_status', 'tracked_catalog_member',
    'tracked_catalog_source', 'element_reference', 'tracked_provenance', 'has_current_elements',
    'metadata_only', 'propagation_status', 'unavailable_reason', 'tracked_catalog_suppressed'
]);

function rememberTrackedOverlayBaseline(record) {
    if (!record || typeof record !== 'object' || trackedOverlayBaselineCache.has(record)) return;
    trackedOverlayBaselineCache.set(record, TRACKED_OVERLAY_FIELDS.map(key => ({
        key,
        present: Object.prototype.hasOwnProperty.call(record, key),
        value: record[key]
    })));
}

function restoreTrackedOverlayBaseline(record, { forget = false } = {}) {
    const baseline = trackedOverlayBaselineCache.get(record);
    if (!baseline) return false;
    for (const { key, present, value } of baseline) {
        if (present) record[key] = value;
        else delete record[key];
    }
    trackedObjectFacetValueCache.delete(record);
    if (forget) trackedOverlayBaselineCache.delete(record);
    return true;
}

export function restoreOrbitalRecordsAfterTrackedOverlay(records = []) {
    for (const record of Array.isArray(records) ? records : []) {
        restoreTrackedOverlayBaseline(record, { forget: true });
    }
    return records;
}

export function trackedObjectFacetValues(record) {
    if (record && typeof record === 'object' && trackedObjectFacetValueCache.has(record)) {
        return trackedObjectFacetValueCache.get(record);
    }
    const owner = String(record?.owner_code ?? record?.owner ?? '').trim().toUpperCase() || 'UNKNOWN';
    const launchSite = String(record?.launch_site ?? '').trim().toUpperCase() || 'UNKNOWN';
    const status = String(record?.ops_status_code ?? '').trim().toUpperCase() || 'UNKNOWN';
    const launchDate = String(record?.launch_date ?? '').trim();
    const launchYearMatch = /^(\d{4})/.exec(launchDate);
    const launchYear = launchYearMatch ? normalizedLaunchYear(launchYearMatch[1]) : null;
    const designator = String(
        record?.international_designator ?? record?.element_set?.omm?.OBJECT_ID ?? ''
    ).trim().toUpperCase();
    const values = Object.freeze({
        owner,
        launchSite,
        status,
        launchYear,
        designator,
        position: isTrackedRecordPropagatable(record)
            ? TRACKED_POSITION_FILTER.POSITIONED
            : TRACKED_POSITION_FILTER.METADATA_ONLY,
        rcsBand: trackedObjectRcsBand(record)
    });
    if (record && typeof record === 'object') trackedObjectFacetValueCache.set(record, values);
    return values;
}

export function trackedObjectMatchesFacets(record, facets = {}) {
    const normalized = normalizeTrackedFacets(facets);
    const values = trackedObjectFacetValues(record);
    return trackedObjectMatchesNormalizedFacets(record, normalized, values);
}

function trackedObjectMatchesNormalizedFacets(record, normalized, values, ignoredKey = null) {

    if (ignoredKey !== 'position' && !normalized.position.includes(TRACKED_POSITION_FILTER.ALL)) {
        if (!normalized.position.includes(values.position)) return false;
    }
    if (ignoredKey !== 'rcs' && !normalized.rcs.includes(TRACKED_RCS_FILTER.ALL) &&
        !normalized.rcs.includes(values.rcsBand)) return false;
    for (const key of TRACKED_FACET_ARRAY_KEYS) {
        if (ignoredKey === key) continue;
        if (normalized[key].length > 0 && !normalized[key].includes(values[key])) return false;
    }
    if (ignoredKey !== 'launchYear' && normalized.launchYearFrom !== null &&
        (values.launchYear === null || values.launchYear < normalized.launchYearFrom)) return false;
    if (ignoredKey !== 'launchYear' && normalized.launchYearTo !== null &&
        (values.launchYear === null || values.launchYear > normalized.launchYearTo)) return false;
    if (ignoredKey !== 'designator' && normalized.designator && !values.designator.includes(normalized.designator)) {
        return false;
    }
    return true;
}

function facetCountEntries(counts) {
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

export function buildTrackedFacetOptions(records = [], facets = {}) {
    const source = Array.isArray(records) ? records : [];
    const normalized = normalizeTrackedFacets(facets);
    const counts = {
        position: new Map(TRACKED_POSITION_FILTER_OPTIONS.map(value => [value, 0])),
        rcs: new Map(TRACKED_RCS_FILTER_OPTIONS.map(value => [value, 0])),
        owner: new Map(),
        launchSite: new Map(),
        status: new Map(),
        launchYear: new Map()
    };
    let designatorMatches = 0;
    const increment = (map, value) => {
        if (value === null || value === undefined || value === '') return;
        map.set(value, (map.get(value) ?? 0) + 1);
    };
    source.forEach(record => {
        const values = trackedObjectFacetValues(record);
        if (trackedObjectMatchesNormalizedFacets(record, normalized, values, 'position')) {
            increment(counts.position, values.position);
        }
        if (trackedObjectMatchesNormalizedFacets(record, normalized, values, 'rcs')) {
            increment(counts.rcs, values.rcsBand);
        }
        for (const key of TRACKED_FACET_ARRAY_KEYS) {
            if (trackedObjectMatchesNormalizedFacets(record, normalized, values, key)) {
                increment(counts[key], values[key]);
            }
        }
        if (trackedObjectMatchesNormalizedFacets(record, normalized, values, 'launchYear')) {
            increment(counts.launchYear, values.launchYear);
        }
        if (trackedObjectMatchesNormalizedFacets(record, normalized, values)) designatorMatches += 1;
    });
    return {
        position: TRACKED_POSITION_FILTER_OPTIONS.map(value => ({ value, count: counts.position.get(value) ?? 0 })),
        rcs: TRACKED_RCS_FILTER_OPTIONS.map(value => ({ value, count: counts.rcs.get(value) ?? 0 })),
        owner: facetCountEntries(counts.owner),
        launchSite: facetCountEntries(counts.launchSite),
        status: facetCountEntries(counts.status),
        launchYear: facetCountEntries(counts.launchYear),
        designatorMatches
    };
}

export function trackedObjectMatchesFilters(record, filters = {}) {
    if (!trackedObjectMatchesOrbitSelection(record, filters.orbitSelection)) return false;
    if (!trackedObjectMatchesTypeSelection(record, filters.objectTypeSelection)) return false;
    if (filters.includeHistorical !== true && isHistoricalTrackedRecord(record)) return false;

    const tagSelection = Array.isArray(filters.tagSelection) ? filters.tagSelection : [];
    const allTagValue = String(filters.allTagValue ?? 'ALL COMPANY');
    if (tagSelection.length > 0 && !tagSelection.includes(allTagValue)) {
        const tags = new Set([
            record?.company,
            record?.operator,
            ...(Array.isArray(record?.tags) ? record.tags : [])
        ].filter(Boolean).map(value => String(value)));
        if (!tagSelection.some(value => tags.has(String(value)))) return false;
    }
    return filters.facets ? trackedObjectMatchesFacets(record, filters.facets) : true;
}

export function isHistoricalTrackedRecord(record) {
    const lifecycle = normalizedToken(record?.lifecycle_status ?? record?.operational_status);
    if (['DECAYED', 'ABSENT', 'RETIRED'].includes(lifecycle)) return true;
    const membership = normalizedToken(record?.catalog_membership_status ?? record?.presence_status);
    const observation = normalizedToken(record?.observation_status ?? record?.tracked_observation_status);
    if (membership === 'ABSENT' || observation === 'ABSENT') return true;
    return Boolean(record?.decay_date || record?.DECAY_DATE);
}

export function trackedNoradId(record) {
    const candidate = record?.norad_id ?? record?.noradId ?? record?.NORAD_CAT_ID;
    try {
        return normalizeNoradId(candidate);
    } catch {
        return null;
    }
}

export function isTrackedRecordPropagatable(record) {
    if (!record || typeof record !== 'object' || record.metadata_only === true) return false;
    if (isHistoricalTrackedRecord(record) || record.tracked_catalog_suppressed === true) return false;
    if (record.satrec && record.mesh) return true;
    if (record.has_current_elements === false) return false;
    const status = normalizedToken(record.propagation_status);
    if (['NO_CURRENT_ELEMENTS', 'QUARANTINED', 'INVALID', 'UNAVAILABLE'].includes(status)) return false;
    return record.has_current_elements === true;
}

export function isTrackedCatalogMember(record) {
    return record?.tracked_catalog_member === true;
}

export function normalizeTrackedRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError('Tracked catalog record must be an object.');
    }
    const noradId = trackedNoradId(record);
    if (!noradId) throw new TypeError('Tracked catalog record has an invalid NORAD identifier.');
    const objectType = trackedObjectType(record);
    const hasCurrentElements = record.has_current_elements === true;
    const metadataOnly = record.metadata_only === true || !hasCurrentElements;
    const lifecycleStatus = normalizedToken(record.lifecycle_status || record.operational_status || 'UNKNOWN');
    const observationStatus = normalizedToken(
        record.observation_status || record.tracked_observation_status || record.presence_status || 'UNKNOWN'
    );
    const rcsCandidate = record.rcs_m2 ?? record.rcs ?? null;
    const rcsNumber = rcsCandidate === null ||
        (typeof rcsCandidate === 'string' && rcsCandidate.trim() === '')
        ? null
        : Number(rcsCandidate);
    return {
        ...record,
        norad_id: noradId,
        satellite_name: String(record.satellite_name ?? record.name ?? `NORAD ${noradId}`).trim(),
        object_type: objectType,
        orbit_class: trackedOrbitClass(record),
        orbitType: trackedOrbitClass(record),
        lifecycle_status: lifecycleStatus || 'UNKNOWN',
        observation_status: observationStatus || 'UNKNOWN',
        tracked_observation_status: observationStatus || 'UNKNOWN',
        tracked_catalog_member: true,
        tracked_catalog_source: record.tracked_catalog_source ?? record.source ?? null,
        rcs_m2: Number.isFinite(rcsNumber) && rcsNumber >= 0 ? rcsNumber : null,
        rcs_status: String(record.rcs_status ?? record.rcs_size ?? (Number.isFinite(rcsNumber) ? 'REPORTED' : 'UNKNOWN')),
        has_current_elements: hasCurrentElements,
        metadata_only: metadataOnly,
        propagation_status: metadataOnly
            ? normalizedToken(record.propagation_status || 'NO_CURRENT_ELEMENTS')
            : 'CURRENT_ELEMENTS',
        unavailable_reason: metadataOnly
            ? String(record.unavailable_reason ?? record.no_current_elements_reason ??
                'No validated current orbital elements are available in this catalog snapshot.')
            : null
    };
}

function metadataFields(record) {
    return {
        satellite_name: record.satellite_name,
        name: record.name,
        international_designator: record.international_designator,
        object_type: record.object_type,
        lifecycle_status: record.lifecycle_status,
        operational_status: record.operational_status,
        rcs_m2: record.rcs_m2,
        rcs_status: record.rcs_status,
        launch_date: record.launch_date,
        launch_site: record.launch_site,
        owner: record.owner,
        owner_code: record.owner_code,
        ops_status_code: record.ops_status_code,
        data_status_code: record.data_status_code,
        decay_date: record.decay_date,
        company: record.company,
        operator: record.operator,
        tags: record.tags,
        observation_status: record.observation_status,
        tracked_observation_status: record.tracked_observation_status ?? record.observation_status,
        tracked_catalog_member: true,
        catalog_membership_status: record.catalog_membership_status,
        presence_status: record.presence_status,
        tracked_catalog_source: record.tracked_catalog_source ?? record.source,
        element_reference: record.element_reference,
        tracked_provenance: record.provenance
    };
}

export function mergeTrackedCatalogRecords(orbitalRecords = [], trackedRecords = [], options = {}) {
    const preserveOrbitalReferences = options.preserveOrbitalReferences === true;
    const byNorad = new Map();
    for (const orbitalRecord of Array.isArray(orbitalRecords) ? orbitalRecords : []) {
        const noradId = trackedNoradId(orbitalRecord);
        if (!noradId || byNorad.has(noradId)) continue;
        const target = preserveOrbitalReferences ? orbitalRecord : { ...orbitalRecord };
        if (preserveOrbitalReferences) {
            if (!restoreTrackedOverlayBaseline(target)) rememberTrackedOverlayBaseline(target);
        }
        trackedObjectFacetValueCache.delete(target);
        target.norad_id = noradId;
        target.has_current_elements = true;
        target.metadata_only = false;
        target.propagation_status = 'CURRENT_ELEMENTS';
        target.tracked_catalog_member = false;
        byNorad.set(noradId, target);
    }
    for (const source of Array.isArray(trackedRecords) ? trackedRecords : []) {
        let metadata;
        try {
            metadata = normalizeTrackedRecord(source);
        } catch {
            continue;
        }
        const orbital = byNorad.get(metadata.norad_id);
        if (!orbital) {
            byNorad.set(metadata.norad_id, metadata);
            continue;
        }
        const descriptive = metadataFields(metadata);
        for (const key of ['owner', 'owner_code', 'launch_site', 'ops_status_code', 'data_status_code']) {
            orbital[key] = descriptive[key] ?? null;
        }
        for (const [key, value] of Object.entries(descriptive)) {
            if (value !== undefined && value !== null && value !== '') orbital[key] = value;
        }
        orbital.rcs_m2 = metadata.rcs_m2;
        if (metadata.rcs_m2 === null && 'rcs' in orbital) orbital.rcs = null;
        const propagationStatus = normalizedToken(metadata.propagation_status);
        const suppressOrbitalRecord = isHistoricalTrackedRecord(metadata) ||
            metadata.has_current_elements === false ||
            metadata.metadata_only === true ||
            ['NO_CURRENT_ELEMENTS', 'INVALID', 'QUARANTINED', 'UNAVAILABLE'].includes(propagationStatus);
        if (suppressOrbitalRecord) {
            orbital.has_current_elements = false;
            orbital.metadata_only = true;
            orbital.propagation_status = metadata.propagation_status || 'NO_CURRENT_ELEMENTS';
            orbital.unavailable_reason = metadata.unavailable_reason ||
                'No validated current orbital elements are available in this catalog snapshot.';
            orbital.tracked_catalog_suppressed = true;
            continue;
        }
        orbital.has_current_elements = true;
        orbital.metadata_only = false;
        orbital.propagation_status = 'CURRENT_ELEMENTS';
        orbital.unavailable_reason = null;
        orbital.tracked_catalog_suppressed = false;
    }
    return [...byNorad.values()];
}

export function buildTrackedCatalogCounts(allRecords = [], filteredRecords = allRecords, options = {}) {
    const unique = records => {
        const seen = new Set();
        return (Array.isArray(records) ? records : []).filter(record => {
            const key = trackedNoradId(record);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    const all = unique(allRecords);
    const filtered = unique(filteredRecords);
    const propagatable = filtered.filter(isTrackedRecordPropagatable);
    const historical = all.filter(isHistoricalTrackedRecord);
    const renderReadyPredicate = typeof options.renderReadyPredicate === 'function'
        ? options.renderReadyPredicate
        : record => record?.mesh?.visible === true && record?.motionPositionReady === true;
    return Object.freeze({
        total: all.length,
        current_tracked: all.length - historical.length,
        historical_tracked: historical.length,
        filtered: filtered.length,
        propagatable: propagatable.length,
        metadata_only: filtered.length - propagatable.length,
        render_ready: propagatable.filter(renderReadyPredicate).length,
        quarantine: Math.max(0, Number(options.quarantineCount) || 0)
    });
}

async function sha256Hex(text) {
    const cryptoImpl = globalThis.crypto;
    if (!cryptoImpl?.subtle?.digest) throw new Error('SHA-256 verification is unavailable.');
    const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function responseJson(response, label, expectedHash = null) {
    if (!response || response.ok === false) {
        throw new Error(`${label} request failed${response?.status ? ` (${response.status})` : ''}.`);
    }
    if (expectedHash) {
        if (typeof response.text !== 'function') throw new Error(`${label} cannot be integrity checked.`);
        const text = await response.text();
        const actual = await sha256Hex(text);
        const expected = String(expectedHash).trim().toLowerCase().replace(/^sha256:/, '');
        if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) {
            throw new Error(`${label} failed SHA-256 integrity validation.`);
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`${label} did not return valid JSON.`);
        }
    }
    if (typeof response.json !== 'function') throw new Error(`${label} did not return JSON.`);
    return response.json();
}

function resolveChunkUrl(path, manifestUrl) {
    const text = String(path ?? '').trim();
    if (!text) throw new Error('Tracked catalog chunk path is required.');
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//') || text.startsWith('/') ||
        text.includes('\\') || text.includes('%') || text.split('/').includes('..') || /[?#]/.test(text)) {
        throw new Error(`Tracked catalog chunk path must be a local relative path: ${text}`);
    }
    if (text.startsWith('json/tracked/')) return text;
    const separatorIndex = String(manifestUrl).lastIndexOf('/');
    const base = separatorIndex >= 0 ? String(manifestUrl).slice(0, separatorIndex + 1) : '';
    return `${base}${text.replace(/^\.\//, '')}`;
}

function declaredChunkObjectType(value, label) {
    const token = normalizedToken(value);
    const normalized = normalizeTrackedObjectType(value);
    if (!token || (normalized === TRACKED_OBJECT_TYPE.UNKNOWN && !['UNK', 'UNKNOWN', 'N_A'].includes(token))) {
        throw new Error(`${label} has an invalid object_type.`);
    }
    return normalized;
}

function declaredChunkScope(value, label) {
    const token = normalizedToken(value);
    if (['CURRENT', 'ACTIVE'].includes(token)) return 'current';
    if (['HISTORY', 'HISTORICAL', 'DECAYED_ABSENT'].includes(token)) return 'history';
    throw new Error(`${label} has an invalid scope.`);
}

function validateManifest(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.chunks)) {
        throw new Error('Tracked catalog manifest must contain a chunks array.');
    }
    if (!/^2\.3(?:\.|$)/.test(String(payload.schema_version ?? ''))) {
        throw new Error('Tracked catalog manifest schema_version must be 2.3.x.');
    }
    const historyChunks = Array.isArray(payload.history_chunks) ? payload.history_chunks : [];
    const ids = new Set();
    const paths = new Set();
    let declaredCurrent = 0;
    let declaredHistory = 0;
    const validateChunk = (chunk, index, scope) => {
        if (!chunk || typeof chunk !== 'object') throw new Error(`Tracked catalog chunk ${index} is invalid.`);
        const id = chunkIdentity(chunk, index);
        const path = String(chunk.path ?? '').trim();
        resolveChunkUrl(path, TRACKED_CATALOG_MANIFEST_URL);
        declaredChunkObjectType(chunk.object_type ?? chunk.objectType, `Tracked catalog chunk ${id}`);
        if (chunk.scope !== undefined && declaredChunkScope(chunk.scope, `Tracked catalog chunk ${id}`) !== scope) {
            throw new Error(`Tracked catalog chunk ${id} scope does not match its manifest collection.`);
        }
        if (ids.has(id)) throw new Error(`Tracked catalog chunk id is duplicated: ${id}`);
        if (paths.has(path)) throw new Error(`Tracked catalog chunk path is duplicated: ${path}`);
        ids.add(id);
        paths.add(path);
        const count = Number(chunk.count);
        if (!Number.isInteger(count) || count < 0) throw new Error(`Tracked catalog chunk ${id} has an invalid count.`);
        if (chunk.sha256 && !/^(?:sha256:)?[a-f0-9]{64}$/i.test(String(chunk.sha256))) {
            throw new Error(`Tracked catalog chunk ${id} has an invalid SHA-256 digest.`);
        }
        if (scope === 'history') declaredHistory += count;
        else declaredCurrent += count;
    };
    payload.chunks.forEach((chunk, index) => validateChunk(chunk, index, 'current'));
    historyChunks.forEach((chunk, index) => validateChunk(chunk, index, 'history'));
    const currentCount = Number(
        payload.counts?.current ?? payload.counts?.current_tracked ?? payload.counts?.current_records
    );
    const historyCount = Number(
        payload.counts?.history ?? payload.counts?.historical_tracked ?? payload.counts?.history_total
    );
    const manifestTotal = Number(payload.counts?.total ?? payload.total_count);
    if (Number.isFinite(currentCount) && currentCount !== declaredCurrent) {
        throw new Error('Tracked catalog manifest current count does not equal its current chunks.');
    }
    if (Number.isFinite(historyCount) && historyCount !== declaredHistory) {
        throw new Error('Tracked catalog manifest history count does not equal its history chunks.');
    }
    if (Number.isFinite(manifestTotal) && manifestTotal !== declaredCurrent + declaredHistory) {
        throw new Error('Tracked catalog manifest total does not equal the sum of chunk counts.');
    }
    return payload;
}

function chunkIdentity(chunk, index) {
    return String(chunk?.id ?? chunk?.path ?? `chunk-${index}`);
}

function chunkMatchesTypes(chunk, objectTypes) {
    if (!objectTypes || objectTypes.includes(TRACKED_OBJECT_TYPE.ALL)) return true;
    const declared = normalizeTrackedObjectType(chunk?.object_type ?? chunk?.objectType);
    return objectTypes.includes(declared);
}

export function createTrackedObjectCatalogLoader(options = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    const manifestUrl = options.manifestUrl ?? TRACKED_CATALOG_MANIFEST_URL;
    const concurrency = Math.max(1, Math.min(8, Math.trunc(Number(options.concurrency) || 3)));
    if (typeof fetchImpl !== 'function') throw new TypeError('Tracked catalog loading requires fetch.');

    let manifest = null;
    let recordsByNorad = new Map();
    let loadedChunkIds = new Set();
    let quarantinedRecords = [];
    let state = 'idle';
    let error = null;
    let requestGeneration = 0;

    const snapshot = () => Object.freeze({
        state,
        manifest,
        records: Object.freeze([...recordsByNorad.values()]),
        loaded_chunk_ids: Object.freeze([...loadedChunkIds]),
        loaded_count: recordsByNorad.size,
        quarantine: Object.freeze([...quarantinedRecords]),
        error
    });

    const coverage = () => Object.freeze({
        state,
        manifest,
        loaded_chunk_ids: Object.freeze([...loadedChunkIds]),
        error
    });

    const loadManifest = async ({ signal, force = false } = {}) => {
        if (manifest && !force) return manifest;
        const payload = await responseJson(await fetchImpl(manifestUrl, { signal, cache: force ? 'no-store' : 'default' }), 'Tracked catalog manifest');
        return validateManifest(payload);
    };

    const load = async (loadOptions = {}) => {
        const requestedTypes = normalizeTrackedObjectTypeSelection(
            loadOptions.objectTypes ?? loadOptions.object_types ?? TRACKED_OBJECT_TYPE.ALL
        );
        const includeHistorical = loadOptions.includeHistorical === true || loadOptions.include_historical === true;
        const force = loadOptions.force === true;
        const transactional = force || loadOptions.transactional === true;
        const generation = ++requestGeneration;
        const run = async () => {
            state = 'loading';
            error = null;
            try {
                const nextManifest = await loadManifest({ signal: loadOptions.signal, force });
                if (generation !== requestGeneration) {
                    return Object.freeze({ ...snapshot(), stale_request: true, request_generation: generation });
                }
                const availableChunks = includeHistorical
                    ? [...nextManifest.chunks, ...(nextManifest.history_chunks ?? [])]
                    : nextManifest.chunks;
                const historyChunkIds = new Set((nextManifest.history_chunks ?? []).map(chunkIdentity));
                const selectedChunks = availableChunks.filter(chunk => chunkMatchesTypes(chunk, requestedTypes));
                const chunksToLoad = force
                    ? selectedChunks
                    : selectedChunks.filter((chunk, index) => !loadedChunkIds.has(chunkIdentity(chunk, index)));
                const targetRecords = transactional ? new Map() : new Map(recordsByNorad);
                const targetChunkIds = transactional ? new Set() : new Set(loadedChunkIds);
                const targetQuarantine = transactional ? [] : [...quarantinedRecords];
                let processed = 0;

                for (let offset = 0; offset < chunksToLoad.length; offset += concurrency) {
                    const batch = chunksToLoad.slice(offset, offset + concurrency);
                    const payloads = await Promise.all(batch.map(async (chunk, batchIndex) => {
                        const chunkIndex = offset + batchIndex;
                        const id = chunkIdentity(chunk, chunkIndex);
                        const url = resolveChunkUrl(chunk.path, manifestUrl);
                        const payload = await responseJson(
                            await fetchImpl(url, { signal: loadOptions.signal, cache: force ? 'no-store' : 'default' }),
                            `Tracked catalog chunk ${id}`,
                            chunk.sha256
                        );
                        const records = Array.isArray(payload) ? payload : payload?.records;
                        if (!Array.isArray(records)) throw new Error(`Tracked catalog chunk ${id} must contain records.`);
                        if (records.length !== Number(chunk.count)) {
                            throw new Error(`Tracked catalog chunk ${id} count does not match its manifest declaration.`);
                        }
                        if (Array.isArray(payload)) {
                            throw new Error(`Tracked catalog chunk ${id} must declare its schema and object_type.`);
                        }
                        if (!/^2\.3(?:\.|$)/.test(String(payload.schema_version ?? ''))) {
                            throw new Error(`Tracked catalog chunk ${id} schema_version must be 2.3.x.`);
                        }
                        const expectedScope = historyChunkIds.has(id) ? 'history' : 'current';
                        const descriptorType = declaredChunkObjectType(
                            chunk.object_type ?? chunk.objectType,
                            `Tracked catalog chunk ${id}`
                        );
                        const payloadType = declaredChunkObjectType(
                            payload.object_type ?? payload.objectType,
                            `Tracked catalog chunk ${id} payload`
                        );
                        if (payloadType !== descriptorType) {
                            throw new Error(`Tracked catalog chunk ${id} payload object_type does not match its descriptor.`);
                        }
                        if (declaredChunkScope(payload.scope, `Tracked catalog chunk ${id} payload`) !== expectedScope) {
                            throw new Error(`Tracked catalog chunk ${id} payload scope does not match its manifest collection.`);
                        }
                        const entries = records.map((record, recordIndex) => {
                            try {
                                const declaredRecordType = declaredChunkObjectType(
                                    record?.object_type ?? record?.objectType,
                                    `Tracked catalog chunk ${id} record ${recordIndex}`
                                );
                                const normalized = normalizeTrackedRecord(record);
                                if (declaredRecordType !== descriptorType || normalized.object_type !== descriptorType) {
                                    throw new Error(`Tracked catalog chunk ${id} record ${recordIndex} object_type does not match its descriptor.`);
                                }
                                if (isHistoricalTrackedRecord(normalized) !== (expectedScope === 'history')) {
                                    throw new Error(`Tracked catalog chunk ${id} record ${recordIndex} lifecycle does not match its ${expectedScope} scope.`);
                                }
                                return { normalized, recordIndex };
                            } catch (recordError) {
                                return { recordError, recordIndex };
                            }
                        });
                        const contractError = entries.find(entry => entry.recordError &&
                            /does not match its (?:descriptor|current scope|history scope)/.test(entry.recordError.message));
                        if (contractError) throw contractError.recordError;
                        return { id, entries, scope: expectedScope };
                    }));

                    if (generation !== requestGeneration) {
                        return Object.freeze({ ...snapshot(), stale_request: true, request_generation: generation });
                    }

                    for (const payload of payloads) {
                        for (const entry of payload.entries) {
                            if (!entry.recordError) {
                                const normalized = entry.normalized;
                                const existing = targetRecords.get(normalized.norad_id);
                                if (payload.scope === 'history' && existing && !isHistoricalTrackedRecord(existing)) {
                                    continue;
                                }
                                targetRecords.set(normalized.norad_id, normalized);
                            } else {
                                targetQuarantine.push(Object.freeze({
                                    chunk_id: payload.id,
                                    record_index: entry.recordIndex,
                                    reason: entry.recordError?.message || String(entry.recordError)
                                }));
                            }
                        }
                        targetChunkIds.add(payload.id);
                        processed += 1;
                    }
                    loadOptions.onProgress?.({
                        processed_chunks: processed,
                        total_chunks: chunksToLoad.length,
                        loaded_records: targetRecords.size
                    });
                }

                if (generation !== requestGeneration) {
                    return Object.freeze({ ...snapshot(), stale_request: true, request_generation: generation });
                }
                manifest = nextManifest;
                recordsByNorad = targetRecords;
                loadedChunkIds = targetChunkIds;
                quarantinedRecords = targetQuarantine;
                const selectedChunkIds = selectedChunks.map(chunkIdentity);
                state = selectedChunkIds.every(id => loadedChunkIds.has(id)) ? 'ready' : 'partial';
                return snapshot();
            } catch (loadError) {
                if (generation !== requestGeneration) {
                    return Object.freeze({ ...snapshot(), stale_request: true, request_generation: generation });
                }
                error = loadError?.message || String(loadError);
                state = recordsByNorad.size ? 'stale' : 'error';
                if (loadOptions.throwOnFailure !== false) throw loadError;
                return snapshot();
            }
        };
        return run();
    };

    return Object.freeze({
        snapshot,
        coverage,
        clear() {
            requestGeneration += 1;
            manifest = null;
            recordsByNorad = new Map();
            loadedChunkIds = new Set();
            quarantinedRecords = [];
            state = 'idle';
            error = null;
            return snapshot();
        },
        async readManifest(readOptions = {}) {
            const nextManifest = await loadManifest({
                signal: readOptions.signal,
                force: readOptions.force === true
            });
            if (!manifest && readOptions.force !== true) manifest = nextManifest;
            return nextManifest;
        },
        load,
        loadAll: loadOptions => load({ ...loadOptions, objectTypes: [TRACKED_OBJECT_TYPE.ALL] }),
        reloadAll: loadOptions => load({
            ...loadOptions,
            objectTypes: [TRACKED_OBJECT_TYPE.ALL],
            force: true,
            transactional: true
        })
    });
}
