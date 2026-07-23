import {
    normalizeComputationProvenance,
    normalizeStateVector
} from '../domain/contracts.js';
import {
    catalogObjectId,
    elementSetId,
    stableFingerprint
} from '../domain/objectIdentity.js';
import {
    DOMAIN_SCHEMA_VERSION,
    ORBIT_CLASS,
    REFERENCE_FRAME,
    TIME_SCALE,
    normalizeUtcInstant
} from '../domain/orbitalPolicy.js';

export const TLE_PROPAGATION_SERVICE_VERSION = '2.0.0';
export const SATELLITE_JS_VERSION = '6.0.2';
export const DEFAULT_MINIMUM_ORBIT_RADIUS_KM = 6378.137;

export const PROPAGATION_ERROR_CODE = Object.freeze({
    LIBRARY_UNAVAILABLE: 'PROPAGATION_LIBRARY_UNAVAILABLE',
    INVALID_OBJECT_IDENTITY: 'INVALID_OBJECT_IDENTITY',
    MISSING_TLE: 'MISSING_TLE',
    TLE_PARSE_FAILED: 'TLE_PARSE_FAILED',
    TLE_INVALID: 'TLE_INVALID',
    INVALID_EPOCH: 'INVALID_PROPAGATION_EPOCH',
    PROPAGATION_FAILED: 'PROPAGATION_FAILED',
    INVALID_POSITION: 'INVALID_PROPAGATED_POSITION',
    INVALID_VELOCITY: 'INVALID_PROPAGATED_VELOCITY',
    BELOW_EARTH: 'PROPAGATED_STATE_BELOW_EARTH',
    STATE_VALIDATION_FAILED: 'PROPAGATED_STATE_VALIDATION_FAILED'
});

const PREPARED_OBJECT_MARKER = 'openbexi.tle.prepared.v2';
const DEFAULT_SOURCE_ID = 'legacy-tle-catalog';
const SGP4_CRITICAL_FINITE_FIELDS = Object.freeze([
    'epochyr', 'epochdays', 'jdsatepoch', 'ndot', 'nddot', 'bstar',
    'inclo', 'nodeo', 'ecco', 'argpo', 'mo', 'no'
]);

function firstNonEmpty(record, keys) {
    for (const key of keys) {
        const value = record?.[key];
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
}

function finiteVector(value) {
    return !!value &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.z);
}

function vectorCopy(value) {
    return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

function vectorMagnitude(value) {
    return Math.hypot(value.x, value.y, value.z);
}

function inputQualityFlags(record) {
    const supplied = record?.quality_flags ?? record?.qualityFlags;
    const flags = new Set(Array.isArray(supplied)
        ? supplied.map(value => String(value).trim()).filter(Boolean)
        : []);
    const sourceStatus = String(record?.provenance?.source_status ?? '').trim().toUpperCase();
    if (sourceStatus === 'DEGRADED') flags.add('SOURCE_DATA_DEGRADED');
    if (record?.provenance?.partial_update === true) flags.add('SOURCE_PARTIAL_UPDATE');
    return Object.freeze([...flags].sort());
}

function hashValue(value) {
    return `fnv1a64:${stableFingerprint(value)}`;
}

function tleLines(record) {
    const elementSet = record?.element_set ?? record?.elementSet ?? {};
    return {
        line1: firstNonEmpty({ ...record, ...elementSet }, [
            'line1', 'tle_line1', 'tleLine1', 'TLE_LINE1'
        ]),
        line2: firstNonEmpty({ ...record, ...elementSet }, [
            'line2', 'tle_line2', 'tleLine2', 'TLE_LINE2'
        ])
    };
}

function identityRecord(record, line1) {
    const hasKnownIdentity = [
        record?.object_id,
        record?.objectId,
        record?.norad_id,
        record?.noradId,
        record?.NORAD_CAT_ID,
        record?.international_designator,
        record?.internationalDesignator,
        record?.OBJECT_ID
    ].some(value => value !== undefined && value !== null && String(value).trim());

    if (hasKnownIdentity) return record;
    const noradFromTle = line1?.slice(2, 7).trim();
    return { ...record, norad_id: noradFromTle };
}

function objectName(record, objectId) {
    return firstNonEmpty(record, [
        'name', 'object_name', 'objectName', 'satellite_name', 'satelliteName', 'OBJECT_NAME'
    ]) || objectId;
}

function noradId(record, line1) {
    return firstNonEmpty(record, ['norad_id', 'noradId', 'NORAD_CAT_ID']) || line1?.slice(2, 7).trim() || null;
}

function propagationError(code, message, context = {}) {
    return Object.freeze({
        schema_version: DOMAIN_SCHEMA_VERSION,
        code,
        message,
        stage: context.stage ?? 'PROPAGATION',
        object_id: context.object_id ?? null,
        element_set_id: context.element_set_id ?? null,
        timestamp: context.timestamp ?? null,
        propagator_error_code: context.propagator_error_code ?? null,
        recoverable: context.recoverable ?? true
    });
}

function resultError(code, message, context) {
    return { ok: false, error: propagationError(code, message, context) };
}

function elementEpochUtc(satrec, satelliteLib, record) {
    const explicit = record?.element_set?.epoch ?? record?.elementSet?.epoch ??
        record?.element_epoch_utc ?? record?.elementEpochUtc;
    if (explicit) {
        try {
            return normalizeUtcInstant(explicit, 'TLE element epoch');
        } catch {
            // Prefer the parsed SGP4 epoch below when legacy metadata is malformed.
        }
    }

    if (Number.isFinite(satrec?.epochyr) && Number.isFinite(satrec?.epochdays)) {
        const fullYear = satrec.epochyr < 57 ? 2000 + satrec.epochyr : 1900 + satrec.epochyr;
        const epochMs = Date.UTC(fullYear, 0, 1) + (satrec.epochdays - 1) * 86_400_000;
        if (Number.isFinite(epochMs)) return new Date(Math.round(epochMs)).toISOString();
    }

    if (!Number.isFinite(satrec?.jdsatepoch)) return null;
    try {
        const date = satelliteLib?.invjday?.(satrec.jdsatepoch);
        return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
    } catch {
        return null;
    }
}

function sourceMetadata(record, line1, line2) {
    const provenance = record?.provenance ?? {};
    const sourceId = firstNonEmpty({ ...record, ...provenance }, ['source_id', 'sourceId']) || DEFAULT_SOURCE_ID;
    const datasetId = firstNonEmpty(provenance, ['dataset_id', 'datasetId']) || `dataset:${sourceId}`;
    const datasetHash = firstNonEmpty(provenance, ['dataset_hash', 'datasetHash']) ||
        hashValue([sourceId, line1, line2].join('\n'));
    return { sourceId, datasetId, datasetHash };
}

function stateProvenance(prepared, timestamp, libraryVersion) {
    return normalizeComputationProvenance({
        dataset_id: prepared.dataset_id,
        dataset_hash: prepared.dataset_hash,
        generated_at: timestamp,
        algorithm: {
            name: 'satellite.js SGP4',
            version: libraryVersion,
            configuration_hash: hashValue([
                TLE_PROPAGATION_SERVICE_VERSION,
                libraryVersion,
                REFERENCE_FRAME.TEME,
                TIME_SCALE.UTC
            ].join('|'))
        },
        input_element_set_ids: [prepared.element_set_id]
    });
}

export function createTlePropagationService({
    satelliteLib = globalThis.satellite,
    libraryVersion = SATELLITE_JS_VERSION,
    minimumOrbitRadiusKm = DEFAULT_MINIMUM_ORBIT_RADIUS_KM
} = {}) {
    const libraryAvailable = !!satelliteLib?.twoline2satrec && !!satelliteLib?.propagate;

    function prepareObject(record) {
        if (record?.prepared_by === PREPARED_OBJECT_MARKER && record?.satrec) {
            return { ok: true, value: record };
        }
        if (!libraryAvailable) {
            return resultError(
                PROPAGATION_ERROR_CODE.LIBRARY_UNAVAILABLE,
                'satellite.js with twoline2satrec and propagate is required.',
                { stage: 'PREPARE', recoverable: false }
            );
        }

        const { line1, line2 } = tleLines(record);
        if (!line1 || !line2) {
            return resultError(PROPAGATION_ERROR_CODE.MISSING_TLE, 'Both TLE lines are required.', {
                stage: 'PREPARE'
            });
        }

        let objectId;
        try {
            objectId = catalogObjectId(identityRecord(record, line1));
        } catch (error) {
            return resultError(PROPAGATION_ERROR_CODE.INVALID_OBJECT_IDENTITY, error.message, {
                stage: 'PREPARE'
            });
        }

        let satrec;
        try {
            satrec = satelliteLib.twoline2satrec(line1, line2);
        } catch (error) {
            return resultError(PROPAGATION_ERROR_CODE.TLE_PARSE_FAILED, error.message, {
                stage: 'PREPARE', object_id: objectId
            });
        }
        if (!satrec) {
            return resultError(PROPAGATION_ERROR_CODE.TLE_PARSE_FAILED, 'satellite.js did not return a satellite record.', {
                stage: 'PREPARE', object_id: objectId
            });
        }
        const nonFiniteSatrecFields = SGP4_CRITICAL_FINITE_FIELDS.filter(field => !Number.isFinite(satrec[field]));
        if (!Number.isFinite(satrec.error) || satrec.error !== 0 || nonFiniteSatrecFields.length > 0) {
            const detail = nonFiniteSatrecFields.length > 0
                ? ` Non-finite SGP4 fields: ${nonFiniteSatrecFields.join(', ')}.`
                : '';
            return resultError(PROPAGATION_ERROR_CODE.TLE_INVALID, `The TLE is invalid for SGP4 initialization.${detail}`, {
                stage: 'PREPARE',
                object_id: objectId,
                propagator_error_code: Number.isFinite(satrec.error) ? satrec.error : null
            });
        }

        const source = sourceMetadata(record, line1, line2);
        const inheritedQualityFlags = inputQualityFlags(record);
        const explicitElementSetId = firstNonEmpty(record?.element_set ?? record?.elementSet ?? {}, [
            'element_set_id', 'elementSetId'
        ]);
        const preparedElementSetId = explicitElementSetId || elementSetId({
            object_id: objectId,
            format: 'TLE',
            line1,
            line2
        });

        return {
            ok: true,
            value: {
                prepared_by: PREPARED_OBJECT_MARKER,
                object_id: objectId,
                object_name: objectName(record, objectId),
                norad_id: noradId(record, line1),
                orbit_class: Object.values(ORBIT_CLASS).includes(record?.orbit_class ?? record?.orbitClass)
                    ? (record.orbit_class ?? record.orbitClass)
                    : ORBIT_CLASS.UNKNOWN,
                element_set_id: preparedElementSetId,
                element_epoch_utc: elementEpochUtc(satrec, satelliteLib, record),
                line1,
                line2,
                satrec,
                dataset_id: source.datasetId,
                dataset_hash: source.datasetHash,
                source_id: source.sourceId,
                input_quality_flags: inheritedQualityFlags,
                quality_flags: Object.freeze([...new Set([
                    ...inheritedQualityFlags,
                    'TLE_SGP4_EXPERIMENTAL',
                    'TEME_FRAME_EXPLICIT'
                ])].sort())
            }
        };
    }

    function propagate(preparedOrRaw, instant) {
        const preparedResult = prepareObject(preparedOrRaw);
        if (!preparedResult.ok) return preparedResult;
        const prepared = preparedResult.value;

        let timestamp;
        try {
            timestamp = normalizeUtcInstant(instant, 'propagation timestamp');
        } catch (error) {
            return resultError(PROPAGATION_ERROR_CODE.INVALID_EPOCH, error.message, {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                recoverable: false
            });
        }

        let propagated;
        try {
            propagated = satelliteLib.propagate(prepared.satrec, new Date(timestamp));
        } catch (error) {
            return resultError(PROPAGATION_ERROR_CODE.PROPAGATION_FAILED, error.message, {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }

        if (!propagated) {
            return resultError(PROPAGATION_ERROR_CODE.PROPAGATION_FAILED, 'SGP4 propagation returned no state.', {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }
        if (!finiteVector(propagated.position)) {
            return resultError(PROPAGATION_ERROR_CODE.INVALID_POSITION, 'SGP4 returned a non-finite position.', {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }
        if (!finiteVector(propagated.velocity)) {
            return resultError(PROPAGATION_ERROR_CODE.INVALID_VELOCITY, 'SGP4 returned a non-finite velocity.', {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }

        const radiusKm = vectorMagnitude(propagated.position);
        if (Number.isFinite(minimumOrbitRadiusKm) && radiusKm < minimumOrbitRadiusKm) {
            return resultError(
                PROPAGATION_ERROR_CODE.BELOW_EARTH,
                `Propagated radius ${radiusKm.toFixed(3)} km is below ${minimumOrbitRadiusKm.toFixed(3)} km.`,
                {
                    object_id: prepared.object_id,
                    element_set_id: prepared.element_set_id,
                    timestamp,
                    propagator_error_code: prepared.satrec?.error ?? null
                }
            );
        }

        let state;
        try {
            state = normalizeStateVector({
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                time_scale: TIME_SCALE.UTC,
                frame: REFERENCE_FRAME.TEME,
                position_km: vectorCopy(propagated.position),
                velocity_km_s: vectorCopy(propagated.velocity),
                units: { position: 'km', velocity: 'km/s' },
                provenance: stateProvenance(prepared, timestamp, libraryVersion),
                quality_flags: prepared.quality_flags
            });
        } catch (error) {
            return resultError(PROPAGATION_ERROR_CODE.STATE_VALIDATION_FAILED, error.message, {
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp,
                propagator_error_code: prepared.satrec?.error ?? null
            });
        }

        return { ok: true, value: state };
    }

    return Object.freeze({
        service_version: TLE_PROPAGATION_SERVICE_VERSION,
        propagator: 'SGP4',
        implementation: 'satellite.js',
        implementation_version: libraryVersion,
        time_scale: TIME_SCALE.UTC,
        frame: REFERENCE_FRAME.TEME,
        units: Object.freeze({ position: 'km', velocity: 'km/s' }),
        minimum_orbit_radius_km: minimumOrbitRadiusKm,
        prepareObject,
        propagate
    });
}
