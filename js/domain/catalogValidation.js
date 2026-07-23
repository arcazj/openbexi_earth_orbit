import {
    buildIdentityEvidence,
    catalogObjectId,
    elementSetId,
    normalizeInternationalDesignator,
    normalizeNoradId
} from './objectIdentity.js';
import {
    DOMAIN_SCHEMA_VERSION,
    LIFECYCLE_STATUS,
    OBJECT_TYPE,
    ORBIT_CLASS,
    REFERENCE_FRAME,
    TIME_SCALE,
    DEFAULT_TLE_FRESHNESS_POLICY,
    freshnessStatus,
    normalizeLifecycleStatus,
    normalizeObjectType,
    normalizeOrbitClass,
    normalizeUtcInstant
} from './orbitalPolicy.js';
import {
    assertCatalogObject,
    normalizeDatasetProvenance,
    validateDatasetProvenance
} from './contracts.js';

export const TLE_LINE_LENGTH = 69;

const SGP4_CRITICAL_FINITE_FIELDS = Object.freeze([
    'epochyr',
    'epochdays',
    'jdsatepoch',
    'ndot',
    'nddot',
    'bstar',
    'inclo',
    'nodeo',
    'ecco',
    'argpo',
    'mo',
    'no'
]);

export const CATALOG_STATUS = Object.freeze({
    VALID: 'VALID',
    DEGRADED: 'DEGRADED',
    PARTIAL: 'PARTIAL',
    INVALID: 'INVALID'
});

export class CatalogValidationError extends TypeError {
    constructor(message, issues = []) {
        super(message);
        this.name = 'CatalogValidationError';
        this.issues = Object.freeze([...issues]);
    }
}

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addIssue(issues, path, code, message, severity = 'error') {
    issues.push(Object.freeze({ path, code, message, severity }));
}

function finish(value, issues, validOverride = null) {
    const frozenIssues = Object.freeze([...issues]);
    const errors = Object.freeze(frozenIssues.filter(item => item.severity === 'error'));
    const warnings = Object.freeze(frozenIssues.filter(item => item.severity === 'warning'));
    return Object.freeze({
        valid: validOverride ?? errors.length === 0,
        value,
        issues: frozenIssues,
        errors,
        warnings
    });
}

function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
}

function readFirst(record, keys) {
    for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null) return record[key];
    }
    return undefined;
}

function requireFiniteField(value, issues, path, options = {}) {
    const { minimum = null, maximum = null, exclusiveMaximum = false } = options;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        addIssue(issues, path, 'FINITE_NUMBER_REQUIRED', 'must be a finite number.');
        return false;
    }
    if (minimum !== null && value < minimum) {
        addIssue(issues, path, 'NUMBER_OUT_OF_RANGE', `must be at least ${minimum}.`);
        return false;
    }
    if (maximum !== null && (exclusiveMaximum ? value >= maximum : value > maximum)) {
        addIssue(issues, path, 'NUMBER_OUT_OF_RANGE', `must be ${exclusiveMaximum ? 'less than' : 'at most'} ${maximum}.`);
        return false;
    }
    return true;
}

/** Return the modulo-10 checksum for the first 68 characters of a TLE line. */
export function computeTleChecksum(line) {
    if (typeof line !== 'string' || line.length < TLE_LINE_LENGTH - 1) {
        throw new TypeError('A TLE checksum requires at least 68 characters.');
    }
    let sum = 0;
    for (const character of line.slice(0, TLE_LINE_LENGTH - 1)) {
        if (character >= '0' && character <= '9') sum += Number(character);
        if (character === '-') sum += 1;
    }
    return sum % 10;
}

function daysInYear(year) {
    return new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
}

/** Parse the fixed-width YYDDD.dddddddd TLE epoch into canonical UTC. */
export function parseTleEpochUtc(epochField) {
    const normalized = String(epochField ?? '');
    if (!/^\d{5}\.\d{8}$/.test(normalized)) {
        throw new TypeError('TLE epoch must use the fixed-width YYDDD.dddddddd form.');
    }
    const twoDigitYear = Number(normalized.slice(0, 2));
    const year = twoDigitYear >= 57 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
    const dayOfYear = Number(normalized.slice(2));
    if (!(dayOfYear >= 1 && dayOfYear < daysInYear(year) + 1)) {
        throw new RangeError(`TLE epoch day ${dayOfYear} is outside year ${year}.`);
    }
    return new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86_400_000).toISOString();
}

function parseTleCatalogId(line, issues, path) {
    const token = line.slice(2, 7).trim();
    try {
        return normalizeNoradId(token);
    } catch (error) {
        addIssue(issues, `${path}[2:7]`, 'TLE_CATALOG_ID_INVALID', error.message);
        return null;
    }
}

function parseTleNumber(line, start, end, issues, path, label, options = {}) {
    const token = line.slice(start, end).trim();
    const value = Number(token);
    if (!token || !Number.isFinite(value)) {
        addIssue(issues, `${path}[${start}:${end}]`, 'TLE_NUMERIC_FIELD_INVALID', `${label} is not a finite number.`);
        return null;
    }
    return requireFiniteField(value, issues, `${path}[${start}:${end}]`, options) ? value : null;
}

function validateTleLine1NumericFields(line1, issues) {
    const separatorIndexes = [8, 17, 32, 43, 52, 61, 63];
    for (const index of separatorIndexes) {
        if (line1[index] !== ' ') {
            addIssue(
                issues,
                `$.line1[${index}]`,
                'TLE_LINE1_SEPARATOR_INVALID',
                `line 1 column ${index + 1} must be a space.`
            );
        }
    }

    const firstDerivative = line1.slice(33, 43);
    if (!/^[ +\-]\.\d{8}$/.test(firstDerivative) || !Number.isFinite(Number(firstDerivative))) {
        addIssue(
            issues,
            '$.line1[33:43]',
            'TLE_MEAN_MOTION_FIRST_DERIVATIVE_INVALID',
            'mean-motion first derivative must use the fixed-width sign, decimal point, and eight-digit form.'
        );
    }

    const impliedExponentFields = [
        {
            start: 44,
            end: 52,
            code: 'TLE_MEAN_MOTION_SECOND_DERIVATIVE_INVALID',
            label: 'mean-motion second derivative'
        },
        {
            start: 53,
            end: 61,
            code: 'TLE_BSTAR_INVALID',
            label: 'BSTAR drag term'
        }
    ];
    for (const { start, end, code, label } of impliedExponentFields) {
        const token = line1.slice(start, end);
        if (!/^[ +\-]\d{5}[+\-]\d$/.test(token)) {
            addIssue(
                issues,
                `$.line1[${start}:${end}]`,
                code,
                `${label} must use the fixed-width implied-decimal mantissa and signed exponent form.`
            );
            continue;
        }
        const mantissaSign = token[0] === '-' ? -1 : 1;
        const mantissa = Number(`0.${token.slice(1, 6)}`);
        const exponent = Number(token.slice(6));
        if (!Number.isFinite(mantissaSign * mantissa * (10 ** exponent))) {
            addIssue(issues, `$.line1[${start}:${end}]`, code, `${label} is not finite.`);
        }
    }

    const ephemerisType = line1.slice(62, 63);
    if (!/^\d$/.test(ephemerisType)) {
        addIssue(
            issues,
            '$.line1[62:63]',
            'TLE_EPHEMERIS_TYPE_INVALID',
            'ephemeris type must be one decimal digit.'
        );
    } else if (ephemerisType !== '0') {
        addIssue(
            issues,
            '$.line1[62:63]',
            'TLE_EPHEMERIS_TYPE_UNSUPPORTED',
            'ephemeris type must be 0 for the pinned SGP4/SDP4 implementation.'
        );
    }
    if (!/^ *\d+$/.test(line1.slice(64, 68))) {
        addIssue(
            issues,
            '$.line1[64:68]',
            'TLE_ELEMENT_SET_NUMBER_INVALID',
            'element-set number must be a right-aligned unsigned integer.'
        );
    }
}

function parseInternationalDesignator(line1, issues) {
    const token = line1.slice(9, 17).trim();
    if (!token) return null;
    if (!/^\d{5}[A-Z0-9]{0,3}$/.test(token)) {
        addIssue(issues, '$.line1[9:17]', 'TLE_INTERNATIONAL_DESIGNATOR_INVALID', 'has an invalid launch designator.');
        return null;
    }
    const twoDigitYear = Number(token.slice(0, 2));
    const fullYear = twoDigitYear >= 57 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
    try {
        return normalizeInternationalDesignator(`${fullYear}-${token.slice(2)}`);
    } catch (error) {
        addIssue(issues, '$.line1[9:17]', 'TLE_INTERNATIONAL_DESIGNATOR_INVALID', error.message);
        return null;
    }
}

function validateTleLine(line, expectedNumber, issues) {
    const path = `$.line${expectedNumber}`;
    if (typeof line !== 'string') {
        addIssue(issues, path, 'TLE_LINE_REQUIRED', 'must be a string.');
        return false;
    }
    if (line.length !== TLE_LINE_LENGTH) {
        addIssue(issues, path, 'TLE_LINE_LENGTH_INVALID', `must contain exactly ${TLE_LINE_LENGTH} characters.`);
        return false;
    }
    if (line[0] !== String(expectedNumber) || line[1] !== ' ') {
        addIssue(issues, path, 'TLE_LINE_NUMBER_INVALID', `must begin with "${expectedNumber} ".`);
    }
    if (!/^\d$/.test(line[68])) {
        addIssue(issues, `${path}[68]`, 'TLE_CHECKSUM_CHARACTER_INVALID', 'must be a decimal checksum digit.');
    } else if (Number(line[68]) !== computeTleChecksum(line)) {
        addIssue(issues, `${path}[68]`, 'TLE_CHECKSUM_MISMATCH', `expected checksum ${computeTleChecksum(line)}.`);
    }
    return true;
}

/** Strictly validate and parse a two-line element set without propagating it. */
export function validateTlePair(line1, line2, options = {}) {
    const issues = [];
    const line1ShapeValid = validateTleLine(line1, 1, issues);
    const line2ShapeValid = validateTleLine(line2, 2, issues);
    if (!line1ShapeValid || !line2ShapeValid) return finish(null, issues);

    validateTleLine1NumericFields(line1, issues);

    const line1Norad = parseTleCatalogId(line1, issues, '$.line1');
    const line2Norad = parseTleCatalogId(line2, issues, '$.line2');
    if (line1Norad && line2Norad && line1Norad !== line2Norad) {
        addIssue(issues, '$.line2[2:7]', 'TLE_CATALOG_ID_MISMATCH', 'must match the line 1 catalog identifier.');
    }
    if (options.expected_norad_id !== undefined && options.expected_norad_id !== null) {
        try {
            const expected = normalizeNoradId(options.expected_norad_id);
            if (line1Norad && line1Norad !== expected) {
                addIssue(issues, '$.line1[2:7]', 'TLE_EXPECTED_CATALOG_ID_MISMATCH', `must match expected NORAD ${expected}.`);
            }
        } catch (error) {
            addIssue(issues, '$.expected_norad_id', 'EXPECTED_CATALOG_ID_INVALID', error.message);
        }
    }

    let epoch = null;
    try {
        epoch = parseTleEpochUtc(line1.slice(18, 32));
    } catch (error) {
        addIssue(issues, '$.line1[18:32]', 'TLE_EPOCH_INVALID', error.message);
    }

    const inclinationDeg = parseTleNumber(line2, 8, 16, issues, '$.line2', 'Inclination', { minimum: 0, maximum: 180 });
    const raanDeg = parseTleNumber(line2, 17, 25, issues, '$.line2', 'RAAN', { minimum: 0, maximum: 360, exclusiveMaximum: true });
    const eccentricityToken = line2.slice(26, 33);
    let eccentricity = null;
    if (!/^\d{7}$/.test(eccentricityToken)) {
        addIssue(issues, '$.line2[26:33]', 'TLE_ECCENTRICITY_INVALID', 'must contain seven implied-decimal digits.');
    } else {
        eccentricity = Number(`0.${eccentricityToken}`);
    }
    const argumentOfPerigeeDeg = parseTleNumber(line2, 34, 42, issues, '$.line2', 'Argument of perigee', { minimum: 0, maximum: 360, exclusiveMaximum: true });
    const meanAnomalyDeg = parseTleNumber(line2, 43, 51, issues, '$.line2', 'Mean anomaly', { minimum: 0, maximum: 360, exclusiveMaximum: true });
    const meanMotionRevPerDay = parseTleNumber(line2, 52, 63, issues, '$.line2', 'Mean motion', { minimum: Number.MIN_VALUE });
    const revolutionToken = line2.slice(63, 68).trim();
    const revolutionNumber = /^\d+$/.test(revolutionToken) ? Number(revolutionToken) : null;
    if (revolutionNumber === null) {
        addIssue(issues, '$.line2[63:68]', 'TLE_REVOLUTION_NUMBER_INVALID', 'must be an unsigned integer.');
    }

    const parsed = {
        line1,
        line2,
        norad_id: line1Norad,
        international_designator: parseInternationalDesignator(line1, issues),
        epoch,
        inclination_deg: inclinationDeg,
        raan_deg: raanDeg,
        eccentricity,
        argument_of_perigee_deg: argumentOfPerigeeDeg,
        mean_anomaly_deg: meanAnomalyDeg,
        mean_motion_rev_per_day: meanMotionRevPerDay,
        revolution_number: revolutionNumber
    };
    return finish(freezeDeep(parsed), issues);
}

function validateSgp4Initialization(line1, line2, issues, options) {
    const initialize = options.sgp4_initializer ?? options.sgp4Initializer;
    if (initialize === undefined || initialize === null) return true;
    if (typeof initialize !== 'function') {
        addIssue(
            issues,
            '$.element_set',
            'TLE_SGP4_INITIALIZER_INVALID',
            'SGP4 initializer must be a function when supplied.'
        );
        return false;
    }

    let satrec;
    try {
        satrec = initialize(line1, line2);
    } catch (error) {
        addIssue(
            issues,
            '$.element_set',
            'TLE_SGP4_PARSE_FAILED',
            `satellite.js could not initialize this TLE: ${error?.message || String(error)}`
        );
        return false;
    }
    if (!satrec || typeof satrec !== 'object') {
        addIssue(
            issues,
            '$.element_set',
            'TLE_SGP4_PARSE_FAILED',
            'satellite.js did not return a satellite record for this TLE.'
        );
        return false;
    }
    if (!Number.isFinite(satrec.error)) {
        addIssue(
            issues,
            '$.element_set',
            'TLE_SGP4_INITIALIZATION_INVALID',
            'satellite.js returned a satellite record without a finite SGP4 error code.'
        );
        return false;
    }
    if (satrec.error !== 0) {
        addIssue(
            issues,
            '$.element_set',
            'TLE_SGP4_INITIALIZATION_FAILED',
            `satellite.js rejected this TLE with SGP4 error code ${satrec.error}.`
        );
        return false;
    }
    const nonFiniteFields = SGP4_CRITICAL_FINITE_FIELDS.filter(field => !Number.isFinite(satrec[field]));
    if (nonFiniteFields.length > 0) {
        addIssue(
            issues,
            '$.element_set',
            'TLE_SGP4_NONFINITE_FIELD',
            `satellite.js returned non-finite critical field${nonFiniteFields.length === 1 ? '' : 's'}: ${nonFiniteFields.join(', ')}.`
        );
        return false;
    }
    return true;
}

function sourceProvenance(input, issues) {
    const result = validateDatasetProvenance(input);
    result.issues.forEach(item => addIssue(issues, `$.provenance${item.path.slice(1)}`, item.code, item.message, item.severity));
    if (!result.valid) return null;
    return normalizeDatasetProvenance(input);
}

function identityInput(record, tle, provenance) {
    const explicitInternalId = String(readFirst(record, ['internal_object_id', 'internalObjectId']) ?? '').trim();
    const rawObjectId = String(readFirst(record, ['object_id', 'objectId']) ?? '').trim();
    const objectId = explicitInternalId || (rawObjectId.toLowerCase().startsWith('obx:') ? rawObjectId : undefined);
    const rawInternationalDesignator = readFirst(record, ['international_designator', 'internationalDesignator', 'OBJECT_ID']) ??
        (/^\d{4}-\d{3}[A-Za-z0-9]{0,3}$/.test(rawObjectId) ? rawObjectId : undefined);
    return {
        object_id: objectId,
        norad_id: readFirst(record, ['norad_id', 'noradId', 'NORAD_CAT_ID']) ?? tle?.norad_id,
        international_designator: rawInternationalDesignator ?? tle?.international_designator,
        provider: provenance?.source_id,
        provider_object_id: readFirst(record, ['provider_object_id', 'providerObjectId', 'source_record_id'])
    };
}

function appendOptionalDerivedFieldChecks(record, tle, issues) {
    const comparisons = [
        { keys: ['inclination_deg', 'inclinationDeg'], parsed: tle.inclination_deg, tolerance: 5e-4 },
        { keys: ['eccentricity'], parsed: tle.eccentricity, tolerance: 5e-8 },
        { keys: ['mean_motion_rev_per_day', 'meanMotionRevPerDay'], parsed: tle.mean_motion_rev_per_day, tolerance: 5e-8 }
    ];
    comparisons.forEach(({ keys, parsed, tolerance }) => {
        const raw = readFirst(record, keys);
        if (raw === undefined) return;
        const numeric = Number(raw);
        const path = `$.${keys.find(key => record[key] !== undefined) ?? keys[0]}`;
        if (!Number.isFinite(numeric)) {
            addIssue(issues, path, 'DERIVED_FIELD_NONFINITE', 'must be finite when supplied.');
        } else if (parsed !== null && Math.abs(numeric - parsed) > tolerance) {
            addIssue(issues, path, 'DERIVED_FIELD_TLE_MISMATCH', 'does not match the authoritative TLE field.');
        }
    });
    [
        ['period_min', 'periodMin'],
        ['semi_major_axis_km', 'semiMajorAxisKm'],
        ['perigee_km', 'perigeeKm'],
        ['apogee_km', 'apogeeKm'],
        ['estimated_altitude_km', 'estimatedAltitudeKm']
    ].forEach(keys => {
        const raw = readFirst(record, keys);
        if (raw !== undefined && !Number.isFinite(Number(raw))) {
            addIssue(issues, `$.${keys.find(key => record[key] !== undefined) ?? keys[0]}`, 'DERIVED_FIELD_NONFINITE', 'must be finite when supplied.');
        }
    });
}

function recordName(record) {
    return String(readFirst(record, ['name', 'satellite_name', 'object_name', 'OBJECT_NAME']) ?? '').trim();
}

function recordTleLines(record) {
    return {
        line1: readFirst(record, ['tle_line1', 'tleLine1', 'TLE_LINE1', 'line1']),
        line2: readFirst(record, ['tle_line2', 'tleLine2', 'TLE_LINE2', 'line2'])
    };
}

/** Validate one source record and return a normalized CatalogObject when usable. */
export function validateCatalogRecord(record, options = {}) {
    const issues = [];
    if (!isRecord(record)) {
        addIssue(issues, '$', 'CATALOG_RECORD_REQUIRED', 'must be an object.');
        return finish(null, issues);
    }
    const provenance = sourceProvenance(options.provenance ?? record.provenance, issues);
    const { line1, line2 } = recordTleLines(record);
    const rawNorad = readFirst(record, ['norad_id', 'noradId', 'NORAD_CAT_ID']);
    const tleResult = validateTlePair(line1, line2, { expected_norad_id: rawNorad });
    tleResult.issues.forEach(item => addIssue(issues, `$.element_set${item.path.slice(1)}`, item.code, item.message, item.severity));
    const tle = tleResult.value;
    const sgp4Initializes = tleResult.valid && tle
        ? validateSgp4Initialization(line1, line2, issues, options)
        : false;
    if (!provenance || !tleResult.valid || !tle || !sgp4Initializes) return finish(null, issues);

    const name = recordName(record);
    if (!name) addIssue(issues, '$.name', 'CATALOG_NAME_REQUIRED', 'must be a non-empty string.');

    const identityData = identityInput(record, tle, provenance);
    if (identityData.international_designator && tle.international_designator) {
        try {
            if (normalizeInternationalDesignator(identityData.international_designator) !== tle.international_designator) {
                addIssue(issues, '$.international_designator', 'INTERNATIONAL_DESIGNATOR_TLE_MISMATCH', 'must match the line 1 launch designator.');
            }
        } catch (error) {
            addIssue(issues, '$.international_designator', 'INTERNATIONAL_DESIGNATOR_INVALID', error.message);
        }
    }
    let identity;
    try {
        identity = buildIdentityEvidence(identityData, { source_id: provenance.source_id });
    } catch (error) {
        addIssue(issues, '$.object_id', 'STABLE_IDENTITY_REQUIRED', error.message);
    }
    if (!identity) return finish(null, issues);

    const objectTypeRaw = readFirst(record, ['object_type', 'objectType', 'OBJECT_TYPE']);
    const orbitClassRaw = readFirst(record, ['orbit_class', 'orbitClass', 'ORBIT_CLASS']);
    const legacyOrbitClass = orbitClassRaw ?? readFirst(record, ['type']);
    const objectType = normalizeObjectType(objectTypeRaw);
    const orbitClass = normalizeOrbitClass(legacyOrbitClass);
    const lifecycleStatus = normalizeLifecycleStatus(readFirst(record, ['lifecycle_status', 'lifecycleStatus', 'operational_status', 'operationalStatus']));
    const qualityFlags = new Set((record.quality_flags ?? record.qualityFlags ?? []).map(String));
    if (objectType === OBJECT_TYPE.UNKNOWN) qualityFlags.add('OBJECT_TYPE_UNKNOWN');
    if (orbitClass === ORBIT_CLASS.UNKNOWN) qualityFlags.add('ORBIT_CLASS_UNKNOWN');
    if (lifecycleStatus === LIFECYCLE_STATUS.UNKNOWN) qualityFlags.add('LIFECYCLE_STATUS_UNKNOWN');
    if (orbitClassRaw === undefined && readFirst(record, ['type']) !== undefined) {
        qualityFlags.add('LEGACY_TYPE_USED_AS_ORBIT_CLASS');
    }
    if (record.covariance != null) qualityFlags.add('COVARIANCE_UNVALIDATED');

    if (options.require_known_classification && objectType === OBJECT_TYPE.UNKNOWN) {
        addIssue(issues, '$.object_type', 'OBJECT_TYPE_REQUIRED', 'must be known under the configured policy.');
    } else if (objectType === OBJECT_TYPE.UNKNOWN) {
        addIssue(issues, '$.object_type', 'OBJECT_TYPE_UNKNOWN', 'was not supplied or recognized.', 'warning');
    }
    if (orbitClass === ORBIT_CLASS.UNKNOWN) addIssue(issues, '$.orbit_class', 'ORBIT_CLASS_UNKNOWN', 'was not supplied or recognized.', 'warning');
    if (lifecycleStatus === LIFECYCLE_STATUS.UNKNOWN) addIssue(issues, '$.lifecycle_status', 'LIFECYCLE_STATUS_UNKNOWN', 'was not supplied or recognized.', 'warning');

    appendOptionalDerivedFieldChecks(record, tle, issues);
    if (record.covariance !== undefined && record.covariance !== null && !isRecord(record.covariance)) {
        addIssue(issues, '$.covariance', 'COVARIANCE_OBJECT_OR_NULL_REQUIRED', 'must be an object or null.');
    }
    const hardBodyRadiusRaw = readFirst(record, ['hard_body_radius_km', 'hardBodyRadiusKm']);
    const hardBodyRadiusKm = hardBodyRadiusRaw == null ? null : Number(hardBodyRadiusRaw);
    if (hardBodyRadiusKm !== null) requireFiniteField(hardBodyRadiusKm, issues, '$.hard_body_radius_km', { minimum: 0 });

    const referenceTime = normalizeUtcInstant(options.reference_time ?? provenance.retrieved_at, 'catalog reference time');
    const freshness = freshnessStatus(tle.epoch, orbitClass, referenceTime, options.freshness_policy ?? DEFAULT_TLE_FRESHNESS_POLICY);
    if (freshness.status === 'FUTURE') {
        addIssue(issues, '$.element_set.epoch', 'TLE_EPOCH_IN_FUTURE', 'exceeds the configured future-epoch tolerance.');
        qualityFlags.add('TLE_EPOCH_IN_FUTURE');
    } else if (freshness.status === 'STALE') {
        const severity = options.quarantine_stale ? 'error' : 'warning';
        addIssue(issues, '$.element_set.epoch', 'TLE_STALE', `is ${freshness.age_days.toFixed(3)} days old; limit is ${freshness.max_age_days} days.`, severity);
        qualityFlags.add('TLE_STALE');
    }

    const objectId = catalogObjectId({ object_id: identity.object_id });
    const setId = elementSetId({ object_id: objectId, format: 'TLE', line1, line2 });
    const normalized = {
        schema_version: DOMAIN_SCHEMA_VERSION,
        object_id: objectId,
        name,
        norad_id: tle.norad_id,
        international_designator: identityData.international_designator
            ? normalizeInternationalDesignator(identityData.international_designator)
            : null,
        object_type: objectType,
        orbit_class: orbitClass,
        lifecycle_status: lifecycleStatus,
        identity,
        element_set: {
            element_set_id: setId,
            object_id: objectId,
            format: 'TLE',
            epoch: tle.epoch,
            time_scale: TIME_SCALE.UTC,
            native_frame: REFERENCE_FRAME.TEME,
            line1,
            line2,
            provenance
        },
        provenance,
        covariance: record.covariance ?? null,
        hard_body_radius_km: hardBodyRadiusKm,
        quality_flags: [...qualityFlags].sort()
    };

    if (issues.some(item => item.severity === 'error')) return finish(null, issues);
    try {
        assertCatalogObject(normalized);
    } catch (error) {
        for (const contractIssue of error.issues ?? []) {
            addIssue(issues, contractIssue.path, contractIssue.code, contractIssue.message, contractIssue.severity);
        }
        return finish(null, issues);
    }
    return finish(freezeDeep(normalized), issues);
}

export function normalizeCatalogRecord(record, options = {}) {
    const result = validateCatalogRecord(record, options);
    if (!result.valid) throw new CatalogValidationError('Catalog record validation failed.', result.issues);
    return result.value;
}

function identityCandidate(record) {
    if (!isRecord(record)) return null;
    const { line1, line2 } = recordTleLines(record);
    const tleResult = validateTlePair(line1, line2);
    const tle = tleResult.value;
    try {
        return catalogObjectId(identityInput(record, tle, { source_id: 'duplicate-detection' }));
    } catch {
        return null;
    }
}

function incrementCount(target, key) {
    target[key] = (target[key] ?? 0) + 1;
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Validate a source catalog. Every record sharing a duplicate stable identity is quarantined. */
export function validateCatalog(records, options = {}) {
    const issues = [];
    const referenceTimeInput = options.reference_time ?? options.provenance?.retrieved_at;
    let referenceTime = null;
    try {
        referenceTime = normalizeUtcInstant(referenceTimeInput, 'catalog reference time');
    } catch (error) {
        addIssue(issues, '$.reference_time', 'CATALOG_REFERENCE_TIME_INVALID', error.message);
    }
    const provenanceResult = validateDatasetProvenance(options.provenance);
    provenanceResult.issues.forEach(item => addIssue(issues, `$.provenance${item.path.slice(1)}`, item.code, item.message, item.severity));
    if (!Array.isArray(records)) {
        addIssue(issues, '$.records', 'CATALOG_ARRAY_REQUIRED', 'must be an array.');
    } else if (records.length === 0) {
        addIssue(issues, '$.records', 'CATALOG_EMPTY', 'must contain at least one record.');
    }
    if (!referenceTime || !provenanceResult.valid || !Array.isArray(records) || records.length === 0) {
        return finish(null, issues, false);
    }
    const provenance = normalizeDatasetProvenance(options.provenance);

    const recordResults = records.map(record => validateCatalogRecord(record, {
        ...options,
        provenance,
        reference_time: referenceTime
    }));
    const candidateIds = records.map((record, index) => recordResults[index].value?.object_id ?? identityCandidate(record));
    const identityCounts = new Map();
    candidateIds.forEach(id => {
        if (id) identityCounts.set(id, (identityCounts.get(id) ?? 0) + 1);
    });
    const duplicateIds = new Set([...identityCounts].filter(([, count]) => count > 1).map(([id]) => id));

    const objects = [];
    const acceptedRecordIndices = [];
    const quarantine = [];
    records.forEach((record, index) => {
        const result = recordResults[index];
        const objectId = result.value?.object_id ?? candidateIds[index];
        const recordIssues = [...result.issues];
        if (objectId && duplicateIds.has(objectId)) {
            addIssue(recordIssues, '$.object_id', 'DUPLICATE_OBJECT_ID', `duplicates canonical identity ${objectId}.`);
        }
        const hasError = recordIssues.some(item => item.severity === 'error');
        if (!hasError && result.value) {
            objects.push(result.value);
            acceptedRecordIndices.push(index);
            return;
        }
        quarantine.push(freezeDeep({
            index,
            object_id: objectId,
            name: isRecord(record) ? recordName(record) || null : null,
            reason_codes: [...new Set(recordIssues.filter(item => item.severity === 'error').map(item => item.code))].sort(),
            issues: recordIssues
        }));
    });

    const quality = {
        total_records: records.length,
        accepted_records: objects.length,
        quarantined_records: quarantine.length,
        duplicate_records: quarantine.filter(item => item.reason_codes.includes('DUPLICATE_OBJECT_ID')).length,
        by_object_type: {},
        by_orbit_class: {},
        by_lifecycle_status: {},
        freshness: { FRESH: 0, STALE: 0, FUTURE: 0, UNUSABLE: 0 },
        epoch_age_days: { minimum: null, median: null, maximum: null },
        quarantine_reason_counts: {}
    };
    const ages = [];
    objects.forEach(object => {
        incrementCount(quality.by_object_type, object.object_type);
        incrementCount(quality.by_orbit_class, object.orbit_class);
        incrementCount(quality.by_lifecycle_status, object.lifecycle_status);
        const freshness = freshnessStatus(object.element_set.epoch, object.orbit_class, referenceTime, options.freshness_policy ?? DEFAULT_TLE_FRESHNESS_POLICY);
        incrementCount(quality.freshness, freshness.status);
        if (Number.isFinite(freshness.age_days)) ages.push(freshness.age_days);
    });
    quarantine.forEach(item => item.reason_codes.forEach(code => incrementCount(quality.quarantine_reason_counts, code)));
    if (ages.length) {
        quality.epoch_age_days.minimum = Math.min(...ages);
        quality.epoch_age_days.median = median(ages);
        quality.epoch_age_days.maximum = Math.max(...ages);
    }

    let status = CATALOG_STATUS.VALID;
    const acceptedWarnings = objects.some(object => object.quality_flags.length > 0);
    if (acceptedWarnings || provenance.source_status === 'DEGRADED') status = CATALOG_STATUS.DEGRADED;
    if (quarantine.length > 0 || provenance.source_status === 'PARTIAL' || provenance.partial_update) status = CATALOG_STATUS.PARTIAL;
    if (objects.length === 0) status = CATALOG_STATUS.INVALID;
    if (provenance.source_status === 'PARTIAL' && !provenance.partial_update) status = CATALOG_STATUS.INVALID;

    const snapshot = freezeDeep({
        schema_version: DOMAIN_SCHEMA_VERSION,
        status,
        reference_time: referenceTime,
        provenance,
        objects,
        accepted_record_indices: acceptedRecordIndices,
        quarantine,
        quality
    });
    return finish(snapshot, issues, status !== CATALOG_STATUS.INVALID);
}

export function assertValidCatalog(records, options = {}) {
    const result = validateCatalog(records, options);
    if (!result.valid) throw new CatalogValidationError('Catalog validation produced no usable snapshot.', result.issues);
    return result.value;
}
