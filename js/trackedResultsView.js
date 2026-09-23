import {
    isHistoricalTrackedRecord,
    isTrackedRecordPropagatable,
    trackedObjectType
} from './trackedObjectCatalog.js';

export const TRACKED_RESULT_MODE = Object.freeze({
    ALL: 'ALL',
    POSITIONED: 'POSITIONED',
    UNAVAILABLE: 'UNAVAILABLE'
});

export const TRACKED_RESULT_SORT = Object.freeze({
    NAME: 'name',
    NORAD: 'norad',
    TYPE: 'type',
    OWNER: 'owner',
    ORBIT: 'orbit',
    RCS: 'rcs',
    AVAILABILITY: 'availability'
});

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function trackedResultIsPositioned(record) {
    return isTrackedRecordPropagatable(record) && !isHistoricalTrackedRecord(record);
}

export function trackedResultRow(record) {
    const rawRcs = record?.rcs_m2;
    const rcs = rawRcs === null || rawRcs === undefined ||
        (typeof rawRcs === 'string' && rawRcs.trim() === '')
        ? null
        : Number(rawRcs);
    const positioned = trackedResultIsPositioned(record);
    return Object.freeze({
        record,
        norad: String(record?.norad_id ?? record?.NORAD_CAT_ID ?? '').trim(),
        name: String(record?.satellite_name ?? record?.name ?? 'Unnamed object').trim(),
        type: trackedObjectType(record),
        owner: String(record?.owner ?? record?.owner_code ?? record?.operator ?? '').trim() || 'Not reported',
        orbit: String(record?.orbit_class ?? record?.orbitType ?? record?.type ?? '').trim() || 'Unknown',
        rcs: Number.isFinite(rcs) && rcs >= 0 ? rcs : null,
        availability: positioned ? 'Positioned' : 'Position unavailable',
        positioned
    });
}

function rowValue(row, key) {
    if (key === TRACKED_RESULT_SORT.RCS) return row.rcs;
    return row[key] ?? '';
}

export function prepareTrackedResults(records = [], options = {}) {
    const mode = Object.values(TRACKED_RESULT_MODE).includes(options.mode)
        ? options.mode
        : TRACKED_RESULT_MODE.ALL;
    const sortKey = Object.values(TRACKED_RESULT_SORT).includes(options.sortKey)
        ? options.sortKey
        : TRACKED_RESULT_SORT.NAME;
    const direction = options.direction === 'desc' ? -1 : 1;
    return records
        .map(trackedResultRow)
        .filter(row => mode === TRACKED_RESULT_MODE.ALL ||
            (mode === TRACKED_RESULT_MODE.POSITIONED ? row.positioned : !row.positioned))
        .sort((a, b) => {
            const left = rowValue(a, sortKey);
            const right = rowValue(b, sortKey);
            if (left === null && right !== null) return 1;
            if (right === null && left !== null) return -1;
            const compared = typeof left === 'number' && typeof right === 'number'
                ? left - right
                : collator.compare(String(left), String(right));
            return direction * (compared || collator.compare(a.norad, b.norad));
        });
}

export function trackedResultWindow(rows = [], options = {}) {
    const rowHeight = Math.max(32, Number(options.rowHeight) || 44);
    const viewportHeight = Math.max(rowHeight, Number(options.viewportHeight) || rowHeight * 8);
    const scrollTop = Math.max(0, Number(options.scrollTop) || 0);
    const overscan = Math.max(0, Math.floor(Number(options.overscan) || 4));
    const visibleCount = Math.ceil(viewportHeight / rowHeight);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(rows.length, start + visibleCount + overscan * 2);
    return Object.freeze({
        start,
        end,
        rowHeight,
        totalHeight: rows.length * rowHeight,
        rows: rows.slice(start, end)
    });
}
