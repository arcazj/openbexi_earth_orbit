export const SATELLITE_CATEGORY = Object.freeze({
    ALL: 'ALL',
    GEO: 'GEO',
    MEO: 'MEO',
    LEO: 'LEO',
    HEO: 'HEO',
    DEBRIS: 'DEBRIS',
    OTHER: 'OTHER'
});

export const SATELLITE_CATEGORY_OPTIONS = Object.freeze([
    SATELLITE_CATEGORY.GEO,
    SATELLITE_CATEGORY.MEO,
    SATELLITE_CATEGORY.LEO,
    SATELLITE_CATEGORY.HEO,
    SATELLITE_CATEGORY.DEBRIS,
    SATELLITE_CATEGORY.OTHER
]);

function categoryValue(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized === 'HRO' ? SATELLITE_CATEGORY.HEO : normalized;
}

export function isDebrisSatellite(record) {
    if (!record || typeof record !== 'object') return false;
    const objectTypes = [
        record.object_type,
        record.objectType,
        record.catalogObject?.object_type,
        record.element_set?.omm?.OBJECT_TYPE
    ]
        .map(value => String(value ?? '').trim().toUpperCase().replaceAll('_', ' '))
        .filter(Boolean);
    const objectType = objectTypes.find(value => !/^(UNKNOWN|N\/A)$/.test(value)) ?? objectTypes[0] ?? '';
    if (/^(DEB|DEBRIS|R\/B|RB|ROCKET BODY|ROCKETBODY|STAGE)$/.test(objectType)) return true;
    if (objectType && !/^(UNKNOWN|N\/A)$/.test(objectType)) return false;

    const identityText = [record.satellite_name, record.name, record.company]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();
    return /\b(DEB|DEBRIS)\b/.test(identityText) ||
        /\bR\/B\b/.test(identityText) ||
        /\bROCKET BODY\b/.test(identityText) ||
        /\bSTAGE\b/.test(identityText);
}

export function satelliteCategory(recordOrOrbitType) {
    if (recordOrOrbitType && typeof recordOrOrbitType === 'object') {
        if (isDebrisSatellite(recordOrOrbitType)) return SATELLITE_CATEGORY.DEBRIS;
        const value = categoryValue(
            recordOrOrbitType.orbitType ??
            recordOrOrbitType.orbit_class ??
            recordOrOrbitType.orbitClass ??
            recordOrOrbitType.type
        );
        return SATELLITE_CATEGORY_OPTIONS.includes(value) && value !== SATELLITE_CATEGORY.DEBRIS
            ? value
            : SATELLITE_CATEGORY.OTHER;
    }

    const value = categoryValue(recordOrOrbitType);
    return SATELLITE_CATEGORY_OPTIONS.includes(value) ? value : SATELLITE_CATEGORY.OTHER;
}

export function normalizeSatelliteCategorySelection(selection) {
    const values = Array.isArray(selection) ? selection : [selection];
    const cleaned = Array.from(new Set(values
        .filter(value => value !== undefined && value !== null && value !== '')
        .map(categoryValue)));

    if (cleaned.includes(SATELLITE_CATEGORY.ALL)) return [SATELLITE_CATEGORY.ALL];
    const categories = cleaned.filter(value => SATELLITE_CATEGORY_OPTIONS.includes(value));
    if (categories.length === 0 || categories.length === SATELLITE_CATEGORY_OPTIONS.length) {
        return [SATELLITE_CATEGORY.ALL];
    }
    return categories;
}

export function isAllSatelliteCategorySelection(selection) {
    const normalized = normalizeSatelliteCategorySelection(selection);
    return normalized.length === 1 && normalized[0] === SATELLITE_CATEGORY.ALL;
}

export function toggleSatelliteCategorySelection(selection, changedCategory) {
    const changed = categoryValue(changedCategory);
    if (changed === SATELLITE_CATEGORY.ALL) return [SATELLITE_CATEGORY.ALL];
    if (!SATELLITE_CATEGORY_OPTIONS.includes(changed)) {
        return normalizeSatelliteCategorySelection(selection);
    }

    const normalized = normalizeSatelliteCategorySelection(selection);
    const active = isAllSatelliteCategorySelection(normalized) ? [] : [...normalized];
    const next = active.includes(changed)
        ? active.filter(category => category !== changed)
        : [...active, changed];
    return normalizeSatelliteCategorySelection(next);
}

export function satelliteMatchesCategorySelection(record, selection) {
    const normalized = normalizeSatelliteCategorySelection(selection);
    return isAllSatelliteCategorySelection(normalized) || normalized.includes(satelliteCategory(record));
}
